import {
  AdditiveBlending,
  BackSide,
  Color,
  DataTexture,
  Group,
  Mesh,
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';
import { DEG, smoothstep } from '../core/math';
import type { Params } from '../core/params';
import { NOISE_GLSL } from '../shaders/noise';

/*
 * 地球。uniform float uEra（0..1）ひとつで
 *   溶岩 → 冷えた岩 → 海の惑星 → 大陸 → 緑 → 氷期 → 緑 → 現代(Blue Marble) → 火 → 都市光(Black Marble)
 * をブレンドする。テクスチャが無い場合は手続き生成で代用する。
 */

const SURFACE_COMMON = /* glsl */ `
uniform float uEra;
uniform float uTime;
uniform float uContShift;
uniform float uTide;
uniform vec3 uMoonDirObj;
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform float uHasDay;
uniform float uHasNight;

${NOISE_GLSL}

float eraW(float a, float b) { return smoothstep(a, b, uEra); }

// 大陸の標高（uContShift でドメインがずれ、大陸が動く）
float landElevation(vec3 p) {
  vec3 q = p * 1.3 + vec3(uContShift * 0.8, uContShift * 0.12, -uContShift * 0.45);
  return fbm(q) * 0.9 + snoise(q * 0.45 + 7.0) * 0.35;
}

// 潮汐：月方向（と反対側）に海が盛り上がる P2(cos)
float tideShape(vec3 p) {
  float c = dot(p, uMoonDirObj);
  return 1.5 * c * c - 0.5;
}

struct Surf {
  vec3 albedo;
  float land;
  float water;
  float ice;
  float cloud;
  vec3 emit;
};

Surf earthSurface(vec3 p, vec2 uv) {
  Surf s;
  float wLava  = 1.0 - eraW(0.07, 0.2);
  float water  = eraW(0.1, 0.22);
  float emerge = eraW(0.24, 0.4);
  float green  = eraW(0.38, 0.5);
  float iceAge = eraW(0.5, 0.56) * (1.0 - eraW(0.6, 0.68));
  float modern = eraW(0.7, 0.8) * uHasDay;
  float caps   = eraW(0.3, 0.42);
  float lat = abs(p.y);

  float e = landElevation(p);
  float sea = mix(0.8, 0.06, emerge) + uTide * tideShape(p) * 0.09;
  float land = smoothstep(sea, sea + 0.015, e);
  float detail = fbm(p * 7.0 + 3.1);

  vec3 rock = vec3(0.10, 0.09, 0.085);
  vec3 ocean = mix(vec3(0.012, 0.035, 0.11), vec3(0.03, 0.10, 0.20), smoothstep(-0.12, 0.0, e - sea));
  vec3 seaCol = mix(rock, ocean, water);
  vec3 barren = mix(vec3(0.30, 0.24, 0.19), vec3(0.45, 0.37, 0.28), detail * 0.5 + 0.5);
  vec3 lush = mix(vec3(0.05, 0.16, 0.05), vec3(0.20, 0.26, 0.10), smoothstep(-0.4, 0.5, detail));
  float desert = smoothstep(0.35, 0.0, abs(lat - 0.33)) * smoothstep(-0.1, 0.4, detail);
  lush = mix(lush, vec3(0.55, 0.45, 0.30), desert * 0.7);
  vec3 col = mix(seaCol, mix(barren, lush, green), land);

  // 現代：Blue Marble
  vec3 tex = texture2D(uDayMap, uv).rgb;
  float texOcean = smoothstep(0.006, 0.025, tex.b - max(tex.r, tex.g) * 0.85);
  col = mix(col, tex, modern);
  land = mix(land, 1.0 - texOcean, modern);

  // 氷：極冠と氷期
  float capLine = mix(0.97, 0.80, caps);
  capLine = mix(capLine, 0.22, iceAge);
  float ice = smoothstep(capLine, capLine + 0.05, lat + detail * 0.06) * caps * (1.0 - modern * 0.85);
  ice = max(ice, iceAge * 0.3 * land);
  col = mix(col, vec3(0.85, 0.89, 0.95), ice);

  // 溶岩
  float n1 = snoise(p * 2.5 + vec3(0.0, uTime * 0.03, 0.0));
  float cr = pow(1.0 - abs(snoise(p * 6.0 + n1 * 0.6)), 7.0);
  col = mix(col, vec3(0.07, 0.045, 0.035), wLava);
  s.emit = vec3(1.6, 0.32, 0.05) * (cr * 1.4 + 0.08 * (0.6 + 0.4 * n1)) * wLava;
  s.emit += vec3(0.8, 0.15, 0.03) * cr * (1.0 - water) * (1.0 - wLava) * 0.5;

  // 雲（海ができる頃は厚い蒸気の雲）
  float cAmt = eraW(0.1, 0.2) * mix(0.85, 0.45, eraW(0.25, 0.42));
  float cn = fbm(p * 2.2 + vec3(uTime * 0.006, 0.0, uTime * 0.002)) * 0.5 + 0.5;
  float thr = mix(0.85, 0.35, cAmt);
  s.cloud = smoothstep(thr, thr + 0.15, cn) * step(0.001, cAmt);

  s.albedo = col;
  s.land = land;
  s.water = water * (1.0 - land) * (1.0 - ice);
  s.ice = ice;
  return s;
}
`;

const SURFACE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vObjPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const SURFACE_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
${SURFACE_COMMON}

void main() {
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObjPos);
  Surf s = earthSurface(p, vUv);

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndl = dot(N, L);
  float diff = smoothstep(-0.08, 1.0, ndl);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 80.0) * s.water * step(0.0, ndl) * 1.4;

  vec3 col = s.albedo * diff * 2.2 + vec3(1.0, 0.92, 0.8) * spec;
  col = mix(col, vec3(0.95) * diff * 1.6, s.cloud);

  // 夜側の火と都市の光
  float night = smoothstep(0.08, -0.18, ndl);
  float fire = eraW(0.79, 0.85) * (1.0 - eraW(0.9, 1.0) * 0.6);
  float city = eraW(0.86, 1.0);
  float speck = smoothstep(0.78, 0.95, snoise(p * 70.0)) * (0.6 + 0.4 * sin(uTime * 6.0 + p.x * 200.0));
  vec3 lights = vec3(1.8, 0.55, 0.12) * speck * fire;
  float nl;
  if (uHasNight > 0.5) {
    nl = dot(texture2D(uNightMap, vUv).rgb, vec3(0.3, 0.55, 0.15));
  } else {
    nl = smoothstep(0.55, 0.85, snoise(p * 8.0) * 0.5 + 0.5)
       * pow(max(snoise(p * 55.0) * 0.5 + 0.5, 0.0), 3.0) * 1.5;
  }
  // 明るい都市から順に灯り、広がっていく
  float cthr = mix(0.5, 0.004, city);
  float cityL = smoothstep(cthr, cthr * 2.0 + 0.002, nl) * sqrt(max(nl, 0.0)) * step(0.001, city);
  lights += vec3(1.0, 0.72, 0.38) * cityL * 2.5;
  lights *= s.land * (1.0 - s.ice) * night * (1.0 - s.cloud * 0.7);

  // 大気のふち（フレネル）
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 atmo = mix(vec3(1.0, 0.4, 0.15), vec3(0.35, 0.6, 1.0), eraW(0.1, 0.25));
  col += atmo * rim * smoothstep(-0.25, 0.5, ndl) * 0.9;

  col += s.emit + lights;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// 海面メッシュ：頂点シェーダーで月方向に数%膨らませる
