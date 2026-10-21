# 覆盖率校验：源文件里所有 CJK 字符（ord > 0x2E80）必须都在新 woff2 的 cmap 里
import glob
import os
from fontTools.ttLib import TTFont

ROOT = r'C:\Users\HP\Desktop\changzheng-web-main\competition-timeline'

sources = [
    'index.html',
    'series-2.html',
    'admin.html',
    'css/style.css',
    'css/series-2.css',
    'css/admin.css',
] + ['js/' + os.path.basename(p) for p in glob.glob(os.path.join(ROOT, 'js', '*.js'))]

needed = set()
for rel in sources:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        print('WARN missing source:', rel)
        continue
    with open(p, encoding='utf-8') as fh:
        for ch in fh.read():
            if ord(ch) > 0x2E80:
                needed.add(ch)

print('sources scanned:', len(sources))
print('needed (CJK, ord>0x2E80):', len(needed))

all_missing = set()
for w in ['noto-serif-sc-400.woff2', 'noto-serif-sc-700.woff2', 'noto-serif-sc-900.woff2']:
    p = os.path.join(ROOT, 'fonts', w)
    font = TTFont(p)
    cmap = font.getBestCmap()
    missing = sorted(ch for ch in needed if ord(ch) not in cmap)
    all_missing |= set(missing)
    print('%s bytes=%d cmap=%d missing=%d' % (w, os.path.getsize(p), len(cmap), len(missing)))
    if missing:
        print('   missing chars:', ''.join(missing))

print('missing total (union over 3 weights):', len(all_missing))
print('missing list:', repr(''.join(sorted(all_missing))))
print('RESULT:', 'PASS' if not all_missing else 'FAIL')
