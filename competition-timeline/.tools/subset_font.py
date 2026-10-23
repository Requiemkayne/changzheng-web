# 把思源宋体子集化成「只含站点实际用到的字符」的 woff2
import glob
import os
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 目录整体移动后仍然可用

# 扫描范围要覆盖所有会渲染中文的地方：
# 根目录所有 HTML（含后台页与各系列页，新增页面自动纳入）、css/*.css、
# 以及 JS 里动态生成的文案（如“优秀”印章）
sources = sorted(glob.glob(os.path.join(ROOT, '*.html')))
sources += sorted(glob.glob(os.path.join(ROOT, 'css', '*.css')))
sources += sorted(glob.glob(os.path.join(ROOT, 'js', '*.js')))

print('scanning %d sources' % len(sources))
chars = set()
for p in sources:
    if os.path.exists(p):
        chars |= set(open(p, encoding='utf-8').read())

# 常用备选（数字、标点、英文字母）
chars |= set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
chars |= set('，。、；：？！“”‘’（）《》〈〉—…·【】％‰+-×÷=±°')
# 兜底：管理台与印章常用的少量字，避免以后再漏
chars |= set('优秀置顶取消通过拒绝删除添加修改密码账号昵称留言审核全部')

text = ''.join(sorted(chars))
print('unique chars:', len(text))
for must in ['优', '秀']:
    print('  contains', must, ':', must in chars)

out_dir = os.path.join(ROOT, 'fonts')
os.makedirs(out_dir, exist_ok=True)

jobs = [
    ('NotoSerifSC-Regular.otf', 400, 'noto-serif-sc-400.woff2'),
    ('NotoSerifSC-Bold.otf', 700, 'noto-serif-sc-700.woff2'),
    ('NotoSerifSC-Black.otf', 900, 'noto-serif-sc-900.woff2'),
]
for src, weight, out in jobs:
    src_path = os.path.join(ROOT, '.tools', 'srcfonts', src)
    out_path = os.path.join(out_dir, out)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.desubroutinize = True
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    font = subset.load_font(src_path, opts)
    s = subset.Subsetter(options=opts)
    s.populate(text=text)
    s.subset(font)
    subset.save_font(font, out_path, opts)
    kb = os.path.getsize(out_path) / 1024
    print(f'{out}: {kb:.0f} KB (weight {weight})')

# 生成精简的 font css（带版本号，避免浏览器缓存旧字体导致字形缺失）
FONT_VER = '14'  # 11: 纳入 series-2「评委视角」长段落新增的 18 字
# 9: 纳入 index 引言（市赛 → 备赛 → 国赛）综述文案（v8 子集缺 遴/锋/众/封/搏）
# 8: 纳入 index 学校新闻（以赛促教结硕果）文案与 news-1 配图 alt（后该块已删除，字形保留在子集里）
# 8: 纳入 series-3「技术实现」卡片 tag「清洗」（v7 子集缺 U+6D17）
# 7: 纳入 series-3「赛场图集」五张配图 alt（v6 子集缺厢/叮/嘱/床/房/散/晚/材/途/铁）
# 6: 纳入 series-3「技术实现」板块（v5 子集缺 19 字：低况剔匹去垂域座情截敛残率纳追适针靠预）
# 5: 纳入「百炼成器 · 笃行致远」等新文案（v4 子集缺 32 字）
css_lines = ["/* Noto Serif SC 子集（仅含站点实际用到的字符，fontTools 生成） */"]
for _, weight, out in jobs:
    css_lines.append(f"""@font-face {{
  font-family: 'Noto Serif SC';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url({out}?v={FONT_VER}) format('woff2');
}}""")
open(os.path.join(out_dir, 'noto-serif-sc.css'), 'w', encoding='utf-8').write('\n'.join(css_lines) + '\n')
print('font css rewritten (v=%s)' % FONT_VER)
