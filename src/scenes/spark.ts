import { Color, Vector3 } from 'three';
import { aim, lerp, mixDir, mulberry32, range, setFov, smoothstep } from '../core/math';
import type { Ctx, SceneModule } from '../core/types';
import { Dust, type DustGrain } from '../world/Dust';
import { makeGlow, setGlow } from '../world/Glow';

/*
 * 2:30–3:30 火花
 * 地球の縁から火花がひとつ離れ、まっすぐこちらへ。大きくなり、脚を広げ、
 * 砂煙をゆっくり上げて着陸する。
 */

const DEPART = 8;
const ARRIVE = 40;
const TOUCHDOWN = 50;
const HOVER = 32;

export function createSpark(ctx: Ctx): SceneModule {
  const { surface, earth } = ctx;
  const camera = surface.camera;
  const lander = surface.lander;
  const L = surface.landingSite;
  const up = new Vector3(0, 1, 0);

  const spark = makeGlow(6, 5, 4);

  // 着陸の砂煙：重力が弱いので、ゆっくり弧を描いて落ちる
  const rnd = mulberry32(21);
  const grains: DustGrain[] = [];
  const count = ctx.quality === 'high' ? 4000 : 1800;
  for (let i = 0; i < count; i++) {
    const t0 = lerp(43, TOUCHDOWN + 0.3, Math.sqrt(rnd()));
    const near = range(t0, 43, TOUCHDOWN);
    const a = rnd() * Math.PI * 2;
    const r = 0.4 + rnd() * 3;
    const haze = rnd() < 0.12;
    const out = haze ? 0.4 + rnd() * 1.2 : (1.2 + rnd() * 4.5) * (0.5 + near * 0.7);
    const upv = haze ? 0.5 + rnd() * 1.4 : 0.6 + rnd() * 2.6;
    grains.push({
      origin: new Vector3(L.x + Math.cos(a) * r, L.y + 0.03, L.z + Math.sin(a) * r),
      vel: new Vector3(Math.cos(a) * out, upv, Math.sin(a) * out),
      t0,
      size: haze ? 0.25 + rnd() * 0.35 : 0.02 + rnd() * 0.05,
      alpha: haze ? 0.06 : 0.55,
    });
  }
  const dust = new Dust(grains, L.y, new Color(0.5, 0.48, 0.45));

  // 経路
  const side = new Vector3();
  const S0 = new Vector3();
  const Q = new Vector3().copy(L).addScaledVector(up, HOVER);
  const P = new Vector3();
  const camPos = new Vector3();
  const toEarth = new Vector3();
  const toSpark = new Vector3();
  const look = new Vector3();
  const focus = new Vector3();
  const K = 8;

  return {
    name: 'spark',
    stage: 'surface',

    setup() {
      surface.activate(earth);
      surface.scene.add(spark, dust.points);
      lander.reset();
      lander.root.position.copy(L);
      surface.stampFootprint(0);
      surface.setShadowFocus(focus.copy(L).multiplyScalar(0.5), 14);
    },

    update(t) {
      const T = ctx.time;
      surface.update(T, earth);
      const E = surface.earthPos;

      // 地球の縁（画面右側）から出発
      side.crossVectors(surface.earthDir, up).normalize();
      S0.copy(E).addScaledVector(side, surface.earthRadius * 1.02);

      if (t < DEPART) {
        P.copy(S0);
      } else if (t < ARRIVE) {
        const s = (t - DEPART) / (ARRIVE - DEPART);
        const f = (Math.exp(K * (1 - s)) - 1) / (Math.exp(K) - 1);
        P.copy(Q).lerp(S0, f);
      } else {
        const u = range(t, ARRIVE, TOUCHDOWN);
        P.copy(L).addScaledVector(up, HOVER * (1 - u) * (1 - u));
      }

      lander.root.position.copy(P);
      lander.setLegs(smoothstep(35, 41, t));
      const dist = camera.position.distanceTo(P);
      lander.root.visible = dist < 2500;
      const engine = t < TOUCHDOWN ? smoothstep(DEPART - 2, DEPART, t) : 1 - smoothstep(TOUCHDOWN, TOUCHDOWN + 0.4, t);
      lander.setDescentEngine(engine * smoothstep(30, 38, t));

      // 遠くでは一点の火花。近づくと機体の噴射に溶け込む
      spark.position.copy(P).addScaledVector(up, 0.6);
      spark.scale.setScalar(Math.max(dist * 0.0065, 2.5));
      setGlow(spark, 6, 5, 4, engine * (1 - smoothstep(36, 44, t) * 0.85));

      // カメラ：最初は地球を見つめ、火花を追って視線を下ろす
      camPos.set(-0.5, 0.5, 2.4 - 0.3 * (t / 60));
      toEarth.copy(E).sub(camPos);
      toSpark.copy(P).addScaledVector(up, 2.0).sub(camPos);
      mixDir(toEarth, toSpark, smoothstep(14, 34, t), look);
      aim(camera, camPos, look);
      setFov(camera, lerp(34, 44, smoothstep(36, 48, t)));

      dust.update(t, camera, ctx.renderer.domElement.height);
    },

    dispose() {
      surface.scene.remove(spark, dust.points);
    },
  };
}
