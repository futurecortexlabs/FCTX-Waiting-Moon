import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';

export const DEG = Math.PI / 180;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** t を [a, b] から [0, 1] へ線形に写す（範囲外はクランプ） */
export const range = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = range(x, e0, e1);
  return t * t * (3 - 2 * t);
};

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t: number) => t * t * t;

const _m = new Matrix4();
const UP = new Vector3(0, 1, 0);

/** カメラ用（-Z が前）の lookAt クォータニオン */
export function lookAtQuat(eye: Vector3, target: Vector3, out: Quaternion, up = UP) {
  _m.lookAt(eye, target, up);
  return out.setFromRotationMatrix(_m);
}

const _t = new Vector3();

/** カメラを pos に置き、dir 方向を向かせる */
export function aim(camera: PerspectiveCamera, pos: Vector3, dir: Vector3) {
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(_t.copy(pos).add(dir));
}

/** 方向ベクトルを正規化しつつ補間する */
export function mixDir(a: Vector3, b: Vector3, t: number, out: Vector3) {
  return out.copy(a).normalize().lerp(_t.copy(b).normalize(), t).normalize();
}

export function setFov(camera: PerspectiveCamera, fov: number) {
  if (Math.abs(camera.fov - fov) > 1e-4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

/** 決定論的乱数 */
export function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 2D バリューノイズ（-1..1） */
export function valueNoise2(x: number, y: number, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
