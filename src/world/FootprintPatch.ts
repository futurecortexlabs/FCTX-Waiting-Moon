import {
  DataTexture,
  FloatType,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RedFormat,
} from 'three';
import { clamp, smoothstep } from '../core/math';
import { REGOLITH_GLSL } from '../shaders/regolith';
import { bootSdf } from './bootShape';

/**
 * 足跡を刻む月面の一区画。PlaneGeometry + ハイトマップ（DataTexture）。
 * ブーツ接地位置に深さを書き込み、フラグメントで法線を再計算して光の当たり方を変える。
 */
export class FootprintPatch {
  readonly mesh: Mesh;
  readonly size: number;
  private readonly res: number;
  private readonly heights: Float32Array;
  private readonly texture: DataTexture;
  private profile: { i0: number; i1: number; j0: number; j1: number; data: Float32Array } | null = null;
  private profileKey = '';
  private lastSink = -1;

  constructor(centerX: number, centerZ: number, size = 1.5, res = 1024, segments = 320) {
    this.size = size;
    this.res = res;
    this.heights = new Float32Array(res * res);
    this.texture = new DataTexture(this.heights, res, res, RedFormat, FloatType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    const geo = new PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const uHeight = { value: this.texture };
    const uTexel = { value: 1 / res };
    const uSize = { value: size };
    const material = new MeshStandardMaterial({
      color: 0x8f8c87,
      roughness: 1,
      metalness: 0,
      displacementMap: this.texture,
      displacementScale: 1,
    });
    material.customProgramCacheKey = () => 'footprint-patch';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHeight = uHeight;
      shader.uniforms.uTexel = uTexel;
      shader.uniforms.uSize = uSize;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec2 vPatchUv;')
        .replace(
          '#include <displacementmap_vertex>',
          '#include <displacementmap_vertex>\nvPatchUv = uv;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWPos;
varying vec2 vPatchUv;
uniform sampler2D uHeight;
uniform float uTexel;
uniform float uSize;
${REGOLITH_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  diffuseColor.rgb *= regolithAlbedo(vWPos.xz);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    float hL = texture2D(uHeight, vPatchUv - vec2(uTexel, 0.0)).r;
    float hR = texture2D(uHeight, vPatchUv + vec2(uTexel, 0.0)).r;
    float hD = texture2D(uHeight, vPatchUv - vec2(0.0, uTexel)).r;
    float hU = texture2D(uHeight, vPatchUv + vec2(0.0, uTexel)).r;
    float span = 2.0 * uTexel * uSize;
    // uv の v+ はワールドの -Z
    vec3 nW = normalize(vec3((hL - hR) / span, 1.0, (hU - hD) / span));
    nW = regolithNormalW(nW, vWPos.xz, length(vWPos - cameraPosition));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`,
        );
    };

    this.mesh = new Mesh(geo, material);
    this.mesh.position.set(centerX, 0, centerZ);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  clear() {
    this.stamp(0, 0, 0, 0);
  }

  /**
   * 足跡を書き込む。(x, z) はパッチ中心からの相対位置（m）、angle はブーツの向き、
   * sink は 0（跡なし）〜1（完全に沈んだ跡）。
   * 足跡の形は位置と向きごとに一度だけ計算し、毎フレームは sink 倍して書き込むだけにする。
   */
  stamp(x: number, z: number, angle: number, sink: number) {
    sink = Math.round(clamp(sink) * 1000) / 1000;
    const key = `${x.toFixed(3)},${z.toFixed(3)},${angle.toFixed(3)}`;
    if (key === this.profileKey && sink === this.lastSink) return;

    if (key !== this.profileKey) {
      // 前の足跡を消して、新しい形を計算しなおす
      if (this.profile) this.writeBox(0);
      this.profile = this.computeProfile(x, z, angle);
      this.profileKey = key;
    }
    this.writeBox(sink);
    this.lastSink = sink;
    this.texture.needsUpdate = true;
  }

  private writeBox(sink: number) {
    const p = this.profile;
    if (!p) return;
    const { res, heights } = this;
    const w = p.i1 - p.i0 + 1;
    for (let j = p.j0; j <= p.j1; j++) {
      const row = j * res + p.i0;
      const src = (j - p.j0) * w;
      for (let i = 0; i < w; i++) heights[row + i] = p.data[src + i] * sink;
    }
  }

  private computeProfile(x: number, z: number, angle: number) {
    const { res, size } = this;
    const fx = -Math.sin(angle);
    const fz = -Math.cos(angle);
    const rx = Math.cos(angle);
    const rz = -Math.sin(angle);
    const reach = 0.24;
    const toTex = (v: number) => (v / size + 0.5) * (res - 1);
    const i0 = Math.max(0, Math.floor(toTex(x - reach)));
    const i1 = Math.min(res - 1, Math.ceil(toTex(x + reach)));
    // テクセル j のワールド z は -(j/(res-1) - 0.5) * size
    const j0 = Math.max(0, Math.floor(toTex(-(z + reach))));
    const j1 = Math.min(res - 1, Math.ceil(toTex(-(z - reach))));
    const w = i1 - i0 + 1;
    const data = new Float32Array(w * (j1 - j0 + 1));
    for (let j = j0; j <= j1; j++) {
      const wz = -(j / (res - 1) - 0.5) * size;
      for (let i = i0; i <= i1; i++) {
        const wx = (i / (res - 1) - 0.5) * size;
        const dx = wx - x;
        const dz = wz - z;
        data[(j - j0) * w + (i - i0)] = footprintHeight(dx * rx + dz * rz, dx * fx + dz * fz);
      }
    }
    return { i0, i1, j0, j1, data };
  }
}


/** ブーツ座標 (u, v) での足跡の高さ（m）。負が凹み、縁は押し出された砂で少し盛り上がる */
function footprintHeight(u: number, v: number) {
  const d = bootSdf(u, v);
  if (d > 0.06) return 0;
  // かかと側が少し深い
  const depth = 0.032 * (1.1 - 0.2 * ((v + 0.165) / 0.33));
  if (d < 0) {
    const wall = smoothstep(0, 0.012, -d);
    // 靴底のシェブロン状の溝（足跡では山になる）
    const phase = ((v + Math.abs(u) * 0.55) / 0.017) * Math.PI * 2;
    const ridge = smoothstep(0.3, 0.7, 0.5 + 0.5 * Math.sin(phase)) * smoothstep(0.004, 0.012, -d);
    return -depth * wall + 0.0045 * ridge * wall;
  }
  // 外側の盛り上がり
  return 0.005 * Math.exp(-d / 0.012) * smoothstep(0, 0.003, d);
}
