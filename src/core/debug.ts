import GUI from 'lil-gui';
import type { Director } from './Director';
import { createParams, type Params } from './params';
import { DURATION, SCENE_NAMES, SCENE_START, type SceneName } from './timeline';

/** ?debug で表示するタイムスライダー */
export function createDebugGui(director: Director, params: Params) {
  document.body.classList.add('debug');
  const gui = new GUI({ title: 'debug' });

  const state = {
    get time() {
      return director.time;
    },
    set time(v: number) {
      director.seek(v);
    },
    get playing() {
      return director.playing;
    },
    set playing(v: boolean) {
      director.setPlaying(v);
    },
    scene: 'birth' as SceneName,
    get current() {
      return director.sceneName;
    },
    get fps() {
      return Math.round(director.fps);
    },
  };

  gui.add(state, 'time', 0, DURATION, 0.01).listen();
  gui.add(state, 'playing').listen();
  gui.add(director, 'speed', [0.25, 0.5, 1, 2, 4, 8]);
  gui
    .add(state, 'scene', [...SCENE_NAMES])
    .name('jump to')
    .onChange((name: SceneName) => director.seek(SCENE_START[name]));
  gui.add(state, 'current').listen().disable();
  gui.add(state, 'fps').listen().disable();

  const p = gui.addFolder('params (read only)');
  p.close();
  // GSAP が params に内部プロパティ（_gsap）を足すので、既知のキーだけ並べる
  for (const key of Object.keys(createParams()) as (keyof Params)[]) {
    p.add(params, key).listen().disable();
  }

  return gui;
}
