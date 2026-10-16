---
name: 长征 · 重走长征路
description: 红色文献装帧风格的打卡答题应用 —— 深红 shell、宣纸工作区、烫金状态、盖章打卡
colors:
  red-deep: "#4A0510"
  red-dark: "#6E0918"
  red: "#A8182C"
  red-mid: "#C8102E"
  red-bright: "#D43A4E"
  red-bg: "#FAEEEF"
  gold: "#C9A227"
  gold-light: "#E8C86A"
  gold-deep: "#8F6E0B"
  gold-pale: "#F5E9C8"
  gold-bg: "#FAF4E2"
  paper: "#F5EFE0"
  card: "#FFFDF6"
  ink: "#33261A"
  muted: "#6E6350"
  line: "#E3D6B8"
  green: "#3E7C44"
  green-bg: "#EDF4EC"
  gray-bg: "#ECE7DA"
typography:
  display:
    fontFamily: "'Noto Serif SC', 'Songti SC', 'SimSun', serif"
    fontWeight: 900
    letterSpacing: "0.3em"
  headline:
    fontFamily: "'Noto Serif SC', 'Songti SC', 'SimSun', serif"
    fontWeight: 700
    letterSpacing: "0.1em"
  body:
    fontFamily: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontWeight: 400
    fontSize: "15px"
    lineHeight: 1.65
  label:
    fontFamily: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontWeight: 400
    fontSize: "12px"
    letterSpacing: "0.08em"
rounded:
  lg: "12px"
  md: "8px"
  sm: "5px"
spacing:
  page-padding: "18px"
  card-padding: "16px 18px"
  card-gap: "14px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "linear-gradient(170deg, {colors.red-mid}, {colors.red-dark})"
    textColor: "#FFF6E0"
    rounded: "{rounded.sm}"
    padding: "14px 0"
    size: "16px"
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.red-dark}"
    rounded: "{rounded.sm}"
    padding: "14px 0"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "{spacing.card-padding}"
  badge-open:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.red}"
  badge-checked:
    backgroundColor: "{colors.red}"
    textColor: "#FFF4DC"
  badge-passed:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.red-deep}"
  badge-locked:
    backgroundColor: "#C9C0AC"
    textColor: "#F7F2E7"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.red-dark}"
    rounded: "6px"
    size: "62px"
---

## Overview

「重走长征路」是面向单位红色教育活动的打卡答题应用：沿长征路线 11 个关键节点依次打卡，每节点解锁答题关卡，全部通关后参加毕业考试。移动优先（手机为主，桌面 >520px 居中微调）。

视觉世界是**红色文献装帧**——苏区出版物与革命文物的材料语言：铅印宋体黑重大标、深红 shell（tabbar / hero）、宣纸工作区、烫金状态四色。签名动作：**打卡 = 盖章**（红色印章盖下动画，通关后变金章）。

设计服务于三件事：仪式感（每一步都有文物级的确认）、庄重大气（政治特色第一屏）、扫描效率（Operate 模式：标准 web 控件，世界只贡献 type / palette / density / 盖章动作）。

## Colors

- **深红五阶**（shell 与主色）：`--red-deep #4A0510` → `--red-dark #6E0918` → `--red #A8182C` → `--red-mid #C8102E` → `--red-bright #D43A4E`。深色端做页面 shell 与夜幕，中间端做主色与文字。
- **烫金三阶**（状态与装饰）：`--gold #C9A227` → `--gold-light #E8C86A`（深底上的金）→ `--gold-deep #8F6E0B`（宣纸底上的金）。金线一律 1px、45% 透明度（`--gold-border`）。
- **宣纸工作区**：`--paper #F5EFE0` 页面底，`--card #FFFDF6` 卡片面。金框细线 + 近无投影，卡片靠「纸叠纸」而非阴影分层。
- **墨字**：`--ink #33261A` 正文，`--muted #6E6350` 次要（宣纸底上对比度达标）。
- **辅助**：`--green #3E7C44` 仅用于正确/通过性辅助标记；红绿不同时承担同一语义。
- 深红渐变一律 `160deg~170deg` 斜向，忌 45deg 标准 AI 渐变；金色径向只用极低透明度（≤0.10）作天光。

## Typography

