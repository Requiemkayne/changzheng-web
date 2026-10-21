# 构建单文件版：把 CSS、字体、图片、脚本全部内嵌进指定页面，输出到 pub/<页面名>
# 用法：python .tools/build_single.py [入口页] [输出路径]
#   python .tools/build_single.py                            # 旧行为：index.html → pub/index.html
#   python .tools/build_single.py index.html pub/index.html
#   python .tools/build_single.py series-2.html pub/series-2.html
import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 目录整体移动后仍然可用

# 入口页（相对仓库根）与输出路径（相对仓库根）；输出缺省沿用旧约定 pub/<页面名>
PAGE = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
OUTREL = sys.argv[2] if len(sys.argv) > 2 else os.path.join('pub', PAGE)

SRC = os.path.join(ROOT, PAGE)
if not os.path.exists(SRC):
    sys.exit('页面不存在: %s' % SRC)

DEST = os.path.join(ROOT, OUTREL)
os.makedirs(os.path.dirname(DEST) or ROOT, exist_ok=True)

html = open(SRC, encoding='utf-8').read()
font_css = open(os.path.join(ROOT, 'fonts', 'noto-serif-sc.css'), encoding='utf-8').read()

MIME = {'.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2'}

def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, 'rb') as f:
        return 'data:%s;base64,%s' % (MIME.get(ext, 'application/octet-stream'), base64.b64encode(f.read()).decode())

# --- 本地样式表：页面里出现几个就内联几个（按原顺序），外链保持原样
HREF_RE = re.compile(r'href="([^"]+)"')
STYLE_LINK_RE = re.compile(r'<link\b[^>]*\brel="stylesheet"[^>]*>', re.I)
FONT_LINK_RE = re.compile(r'\s*<link[^>]*href="fonts/noto-serif-sc\.css[^"]*"[^>]*>', re.I)
FONT_CSS_NAME = 'noto-serif-sc.css'

def local_path(href):
    href = href.split('?')[0].split('#')[0]   # 去掉 ?v=2 之类的缓存版本号
    if re.match(r'^(?:[a-z][a-z0-9+.-]*:)?//', href, re.I):
        return None                           # http(s):// 或 // 外链
    p = os.path.join(ROOT, href.replace('/', os.sep))
    return p if os.path.exists(p) else None

local_styles = []
for tag in STYLE_LINK_RE.finditer(html):
    hm = HREF_RE.search(tag.group(0))
    p = local_path(hm.group(1)) if hm else None
    if p:
        local_styles.append(p)

# --- 只内嵌覆盖页面实际字符的字体分片
page_chars = {c for c in (html + ''.join(
    open(p, encoding='utf-8').read() for p in local_styles if not p.endswith(FONT_CSS_NAME))) if ord(c) > 0x2E80}

def parse_ranges(block):
    m = re.search(r'unicode-range:\s*([^;]+);', block)
    if not m:
        return None
    out = []
    for part in m.group(1).split(','):
        part = part.strip()
        if not part.startswith('U+'):
            continue
        v = part[2:]
        if '-' in v:
            a, b = v.split('-')
        elif '?' in v:
            a, b = v.replace('?', '0'), v.replace('?', 'F')
        else:
            a = b = v
        try:
            out.append((int(a, 16), int(b, 16)))
        except ValueError:
            continue
    return out

fontdir = os.path.join(ROOT, 'fonts')
def inline_url(m):
    name = m.group(1).strip('\'"')
    name = name.split('?')[0].split('#')[0]   # 去掉 ?v=2 之类的缓存版本号
    p = os.path.join(fontdir, name)
    return "url('%s')" % data_uri(p) if os.path.exists(p) else m.group(0)

blocks = re.findall(r'@font-face\s*\{[^}]*\}', font_css)
kept = []
for blk in blocks:
    rngs = parse_ranges(blk)
    if rngs is None:
        kept.append(blk); continue
    if any(lo <= ord(c) <= hi for c in page_chars for lo, hi in rngs):
        kept.append(blk)

# 去掉 unicode-range（单文件里没必要，且部分浏览器会因此跳过加载）
font_inlined = re.sub(r'\s*unicode-range:[^;]+;', '', '\n'.join(kept))
font_inlined = re.sub(r'url\(([^)]+)\)', inline_url, font_inlined)

# --- 图片内嵌
html = re.sub(r'src="(assets/img/[^"]+)"',
              lambda m: 'src="%s"' % data_uri(os.path.join(ROOT, m.group(1).replace('/', os.sep))), html)

# --- 合入样式：字体 CSS 的 <link> 移除；本地样式表逐个内联，首个带上字体 @font-face
html = FONT_LINK_RE.sub('', html)

first_style = [True]
def inline_style(m):
    tag = m.group(0)
    hm = HREF_RE.search(tag)
    p = local_path(hm.group(1)) if hm else None
    if not p:
        return tag
    css_text = open(p, encoding='utf-8').read()
    body = (font_inlined + '\n\n' + css_text) if first_style[0] else css_text
    first_style[0] = False
    return '<style>\n' + body + '\n</style>'

html = STYLE_LINK_RE.sub(inline_style, html)

# --- 合入脚本（留言区等）
def inline_script(m):
    src = m.group(1)
    if re.match(r'^(?:[a-z][a-z0-9+.-]*:)?//', src, re.I):
        return m.group(0)
    path = os.path.join(ROOT, src.replace('/', os.sep))
    if not os.path.exists(path):
        return m.group(0)
    code = open(path, encoding='utf-8').read()
    return '<script>\n' + code + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

open(DEST, 'w', encoding='utf-8').write(html)
print('built:', OUTREL, '| 入口:', PAGE, '|', round(os.path.getsize(DEST) / 1024 / 1024, 2), 'MB | font shards inlined:', len(kept), '/', len(blocks))
print('data URIs:', html.count('data:'))

# 自检：除跨页导航与锚点外，不应再残留本地资源引用（外链 http(s) 原样保留）
left = [u for u in re.findall(r'(?:src|href)="([^"]+)"', html)
        if not re.match(r'^(?:data:|https?:|//|#|mailto:)', u)]
print('保留的本地引用:', left if left else '(无)')
