import os, sys, ssl, urllib.request

dir_ = os.path.join(r'C:\Users\HP\Desktop\changzheng-web-main\competition-timeline', '.tools', 'srcfonts')
os.makedirs(dir_, exist_ok=True)
C = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC'
J = 'https://fastly.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC'
jobs = [
    ('NotoSerifSC-Regular.otf', [C, J]),
    ('NotoSerifSC-Bold.otf', [J, C]),
    ('NotoSerifSC-Black.otf', [J, C]),
]
ctx = ssl.create_default_context()
for name, bases in jobs:
    out = os.path.join(dir_, name)
    done = False
    for b in bases:
        url = b + '/' + name
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'python-urllib/3.12'})
            with urllib.request.urlopen(req, timeout=120, context=ctx) as r, open(out, 'wb') as f:
                n = 0
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
                    n += len(chunk)
            magic = open(out, 'rb').read(4)
            print('OK  ', name, url, 'bytes=%d' % n, 'magic=%r' % magic)
            if magic == b'OTTO' and n > 1000000:
                done = True
                break
        except Exception as e:
            print('ERR ', name, url, type(e).__name__, str(e)[:200])
            if os.path.exists(out):
                os.remove(out)
    if not done:
        print('FAIL', name)
print('--- listing ---')
for n in sorted(os.listdir(dir_)):
    print(n, os.path.getsize(os.path.join(dir_, n)))
