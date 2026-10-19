import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { easeOut, lerp, mulberry32, setFov, smoothstep } from '../core/math';
import type { Ctx, SceneModule } from '../core/types';
import { makeGlow, setGlow } from '../world/Glow';

/*
 * 0:00–0:50 誕生
 * 原始地球に火星大の天体が斜めに衝突。溶けた岩が飛び散り、破片の円盤が渦を巻いて、
 * 地球のすぐそばで赤い球（月）に集まる。
 */

const IMPACT_T = 7;
const THEIA_R = 0.53;

const DEBRIS_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aSeed;
attribute vec3 aDir;
uniform float uTime;
uniform vec3 uImpact;
uniform vec3 uMoon;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;

void main() {
  float te = max(uTime - ${IMPACT_T.toFixed(1)}, 0.0);

  // A: 衝突点から飛び散る
  float speed = 1.2 + 3.4 * aSeed.x;
  vec3 A = uImpact + aDir * speed * (1.0 - exp(-te * 0.9));

  // B: 地球を回る破片の円盤（ケプラー回転、内側ほど速い）
  float r = 1.35 + 3.6 * pow(aSeed.y, 0.8);
  vec3 a0 = uImpact + aDir * 2.0;
  float th = atan(a0.z, a0.x) + (aSeed.z - 0.5) * 1.2 + 1.1 * pow(r, -1.5) * max(uTime - 9.0, 0.0) * 1.6;
  float thick = mix(0.12, 0.05, smoothstep(14.0, 30.0, uTime));
  vec3 B = vec3(r * cos(th), (aSeed.w - 0.5) * thick * r, r * sin(th));
  vec3 P = mix(A, B, smoothstep(8.5 + aSeed.w * 2.0, 15.0 + aSeed.w * 3.0, uTime));

  // C: 一点（生まれる月）へ収束。一部は地球へ落ちる
  float tc = 26.0 + aSeed.x * 12.0;
  float k = smoothstep(tc, tc + 7.0, uTime);
  vec3 target = aSeed.z < 0.22 ? normalize(B) * 1.0 : uMoon + (aSeed.xyz - 0.5) * 0.35 * (1.0 - k);
  P = mix(P, target, k * k);

  // 衝突直後は粒が一点に重なって白飛びするので、広がるまでは薄く
  vAlpha = step(${IMPACT_T.toFixed(1)}, uTime) * (1.0 - smoothstep(0.82, 1.0, k)) * mix(0.08, 1.0, smoothstep(10.0, 20.0, uTime));
  float heat = exp(-te * 0.07);
  vColor = mix(vec3(1.0, 0.22, 0.05), vec3(1.0, 0.75, 0.45), heat) * (0.9 + 1.0 * heat) * (0.6 + 0.6 * aSeed.y);

  vec4 mv = modelViewMatrix * vec4(P, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(0.022 * (0.5 + aSeed.w) * uScale / -mv.z, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const DEBRIS_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying float vAlpha;
varying vec3 vColor;
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export function createBirth(ctx: Ctx): SceneModule {
  const { space, earth } = ctx;
  const camera = space.camera;

  // 衝突の幾何：かすめるように、やや内側へ
  const n = new Vector3(0.55, 0.12, -0.83).normalize();
  const tang = new Vector3().crossVectors(n, new Vector3(0, 1, 0)).normalize();
  const vdir = tang.clone().addScaledVector(n, -0.35).normalize();
  const contact = n.clone().multiplyScalar(1 + THEIA_R * 0.9);
  const impactPoint = n.clone();

  const theiaMat = new MeshStandardMaterial({ color: 0x4a3c34, roughness: 0.9, emissive: 0x000000 });
  const theia = new Mesh(new SphereGeometry(THEIA_R, 96, 64), theiaMat);
  const flash = makeGlow(9, 7, 5);

  const count = ctx.quality === 'high' ? 60000 : 24000;
  const rnd = mulberry32(3);
  const seeds = new Float32Array(count * 4);
  const dirs = new Float32Array(count * 3);
  const v = new Vector3();
  const rv = new Vector3();
  for (let i = 0; i < count; i++) {
    seeds.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    do rv.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    while (rv.lengthSq() > 1);
    v.copy(vdir).addScaledVector(n, 0.6).addScaledVector(rv, 0.8).normalize();
    dirs.set([v.x, v.y * 0.5, v.z], i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  geo.setAttribute('aDir', new BufferAttribute(dirs, 3));
  const uniforms = {
    uTime: { value: 0 },
    uImpact: { value: impactPoint },
    uMoon: { value: new Vector3() },
    uScale: { value: 800 },
  };
  const debris = new Points(
    geo,
    new ShaderMaterial({
      uniforms,
      vertexShader: DEBRIS_VERT,
      fragmentShader: DEBRIS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  debris.frustumCulled = false;

  const camPos = new Vector3();
  const camTarget = new Vector3();
  const fPos = new Vector3();
  const fTarget = new Vector3();
  const tan = new Vector3();

  return {
    name: 'birth',
    stage: 'space',

    setup() {
      space.activate(earth);
      space.scene.add(theia, flash, debris);
      setFov(camera, 40);
    },

    update(t) {
      const T = ctx.time;
      space.update(T, earth, Math.cbrt(smoothstep(30, 46, t)));

      // テイア
      if (t < IMPACT_T) {
        theia.visible = true;
        theia.scale.setScalar(1);
        theia.position.copy(contact).addScaledVector(vdir, 1.6 * (t - IMPACT_T));
        theiaMat.emissive.setRGB(0.9, 0.25, 0.05).multiplyScalar(smoothstep(4, IMPACT_T, t) * 0.6);
      } else {
        const k = smoothstep(IMPACT_T, IMPACT_T + 1.2, t);
        theia.visible = k < 1;
        theia.scale.setScalar(Math.max(1 - k, 1e-3));
        theia.position.copy(contact).addScaledVector(n, -0.5 * k).addScaledVector(vdir, 0.4 * k);
        theiaMat.emissive.setRGB(1.6, 0.45, 0.1);
      }

      // 閃光
      const ft = t - IMPACT_T;
      flash.position.copy(impactPoint).multiplyScalar(1.05);
      flash.scale.setScalar(0.4 + 5 * easeOut(Math.min(Math.max(ft, 0) / 0.6, 1)));
      setGlow(flash, 9, 7, 5, ft < 0 ? 0 : 0.6 * Math.exp(-ft * 2.2));

      // 破片
      uniforms.uTime.value = t;
      uniforms.uMoon.value.copy(space.moonPos);
      uniforms.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));

      // カメラ：衝突を横から見て、円盤を見下ろし、最後に地球と月を並べる
      const ang = -0.64 + t * 0.012;
      const dist = lerp(9.5, 13, smoothstep(0, 26, t));
      const elev = lerp(0.18, 0.62, smoothstep(4, 28, t));
      camPos.set(Math.cos(ang) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.sin(ang) * Math.cos(elev) * dist);
      camTarget.set(0, 0, 0);
      space.framing(fPos, fTarget, tan);
      const k = smoothstep(36, 48, t);
      camPos.lerp(fPos, k);
      camTarget.lerp(fTarget, k);
      if (ft > 0) {
        const s = 0.07 * Math.exp(-ft * 2.2);
        camPos.x += Math.sin(t * 61) * s;
        camPos.y += Math.sin(t * 47 + 1) * s;
      }
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(camTarget);
    },

    dispose() {
      space.scene.remove(theia, flash, debris);
    },
  };
}
