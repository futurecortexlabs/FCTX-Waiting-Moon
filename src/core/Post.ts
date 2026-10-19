import { HalfFloatType, PerspectiveCamera, Scene, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Quality } from './types';

export class Post {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;

  constructor(renderer: WebGLRenderer, quality: Quality) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const rt = new WebGLRenderTarget(size.x, size.y, {
      type: HalfFloatType,
      samples: quality === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(new Scene(), new PerspectiveCamera());
    // ブルームは内部で縮小バッファを使う。low ではさらに半分に
    const bloomScale = quality === 'high' ? 0.5 : 0.25;
    this.bloom = new UnrealBloomPass(new Vector2(size.x * bloomScale, size.y * bloomScale), 1.0, 0.55, 0.85);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(scene: Scene, camera: PerspectiveCamera, bloomStrength: number) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.bloom.strength = bloomStrength;
    this.composer.render();
  }
}
