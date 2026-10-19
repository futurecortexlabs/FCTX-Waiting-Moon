import gsap from 'gsap';
import type { Params } from './params';

export const DURATION = 300;

export const SCENE_NAMES = ['birth', 'lock', 'watch', 'spark', 'footprint', 'remain'] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

export const SCENE_START: Record<SceneName, number> = {
  birth: 0,
  lock: 50,
  watch: 100,
  spark: 150,
  footprint: 210,
  remain: 260,
};

export function sceneEnd(name: SceneName) {
  const i = SCENE_NAMES.indexOf(name);
  return i + 1 < SCENE_NAMES.length ? SCENE_START[SCENE_NAMES[i + 1]] : DURATION;
}

/**
 * 作品全体を 1 本の GSAP タイムラインにまとめる。
 * 再生ヘッドは Director が毎フレーム tl.time(t) で動かすので、paused のまま使う。
 * シーン境界はラベルとして持つ。
 */
export function buildMasterTimeline(p: Params) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none', immediateRender: false } });
  for (const name of SCENE_NAMES) tl.addLabel(name, SCENE_START[name]);

  // 地球の時代：向き合う（冷えて青く）→ 見守る（緑→氷→緑→都市光）
  tl.fromTo(p, { era: 0 }, { era: 0.3, duration: 50, ease: 'sine.inOut' }, 50);
  tl.fromTo(p, { era: 0.3 }, { era: 1, duration: 46, ease: 'sine.inOut' }, 100);
  tl.fromTo(p, { contShift: 0 }, { contShift: 2.4, duration: 34, ease: 'sine.inOut' }, 102);

  // 潮汐：見守るの間だけ
  tl.fromTo(p, { tide: 0 }, { tide: 1, duration: 6, ease: 'sine.inOut' }, 104);
  tl.fromTo(p, { tide: 1 }, { tide: 0.5, duration: 30, ease: 'sine.inOut' }, 118);
  tl.set(p, { tide: 0 }, 150);

  // 遠ざかる地球（気づかれない速度で、最後まで）
  tl.fromTo(p, { moonDist: 3.5 }, { moonDist: 8.5, duration: 50, ease: 'sine.inOut' }, 50);
  tl.fromTo(p, { moonDist: 8.5 }, { moonDist: 13, duration: 50 }, 100);
  tl.fromTo(p, { moonDist: 13 }, { moonDist: 15.5, duration: 150 }, 150);

  // 月の熱：集積で赤く灼け、向き合うの前半で冷える
  tl.fromTo(p, { moonHeat: 0 }, { moonHeat: 1, duration: 10, ease: 'power2.out' }, 30);
  tl.fromTo(p, { moonHeat: 1 }, { moonHeat: 0, duration: 32, ease: 'power1.inOut' }, 52);

  // 黒フェード
  tl.fromTo(p, { fade: 1 }, { fade: 0, duration: 4, ease: 'sine.out' }, 0);
  const dip = (a: number, mid: number, b: number) => {
    tl.fromTo(p, { fade: 0 }, { fade: 1, duration: mid - a, ease: 'sine.in' }, a);
    tl.fromTo(p, { fade: 1 }, { fade: 0, duration: b - mid, ease: 'sine.out' }, mid);
  };
  dip(148.6, 150, 151.8);
  dip(208.8, 210, 211.6);
  dip(258.8, 260, 261.8);
  tl.fromTo(p, { fade: 0 }, { fade: 1, duration: 4, ease: 'sine.inOut' }, 288);

  // 最後の一行 → 暗転 → タイトル
  tl.fromTo(p, { line: 0 }, { line: 1, duration: 4, ease: 'sine.inOut' }, 276);
  tl.fromTo(p, { line: 1 }, { line: 0, duration: 3, ease: 'sine.inOut' }, 287);
  tl.fromTo(p, { title: 0 }, { title: 1, duration: 3, ease: 'sine.inOut' }, 293);

  // ブルーム
  tl.fromTo(p, { bloom: 1.1 }, { bloom: 0.8, duration: 20 }, 40);
  tl.set(p, { bloom: 0.55 }, 150);

  tl.set({}, {}, DURATION);
  return tl;
}
