/**
 * 作品の音楽（5 分）を手続き的に作曲・合成し、public/audio/music.mp3 に書き出す。
 *   npm run music
 *
 * すべてこのスクリプト内の加算合成・ノイズ・残響で作るので、外部の音素材は使わない。
 * 合図の時刻は src/core/timeline.ts と各シーンの定数に合わせてある（作品全体の秒）。
 * 生成は決定論的（同じコードからは同じ音）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';

const SR = 44100;
const DUR = 300;
const N = SR * DUR;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio/music.mp3');

const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);

// ---------------------------------------------------------------- 基本部品

const TBL = 4096;
const SIN = new Float32Array(TBL + 1);
for (let i = 0; i <= TBL; i++) SIN[i] = Math.sin((2 * Math.PI * i) / TBL);
/** 位相（周期単位, 0〜1）の正弦 */
function sin1(ph) {
  const x = ph * TBL;
  const i = x | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(45);

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return STEP[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + (Number(m[3]) + 1) * 12;
}
const hz = (n) => (typeof n === 'number' ? n : 440 * 2 ** ((midi(n) - 69) / 12));
const up = (n, semis) => 440 * 2 ** ((midi(n) + semis - 69) / 12);

function panGains(p) {
  const a = ((Math.max(-1, Math.min(1, p)) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

const range = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (t, a, b) => {
  const k = range(t, a, b);
  return k * k * (3 - 2 * k);
};

/** なめらかな立ち上がりと余韻（cos カーブ） */
function envCos(t, t0, a, t1, r) {
  if (t < t0) return 0;
  let e = t < t0 + a ? 0.5 - 0.5 * Math.cos((Math.PI * (t - t0)) / a) : 1;
  if (t > t1) {
    const k = (t - t1) / r;
    e *= k >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * k);
  }
  return e;
}

// ---------------------------------------------------------------- 楽器

/** 持続音（倍音を足した 2 声のデチューン）。t0〜t1 に鳴り、r 秒かけて消える */
function pad(t0, t1, note, amp, { a = 4, r = 5, bright = 0.3, pan = 0, width = 0.5, send = 0.6, det = 6, lfo = 0.12 } = {}) {
  const f = hz(note);
  const parts = [];
  for (let n = 1; n <= 8; n++) {
    if (f * n > 14000) break;
    parts.push([n, 1 / n ** (2.4 - 1.8 * bright)]);
  }
  const norm = 1 / Math.sqrt(parts.reduce((s, [, g]) => s + g * g, 0));
  const voices = [-1, 1].map((sgn) => {
    const ratio = 2 ** ((sgn * det) / 1200);
    return {
      pg: panGains(pan + sgn * width * 0.5),
      inc: parts.map(([n]) => (f * n * ratio * (1 + 0.0003 * n * n)) / SR),
      ph: parts.map(() => rand()),
      g: parts.map(([, g]) => g * norm * 0.5),
    };
  });
  const lp = rand() * 6.28;
  const lr = 0.05 + rand() * 0.08;
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.ceil((t1 + r) * SR));
  for (let s = s0; s < s1; s++) {
    const t = s / SR;
    const e = envCos(t, t0, a, t1, r) * amp * (1 + lfo * Math.sin(lp + 6.2832 * lr * t));
    if (e === 0) continue;
    let l = 0;
    let rr = 0;
    for (const v of voices) {
      let x = 0;
      for (let k = 0; k < v.inc.length; k++) {
        let p = v.ph[k] + v.inc[k];
        if (p >= 1) p -= 1;
        v.ph[k] = p;
        x += sin1(p) * v.g[k];
      }
      l += x * v.pg[0];
      rr += x * v.pg[1];
    }
    l *= e;
    rr *= e;
    dryL[s] += l;
    dryR[s] += rr;
    sendL[s] += l * send;
    sendR[s] += rr * send;
  }
}

// [倍率, 音量, 減衰の速さの係数]
const KEYS = [
  [1, 1, 1],
  [2, 0.42, 0.55],
  [3, 0.2, 0.36],
  [4, 0.1, 0.26],
  [5, 0.05, 0.2],
  [6, 0.025, 0.16],
];
const BELL = [
  [1, 1, 1],
  [2.756, 0.42, 0.5],
  [5.404, 0.2, 0.32],
  [8.933, 0.09, 0.2],
  [0.5, 0.12, 1.3],
];
const GLINT = [
  [1, 1, 1],
  [2.0, 0.3, 0.5],
  [4.07, 0.12, 0.3],
];

/** 打って減衰する音（ピアノ風の鍵盤・鐘・粒） */
function strike(t0, note, amp, { decay = 3, pan = 0, send = 0.45, parts = KEYS, atk = 0.005, hold = Infinity, rel = 0.6 } = {}) {
  const f = hz(note);
  const [gl, gr] = panGains(pan);
  for (const [ratio, g, dk] of parts) {
    const pf = f * ratio * (parts === KEYS ? 1 + 0.0004 * ratio * ratio : 1);
    if (pf > 16000) continue;
    const tau = decay * dk;
    const len = Math.min(tau * 7, hold + rel * 7);
    const inc = pf / SR;
    let ph = rand();
    const s0 = Math.max(0, Math.floor(t0 * SR));
    const s1 = Math.min(N, Math.ceil((t0 + len) * SR));
    for (let s = s0; s < s1; s++) {
      const dt = s / SR - t0;
      if (dt < 0) continue;
      let e = Math.exp(-dt / tau) * Math.min(1, dt / atk) * g * amp;
      if (dt > hold) e *= Math.exp(-(dt - hold) / rel);
      ph += inc;
      if (ph >= 1) ph -= 1;
      const x = sin1(ph) * e;
      dryL[s] += x * gl;
      dryR[s] += x * gr;
      sendL[s] += x * gl * send;
      sendR[s] += x * gr * send;
    }
  }
}

/** 2 段の 1 極ローパスを通したノイズ。envFn(t) で音量、lpFn(t) で明るさ、panFn(t) で定位 */
function noise(t0, t1, envFn, { lpFn = () => 800, hp = 0, panFn = () => 0, width = 0.6, send = 0.5, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  let a1 = 0, a2 = 0, b1 = 0, b2 = 0, ha = 0, hb = 0, pa = 0, pb = 0;
  const hk = hp > 0 ? Math.exp((-2 * Math.PI * hp) / SR) : 0;
  let k = 0;
  let gl = 0.7, gr = 0.7;
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.ceil(t1 * SR));
  for (let s = s0; s < s1; s++) {
    const t = s / SR;
    if ((s - s0) % 64 === 0) {
      k = 1 - Math.exp((-2 * Math.PI * Math.min(lpFn(t), 18000)) / SR);
      [gl, gr] = panGains(panFn(t));
    }
    const e = envFn(t);
    const nl = rnd() * 2 - 1;
    const nr = rnd() * 2 - 1;
    const xl = nl * (0.5 + width * 0.5) + nr * (0.5 - width * 0.5);
    const xr = nr * (0.5 + width * 0.5) + nl * (0.5 - width * 0.5);
    a1 += k * (xl - a1);
    a2 += k * (a1 - a2);
    b1 += k * (xr - b1);
    b2 += k * (b1 - b2);
    let l = a2;
    let r = b2;
    if (hk) {
      // 1 極ハイパス
      const yl = hk * (ha + l - pa);
      pa = l;
      ha = yl;
      const yr = hk * (hb + r - pb);
      pb = r;
      hb = yr;
      l = yl;
      r = yr;
    }
    l *= e * gl * 1.4;
    r *= e * gr * 1.4;
    dryL[s] += l;
    dryR[s] += r;
    sendL[s] += l * send;
    sendR[s] += r * send;
  }
}

/** 低い衝撃音（下降する正弦＋倍音） */
function boom(t0, amp, { f0 = 90, f1 = 30, fall = 0.8, decay = 3.5, send = 0.5 } = {}) {
  let ph = 0;
  const s0 = Math.floor(t0 * SR);
  const s1 = Math.min(N, Math.ceil((t0 + decay * 7) * SR));
  for (let s = s0; s < s1; s++) {
    const dt = s / SR - t0;
    const f = f1 + (f0 - f1) * Math.exp(-dt / fall);
    ph += f / SR;
    ph -= Math.floor(ph);
    const e = Math.exp(-dt / decay) * Math.min(1, dt / 0.008) * amp;
    const x = (sin1(ph) + 0.35 * sin1((ph * 2) % 1) + 0.12 * sin1((ph * 3) % 1)) * e;
    dryL[s] += x * 0.7;
    dryR[s] += x * 0.7;
    sendL[s] += x * send * 0.7;
    sendR[s] += x * send * 0.7;
  }
}

function chord(t0, t1, notes, amp, opts = {}) {
  notes.forEach((n, i) => pad(t0, t1, n, amp, { pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.9, ...opts }));
}

// ---------------------------------------------------------------- 主題（ニ短調）

const THEME = [
  ['A4', 1.5], ['D5', 1.5], ['E5', 1.5], ['F5', 3],
  ['E5', 1.5], ['D5', 1.5], ['C5', 1.5], ['A4', 3],
  ['Bb4', 1.5], ['A4', 1.5], ['G4', 1.5], ['A4', 4.5],
];
function theme(t0, amp, { shift = 0, bell = 0, pan = 0.15 } = {}) {
  let t = t0;
  for (const [n, d] of THEME) {
    const f = up(n, shift);
    // わずかに揺らす（機械的にならないように）
    const tt = t + (rand() - 0.5) * 0.04;
    strike(tt, f, amp * (0.85 + rand() * 0.25), { decay: 2.6 + d * 0.6, hold: d + 0.3, rel: 0.9, pan, send: 0.55 });
    if (bell) strike(tt, f * 2, amp * bell, { decay: 2.2, parts: BELL, pan: -pan, send: 0.7 });
    t += d;
  }
  return t;
}

// ================================================================ 譜面

// --- 0:00–0:50 誕生 ---------------------------------------------------------
const IMPACT = 7;
// 宇宙の底の低いうなり
pad(0, 46, 'D1', 0.11, { a: 5, r: 10, bright: 0.25, width: 0.2, send: 0.3 });
pad(0.5, 44, 'A1', 0.05, { a: 6, r: 10, bright: 0.2, width: 0.3, send: 0.3 });
// テイアの接近：鳴りが近づいてくる
noise(0, IMPACT + 0.05, (t) => 0.05 * smooth(t, 0, IMPACT) ** 2, { lpFn: (t) => 150 + 900 * range(t, 0, IMPACT) ** 2, width: 0.3, send: 0.3, seed: 1 });
// 衝突
boom(IMPACT, 0.5, { f0: 110, f1: 28, fall: 0.6, decay: 3.2, send: 0.6 });
noise(IMPACT, IMPACT + 14, (t) => 0.22 * Math.exp(-(t - IMPACT) / 2.2) * Math.min(1, (t - IMPACT) / 0.01), {
  lpFn: (t) => 120 + 3200 * Math.exp(-(t - IMPACT) / 1.4),
  width: 0.9,
  send: 0.9,
  seed: 2,
});
// 渦巻く破片：回りながら左右を行き来する風
noise(9, 36, (t) => 0.045 * smooth(t, 9, 14) * (1 - smooth(t, 26, 36)), {
  lpFn: (t) => 500 + 1400 * smooth(t, 9, 22),
  hp: 180,
  panFn: (t) => 0.75 * Math.sin((t - 9) * (1.1 - 0.025 * (t - 9))),
  width: 0.4,
  send: 0.6,
  seed: 3,
});
// 破片のきらめき
{
  const pent = ['D', 'F', 'G', 'A', 'C'];
  for (let i = 0; i < 230; i++) {
    const t = 9.5 + 26 * rand() ** 1.3;
    const dens = smooth(t, 9.5, 13) * (1 - smooth(t, 26, 36));
    if (rand() > dens) continue;
    const n = `${pent[(rand() * 5) | 0]}${5 + ((rand() * 2.3) | 0)}`;
    strike(t, n, 0.018 + 0.03 * rand(), { decay: 0.35 + 1.2 * rand(), parts: GLINT, pan: rand() * 1.8 - 0.9, send: 0.75 });
  }
}
// 月が集まり、赤く灼ける
pad(24, 55, 'D2', 0.085, { a: 10, r: 8, bright: 0.35 });
pad(28, 55, 'A2', 0.07, { a: 10, r: 8, bright: 0.35, pan: 0.2 });
pad(32, 54, 'D3', 0.055, { a: 8, r: 8, bright: 0.55, pan: -0.2 });
pad(35, 50, 'F3', 0.04, { a: 6, r: 8, bright: 0.5, pan: 0.35 });
pad(36, 47, 'A4', 0.022, { a: 5, r: 7, bright: 0.7, pan: -0.4, lfo: 0.3 });
pad(37, 47, 'E5', 0.014, { a: 5, r: 7, bright: 0.7, pan: 0.4, lfo: 0.3 });

// --- 0:50–1:40 向き合う ------------------------------------------------------
{
  const o = { a: 5, r: 6, send: 0.65 };
  chord(50, 63, ['D3', 'A3', 'E4', 'F4'], 0.05, { ...o, bright: 0.4 });
  chord(62.5, 75.5, ['Bb2', 'F3', 'A3', 'D4'], 0.05, { ...o, bright: 0.35 });
  chord(75, 88, ['G2', 'D3', 'Bb3', 'A4'], 0.048, { ...o, bright: 0.3 });
  chord(87.5, 92.5, ['A2', 'E3', 'D4', 'A4'], 0.048, { ...o, a: 3, r: 3, bright: 0.25 });
  // 92s：自転が止まり、同じ面を地球に向ける
  chord(92, 104, ['D2', 'A2', 'F3', 'A3', 'D4'], 0.045, { a: 2.5, r: 7, bright: 0.25, send: 0.7 });
  pad(52, 104, 'D2', 0.05, { a: 6, r: 6, bright: 0.2, width: 0.2 });
}
// 自転の減速：月が 1/4 回転するたびに鐘。SpaceStage.spinResidual と同じ式なので、
// 回転と一緒に間隔が延び、止まる
{
  const W0 = 1.2, T0 = 76, T1 = 92, THETA = (W0 * (T1 - T0)) / 2;
  const spin = (T) => (T < T0 ? THETA + W0 * (T0 - T) : T > T1 ? 0 : THETA * (1 - (T - T0) / (T1 - T0)) ** 2);
  const q = Math.PI / 2;
  let prev = Math.floor(spin(66) / q);
  let i = 0;
  for (let T = 66; T < T1; T += 0.002) {
    const cur = Math.floor(spin(T) / q);
    if (cur < prev) {
      prev = cur;
      const fade = smooth(T, 66, 72);
      strike(T, i % 2 ? 'A4' : 'D5', 0.07 * fade, { decay: 2.4, parts: BELL, pan: i % 2 ? 0.3 : -0.3, send: 0.6 });
      i++;
    }
  }
  // 止まった瞬間
  strike(T1, 'D4', 0.11, { decay: 5, parts: BELL, send: 0.7 });
  strike(T1, 'D3', 0.12, { decay: 6, send: 0.6 });
}

// --- 1:40–2:30 見守る --------------------------------------------------------
{
  const C = 6.25;
  const chords = [
    ['D3', 'A3', 'E4', 'F4'],
    ['Bb2', 'F3', 'A3', 'C4'],
    ['A2', 'F3', 'C4', 'A4'],
    ['G2', 'D3', 'Bb3', 'A4'],
    ['Bb2', 'G3', 'C4', 'D4'],
    ['F2', 'C3', 'A3', 'C4'],
    ['E2', 'C3', 'G3', 'E4'],
    ['D2', 'A2', 'E3', 'A3'],
  ];
  const bass = ['D2', 'Bb1', 'A1', 'G1', 'Bb1', 'F1', 'E1', 'D1'];
  chords.forEach((ch, i) => {
    const t0 = 100 + i * C;
    const last = i === chords.length - 1;
    const iceAge = t0 >= 118 && t0 < 131;
    chord(t0 - 0.5, t0 + C + (last ? 0 : 0.5), ch, 0.042, { a: 3, r: last ? 4 : 4, bright: iceAge ? 0.15 : 0.35, send: 0.65 });
    pad(t0 - 0.5, t0 + C + 0.3, bass[i], 0.05, { a: 3, r: 4, bright: 0.2, width: 0.15 });
    // 分散和音：時代とともに増え、氷期は高く細く、都市の頃に温かく
    const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    for (let k = 0; k < 8; k++) {
      const t = t0 + k * (C / 8) + (rand() - 0.5) * 0.03;
      const density = 0.3 + 0.7 * smooth(t, 100, 116);
      if (rand() > density) continue;
      const n = ch[pattern[k]];
      if (iceAge) {
        strike(t, up(n, 24), 0.035, { decay: 1.8, parts: BELL, pan: k % 2 ? 0.45 : -0.45, send: 0.8 });
      } else {
        const warm = smooth(t, 136, 142);
        strike(t, up(n, 12), 0.075 + 0.03 * warm, { decay: 2.2 + warm, pan: k % 2 ? 0.4 : -0.4, send: 0.55 });
      }
    }
  });
  // 潮汐：海が月の方へ寄せては返す（104〜118）
  noise(103, 136, (t) => 0.03 * smooth(t, 103, 108) * (1 - smooth(t, 124, 136)) * (0.55 + 0.45 * Math.sin((t - 103) * 0.9)), {
    lpFn: (t) => 350 + 250 * Math.sin((t - 103) * 0.9),
    width: 0.8,
    send: 0.4,
    seed: 4,
  });
  // 都市の光がひとつずつ灯る
  for (let i = 0; i < 90; i++) {
    const t = 137 + 11 * Math.sqrt(rand());
    const n = ['D', 'E', 'F', 'A', 'C'][(rand() * 5) | 0] + (6 + ((rand() * 1.4) | 0));
    strike(t, n, 0.012 + 0.018 * rand(), { decay: 0.6 + rand(), parts: GLINT, pan: rand() * 1.6 - 0.8, send: 0.8 });
  }
}

// --- 2:30–3:30 火花 ----------------------------------------------------------
{
  const DEPART = 158, HOVER = 182, ARRIVE = 190, TOUCH = 200;
  pad(149, 160, 'D1', 0.08, { a: 4, r: 4, bright: 0.2, width: 0.1 });
  pad(150, 159, 'A3', 0.02, { a: 4, r: 4, bright: 0.2 });
  // 火花が地球を離れる
  strike(DEPART, 'A5', 0.09, { decay: 3, parts: BELL, pan: -0.15, send: 0.8 });
  strike(DEPART + 0.75, 'D6', 0.075, { decay: 3.5, parts: BELL, pan: 0.15, send: 0.8 });
  // まっすぐこちらへ：鐘の脈が近づき、和音が昇っていく
  chord(158, 174.5, ['Bb2', 'F3', 'A3', 'C4', 'E4'], 0.04, { a: 6, r: 4, bright: 0.3 });
  chord(174, 186.5, ['C3', 'G3', 'A3', 'D4', 'E4'], 0.046, { a: 4, r: 3, bright: 0.4 });
  chord(186, TOUCH, ['D3', 'G3', 'A3', 'D4', 'G4'], 0.052, { a: 3, r: 1.2, bright: 0.5 });
  pad(158, TOUCH, 'D2', 0.05, { a: 8, r: 1.2, bright: 0.3, width: 0.1 });
  for (let t = 162; t < ARRIVE; ) {
    const near = range(t, 162, ARRIVE);
    strike(t, 'A5', 0.02 + 0.06 * near * near, { decay: 1 + near, parts: BELL, pan: 0.1 * Math.sin(t), send: 0.6 });
    t += 2.2 - 1.1 * near;
  }
  // 脚を広げてから、心臓の鼓動のような低音
  for (let t = HOVER - 6, i = 0; t < TOUCH - 0.6; i++) {
    const k = range(t, HOVER - 6, TOUCH);
    boom(t, 0.12 + 0.18 * k, { f0: 75, f1: 45, fall: 0.08, decay: 0.32, send: 0.25 });
    t += i % 2 ? 1.4 - 0.4 * k : 0.38;
  }
  noise(184, TOUCH, (t) => 0.06 * smooth(t, 184, TOUCH - 0.3) ** 2 * (t < TOUCH - 0.05 ? 1 : 0), {
    lpFn: (t) => 400 + 5000 * range(t, 184, TOUCH) ** 2,
    hp: 150,
    width: 0.8,
    send: 0.5,
    seed: 5,
  });
  // 着陸：すべてが止み、ゆっくり舞い上がった砂がゆっくり落ちる
  boom(TOUCH, 0.32, { f0: 70, f1: 34, fall: 0.25, decay: 1.6, send: 0.7 });
  noise(TOUCH, TOUCH + 9, (t) => 0.06 * Math.exp(-(t - TOUCH) / 2.4) * Math.min(1, (t - TOUCH) / 0.02), {
    lpFn: () => 700,
    width: 1,
    send: 0.8,
    seed: 6,
  });
  chord(TOUCH + 0.4, 209, ['D3', 'A3', 'E4'], 0.026, { a: 3, r: 3, bright: 0.2, send: 0.85 });
  const fall = ['A6', 'G6', 'F6', 'E6', 'D6', 'C6', 'A5', 'G5', 'F5'];
  fall.forEach((n, i) => {
    strike(TOUCH + 0.8 + i * 0.85 + rand() * 0.3, n, 0.022, { decay: 1.6, parts: GLINT, pan: rand() * 1.4 - 0.7, send: 0.85 });
  });
}

// --- 3:30–4:20 足跡 ----------------------------------------------------------
{
  const CONTACT = 217.3, HAND = 255;
  chord(210, 222, ['A3', 'D4', 'E4'], 0.028, { a: 4, r: 4, bright: 0.2, send: 0.8 });
  // ブーツが砂に沈む：はじめての足跡
  strike(CONTACT, 'D2', 0.16, { decay: 6, send: 0.55 });
  strike(CONTACT, 'A2', 0.07, { decay: 5, send: 0.55 });
  boom(CONTACT, 0.1, { f0: 60, f1: 40, fall: 0.2, decay: 0.6, send: 0.4 });
  strike(CONTACT + 0.05, 'D5', 0.05, { decay: 4, parts: BELL, send: 0.8 });
  // 主題
  const o = { a: 3, r: 4, bright: 0.3, send: 0.7 };
  chord(220, 228, ['D3', 'A3', 'E4'], 0.032, o);
  chord(227.5, 235.5, ['Bb2', 'F3', 'D4'], 0.032, o);
  chord(235, 241.5, ['G2', 'D3', 'Bb3'], 0.032, o);
  theme(220, 0.1);
  // 地球を見上げる
  chord(241, 251, ['F2', 'C3', 'A3', 'E4', 'G4'], 0.04, { a: 3, r: 4, bright: 0.45, send: 0.75 });
  pad(241, 251, 'F1', 0.05, { a: 3, r: 4, bright: 0.2, width: 0.1 });
  strike(244.5, 'C6', 0.04, { decay: 3, parts: BELL, pan: 0.3, send: 0.85 });
  strike(246, 'A5', 0.035, { decay: 3, parts: BELL, pan: -0.3, send: 0.85 });
  // 手袋の手を月面に置く
  chord(250.5, 259, ['Bb2', 'F3', 'A3', 'D4'], 0.036, { a: 4, r: 3, bright: 0.3, send: 0.75 });
  strike(HAND, 'F4', 0.07, { decay: 4, send: 0.6, pan: -0.1 });
  strike(HAND + 0.02, 'A4', 0.06, { decay: 4, send: 0.6, pan: 0.1 });
  strike(HAND + 0.05, 'F5', 0.035, { decay: 4, parts: BELL, send: 0.85 });
}

// --- 4:20–5:00 残る ----------------------------------------------------------
{
  const IGNITE = 264, ABSORB = 282;
  chord(259.5, 266.5, ['D3', 'A3', 'F4'], 0.03, { a: 3, r: 4, bright: 0.2, send: 0.8 });
  // 船が離れる
  noise(IGNITE, 276, (t) => 0.06 * smooth(t, IGNITE, IGNITE + 1.5) * (1 - smooth(t, IGNITE + 2, 276)), {
    lpFn: (t) => 250 + 500 * Math.exp(-(t - IGNITE) / 3),
    width: 0.7,
    send: 0.5,
    seed: 8,
  });
  boom(IGNITE + 0.5, 0.14, { f0: 55, f1: 38, fall: 1.5, decay: 3, send: 0.5 });
  // 主題をもう一度、高く
  const o = { a: 3, r: 4, bright: 0.35, send: 0.7 };
  chord(266, 274, ['D3', 'A3', 'E4', 'F4'], 0.038, o);
  chord(273.5, 281.5, ['Bb2', 'F3', 'A3', 'D4'], 0.038, o);
  chord(281, 287.5, ['G2', 'D3', 'Bb3', 'A4'], 0.038, o);
  pad(266, 287.5, 'D2', 0.04, { a: 4, r: 3, bright: 0.2, width: 0.1 });
  theme(266, 0.1, { shift: 12, bell: 0.25, pan: -0.1 });
  // 火花が地球に吸い込まれて消える
  strike(ABSORB, 'D7', 0.02, { decay: 1.5, parts: GLINT, send: 0.9 });
  // 最後の一行の下で開いた和音（長三度で、少しだけ明るく）→ 暗転 → タイトル
  chord(287, 296, ['D2', 'A2', 'E3', 'F#3', 'A3', 'D4'], 0.04, { a: 3, r: 4, bright: 0.25, send: 0.85 });
  strike(293, 'A5', 0.05, { decay: 4, parts: BELL, pan: -0.2, send: 0.9 });
  strike(293.6, 'D6', 0.04, { decay: 4.5, parts: BELL, pan: 0.2, send: 0.9 });
}

// ================================================================ 残響と仕上げ

/** Freeverb（Jezar のチューニング）。左右の入力を別々の櫛形フィルターへ */
function freeverb(inL, inR, room = 0.9, damp = 0.3) {
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apT = [556, 441, 341, 225];
  const spread = 23;
  const fb = 0.7 + 0.28 * room;
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  for (const [inp, out, off] of [
    [inL, outL, 0],
    [inR, outR, spread],
  ]) {
    const combs = combT.map((n) => ({ buf: new Float32Array(n + off), i: 0, st: 0 }));
    const aps = apT.map((n) => ({ buf: new Float32Array(n + off), i: 0 }));
    for (let s = 0; s < N; s++) {
      const x = inp[s] * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.st = o * (1 - damp) + c.st * damp;
        c.buf[c.i] = x + c.st * fb;
        if (++c.i >= c.buf.length) c.i = 0;
        y += o;
      }
      for (const a of aps) {
        const o = a.buf[a.i];
        a.buf[a.i] = y + o * 0.5;
        if (++a.i >= a.buf.length) a.i = 0;
        y = o - y;
      }
      out[s] = y;
    }
  }
  return [outL, outR];
}

console.time('reverb');
const [wetL, wetR] = freeverb(sendL, sendR);
console.timeEnd('reverb');

const WET = 2.2;
const L = new Float32Array(N);
const R = new Float32Array(N);
// シーンの切れ目の暗転では、音も少し引く
const dips = [
  [148.6, 150, 151.8],
  [208.8, 210, 211.6],
  [258.8, 260, 261.8],
];
for (let s = 0; s < N; s++) {
  const t = s / SR;
  let g = 1;
  for (const [a, m, b] of dips) if (t > a && t < b) g = Math.min(g, 1 - 0.45 * (t < m ? smooth(t, a, m) : 1 - smooth(t, m, b)));
  g *= 1 - smooth(t, 297, 300);
  L[s] = (dryL[s] + wetL[s] * WET) * g;
  R[s] = (dryR[s] + wetR[s] * WET) * g;
}

// 音量をそろえ、強いところだけ柔らかく抑える
let peak = 0;
for (let s = 0; s < N; s++) peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
const sorted = Float32Array.from({ length: 20000 }, (_, i) => Math.abs(L[Math.floor((i / 20000) * N)])).sort();
const p999 = sorted[Math.floor(sorted.length * 0.9995)];
const gain = 0.8 / p999;
const KNEE = 0.55;
const limit = (x) => {
  const a = Math.abs(x);
  return a <= KNEE ? x : Math.sign(x) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
};
for (let s = 0; s < N; s++) {
  L[s] = limit(L[s] * gain) * 0.97;
  R[s] = limit(R[s] * gain) * 0.97;
}
console.log(`peak before ${peak.toFixed(3)}, gain ${gain.toFixed(2)}`);

// 10 秒ごとの音量（確認用）
const rows = [];
for (let t = 0; t < DUR; t += 10) {
  let e = 0;
  const a = t * SR;
  const b = Math.min(N, (t + 10) * SR);
  for (let s = a; s < b; s++) e += L[s] * L[s] + R[s] * R[s];
  rows.push(`${String(t).padStart(3)}s ${(10 * Math.log10(e / (2 * (b - a)) + 1e-12)).toFixed(1).padStart(6)} dB`);
}
console.log(rows.join('\n'));

if (process.argv.includes('--wav')) {
  const wavPath = process.argv[process.argv.indexOf('--wav') + 1];
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + N * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 4, 40);
  for (let s = 0; s < N; s++) {
    buf.writeInt16LE(Math.round(L[s] * 32767), 44 + s * 4);
    buf.writeInt16LE(Math.round(R[s] * 32767), 46 + s * 4);
  }
  writeFileSync(wavPath, buf);
  console.log(`wrote ${wavPath}`);
}

// MP3
console.time('encode');
const enc = new Mp3Encoder(2, SR, 128);
const chunks = [];
const BLOCK = 1152 * 16;
const il = new Int16Array(BLOCK);
const ir = new Int16Array(BLOCK);
for (let s = 0; s < N; s += BLOCK) {
  const n = Math.min(BLOCK, N - s);
  for (let i = 0; i < n; i++) {
    il[i] = Math.round(L[s + i] * 32767);
    ir[i] = Math.round(R[s + i] * 32767);
  }
  const out = enc.encodeBuffer(il.subarray(0, n), ir.subarray(0, n));
  if (out.length) chunks.push(Buffer.from(out.buffer, out.byteOffset, out.length));
}
const tail = enc.flush();
if (tail.length) chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length));
console.timeEnd('encode');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat(chunks));
console.log(`wrote ${OUT} (${(Buffer.concat(chunks).length / 1e6).toFixed(2)} MB)`);
