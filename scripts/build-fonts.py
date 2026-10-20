#!/usr/bin/env python3
"""
build-fonts.py —— 离线构建首屏 woff2（700 / 900 两档静态实例）

需要：fonttools + brotli（Python 包）。内置解释器已装好：
  "C:/Users/liwenyang/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
运行（仓库根目录下）：
  python scripts/build-fonts.py

产物直接落仓库（fonts/noto-serif-sc-{700,900}.woff2、fonts/glyphs.txt、fonts/noto-serif-sc.css），
**产物入库，运行时不需要构建**；只在页面文案/路由内容改动（出现新汉字）后手动重跑一次。

输入：fonts/ 下 101 个 Google Fonts 切片（fonts/urls.txt 记录来源，勿删）
     + index.html + js/**/*.js（排除 js/vendor/）+ server/**/*.json + server/**/*.js。
     后端模式下 /api/quiz 从 SQLite 下发题目/选项/解析正文（种子是 server/question-bank.json），
     这些字只出现在 server/ 里，漏扫会让正文逐字回落到 Songti SC / SimSun（一句话里两种衬线体）。
为什么不能直接 Merger：切片是可变字体（fvar wght 200–900，default 200），直接合并会报
  AttributeError: type object 'VarStore' has no attribute 'mergeMap'
所以先按目标字重实例化静态化，再合并、再子集化。
"""
import hashlib
import pathlib
import re
import sys
import tempfile

from fontTools.merge import Merger
from fontTools.subset import Options, Subsetter, save_font
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "fonts"
CSS_OUT = FONT_DIR / "noto-serif-sc.css"
GLYPHS_OUT = FONT_DIR / "glyphs.txt"
WEIGHTS = (700, 900)
# 固定时间戳，保证两次运行产出一致（head.created/modified 参与二进制比对）
FIXED_TS = 3700000000


def slice_files():
    """输入切片 = fonts/ 下除本脚本产物外的 woff2（101 个，来源见 fonts/urls.txt）。"""
    out = {FONT_DIR / ("noto-serif-sc-%d.woff2" % w) for w in WEIGHTS}
    return sorted(p for p in FONT_DIR.glob("*.woff2") if p not in out)


def source_files():
    """所有会渲染到页面上的文案来源：前端资源 + 后端下发内容。"""
    files = [ROOT / "index.html"]
    for p in sorted((ROOT / "js").rglob("*.js")):
        if "vendor" in p.relative_to(ROOT / "js").parts:
            continue
        files.append(p)
    # server/**/*.json（题库种子，正文来自这里）+ server/**/*.js（错误文案、日志、模板串）
    for pattern in ("*.json", "*.js"):
        files += sorted((ROOT / "server").rglob(pattern))
    return files


# 中文标点：整块 U+3000-303F / U+FF01-FF65 会把字体撑过 460KB 预算，
# 这里取标准中文标点集合（内容里真正用到的标点由下面的扫描补充）
CJK_PUNCT = (
    "　、。，．·；：？！…—―〜"
    "《》〈〉「」『』【】〔〕（）"
    "［］｛｝“”‘’＂＇％＋＝／"
    "＼｜＃＆＊＠～￥※‰§•←→↑↓"
)


def collect_charset():
    chars = {chr(c) for c in range(0x20, 0x7F)}
    chars |= set(CJK_PUNCT)
    for p in source_files():
        for ch in p.read_text(encoding="utf-8-sig", errors="ignore"):
            if ord(ch) >= 0x2000:
                chars.add(ch)
    return sorted(c for c in chars if 0x20 <= ord(c) < 0x7F or ord(c) >= 0xA0)


def write_glyphs(chars):
    head = (
        "# 首屏 webfont 字符集快照（构建输入 / 供人工 review）\n"
        "# 生成：scripts/build-fonts.py（扫描 index.html + js/**/*.js 排除 js/vendor/"
        " + server/**/*.json + server/**/*.js）\n"
        "# 一行一个字符；新增内容里出现新汉字后请重跑脚本重建 woff2\n"
    )
    GLYPHS_OUT.write_text(head + "\n".join(chars) + "\n", encoding="utf-8", newline="\n")


def static_instance(src, wght, tmpdir):
    font = TTFont(src)
    font.recalcTimestamp = False   # 否则 head.modified 写入当前时间，两次构建 sha 不一致
    instantiateVariableFont(font, {"wght": wght}, inplace=True, updateFontNames=False)
    out = tmpdir / (src.stem + "-%d.ttf" % wght)
    font.save(out)
    font.close()
    return out


