/*
 * ブーツの靴底の形（足跡とブーツのメッシュで共有）。
 * 座標はブーツ中心基準で u = 横（右が +）、v = つま先方向。長さ約 33cm、幅約 13cm。
 */

export const HEEL_R = 0.048;
export const TOE_R = 0.064;
export const BOOT_H = 0.215;
const BOOT_MID = 0.1155;

/** Inigo Quilez の sdUnevenCapsule */
function sdUnevenCapsule(px: number, py: number, r1: number, r2: number, h: number) {
  px = Math.abs(px);
  const b = (r1 - r2) / h;
  const a = Math.sqrt(1 - b * b);
  const k = -b * px + a * py;
  if (k < 0) return Math.hypot(px, py) - r1;
  if (k > a * h) return Math.hypot(px, py - h) - r2;
  return a * px + b * py - r1;
}

export function bootSdf(u: number, v: number) {
  return sdUnevenCapsule(u, v + BOOT_MID, HEEL_R, TOE_R, BOOT_H);
}

/** 輪郭（内側に inset だけ縮めたもの）を反時計回りの点列で返す */
export function bootOutline(inset: number, n = 72): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    let lo = 0;
    let hi = 0.3;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (bootSdf(cx * mid, cy * mid) < -inset) lo = mid;
      else hi = mid;
    }
    pts.push([cx * lo, cy * lo]);
  }
  return pts;
}