- 标题：Noto Serif SC 700/900（本地自托管 `fonts/noto-serif-sc.css`，202 个 @font-face 分片，零外部依赖）。大标用 900 + 大字距（0.3em 上下），模拟铅印书名。
- 正文：系统黑体栈 `PingFang SC / Hiragino Sans GB / Microsoft YaHei`，15px / 1.65。
- 字号阶：hero 32px(900) / 页面大标 26px(900) / 区块标 17px(700) / 正文 15px / 辅助 12px / 微注 11px。
- 数字一律 `font-variant-numeric: tabular-nums`；徽章、按钮文字用字距而不是字母间距撑宽。
- 禁：系统 display 字体、默认 sans-serif 标题、感叹号语气。

## Layout

- 单列移动优先，页面 padding 18px，卡片间距 14px，区块间距 24px。
- 底部 tabbar 固定（深红 shell + 顶部金线），三页：路线 / 地图 / 我的。
- 卡片内部：左对齐标题 + 右侧状态徽章；时间轴左侧金红菱形节点线。
- 桌面 >520px：#app 居中（max-width 480px），金侧线 + 深红落影，两侧露出宣纸底。
- 登录页全屏无 tabbar：深红夜幕 + 星空 + 山峦剪影 + 居中金框纸卡。

## Elevation & Depth

- 默认卡片几乎无阴影（`--shadow: 0 4px 18px rgba(74,5,16,0.10)`），层次靠色面与金线。
- 可点卡片 hover 投影加深（0 6px 22px，红色调 0.14）。
- 投影一律**有偏移、红色调**（光源统一来自上），禁零偏移光晕（dark-glow）。
- 深色 shell（hero / tabbar）不投彩色影；登录卡在夜幕中仅用近黑落影 + 金框定位。

## Shapes

- 全部方形倒角：`--r-lg 12px`（hero / cover / 大面板）、`--r-md 8px`（卡片 / 表单）、`--r-sm 5px`（按钮 / 徽章）。**无胶囊**。
- 徽章方角 3px + 1px 同色描边；印章方角 6px + 2.5px 边框 + 斑驳噪点。
- 装饰用几何：菱形（block-heading 标题符）、五角星（自绘 SVG path，禁字形 ★）、金线（hairline）。
- 禁：彩色 border-left >1px、彩色圆点列表、emoji 图标（全部自绘 SVG `UI.icon()`）。

## Components

- **按钮**：全宽块按钮，`button-primary` 深红渐变 + 金描边；`button-ghost` 纸面红字。按压 scale(0.98)，disabled 降透明度，focus 金环（`box-shadow: 0 0 0 3px`）。
- **徽章（状态四色）**：待打卡=白底红字红边；已打卡=红底金边白字；通关=金底深红字；锁定=灰褐底白字。
- **印章（签名动作）**：`.stamp` 62px 方形印章，「到 达」红印 /「通 关」金章，径向渐变噪点模拟印泥斑驳，rotate -3deg 常驻。入场 `stampIn`：scale 1.9→1 + rotate -14°→-3° + blur 2px→0（证书章单独 `certSealIn`，终态 -10deg）。
- **卡片**：`--card` 纸面 + 金框 + 12px 内边距；可点卡片 hover 投影加深。
- **对话框 / toast**：中央纸卡（金框）+ 底部深红 toast，无表情符号。
- **图标**：自绘 24 viewBox SVG 集（`js/ui.js ICON_PATHS`），stroke 1.8，`width 1em`，随字号缩放，色随 currentColor。

## Do's and Don'ts

- **Do**：用金线、菱形、五角星做装饰；深红渐变走 160~170deg；状态只讲四色；打卡用盖章动画；标题用 Noto Serif SC 900。
- **Don't**：不用 kicker/eyebrow 眉题；不用 emoji 或彩色圆点；不用零偏移光晕与暗底彩色投影；不用胶囊形状；不用感叹号；不用系统 display 字体；不用渐变按钮做「立体感」。
- 世界语言（保留项）：登录页星空 twinkle / 山峦 clip-path 剪影 / hero 斜纹（军旗纹理）/ 地图 SVG 网格（行军图本义）——这些是政治特色艺术化第一屏的组成部分，detect 的 saturated-pattern 警告不适用于 brief 锁定的语言。