def build_weight(wght, slices, text, tmpdir):
    statics = [str(static_instance(s, wght, tmpdir)) for s in slices]
    merged_path = tmpdir / ("merged-%d.ttf" % wght)
    merged = Merger().merge(statics)
    merged.recalcTimestamp = False
    merged["head"].created = FIXED_TS
    merged["head"].modified = FIXED_TS
    merged.save(merged_path)
    merged.close()
    for s in statics:
        pathlib.Path(s).unlink()

    font = TTFont(merged_path)
    font.recalcTimestamp = False
    opts = Options()
    opts.flavor = "woff2"
    # 竖排表与 BASE 表对横向网页文本无影响（全站无 writing-mode），去掉可省约 6KB/字体
    opts.drop_tables += ["BASE", "vhea", "vmtx"]
    # 只保留横向排版真正会用到的特性：竖排（vert/vrt2/vkrn）、比例宽度（palt/halt/vpal/vhal）、
    # 旧字形变体（jp78/jp83/jp90/jp04/trad/smpl）全站都没有 writing-mode / font-feature-settings 触发，
    # 属死重；locl/liga/ccmp 必留，否则简繁字形映射与连字会变。
    # kern 不留：GPOS 里 119 对拉丁 kern 在全站文案中只命中 16 对，且全部落在代码/注释里
    # （// xp #/ _V V_ B_ /p _p q, P_ @p Fx xV /& ?/ /x），已渲染的中文与标题零命中；
    # 而 103 个新汉字把 700+900 顶到 482,268 B（上限 480,000 B）——保 kern 要多 10,280 B，
    # 用零视觉收益换预算不划算。
    opts.layout_features = [
        "liga", "clig", "calt", "locl", "ccmp", "rlig", "rvrn", "mark", "mkmk",
    ]
    sub = Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(font)
    out = FONT_DIR / ("noto-serif-sc-%d.woff2" % wght)
    font["head"].created = FIXED_TS
    font["head"].modified = FIXED_TS
    font.flavorData = None
    save_font(font, str(out), opts)
    font.close()

    check = TTFont(str(out))
    cmap = check.getBestCmap()
    missing = [c for c in text if ord(c) not in cmap]
    glyphs = len(check.getGlyphOrder())
    check.close()
    return out, missing, glyphs


def write_css(paths):
    lines = [
        "/* Noto Serif SC 700/900 —— 本地自托管单文件（无 unicode-range，一个文件覆盖首屏全字符集）",
        "   构建：scripts/build-fonts.py；字符集快照 fonts/glyphs.txt；产物入库，运行时无需构建。",
        "   降级路径：若新内容里出现 glyphs.txt 之外的汉字，会回落到 Songti SC / SimSun（系统字体），",
        "   不会显示豆腐块；改完内容请重跑 scripts/build-fonts.py 重建 woff2 与 glyphs.txt。 */",
    ]
    for wght, path in zip(WEIGHTS, paths):
        lines += [
            "@font-face {",
            "  font-family: 'Noto Serif SC';",
            "  font-style: normal;",
            "  font-weight: %d;" % wght,
            "  font-display: swap;",
            "  src: url(%s) format('woff2');" % path.name,
            "}",
        ]
    CSS_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def main():
    slices = slice_files()
    if not slices:
        sys.exit("fonts/ 下没有 woff2 切片，无法构建")
    chars = collect_charset()
    write_glyphs(chars)
    text = "".join(chars)
    print("slices=%d charset=%d" % (len(slices), len(chars)))

    outs = []
    with tempfile.TemporaryDirectory() as td:
        tmpdir = pathlib.Path(td)
        for wght in WEIGHTS:
            out, missing, glyphs = build_weight(wght, slices, text, tmpdir)
            outs.append(out)
            data = out.read_bytes()
            if missing:
                # 源字体本身没有这些字形（多为代码里的正则范围端点 / 注释符号，永不渲染）。
                # 只打码位不打字符：Windows GBK 控制台会因个别符号编码失败而中断构建。
                print("  WARN %s: %d codepoint(s) have no glyph in the source font and stay out"
                      " of the subset (code/log only, never rendered): %s" % (
                          out.name, len(missing), " ".join("U+%04X" % ord(c) for c in missing)))
            print("%s bytes=%d glyphs=%d sha256=%s missing=%d%s" % (
                out.name, len(data), glyphs, hashlib.sha256(data).hexdigest()[:16],
                len(missing), (" (%s)" % " ".join("U+%04X" % ord(c) for c in missing[:8])) if missing else ""))
    write_css(outs)
    print("wrote %s" % CSS_OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
