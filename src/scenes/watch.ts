import { easeInOut, lerp, range, setFov } from '../core/math';
import type { Ctx, SceneModule } from '../core/types';

/*
 * 1:40–2:30 見守る
 * 月面から地球を見つめ続ける。地球は緑→氷→緑と変わり、大陸が動く。
 * 海が月の方向へ膨らみ（潮汐）、夜側に火が灯り、都市の光へ広がっていく。
 * 時代の変化はマスタータイムラインの era / contShift / tide が担う。
 */
export function createWatch(ctx: Ctx): SceneModule {
  const { space, earth } = ctx;
  const camera = space.camera;

  return {
    name: 'watch',
    stage: 'space',

    setup() {
      space.activate(earth);
    },

    update(t) {
      space.update(ctx.time, earth);
      space.anchorTransform(camera.position, camera.quaternion);
      // ほんの少しずつ寄る（地球が遠ざかるのを打ち消しきらない程度）
      setFov(camera, lerp(36, 30, easeInOut(range(t, 0, 50))));
    },

    dispose() {},
  };
}
