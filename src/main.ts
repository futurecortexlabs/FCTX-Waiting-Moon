import './style.css';
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace, Texture, TextureLoader, WebGLRenderer } from 'three';
import { createDebugGui } from './core/debug';
import { Director } from './core/Director';
import { Overlay } from './core/Overlay';
import { createParams } from './core/params';
import { Post } from './core/Post';
import { Soundtrack } from './core/Soundtrack';
import { buildMasterTimeline, DURATION, SCENE_NAMES, SCENE_START, type SceneName } from './core/timeline';
import type { Ctx, Quality } from './core/types';
import { createScenes } from './scenes';
import { Earth } from './world/Earth';
import { SpaceStage } from './world/SpaceStage';
import { SurfaceStage } from './world/SurfaceStage';

const BASE = import.meta.env.BASE_URL;

/**
 * クエリ：
 *   ?scene=footprint&t=30  任意シーンのローカル時刻から再生
 *   ?t=123                 作品全体の時刻から再生
 *   ?debug                 タイムスライダー
 *   ?q=low                 軽量モード（粒子・解像度・MSAA を下げる）
 *   ?mute                  音楽を読み込まない
 *   ?paused                止めた状態で開く
 */
function parseQuery() {
  const q = new URLSearchParams(location.search);
  const scene = q.get('scene') as SceneName | null;
  const t = Number(q.get('t') ?? 0) || 0;
  let start = t;
  if (scene && (SCENE_NAMES as readonly string[]).includes(scene)) start = SCENE_START[scene] + t;
  return {
    start: Math.min(Math.max(start, 0), DURATION),
    debug: q.has('debug'),
    quality: (q.get('q') === 'low' ? 'low' : 'high') as Quality,
    muted: q.has('mute'),
    paused: q.has('paused'),
  };
}

async function loadTexture(names: string[]): Promise<Texture | null> {
  const loader = new TextureLoader();
  for (const name of names) {
    try {
      const tex = await loader.loadAsync(`${BASE}textures/${name}`);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    } catch {
      // 次の候補へ
    }
  }
  return null;
}

async function boot() {
  const query = parseQuery();
  const pixelRatio = () => Math.min(window.devicePixelRatio, query.quality === 'high' ? 1.5 : 1);

  const renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const sound = new Soundtrack(query.muted);
  const [day, night] = await Promise.all([
    loadTexture(['earth_day.jpg', 'earth_day.png']),
    loadTexture(['earth_night.jpg', 'earth_night.png']),
    sound.load([`${BASE}audio/music.mp3`, `${BASE}audio/music.ogg`, `${BASE}audio/music.m4a`]),
  ]);

  const params = createParams();
  const master = buildMasterTimeline(params);
  const earth = new Earth(day, night, query.quality === 'high' ? 160 : 96);
  const space = new SpaceStage(params);
  const surface = new SurfaceStage(renderer, params);
  const ctx: Ctx = { renderer, params, earth, space, surface, time: 0, quality: query.quality };
  const scenes = createScenes(ctx);
  const post = new Post(renderer, query.quality);
  const director = new Director(ctx, scenes, master, post, new Overlay(), sound);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = pixelRatio();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    post.setSize(w, h, pr);
    for (const cam of [space.camera, surface.camera]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    space.stars.setPixelRatio(pr);
    surface.stars.setPixelRatio(pr);
  };
  window.addEventListener('resize', resize);
  resize();

  // シェーダーを先にコンパイルしておき、シーン切り替えで止まらないようにする
  space.activate(earth);
  renderer.compile(space.scene, space.camera);
  surface.activate(earth);
  renderer.compile(surface.scene, surface.camera);

  // 全シーンを一度ずつ描いておく（影・環境マップ・初回アップロードのつかえを再生前に済ませる）。
  // 起動直後は黒フェード中なので見えない
  director.playing = false;
  for (const name of SCENE_NAMES) {
    director.seek(SCENE_START[name] + 20);
    director.render();
  }
  director.seek(query.start);
  director.render();
  director.playing = !query.paused;
  if (query.debug) {
    createDebugGui(director, params);
    // コンソールから director.seek(t) などを触れるように
    (window as unknown as { director: Director }).director = director;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') director.setPlaying(!director.playing);
  });

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    director.tick(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
