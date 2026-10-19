import type { WebGLRenderer } from 'three';
import type { Params } from './params';
import type { SceneName } from './timeline';
import type { Earth } from '../world/Earth';
import type { SpaceStage } from '../world/SpaceStage';
import type { SurfaceStage } from '../world/SurfaceStage';

export type Quality = 'high' | 'low';

/** シーン間で共有するもの */
export interface Ctx {
  renderer: WebGLRenderer;
  params: Params;
  earth: Earth;
  /** 宇宙スケール（地球半径 = 1） */
  space: SpaceStage;
  /** 月面スケール（1 = 1m） */
  surface: SurfaceStage;
  /** 作品全体の時刻（秒） */
  time: number;
  quality: Quality;
}

export interface SceneModule {
  readonly name: SceneName;
  readonly stage: 'space' | 'surface';
  setup(): void;
  /** t はシーン内のローカル時刻（秒） */
  update(t: number): void;
  dispose(): void;
}
