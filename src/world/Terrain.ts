import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Vector2 } from 'three';
import { fbm2, mulberry32, smoothstep } from '../core/math';
import { REGOLITH_GLSL } from '../shaders/regolith';

interface Crater {
  x: number;
  z: number;
  r: number;
}

function craterProfile(d: number) {
  let h = 0.06 * Math.exp(-(((d - 1) / 0.22) ** 2));
  if (d < 1) h += 0.2 * (d * d - 1);
  return h;
}

/**
 * 月面の大地。原点付近は細かく、遠くは粗い極座標グリッド。
 * 原点周辺（足跡パッチの範囲）はシェーダーで描かずにパッチへ任せる。
 */
export class Terrain {
  readonly mesh: Mesh;
  private readonly craters: Crater[] = [];
  private readonly patchMin = { value: new Vector2() };
  private readonly patchMax = { value: new Vector2() };

  constructor(patchCenterX: number, patchCenterZ: number, patchHalf: number, rings = 280, segments = 360, radius = 1800) {
    const rnd = mulberry32(42);
    for (let i = 0; i < 150; i++) {
      const r = 2.5 + 110 * Math.pow(rnd(), 4);
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * 1500;
      if (d < r + 40) continue;
      this.craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r });
    }

    const n = 1 + rings * segments;
    const pos = new Float32Array(n * 3);
    pos.set([0, this.heightAt(0, 0), 0], 0);
    for (let i = 1; i <= rings; i++) {
      const r = radius * Math.pow(i / rings, 2.3);
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos.set([x, this.heightAt(x, z), z], (1 + (i - 1) * segments + j) * 3);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      idx.push(0, 1 + j2, 1 + j);
    }
    for (let i = 1; i < rings; i++) {
      const a0 = 1 + (i - 1) * segments;
      const b0 = 1 + i * segments;
      for (let j = 0; j < segments; j++) {
        const j2 = (j + 1) % segments;
        idx.push(a0 + j, a0 + j2, b0 + j);
        idx.push(a0 + j2, b0 + j2, b0 + j);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    this.patchMin.value.set(patchCenterX - patchHalf, patchCenterZ - patchHalf);
    this.patchMax.value.set(patchCenterX + patchHalf, patchCenterZ + patchHalf);

    const material = new MeshStandardMaterial({ color: 0x8f8c87, roughness: 1, metalness: 0 });
    material.customProgramCacheKey = () => 'terrain';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPatchMin = this.patchMin;
      shader.uniforms.uPatchMax = this.patchMax;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace(
          '#include <displacementmap_vertex>',
          '#include <displacementmap_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWPos;
uniform vec2 uPatchMin;
uniform vec2 uPatchMax;
${REGOLITH_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  if (vWPos.x > uPatchMin.x && vWPos.x < uPatchMax.x && vWPos.z > uPatchMin.y && vWPos.z < uPatchMax.y) discard;
  diffuseColor.rgb *= regolithAlbedo(vWPos.xz);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    vec3 nW = inverseTransformDirection(normal, viewMatrix);
    nW = regolithNormalW(nW, vWPos.xz, length(vWPos - cameraPosition));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`,
        );
    };

    this.mesh = new Mesh(geo, material);
    this.mesh.receiveShadow = true;
    // パッチの下に隠れた地形が足跡の底に影を落とさないよう、地形は影を落とさない
    this.mesh.castShadow = false;
  }

  heightAt(x: number, z: number) {
    const r = Math.hypot(x, z);
    let h = fbm2(x / 90, z / 90, 4, 1) * 4 + fbm2(x / 18, z / 18, 3, 2) * 0.6 + fbm2(x / 4, z / 4, 2, 3) * 0.08;
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      if (d < 2.5) h += craterProfile(d) * c.r;
    }
    h *= smoothstep(6, 45, r);
    h += smoothstep(250, 1600, r) * (fbm2(x / 350, z / 350, 3, 4) * 0.5 + 0.5) * 70;
    return h;
  }
}
