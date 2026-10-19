import { Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import { DEG } from '../core/math';
import { NOISE_GLSL } from '../shaders/noise';

const MOON_GLSL = /* glsl */ `
float craterField(vec3 p, float scale) {
  vec3 q = p * scale;
  vec3 i = floor(q);
  vec3 f = fract(q);
  float h = 0.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(i + g);
    if (o.y < 0.55) continue;
    vec3 d = g + o - f;
    float r = 0.18 + 0.25 * o.z;
    float dist = length(d) / r;
    float bowl = dist < 1.0 ? (dist * dist - 1.0) : 0.0;
    float rim = exp(-(dist - 1.0) * (dist - 1.0) * 12.0) * 0.3;
    h += (bowl * 0.5 + rim) * r;
  }
  return h;
}

float moonHeight(vec3 p) {
  return craterField(p, 5.0) + craterField(p, 13.0) * 0.5 + craterField(p, 37.0) * 0.25
       + craterField(p, 110.0) * 0.12 + fbm(p * 20.0) * 0.02;
}
`;

/**
 * 宇宙スケールの月。溶岩球のときは MeshStandardMaterial の emissive をノイズで揺らす。
 * body は自転、anchor は月面上のカメラ位置（地球の方角を見る）。
 */
export class Moon {
  static readonly RADIUS = 0.27;

  readonly group = new Group();
  readonly body: Mesh;
  readonly anchor = new Object3D();
  private readonly uHeat = { value: 0 };
  private readonly uTime = { value: 0 };
  private readonly uBump = { value: 0.12 };

  constructor(segments = 256) {
    const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    material.customProgramCacheKey = () => 'moon';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHeat = this.uHeat;
      shader.uniforms.uTime = this.uTime;
      shader.uniforms.uBump = this.uBump;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vObjPos;
uniform float uHeat;
uniform float uTime;
uniform float uBump;
${NOISE_GLSL}
${MOON_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  vec3 mp = normalize(vObjPos);
  float mh = moonHeight(mp);
  float maria = smoothstep(0.05, 0.35, fbm(mp * 1.7 + 2.0));
  float alb = mix(0.62, 0.34, maria) * (0.9 + 0.2 * snoise(mp * 40.0)) + max(mh, 0.0) * 0.5;
  diffuseColor.rgb *= alb * mix(1.0, 0.22, uHeat);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    vec3 sp = -vViewPosition;
    vec3 dpdx = dFdx(sp);
    vec3 dpdy = dFdy(sp);
    float dhx = dFdx(mh) * uBump;
    float dhy = dFdy(mh) * uBump;
    vec3 r1 = cross(dpdy, normal);
    vec3 r2 = cross(normal, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
    normal = normalize(abs(det) * normal - grad);
  }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  {
    float lavaN = snoise(mp * 3.0 + vec3(uTime * 0.05));
    float crk = pow(1.0 - abs(snoise(mp * 7.0 + lavaN * 0.7)), 8.0);
    float flick = 0.75 + 0.25 * snoise(mp * 5.0 + vec3(0.0, uTime * 0.4, 0.0));
    vec3 lava = mix(vec3(0.8, 0.07, 0.015), vec3(1.8, 0.55, 0.1), crk);
    totalEmissiveRadiance += lava * flick * (smoothstep(0.45, 1.0, uHeat) * 0.35 + crk * smoothstep(0.0, 0.6, uHeat) * 1.3);
  }`,
        );
    };

    this.body = new Mesh(new SphereGeometry(Moon.RADIUS, segments, Math.round(segments * 0.75)), material);
    this.group.add(this.body);
    this.body.add(this.anchor);

    // group の +Z が地球を向く（ロック状態）。カメラは表側の地球直下点から 75° 離れた所に立ち、
    // 地球が地平線から 15° 上に見える。地平線の伏角（高さ 0.3% で約 4.4°）も画面に入るよう、少しだけ見上げる。
    const R = Moon.RADIUS;
    const a = 75 * DEG;
    const n = new Vector3(0, Math.sin(a), Math.cos(a));
    const c = n.clone().multiplyScalar(R * 1.003);
    const e = new Vector3(0, 0, 1);
    const f = e.clone().addScaledVector(n, -e.dot(n)).normalize();
    const pitch = 6 * DEG;
    const d = f.multiplyScalar(Math.cos(pitch)).addScaledVector(n, Math.sin(pitch));
    const m = new Matrix4().lookAt(c, c.clone().add(d), n);
    this.anchor.position.copy(c);
    this.anchor.quaternion.setFromRotationMatrix(m);
  }

  setHeat(h: number) {
    this.uHeat.value = h;
  }

  setTime(t: number) {
    this.uTime.value = t;
  }
}
