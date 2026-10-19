import { NOISE_GLSL } from './noise';

/** 月面（地形と足跡パッチ）で共有するレゴリスの色と微細な凹凸 */
export const REGOLITH_GLSL = /* glsl */ `
${NOISE_GLSL}

float regolithMicro(vec2 xz) {
  return snoise(xz * 7.0) * 0.0012 + snoise(xz * 31.0) * 0.0006 + snoise(xz * 97.0) * 0.00025;
}

vec3 regolithNormalW(vec3 nW, vec2 xz, float dist) {
  float fade = 1.0 - smoothstep(2.0, 14.0, dist);
  if (fade <= 0.0) return nW;
  float e = 0.003;
  float h0 = regolithMicro(xz);
  float hx = regolithMicro(xz + vec2(e, 0.0));
  float hz = regolithMicro(xz + vec2(0.0, e));
  vec3 g = vec3((hx - h0) / e, 0.0, (hz - h0) / e) * fade;
  return normalize(nW - g);
}

float regolithAlbedo(vec2 xz) {
  float a = 0.9 + 0.12 * snoise(xz * 0.035) + 0.07 * snoise(xz * 0.4) + 0.05 * snoise(xz * 3.0);
  float pebble = smoothstep(0.82, 0.9, snoise(xz * 22.0));
  return a + pebble * 0.15;
}
`;
