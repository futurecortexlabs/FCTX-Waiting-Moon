import { BufferAttribute, BufferGeometry, Color, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three';

export const MOON_G = 1.62;

export interface DustGrain {
  origin: Vector3;
  vel: Vector3;
  /** 打ち上げ時刻（シーンのローカル秒） */
  t0: number;
  /** 粒の大きさ（m） */
  size: number;
  alpha: number;
}

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aVel;
attribute vec4 aInfo; // t0, 飛行時間, size, alpha
uniform float uTime;
uniform float uG;
uniform float uScale;
varying float vAlpha;
void main() {
  float tau = uTime - aInfo.x;
  float life = aInfo.y;
  float tt = clamp(tau, 0.0, life);
  // 空気がないので、粒は放物線を描いてゆっくり落ちる
  vec3 p = position + aVel * tt + vec3(0.0, -0.5 * uG * tt * tt, 0.0);
  vAlpha = aInfo.w * step(0.0, tau) * smoothstep(0.0, 0.2, tau) * (1.0 - smoothstep(life, life + 1.5, tau));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(aInfo.z * uScale / -mv.z, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/** 低重力の砂煙。位置は時刻の関数なので、どの時刻へシークしても正しい */
export class Dust {
  readonly points: Points;
  private readonly uniforms = {
    uTime: { value: 0 },
    uG: { value: MOON_G },
    uScale: { value: 800 },
    uColor: { value: new Color(0.55, 0.53, 0.5) },
  };

  constructor(grains: DustGrain[], groundY: number, color?: Color) {
    const n = grains.length;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const info = new Float32Array(n * 4);
    grains.forEach((g, i) => {
      pos.set([g.origin.x, g.origin.y, g.origin.z], i * 3);
      vel.set([g.vel.x, g.vel.y, g.vel.z], i * 3);
      const h = Math.max(g.origin.y - groundY, 0);
      const life = (g.vel.y + Math.sqrt(g.vel.y * g.vel.y + 2 * MOON_G * h)) / MOON_G;
      info.set([g.t0, life, g.size, g.alpha], i * 4);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aVel', new BufferAttribute(vel, 3));
    geo.setAttribute('aInfo', new BufferAttribute(info, 4));
    if (color) this.uniforms.uColor.value.copy(color);
    this.points = new Points(
      geo,
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
  }

  update(t: number, camera: PerspectiveCamera, viewportHeight: number) {
    this.uniforms.uTime.value = t;
    this.uniforms.uScale.value = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
