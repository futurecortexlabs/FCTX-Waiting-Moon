import { Vector3 } from 'three';
import { aim, easeInOut, mixDir, range, setFov, smoothstep } from '../core/math';
import type { Ctx, SceneModule } from '../core/types';
import { makeGlow, setGlow } from '../world/Glow';

/*
 * 4:20–5:00 残る
 * 船は帰り、火花は地球に吸い込まれて消える。足跡だけが残る。
 * 地球は回り続け、月は離れ続ける。最後の一行、暗転、タイトル（文字はマスタータイムライン側）。
 */

const IGNITE = 4;
const LIFT = 4.5;
const ACCEL = 1.8;
const ABSORB = 22;

export function createRemain(ctx: Ctx): SceneModule {
  const { surface, earth } = ctx;
  const camera = surface.camera;
  const lander = surface.lander;
  const F = surface.footprint;
  const up = new Vector3(0, 1, 0);

  const spark = makeGlow(6, 5, 4);
  const glint = makeGlow(3, 3.4, 4);

  const A0 = new Vector3();
  const P = new Vector3();
  const local = new Vector3();
  const pos = new Vector3();
  const look = new Vector3();
  const toF = new Vector3();
  const toE = new Vector3();
  const toS = new Vector3();
  const pNear = new Vector3(0.2, 0.33, 1.05);
  const pFar = new Vector3(0.28, 0.24, 1.45);
  const K = 9;

  return {
    name: 'remain',
    stage: 'surface',

    setup() {
      surface.activate(earth);
      surface.scene.add(spark, glint);
      lander.reset();
      lander.root.position.copy(surface.landingSite);
      lander.root.updateMatrixWorld(true);
      lander.ascent.getWorldPosition(A0);
      surface.stampFootprint(1);
      surface.setShadowFocus(new Vector3().copy(surface.landingSite).multiplyScalar(0.5), 14);
    },

    update(t) {
      surface.update(ctx.time, earth);
      const E = surface.earthPos;

      // 上昇段：まっすぐ上がり、地球へ向かって加速していく
      const h = t > LIFT ? 0.5 * ACCEL * (t - LIFT) * (t - LIFT) : 0;
      P.copy(A0).addScaledVector(up, h);
      const u = range(t, 8, ABSORB);
      const g = (Math.exp(K * u) - 1) / (Math.exp(K) - 1);
      P.lerp(E, g);
      local.copy(P);
      lander.root.worldToLocal(local);
      lander.ascent.position.copy(local);
      const dist = camera.position.distanceTo(P);
      lander.ascent.visible = t < ABSORB && dist < 2500;

      const burn = smoothstep(IGNITE, IGNITE + 0.4, t);
      lander.setAscentEngine(burn * (1 - smoothstep(12, 16, t)));
      spark.position.copy(P);
      spark.scale.setScalar(Math.max(dist * 0.005, 2));
      setGlow(spark, 6, 5, 4, burn * (1 - smoothstep(0.86, 1, g)));

      // 地球に吸い込まれる瞬間の、ごく小さなきらめき
      const gl = smoothstep(ABSORB - 0.6, ABSORB, t) * (1 - smoothstep(ABSORB, ABSORB + 2, t));
      glint.position.copy(E).addScaledVector(surface.earthDir, -surface.earthRadius * 1.05);
      glint.scale.setScalar(E.length() * 0.012);
      setGlow(glint, 3, 3.4, 4, gl * 0.6);

      // カメラ：足跡を手前に、空に地球。最後はゆっくり引く
      pos.lerpVectors(pNear, pFar, easeInOut(range(t, 22, 40))).add(F);
      toF.copy(F).sub(pos);
      toE.copy(E).sub(pos);
      mixDir(toF, toE, 0.55, look);
      toS.copy(P).sub(pos);
      const follow = smoothstep(IGNITE, 9, t) * (1 - smoothstep(14, 21, t)) * 0.8;
      mixDir(look, toS, follow, look);
      aim(camera, pos, look);
      setFov(camera, 50);
    },

    dispose() {
      surface.scene.remove(spark, glint);
      lander.reset();
    },
  };
}
