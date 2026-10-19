import { Quaternion, Vector3 } from 'three';
import { easeInOut, lerp, lookAtQuat, range, setFov } from '../core/math';
import type { Ctx, SceneModule } from '../core/types';

/*
 * 0:50–1:40 向き合う
 * 月が冷えて灰色に。カメラは月面へ降り、そこから月視点に固定される。
 * 自転が減速して止まり、地球が空を横切る速さが落ちて、やがて正面で止まる。
 * 地球は冷えて青くなり、少しずつ遠く小さくなる。
 */
const UP = new Vector3(0, 1, 0);

export function createLock(ctx: Ctx): SceneModule {
  const { space, earth } = ctx;
  const camera = space.camera;

  const pA = new Vector3();
  const tA = new Vector3();
  const pB = new Vector3();
  const tB = new Vector3();
  const pC = new Vector3();
  const qC = new Quaternion();
  const qExt = new Quaternion();
  const tan = new Vector3();
  const mHat = new Vector3();
  const pos = new Vector3();
  const target = new Vector3();

  return {
    name: 'lock',
    stage: 'space',

    setup() {
      space.activate(earth);
    },

    update(t) {
      const T = ctx.time;
      space.update(T, earth);

      // A: 地球と月を並べた構図（誕生の終わりから続く）
      space.framing(pA, tA, tan);
      // B: 月の横から、灼けた表面が冷えていくのを見る
      const m = space.moonPos;
      mHat.copy(m).normalize();
      pB.copy(m).addScaledVector(tan, 1.0).addScaledVector(UP, 0.3).addScaledVector(mHat, -0.25);
      tB.copy(m).addScaledVector(mHat, -0.05);
      // C: 月面に固定されたカメラ
      space.anchorTransform(pC, qC);

      const k1 = easeInOut(range(t, 4, 16));
      const k2 = easeInOut(range(t, 15, 27));
      pos.lerpVectors(pA, pB, k1);
      target.lerpVectors(tA, tB, k1);
      lookAtQuat(pos, target, qExt);

      camera.position.lerpVectors(pos, pC, k2);
      camera.quaternion.slerpQuaternions(qExt, qC, k2);
      setFov(camera, lerp(40, 36, k2));
    },

    dispose() {},
  };
}
