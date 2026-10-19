import {
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
  Vector2,
} from 'three';
import { bootOutline } from './bootShape';

// 人間はブーツと手袋だけ。顔や全身は描かない。

// 強い直射日光でも白飛びしないよう、白い布は暗めの値にしておく
const fabric = new MeshStandardMaterial({ color: 0x8e8c88, roughness: 0.85, metalness: 0 });
const rubber = new MeshStandardMaterial({ color: 0x3c3c3c, roughness: 0.9, metalness: 0 });

function shadowed<T extends Object3D>(o: T) {
  o.traverse((c) => {
    c.castShadow = true;
    c.receiveShadow = true;
  });
  return o;
}

function blob(sx: number, sy: number, sz: number, mat: MeshStandardMaterial) {
  const m = new Mesh(new SphereGeometry(1, 32, 20), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

/** 原点 = 靴底の中心（接地面）、つま先は -Z */
export class Boot {
  readonly group = new Group();

  constructor() {
    const bevel = 0.006;
    const shape = new Shape(bootOutline(bevel).map(([u, v]) => new Vector2(u, v)));
    const soleGeo = new ExtrudeGeometry(shape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
    });
    // 形状の (u, v) を (x, -z) に、押し出しを +y に
    soleGeo.rotateX(-Math.PI / 2);
    soleGeo.translate(0, bevel, 0);
    const sole = new Mesh(soleGeo, rubber);

    const foot = blob(0.062, 0.065, 0.15, fabric);
    foot.position.set(0, 0.07, -0.01);
    const toe = blob(0.058, 0.04, 0.06, rubber);
    toe.position.set(0, 0.048, -0.115);
    const shaft = new Mesh(new CylinderGeometry(0.066, 0.072, 0.24, 32), fabric);
    shaft.position.set(0, 0.2, 0.06);
    shaft.rotation.x = 0.08;
    const strap = new Mesh(new CylinderGeometry(0.074, 0.074, 0.025, 32), rubber);
    strap.position.set(0, 0.13, 0.055);

    this.group.add(sole, foot, toe, shaft, strap);
    shadowed(this.group);
  }
}

/** 原点 = 手のひらの下面中心、指先は -Z、手のひらは下向き */
export class Glove {
  readonly group = new Group();

  constructor() {
    const palm = blob(0.05, 0.022, 0.06, fabric);
    palm.position.set(0, 0.024, 0);
    const back = blob(0.048, 0.02, 0.05, fabric);
    back.position.set(0, 0.04, 0.005);
    this.group.add(palm, back);

    const fingers: [number, number][] = [
      [-0.032, 0.05],
      [-0.011, 0.058],
      [0.011, 0.055],
      [0.031, 0.045],
    ];
    for (const [x, len] of fingers) {
      const f = new Mesh(new CapsuleGeometry(0.0105, len, 4, 12), fabric);
      f.rotation.x = -Math.PI / 2;
      f.position.set(x, 0.014, -0.055 - len / 2);
      const tip = blob(0.0115, 0.0115, 0.013, rubber);
      tip.position.set(x, 0.014, -0.06 - len);
      this.group.add(f, tip);
    }
    const thumb = new Mesh(new CapsuleGeometry(0.012, 0.04, 4, 12), fabric);
    thumb.rotation.set(-Math.PI / 2, 0, 0);
    thumb.rotation.y = 0.7;
    thumb.position.set(0.058, 0.016, -0.03);
    // 袖は長くして、端が画面の外に出るようにする（腕から先は描かない）
    const cuff = new Mesh(new CylinderGeometry(0.055, 0.068, 0.6, 24), fabric);
    cuff.position.set(0, 0.246, 0.284);
    cuff.rotation.x = 0.9;
    const ring = new Mesh(new CylinderGeometry(0.06, 0.06, 0.03, 24), rubber);
    ring.position.set(0, 0.06, 0.05);
    ring.rotation.x = 0.9;
    this.group.add(thumb, cuff, ring);
    shadowed(this.group);
  }
}
