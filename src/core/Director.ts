import { clamp } from './math';
import type { Overlay } from './Overlay';
import type { Post } from './Post';
import type { Soundtrack } from './Soundtrack';
import { DURATION, SCENE_START } from './timeline';
import type { Ctx, SceneModule } from './types';

/**
 * 時計を進め、マスタータイムラインの再生ヘッドを動かし、
 * 該当シーンの setup / update / dispose を呼んで描画する。
 */
export class Director {
  time = 0;
  playing = true;
  speed = 1;
  fps = 60;
  private current: SceneModule | null = null;

  constructor(
    private readonly ctx: Ctx,
    private readonly scenes: SceneModule[],
    private readonly master: gsap.core.Timeline,
    private readonly post: Post,
    private readonly overlay: Overlay,
    private readonly sound: Soundtrack,
  ) {}

  get sceneName() {
    return this.current?.name ?? '';
  }

  seek(t: number) {
    this.time = clamp(t, 0, DURATION);
    this.sound.stop();
    if (this.time < DURATION && !this.playing) this.render();
  }

  setPlaying(p: boolean) {
    if (p && this.time >= DURATION) this.time = 0;
    this.playing = p;
    if (!p) this.sound.stop();
  }

  tick(dt: number) {
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    if (this.playing) {
      const audioTime = this.speed === 1 ? this.sound.time() : null;
      if (audioTime !== null) {
        this.time = audioTime;
      } else {
        this.time += dt * this.speed;
        if (this.speed === 1) this.sound.tryStart(this.time);
        else this.sound.stop();
      }
      if (this.time >= DURATION) {
        this.time = DURATION;
        this.playing = false;
        this.sound.stop();
      }
    }
    this.render();
  }

  private sceneAt(t: number) {
    let s = this.scenes[0];
    for (const sc of this.scenes) if (t >= SCENE_START[sc.name]) s = sc;
    return s;
  }

  render() {
    const { ctx } = this;
    const t = this.time;
    this.master.time(t, true);
    ctx.time = t;

    const scene = this.sceneAt(t);
    if (scene !== this.current) {
      this.current?.dispose();
      scene.setup();
      this.current = scene;
    }
    scene.update(t - SCENE_START[scene.name]);

    const stage = scene.stage === 'space' ? ctx.space : ctx.surface;
    ctx.renderer.toneMappingExposure = ctx.params.exposure;
    this.post.render(stage.scene, stage.camera, ctx.params.bloom);
    this.overlay.apply(ctx.params);
  }
}
