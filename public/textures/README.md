# textures

NASA のパブリックドメイン画像（無くても手続き生成で代用して動きます）。

| ファイル名 | 内容 | 入手先 |
|---|---|---|
| `earth_day.jpg` | Blue Marble: Next Generation（2004年12月、地形・海底地形入り、正距円筒図法 5400×2700） | NASA Earth Observatory / Visible Earth：`eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg` |
| `earth_night.jpg` | Black Marble 2016（夜の都市光） | NASA Earth Observatory：`eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg` |

- `earth_night.jpg` は元画像（13500×6750）を 5400×2700 に縮め、青みがかった陸と海の地色を落として街の光だけを残したグレースケールにしてある。
  式は `v = clamp((max(R, G) − 0.24) / 0.72, 0, 1)^1.15`
- 差し替える場合も正距円筒図法 2:1。`.png` でも可（`earth_day.png` / `earth_night.png`）
- NASA 以外の著作物は使わないこと

Imagery courtesy NASA Earth Observatory (Blue Marble: Next Generation by Reto Stöckli; Black Marble 2016 by Joshua Stevens and Miguel Román, NASA Goddard).
