import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial } from 'three';

let texture: CanvasTexture | null = null;

function glowTexture() {
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  texture = new CanvasTexture(canvas);
  return texture;
}

/** 加算合成の光の玉。color は HDR（1 を超えてよい）でブルームに乗る */
export function makeGlow(r: number, g: number, b: number) {
  const material = new SpriteMaterial({
    map: glowTexture(),
    color: new Color(r, g, b),
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new Sprite(material);
  sprite.frustumCulled = false;
  return sprite;
}

export function setGlow(sprite: Sprite, r: number, g: number, b: number, intensity: number) {
  sprite.material.color.setRGB(r * intensity, g * intensity, b * intensity);
  sprite.visible = intensity > 0.001;
}
