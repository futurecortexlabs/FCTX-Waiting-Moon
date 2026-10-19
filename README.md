# 待つ月：45億年の片思い

ブラウザで再生する約 5 分の Three.js 映像作品。仕様は [CLAUDE.md](CLAUDE.md)。

```bash
npm install
npm run dev
```

## 素材（任意）

- `public/textures/earth_day.jpg`, `earth_night.jpg` — NASA Blue Marble / Black Marble（[説明](public/textures/README.md)）
- `public/audio/music.mp3` — 音楽（[説明](public/audio/README.md)）

どちらも無くても最後まで再生されます（地球は手続き生成、音は無音）。

## デバッグ用クエリ

| クエリ | 意味 |
|---|---|
| `?scene=footprint&t=30` | シーン「足跡」の 30 秒目から再生 |
| `?t=123` | 作品全体の 123 秒目から再生 |
| `?debug` | タイムスライダー（lil-gui） |
| `?q=low` | 軽量モード（粒子数・解像度・MSAA を下げる） |
| `?mute` | 音楽を読み込まない |
| `?paused` | 止めた状態で開く |

スペースキーで一時停止／再開。

シーン名：`birth`（0:00）, `lock`（0:50）, `watch`（1:40）, `spark`（2:30）, `footprint`（3:30）, `remain`（4:20）

## 構成

```
src/
  main.ts              起動、クエリ、ループ
  core/
    timeline.ts        マスタータイムライン（GSAP 1 本）とシーン境界
    params.ts          タイムラインが動かす全体パラメータ（era, moonDist, fade など）
    Director.ts        時計・シーン切り替え・描画
    Post.ts            EffectComposer + UnrealBloomPass
    Soundtrack.ts      THREE.Audio と時計の同期
    Overlay.ts         黒フェード、最後の一行、タイトル
    debug.ts           ?debug のスライダー
  scenes/              birth, lock, watch, spark, footprint, remain（各 setup / update(t) / dispose）
  world/
    Earth.ts           uniform era ひとつで時代をブレンドする地球、潮汐、都市光、大気
    Moon.ts            宇宙スケールの月（溶岩の emissive、月面カメラの位置）
    SpaceStage.ts      地球半径 = 1 のステージ
    SurfaceStage.ts    1 = 1m の月面ステージ
    Terrain.ts         月面の大地
    FootprintPatch.ts  ハイトマップに足跡を刻む区画
    Lander.ts          着陸船
    Suit.ts            ブーツと手袋
    Dust.ts            低重力の砂煙
```
