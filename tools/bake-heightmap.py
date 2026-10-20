"""
烘焙真实高程高度图（离线用）：
  数据源：AWS Terrain Tiles (Terrarium PNG，公开无密钥)
  输出：assets/heightmap.png（8 位灰度）+ assets/heightmap.json（地理范围与海拔范围）

用法：python tools/bake-heightmap.py
说明：只需在联网环境跑一次；浏览器端只读本地 PNG，运行时不联网。
"""
import io
import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

Z = 6
LNG0, LNG1 = 80.0, 140.0       # 大范围：让 3D 沙盘铺满视野，不露纸边
LAT0, LAT1 = 0.0, 60.0
OUT_W = 1200                    # 输出分辨率（范围变大，需更高分辨率保住细节）

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'assets', 'map3d')


def lon2px(lon, z):
    return (lon + 180.0) / 360.0 * (2 ** z) * 256.0


def lat2px(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (2 ** z) * 256.0


def fetch(tx, ty):
    url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
    with urllib.request.urlopen(url, timeout=30) as r:
        return np.asarray(Image.open(io.BytesIO(r.read())).convert('RGB'), dtype=np.float32)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    x0, x1 = lon2px(LNG0, Z), lon2px(LNG1, Z)
    y0, y1 = lat2px(LAT1, Z), lat2px(LAT0, Z)

    tx0, tx1 = int(x0 // 256), int(x1 // 256)
    ty0, ty1 = int(y0 // 256), int(y1 // 256)

    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    dem = np.zeros((H, W), dtype=np.float32)

    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            rgb = fetch(tx, ty)
            # Terrarium 编码：elevation = (R*256 + G + B/256) - 32768
            elev = (rgb[:, :, 0] * 256.0 + rgb[:, :, 1] + rgb[:, :, 2] / 256.0) - 32768.0
            dem[(ty - ty0) * 256:(ty - ty0 + 1) * 256,
                (tx - tx0) * 256:(tx - tx0 + 1) * 256] = elev
            print(f'  tile {Z}/{tx}/{ty}  elev {elev.min():.0f}..{elev.max():.0f} m')

    # 裁到目标经纬范围
    cx0, cx1 = int(round(x0 - tx0 * 256)), int(round(x1 - tx0 * 256))
    cy0, cy1 = int(round(y0 - ty0 * 256)), int(round(y1 - ty0 * 256))
    crop = dem[cy0:cy1, cx0:cx1]

    out_h = int(round(OUT_W * crop.shape[0] / crop.shape[1]))
    img = Image.fromarray(crop.astype(np.float32), mode='F').resize((OUT_W, out_h), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32)

    e_min, e_max = 0.0, 6000.0   # 固定 0~6000 m，保证雪线、配色在任何范围下一致
    norm = np.clip((arr - e_min) / max(1.0, e_max - e_min), 0, 1)
    gray = (norm * 255.0).round().astype(np.uint8)

    png_path = os.path.join(OUT_DIR, 'heightmap.png')
    Image.fromarray(gray, mode='L').save(png_path, optimize=True)

    meta = {
        'lngMin': LNG0, 'lngMax': LNG1, 'latMin': LAT0, 'latMax': LAT1,
        'width': OUT_W, 'height': out_h,
        'elevMin': round(e_min, 1), 'elevMax': round(e_max, 1),
        'source': 'AWS Terrain Tiles (terrarium), zoom %d' % Z
    }
    with open(os.path.join(OUT_DIR, 'heightmap.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print('\n写出:', png_path)
    print('海拔范围: %.0f ~ %.0f m' % (e_min, e_max))
    print('尺寸: %dx%d' % (OUT_W, out_h))
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
