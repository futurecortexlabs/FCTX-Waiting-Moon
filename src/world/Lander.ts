import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Sprite,
  Vector3,
} from 'three';
import { lerp } from '../core/math';
import { makeGlow, setGlow } from './Glow';

const Y = new Vector3(0, 1, 0);

/**
 * 着陸船（特定の機体・ロゴではない汎用の形）。原点 = 着陸脚の接地面の中心。
 * 下段（降下段）は月に残り、上段（上昇段）が帰っていく。
 */
export class Lander {
  static readonly FOLD = -2.2;
  static readonly ASCENT_Y = 3.1;

  readonly root = new Group();
  readonly descent = new Group();
  readonly ascent = new Group();
  private readonly legs: Group[] = [];
  private readonly descentGlow: Sprite;
  private readonly ascentGlow: Sprite;
  private readonly light: PointLight;
  private readonly plumeMat: MeshBasicMaterial;

  constructor() {
    const gold = new MeshStandardMaterial({ color: 0x7a5f28, metalness: 0.75, roughness: 0.5, flatShading: true });
    const silver = new MeshStandardMaterial({ color: 0x7d7e7c, metalness: 0.45, roughness: 0.6, flatShading: true });
    const grey = new MeshStandardMaterial({ color: 0x5f605e, metalness: 0.4, roughness: 0.6, flatShading: true });
    const dark = new MeshStandardMaterial({ color: 0x1e1e1e, metalness: 0.3, roughness: 0.6, side: DoubleSide });
    const strutMat = new MeshStandardMaterial({ color: 0x9a8f7a, metalness: 0.7, roughness: 0.4 });

    // 降下段
    const body = new Mesh(new CylinderGeometry(2.1, 2.1, 1.6, 8), gold);
    body.position.y = 2.3;
    body.rotation.y = Math.PI / 8;
    const bell = new Mesh(new CylinderGeometry(0.38, 0.8, 0.9, 24, 1, true), dark);
    bell.position.y = 1.05;
    this.descent.add(body, bell);

    const strut = (a: Vector3, b: Vector3, r: number) => {
      const d = b.clone().sub(a);
      const m = new Mesh(new CylinderGeometry(r, r, d.length(), 8), strutMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(Y, d.normalize());
      return m;
    };
    const foot = new Vector3(0, -2.53, 2.4);
    for (let i = 0; i < 4; i++) {
      const holder = new Group();
      holder.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
      const leg = new Group();
      leg.position.set(0, 2.6, 1.85);
      leg.add(strut(new Vector3(), foot, 0.07));
      leg.add(strut(new Vector3(0, -1.1, -0.25), foot.clone().multiplyScalar(0.55), 0.045));
      const pad = new Mesh(new CylinderGeometry(0.42, 0.48, 0.12, 20), strutMat);
      pad.position.copy(foot);
      leg.add(pad);
      holder.add(leg);
      this.descent.add(holder);
      this.legs.push(leg);
    }

    // 上昇段
    const cabin = new Mesh(new BoxGeometry(2.5, 2.0, 2.3), silver);
    cabin.position.set(0, 1.0, 0.1);
    const rear = new Mesh(new BoxGeometry(1.8, 1.5, 1.3), grey);
    rear.position.set(0, 1.15, -1.5);
    const hatch = new Mesh(new CylinderGeometry(0.45, 0.5, 0.4, 16), grey);
    hatch.position.set(0, 2.2, 0.1);
    this.ascent.add(cabin, rear, hatch);
    for (const sx of [-1, 1]) {
      const win = new Mesh(new BoxGeometry(0.5, 0.4, 0.05), dark);
      win.position.set(sx * 0.55, 1.45, 1.27);
      win.rotation.y = sx * 0.12;
      this.ascent.add(win);
      for (const sz of [-1, 1]) {
        const rcs = new Mesh(new BoxGeometry(0.22, 0.22, 0.22), grey);
        rcs.position.set(sx * 1.42, 1.65, sz * 1.0);
        this.ascent.add(rcs);
      }
    }
    const mast = new Mesh(new CylinderGeometry(0.03, 0.03, 0.8, 6), strutMat);
    mast.position.set(0.9, 2.35, -0.6);
    const dish = new Mesh(new SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), silver);
    dish.position.set(0.9, 2.75, -0.6);
    this.ascent.add(mast, dish);
    this.ascent.position.y = Lander.ASCENT_Y;

    // 噴射の光
    this.descentGlow = makeGlow(6, 4, 2.5);
    this.descentGlow.position.y = 0.55;
    this.light = new PointLight(new Color(1, 0.72, 0.45), 0, 60, 1.5);
    this.light.position.y = 0.4;
    this.plumeMat = new MeshBasicMaterial({
      color: new Color(1.0, 0.62, 0.32),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const plume = new Mesh(new CylinderGeometry(0.75, 2.2, 5, 24, 1, true), this.plumeMat);
    plume.position.y = 0.6 - 2.5;
    this.descent.add(this.descentGlow, this.light, plume);

    this.ascentGlow = makeGlow(6, 4.5, 3);
    this.ascentGlow.position.y = -0.1;
    this.ascent.add(this.ascentGlow);

    this.root.add(this.descent, this.ascent);
    this.root.traverse((o) => {
      if (o instanceof Mesh && o.material !== this.plumeMat) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.reset();
  }

  reset() {
    this.ascent.position.set(0, Lander.ASCENT_Y, 0);
    this.ascent.visible = true;
    this.root.visible = true;
    this.setLegs(1);
    this.setDescentEngine(0);
    this.setAscentEngine(0);
  }

  /** 0 = 畳んだ脚、1 = 広げた脚 */
  setLegs(k: number) {
    for (const leg of this.legs) leg.rotation.x = lerp(Lander.FOLD, 0, k);
  }

  setDescentEngine(i: number) {
    setGlow(this.descentGlow, 6, 4, 2.5, i);
    this.descentGlow.scale.setScalar(1.5 + 2 * i);
    this.light.intensity = 200 * i;
    this.plumeMat.opacity = 0.05 * i;
  }

  setAscentEngine(i: number) {
    setGlow(this.ascentGlow, 6, 4.5, 3, i);
    this.ascentGlow.scale.setScalar(1.2 + 1.5 * i);
  }
}
