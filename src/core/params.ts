/** マスタータイムライン（GSAP）が動かす全体パラメータ */
export interface Params {
  /** 地球の時代 0..1（溶岩→海→緑→氷→緑→現代→都市光） */
  era: number;
  /** 地球–月距離（地球半径単位） */
  moonDist: number;
  /** 月の熱（1 = 溶けた赤い球） */
  moonHeat: number;
  /** 潮汐の強さ */
  tide: number;
  /** 大陸移動の量 */
  contShift: number;
  /** 黒フェード 0..1 */
  fade: number;
  /** 最後の一行の不透明度 */
  line: number;
  /** タイトルの不透明度 */
  title: number;
  bloom: number;
  exposure: number;
}

export function createParams(): Params {
  return {
    era: 0,
    moonDist: 3.5,
    moonHeat: 0,
    tide: 0,
    contShift: 0,
    fade: 1,
    line: 0,
    title: 0,
    bloom: 1.1,
    exposure: 1.0,
  };
}
