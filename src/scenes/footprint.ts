import { Color, Vector3 } from 'three';
import { aim, easeInOut, lerp, mixDir, mulberry32, range, setFov } from '../core/math';
import type { Ctx, SceneModule } from '../core/types';
import { bootOutline } from '../world/bootShape';
import { Dust, type DustGrain } from '../world/Dust';
import { Boot, Glove } from '../world/Suit';

/*
 * 3:30–4:20 足跡
 * ブーツが砂に沈み、はじめての足跡。視線は地球を見上げ、
 * 手袋の手がそっと月面に置かれる。
 */

const SINK_DEPTH = 0.03;
const CONTACT = 7.3;
const SUNK = 9.0;

export function createFootprint(ctx: Ctx): SceneModule {
  const { surface, earth } = ctx;
  const camera = surface.camera;
  const F = surface.footprint;
  const angle = surface.footprintAngle;
  const fwd = new Vector3(-Math.sin(angle), 0, -Math.cos(angle));
  const G = new Vector3(0.28, 0, -0.12).add(F);

  const boot = new Boot();
  const glove = new Glove();

  // 接地の瞬間、靴底のまわりから細かい砂が舞う
  const rnd = mulberry32(5);
  const outline = bootOutline(-0.01, 48);
  const grains: DustGrain[] = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const addPuff = (cx: number, cz: number, t0: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const [u, v] = outline[Math.floor(rnd() * outline.length)];
      // ブーツ座標 → ワールド
      const x = cx + u * cos - v * sin;
      const z = cz - u * sin - v * cos;
      const dir = new Vector3(x - cx, 0, z - cz).normalize();
      const out = (0.1 + rnd() * 0.5) * spread;
      grains.push({
        origin: new Vector3(x, 0.005, z),
        vel: new Vector3(dir.x * out, (0.15 + rnd() * 0.55) * spread, dir.z * out),
        t0: t0 + rnd() * 0.5,
        size: 0.003 + rnd() * 0.006,
        alpha: 0.8,
      });
    }
  };
  addPuff(F.x, F.z, CONTACT, ctx.quality === 'high' ? 700 : 350, 1);
  addPuff(G.x, G.z, 44.1, ctx.quality === 'high' ? 160 : 80, 0.4);
  const dust = new Dust(grains, 0, new Color(0.6, 0.58, 0.55));

  const pA = new Vector3();
  const tA = new Vector3();
  const pB = new Vector3();
  const tB = new Vector3();
  const pD = new Vector3();
  const tD = new Vector3();
  const pos = new Vector3();
  const dir = new Vector3();
  const tmp = new Vector3();
  const toEarth = new Vector3();

  function updateBoot(t: number) {
    boot.group.visible = t > 2 && t < 17;
    let y = 0;
    let pitch = 0;
    let along = 0;
    if (t < CONTACT) {
      const u = easeInOut(range(t, 2, CONTACT));
      y = 0.75 * (1 - u);
      along = -0.25 * (1 - u);
      // かかとから下ろす（つま先が上がった状態から平らに）
      pitch = lerp(0.35, 0.05, u);
    } else if (t < 13) {
      const s = range(t, CONTACT, SUNK);
      y = -SINK_DEPTH * (1 - Math.pow(1 - s, 2));
      pitch = 0.05 * (1 - range(t, CONTACT, CONTACT + 0.5));
    } else {
      // かかとから持ち上げ、前へ踏み出していく
      const a = range(t, 13, 14.2);
      const b = easeInOut(range(t, 13.8, 16.5));
      pitch = lerp(0, -0.4, a) + 0.5 * b;
      y = -SINK_DEPTH * (1 - a) + 0.9 * b;
      along = 0.45 * b;
    }
    boot.group.position.copy(F).addScaledVector(fwd, along);
    boot.group.position.y = y + 0.165 * Math.abs(Math.sin(pitch));
    boot.group.rotation.set(pitch, angle, 0, 'YXZ');
    surface.stampFootprint(t < CONTACT ? 0 : 1 - Math.pow(1 - range(t, CONTACT, SUNK), 2));
  }

  // 手袋の跡は刻まない（残るのは足跡だけ）
  function updateGlove(t: number) {
    glove.group.visible = t > 40.5 && t < 50;
    let y: number;
    let back: number;
    if (t < 44) {
      const u = easeInOut(range(t, 40.5, 44));
      y = 0.6 * (1 - u) + 0.004;
      back = 0.2 * (1 - u);
    } else if (t < 47) {
      y = lerp(0.004, -0.004, range(t, 44, 45));
      back = 0;
    } else {
      const u = easeInOut(range(t, 47, 49.5));
      y = -0.004 + 0.8 * u;
      back = 0.25 * u;
    }
    glove.group.position.set(G.x, y, G.z + back);
    glove.group.rotation.set(0.15 * range(y, 0, 0.6), 0.5, 0, 'YXZ');
  }

  return {
    name: 'footprint',
    stage: 'surface',

    setup() {
      surface.activate(earth);
      surface.scene.add(boot.group, glove.group, dust.points);
      surface.lander.reset();
      surface.lander.root.position.copy(surface.landingSite);
      surface.setShadowFocus(F, 1.1);
    },

    update(t) {
      surface.update(ctx.time, earth);
      updateBoot(t);
      updateGlove(t);

      // A: 低い位置から、ブーツが降りてくるところ
      pA.copy(F).add(tmp.set(0.62 - t * 0.004, 0.17, 0.42));
      tA.copy(F).add(tmp.set(0, 0.04, -0.02));
      // B: 斜め上から足跡の溝と影を見る
      pB.copy(F).add(tmp.set(0.18 - (t - 16) * 0.003, 0.62 + (t - 16) * 0.006, 0.55));
      tB.copy(F).add(tmp.set(0, 0, -0.02));
      // D: 手袋が置かれる場所
      pD.copy(G).add(tmp.set(0.12 + (t - 38) * 0.004, 0.16, -0.5));
      tD.copy(G).add(tmp.set(0, 0.03, 0));

      const kAB = easeInOut(range(t, 16, 24));
      const kUp = easeInOut(range(t, 27, 34)) * (1 - easeInOut(range(t, 38, 42)));
      const kD = easeInOut(range(t, 38, 42));

      pos.lerpVectors(pA, pB, kAB).lerp(pD, kD);
      dir.copy(tA).lerp(tB, kAB).lerp(tD, kD).sub(pos);
      // C: 地球を見上げる
      toEarth.copy(surface.earthPos).sub(pos);
      mixDir(dir, toEarth, kUp, dir);
      aim(camera, pos, dir);
      setFov(camera, lerp(38, 34, kUp));

      dust.update(t, camera, ctx.renderer.domElement.height);
    },

    dispose() {
      surface.scene.remove(boot.group, glove.group, dust.points);
    },
  };
}