const OCEAN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uTide;
uniform vec3 uMoonDirObj;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vBulge;
void main() {
  vUv = uv;
  vObjPos = position;
  vec3 p = normalize(position);
  float c = dot(p, uMoonDirObj);
  vBulge = uTide * (1.5 * c * c - 0.5);
  vec3 pos = position * (1.0025 + 0.035 * vBulge);
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const OCEAN_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vBulge;
${SURFACE_COMMON}

void main() {
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObjPos);
  Surf s = earthSurface(p, vUv);
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float diff = smoothstep(-0.05, 1.0, dot(N, L));
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 120.0) * step(0.0, dot(N, L));
  vec3 col = vec3(0.25, 0.5, 0.9) * max(vBulge, 0.0) * 0.35 * diff + vec3(1.0, 0.95, 0.85) * spec * 0.6;
  float a = s.water * (1.0 - s.cloud) * clamp(uTide * 1.5, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

const ATMO_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

// 視線と地球中心の最接近距離から、縁の光を滑らかに減衰させる
const ATMO_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uCenter;
uniform float uRe;
uniform float uRa;
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vWorldPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 oc = uCenter - cameraPosition;
  vec3 pc = cameraPosition + rd * dot(oc, rd);
  float d = length(pc - uCenter);
  float h = clamp((d - uRe) / (uRa - uRe), 0.0, 1.0);
  float g = pow(1.0 - h, 3.0);
  float sunF = smoothstep(-0.35, 0.4, dot(normalize(pc - uCenter), normalize(uSunDir)));
  gl_FragColor = vec4(uColor * g * sunF * uIntensity, 1.0);
}
`;

const blank = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
blank.needsUpdate = true;

const _c = new Vector3();
const _s = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();
const LAVA_ATMO = new Color(1.0, 0.42, 0.18);
const BLUE_ATMO = new Color(0.32, 0.58, 1.0);

export class Earth {
  /** ステージ側が位置とスケールを決める */
  readonly group = new Group();
  private readonly tilt = new Group();
  private readonly spin = new Group();
  private readonly ocean: Mesh;

  readonly uniforms = {
    uEra: { value: 0 },
    uTime: { value: 0 },
    uContShift: { value: 0 },
    uTide: { value: 0 },
    uMoonDirObj: { value: new Vector3(1, 0, 0) },
    uSunDir: { value: new Vector3(1, 0, 0) },
    uDayMap: { value: blank as Texture },
    uNightMap: { value: blank as Texture },
    uHasDay: { value: 0 },
    uHasNight: { value: 0 },
  };

  private readonly atmoUniforms = {
    uCenter: { value: new Vector3() },
    uRe: { value: 1 },
    uRa: { value: 1.07 },
    uSunDir: this.uniforms.uSunDir,
    uColor: { value: new Color() },
    uIntensity: { value: 1.3 },
  };

  constructor(day: Texture | null, night: Texture | null, segments = 160) {
    if (day) {
      this.uniforms.uDayMap.value = day;
      this.uniforms.uHasDay.value = 1;
    }
    if (night) {
      this.uniforms.uNightMap.value = night;
      this.uniforms.uHasNight.value = 1;
    }

    const geo = new SphereGeometry(1, segments, Math.round(segments * 0.75));
    const surface = new Mesh(
      geo,
      new ShaderMaterial({ uniforms: this.uniforms, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG }),
    );
    this.ocean = new Mesh(
      geo,
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: OCEAN_VERT,
        fragmentShader: OCEAN_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const atmosphere = new Mesh(
      new SphereGeometry(1.07, 96, 64),
      new ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: BackSide,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.spin.add(surface, this.ocean);
    this.tilt.add(this.spin);
    this.tilt.rotation.z = 23.4 * DEG;
    this.group.add(this.tilt, atmosphere);
  }

  setSunDirection(dir: Vector3) {
    this.uniforms.uSunDir.value.copy(dir).normalize();
  }

  /** 毎フレーム。moonWorld は潮汐の向き（月＝カメラ側）のワールド座標 */
  update(time: number, params: Params, moonWorld: Vector3) {
    const u = this.uniforms;
    this.spin.rotation.y = time * 0.12;
    u.uEra.value = params.era;
    u.uTime.value = time;
    u.uContShift.value = params.contShift;
    u.uTide.value = params.tide;

    this.group.updateMatrixWorld(true);
    const center = this.group.getWorldPosition(_c);
    const scale = this.group.getWorldScale(_s).x;
    _d.copy(moonWorld).sub(center).normalize();
    this.spin.getWorldQuaternion(_q).invert();
    u.uMoonDirObj.value.copy(_d).applyQuaternion(_q);

    const a = this.atmoUniforms;
    a.uCenter.value.copy(center);
    a.uRe.value = scale;
    a.uRa.value = scale * 1.07;
    a.uColor.value.copy(LAVA_ATMO).lerp(BLUE_ATMO, smoothstep(0.1, 0.25, params.era));

    this.ocean.visible = params.tide > 0.001;
  }
}
