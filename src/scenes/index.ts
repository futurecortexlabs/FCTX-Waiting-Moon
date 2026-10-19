import type { Ctx, SceneModule } from '../core/types';
import { createBirth } from './birth';
import { createFootprint } from './footprint';
import { createLock } from './lock';
import { createRemain } from './remain';
import { createSpark } from './spark';
import { createWatch } from './watch';

export function createScenes(ctx: Ctx): SceneModule[] {
  return [
    createBirth(ctx),
    createLock(ctx),
    createWatch(ctx),
    createSpark(ctx),
    createFootprint(ctx),
    createRemain(ctx),
  ];
}
