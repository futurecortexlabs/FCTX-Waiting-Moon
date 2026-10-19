import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { mulberry32 } from '../core/math';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

/** 瞬かない星（月には大気がない） */
export class Stars {
  readonly points: Points;
  readonly uniforms = { uPixelRatio: { value: 1 } };

  constructor(count: number, radius: number, seed = 7) {
    const rnd = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) {
        i--;
        continue;
      }
      v.normalize().multiplyScalar(radius);
      pos.set([v.x, v.y, v.z], i * 3);
      const m = Math.pow(rnd(), 6);
      size[i] = 0.8 + m * 2.2;
      const b = 0.12 + m * 1.6;
      const temp = rnd();
      const r = temp < 0.2 ? 0.75 : temp > 0.85 ? 1.0 : 0.95;
      const bl = temp < 0.2 ? 1.0 : temp > 0.85 ? 0.7 : 0.95;
      color.set([r * b, 0.92 * b, bl * b], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));
    geo.setAttribute('aColor', new BufferAttribute(color, 3));
    this.points = new Points(
      geo,
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = -10;
  }

  setPixelRatio(pr: number) {
    this.uniforms.uPixelRatio.value = pr;
  }
}
