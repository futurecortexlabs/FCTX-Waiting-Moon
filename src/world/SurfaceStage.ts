import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEG, smoothstep } from '../core/math';
import type { Params } from '../core/params';
import type { Earth } from './Earth';
import { FootprintPatch } from './FootprintPatch';
import { Lander } from './Lander';
import { Stars } from './Stars';
import { Terrain } from './Terrain';

/** 月面スケールのステージ（1 = 1m）。火花・足跡・残るで使う */
export class SurfaceStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.01, 40000);

  /** 太陽は低く（長い影で足跡の凹凸が見える）、地球とはほぼ直角 → 地球は半分が夜 */
  readonly sunDir = new Vector3(0.93, 0.26, 0.25).normalize();
  readonly earthDir = new Vector3(0, Math.sin(22 * DEG), -Math.cos(22 * DEG));
  readonly earthDistance = 8000;
  readonly earthPos = new Vector3();

  readonly sun = new DirectionalLight(0xfff6ea, 7.5);
  readonly terrain: Terrain;
  readonly patch: FootprintPatch;
  readonly lander = new Lander();
  readonly stars = new Stars(5000, 20000, 11);

  /** 着陸地点と、足跡（ワールド座標と靴の向き） */
  readonly landingSite = new Vector3(7, 0, -21);
  readonly footprint = new Vector3(0.02, 0, 0.08);
  readonly footprintAngle = -0.18;
  readonly patchCenter = new Vector3(0, 0, 0);

  constructor(
    renderer: WebGLRenderer,
    private readonly params: Params,
  ) {
    const half = 0.75;
    this.terrain = new Terrain(this.patchCenter.x, this.patchCenter.z, half);
    this.patch = new FootprintPatch(this.patchCenter.x, this.patchCenter.z, half * 2);
    this.landingSite.y = this.terrain.heightAt(this.landingSite.x, this.landingSite.z);
    this.lander.root.position.copy(this.landingSite);
    this.lander.root.rotation.y = 0.6;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.01;
    this.setShadowFocus(new Vector3(), 12);

    // 地球照（ほんのわずか）
    const earthshine = new HemisphereLight(0x8899bb, 0x222222, 0.06);

    this.scene.add(
      this.sun,
      this.sun.target,
      earthshine,
      this.terrain.mesh,
      this.patch.mesh,
      this.lander.root,
      this.stars.points,
    );
    this.scene.environment = this.buildEnvironment(renderer);
    this.scene.environmentIntensity = 0.7;
  }

  /** 金属の反射用：黒い空、明るい灰色の地面、太陽 */
  private buildEnvironment(renderer: WebGLRenderer) {
    const env = new Scene();
    const geo = new SphereGeometry(10, 32, 16);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const g = 0.32 * (1 - smoothstep(-1.5, 0.5, pos.getY(i)));
      colors.set([g, g, g * 0.97], i * 3);
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    env.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
    const sunBall = new Mesh(new SphereGeometry(0.5, 16, 8), new MeshBasicMaterial({ color: new Color(3, 3, 2.8) }));
    sunBall.position.copy(this.sunDir).multiplyScalar(8);
    env.add(sunBall);
    const pmrem = new PMREMGenerator(renderer);
    const texture = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    return texture;
  }

  activate(earth: Earth) {
    this.scene.add(earth.group);
    earth.setSunDirection(this.sunDir);
  }

  /** 地球を空に置く。見かけの大きさは moonDist で決まる */
  update(T: number, earth: Earth) {
    this.earthPos.copy(this.earthDir).multiplyScalar(this.earthDistance);
    earth.group.position.copy(this.earthPos);
    earth.group.scale.setScalar(this.earthDistance / this.params.moonDist);
    earth.update(T, this.params, this.camera.position);
  }

  get earthRadius() {
    return this.earthDistance / this.params.moonDist;
  }

  setShadowFocus(center: Vector3, radius: number) {
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(this.sunDir, radius * 3 + 10);
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 0.1;
    cam.far = radius * 6 + 20;
    cam.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
  }

  /** 足跡を刻む（sink 0..1） */
  stampFootprint(sink: number) {
    this.patch.stamp(
      this.footprint.x - this.patchCenter.x,
      this.footprint.z - this.patchCenter.z,
      this.footprintAngle,
      sink,
    );
  }
}
