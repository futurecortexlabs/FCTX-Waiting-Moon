import { AmbientLight, DirectionalLight, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import type { Params } from '../core/params';
import type { Earth } from './Earth';
import { Moon } from './Moon';
import { Stars } from './Stars';

// 月の公転角：誕生直後は速く、遠ざかるにつれ遅くなる
const PHI0 = 0.4;
const PHI_A = 2.62;
const PHI_TAU = 19.1;

// 自転の残り（潮汐ロックで 0 に収束する）。76s〜92s で減速して止まる
const SPIN_W0 = 1.2;
const SPIN_T0 = 76;
const SPIN_T1 = 92;
const SPIN_THETA = (SPIN_W0 * (SPIN_T1 - SPIN_T0)) / 2;

const UP = new Vector3(0, 1, 0);

/** 宇宙スケールのステージ（地球半径 = 1）。誕生・向き合う・見守るで使う */
export class SpaceStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.0002, 3000);
  readonly sun = new DirectionalLight(0xffffff, 4);
  readonly sunDir = new Vector3();
  readonly moon = new Moon();
  readonly stars = new Stars(6000, 1200);
  readonly moonPos = new Vector3();

  constructor(private readonly params: Params) {
    // 見守るシーンで地球が半月に見えるよう、太陽は最終的な地球–月の線にほぼ直交
    const phiEnd = PHI0 + PHI_A;
    // 上下成分は、月面カメラの足元（北寄り）の地面に光が当たるように
    this.sunDir.set(Math.cos(phiEnd + Math.PI / 2 + 0.2), 0.6, Math.sin(phiEnd + Math.PI / 2 + 0.2)).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    // 影を落とす物は無いが、月面ステージと「影あり」の状態を揃えておく。
    // 揃っていないと、ステージ間を移る地球のシェーダーが毎回コンパイルし直されて止まる
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(16, 16);
    this.scene.add(this.sun, this.sun.target, new AmbientLight(0x8899aa, 0.05), this.moon.group, this.stars.points);
  }

  activate(earth: Earth) {
    earth.group.position.set(0, 0, 0);
    earth.group.scale.setScalar(1);
    this.scene.add(earth.group);
    earth.setSunDirection(this.sunDir);
  }

  static orbitAngle(T: number) {
    return PHI0 + PHI_A * (1 - Math.exp(-T / PHI_TAU));
  }

  static spinResidual(T: number) {
    if (T < SPIN_T0) return SPIN_THETA + SPIN_W0 * (SPIN_T0 - T);
    if (T > SPIN_T1) return 0;
    const s = (T - SPIN_T0) / (SPIN_T1 - SPIN_T0);
    return SPIN_THETA * (1 - s) * (1 - s);
  }

  moonPosition(T: number, out: Vector3) {
    const phi = SpaceStage.orbitAngle(T);
    const d = this.params.moonDist;
    return out.set(Math.cos(phi) * d, 0, Math.sin(phi) * d);
  }

  /** 公転方向の単位ベクトル（太陽側を向くよう符号を揃える） */
  tangent(out: Vector3) {
    out.set(-this.moonPos.z, 0, this.moonPos.x).normalize();
    if (out.dot(this.sunDir) < 0) out.negate();
    return out;
  }

  update(T: number, earth: Earth, moonScale = 1) {
    const { moon } = this;
    this.moonPosition(T, this.moonPos);
    moon.group.position.copy(this.moonPos);
    moon.group.scale.setScalar(Math.max(moonScale, 1e-4));
    moon.group.visible = moonScale > 1e-3;
    moon.group.up.copy(UP);
    moon.group.lookAt(0, 0, 0);
    moon.body.rotation.y = SpaceStage.spinResidual(T);
    moon.setHeat(this.params.moonHeat);
    moon.setTime(T);
    moon.group.updateMatrixWorld(true);
    earth.update(T, this.params, this.moonPos);
  }

  /** 月面に固定されたカメラ位置（ワールド） */
  anchorTransform(pos: Vector3, quat: Quaternion) {
    this.moon.anchor.getWorldPosition(pos);
    this.moon.anchor.getWorldQuaternion(quat);
  }

  /** 地球と月を並べて収める外からの構図 */
  framing(pos: Vector3, target: Vector3, tan: Vector3) {
    const d = this.params.moonDist;
    this.tangent(tan);
    target.copy(this.moonPos).multiplyScalar(0.5);
    pos.copy(target).addScaledVector(tan, 6.5 * Math.pow(d / 3.5, 0.6)).addScaledVector(UP, 1.6);
  }
}
