# AGENTS.md

面向在此仓库工作的 AI / 人类 agent：先读本文件，再按需读 `README.md`（主站功能与接口）、`competition-timeline/README.md`（专题站）、`DESIGN.md`（设计令牌）、`PRODUCT.md`（产品约束）。

## 项目是什么

仓库里是**两个站点**，同源托管、设计语言一致：

1. **主站「长征 · 重走长征路」**（仓库根目录）：沿长征路线 11 个节点虚拟打卡、答题闯关、毕业考试、积分赛排行榜的红色教育网页应用。
2. **专题站「日夜磨一剑 · 鹭岛摘金奖」**（`competition-timeline/`）：备赛攻坚纪实系列报道（总览 + 三篇），带留言区、管理后台与离线单文件版；主站 tabBar「我的」左侧「青春经管」即入口，主站把专题站托管在 `/competition-timeline/` 并反代其留言接口。

主站要点：

- 前端：纯静态 HTML/CSS/JS，**无构建、无 npm、无框架**。所有模块是挂到 `window.CZ_*` 的 IIFE。
- 后端：`server/` 下的 Node 程序，**零第三方依赖**（`node:http` / `node:sqlite` / `node:crypto` / `node:zlib`），要求 Node ≥ 22.5（本机 v24）。
- 地图：内联 SVG 2D 路线图 + 可选 3D 沙盘（`js/vendor/three.min.js` 本地自带，不联网）。
- 字体：`fonts/noto-serif-sc.css` 只有 **2 个 @font-face**（700 / 900 两档静态子集，`noto-serif-sc-{700,900}.woff2`），产物入库、运行时不需要构建；`fonts/` 里另有 101 个 Google Fonts 原始切片（历史来源，勿删勿引用）。

## 快速命令（全部在仓库根目录执行）

| 目的 | 命令 |
|---|---|
| 静态预览（mock 模式，无需服务） | 直接用浏览器打开 `index.html` |
| 本地后端 + 完整账号体系 | `node server/server.js` → http://localhost:8088 |
| 前端全链路测试（61 项断言） | `node scripts/test-web.js` |
| 后端 API 全链路测试（127 项断言） | `node scripts/test-api.js`（自起随机端口 + 临时数据库） |
| 专题站（静态页 + 留言服务 + 后台） | `node competition-timeline/server/server.js` → http://127.0.0.1:8899（后台 `/admin`；初始口令首次启动打印并写入 `server/初始管理员.txt`） |
| 专题站单文件构建（离线发布） | `python competition-timeline/.tools/build_single.py <入口页> <输出>`（产物入库到 `competition-timeline/pub/`） |
| 专题站字体子集重建 | `python competition-timeline/.tools/subset_font.py`（之后把各页 `?v=` 递增，当前统一 `?v=4`） |
| 数据库备份（SQLite 三件套 + SHA256 清单 + 轮转） | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-db.ps1`（`-ServiceName` 配合 nssm 停服取一致快照） |
| 字体重建（内容新增汉字后） | `python scripts/build-fonts.py`（见「已知坑」，本机缺输入） |
| 截图（Edge headless，CDP） | `node scripts/cdp-shot.js "<url>" out.png 390 844 3000` |
| 手机视口截图 | `node tools/mobile-shot.js "<url>" out.png 390 844` |
| 公网演示（cloudflared 隧道） | 双击 `启动外网演示.bat`，或 `powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-public-demo.ps1` |

后端环境变量：`PORT`（默认 8088）、`HOST`（默认 `0.0.0.0`）、`DB_PATH`（默认 `server/data.db`，已 gitignore）、`CORS_ORIGIN`（逗号分隔白名单，默认关闭）、`RATE_LIMIT_LOGIN` / `RATE_LIMIT_REGISTER`（默认 10 次/60 秒）、`RATE_LIMIT_CONTEST_START`（默认 5 次/300 秒，用户桶 + IP 桶双计）、`RATE_LIMIT=off`（仅供测试，整体关闭）。

## 运行形态：双模式（改任何取数逻辑前必懂）

`js/config.js` 在运行时决定 `USE_MOCK`，视图对两种模式零感知：

| 场景 | 模式 | URL 开关 |
|---|---|---|
| 双击 `index.html`（file://）、GitHub Pages | mock：数据来自 `js/mock/`，进度存 localStorage，判分在浏览器 | `?mock=1` 强制 mock |
| `node server/server.js` | http：完整账号 + 云端进度 + 服务端判分 | `?mock=0` 强制后端；`?http=1` 同义 |
| 演示免登录（`demo/demo1234`） | 任何 host 都必须**显式**开启，隧道域名也不再自动登录 | `?demo=1`；`?login=1` 优先级更高，强制看登录页 |
| 开发期热刷新 | 轮询 `/__version`，变更即重载 | `?live=1`（同时要跑后端） |
| 跳过开场欢迎页 | — | `?intro=0` |

`?mock=1 / ?mock=0` 显式参数优先于协议/域名自动判定，所以本地静态服务器（如 5500 端口）也能强制连后端。

## 专题站 competition-timeline（第二站点，独立留言服务）

- 页面：`index.html`（总览，无留言区）+ `series-1/2/3.html`（三个正文页各自带按篇隔离的留言区）+ `admin.html`（后台，仅 :8899 直连可见；经主站访问一律 404）；四个前台页面底部都带四栏导航（`css/tabbar.css`），链回主站「路线/地图/我的」并保留 `?demo=1 / ?live=1` 查询参数。
- 服务：`node competition-timeline/server/server.js` → :8899，零依赖；环境变量 `PORT`（默认 8899）、`DB_PATH`（默认 `server/data.db`）、`ADMIN_PASSWORD`（首次启动的初始口令，控制台打印并写入 `server/初始管理员.txt`，该文件已 gitignore）。
- 主站托管：主站 `server/server.js` 用**嵌套白名单**（`STATIC_NESTED`）在 `/competition-timeline/` 下只放行 `index/series-1/2/3.html` 与 `css/ js/ fonts/ assets/ pub/`；`admin.html`、`server/`（源码 + SQLite）、`.tools/`、`.draft/`、README 一律 404（`scripts/test-api.js` 有断言）。
- 留言反代：主站把 `/api/comments`（含 `/:id`）反代到 `COMMENTS_UPSTREAM`（默认 `http://127.0.0.1:8899`），**不反代 `/api/admin/*`**；上游不可用返回 503 `{ ok:false, code:'COMMENTS_UNAVAILABLE' }`（注释流式透传，5s 超时）。
- 专题站自己的白名单（:8899）相反：根目录 `*.html` 全放行（含 `admin.html`），`/server/**`、`.tools`、`.draft`、`*.md|py|bat|db` 拒绝。
- 留言模型：按篇隔离，服务端 `PAGES = ['series-1', 'series-2', 'series-3']` 白名单 + 缺省 `series-1`（`pickPage` / `pickPageFilter`）；归属篇目由页面根节点 `<html data-page="series-N">` 声明，公开读取 `GET /api/comments?page=<篇目>` 按篇过滤（缺省 series-1，非法值 400 `BAD_PAGE`），发表由请求体 `page` 决定归属；后台按 `status × page` 组合过滤（`page=all` 为全部）并返回按篇 `counts`；发表返回 `ownerToken`（服务端只存 SHA-256，浏览器存 `localStorage['tl-comments-own']`），删除需令牌；管理端 scrypt + HttpOnly / SameSite=Strict Cookie（8h）；单 IP 发表 20 条/10 分钟、登录失败 5 次/10 分钟。
- 离线单文件：`pub/` 全部是 `python .tools/build_single.py <入口> <输出>` 的产物（CSS/字体/图片/脚本内嵌），**不要手改**。
- 字体：`competition-timeline/fonts/` 是 400/700/900 三档子集，各页 `?v=` 当前统一为 4；改文案后跑 `python .tools/subset_font.py` 并递增 `?v=`。
- `.draft/` 是本地草稿/探针目录（已 gitignore），其中 `page-column/test.js` 断言留言按篇分栏语义，与当前实现一致，可作回归参考。

## 目录与职责

```
index.html              壳 + 脚本加载顺序 + 底部 tabBar（三 tab + 「我的」左侧「青春经管」专题入口）+ favicon
favicon.svg             站点图标（受回归测试字节锁定：677 B）
css/style.css           设计系统（:root 令牌 + 全部组件样式）
js/config.js            USE_MOCK 判定 / 演示登录 / API_BASE / CACHE_TTL
js/format.js            日期格式化 + escapeHtml（全站唯一转义入口）
js/progress.js          ★ 节点状态机（唯一状态判定源，前端与后端共用）
js/api.js               ★ 数据访问统一层（mock 分支 + http 分支 + 账号方法）
js/ui.js                共享组件：自绘 SVG 图标集 / 徽章 / 节点行 / 弹窗 / toast（含 ARIA）
js/router.js            hash 路由 + tabBar + 路由守卫 + 首访欢迎页
js/map3d.js             3D 沙盘（three.js；高程图 assets/map3d/heightmap.png）
js/weather.js           页面级天气特效（canvas，尊重 reduced-motion）
js/live-reload.js       ?live=1 时的开发自动刷新
js/mock/nodes.js        11 节点（9 篇文案已交付，泸定桥/腊子口仍为占位；含经纬度/阶段/detail 块/quiz 关联）；8 个节点的 detail.blocks 首块是 video（assets/video/<code>.mp4，位于「历史背景」标题上方）
js/mock/questions.js    43 题（每节点 3 题 + final 池 10 题；含 answer/explanation）
js/mock/loader.js       仅 mock 模式用 document.write 注入 questions.js
js/mock/{journey,spirit,weather}.js  开场/精神卡/天气文案数据
js/views/*.js           login home node-detail quiz map profile contest leaderboard journey
server/server.js        静态服务（ETag/304 + gzip + 缓存分层）+ /api 路由 + /__version
server/db.js            SQLite 建表（users/sessions/progress/checkin_logs/bank_questions/contests）
server/auth.js          异步 scrypt 密码哈希 + HMAC 会话令牌 + 按 IP/用户名限速
server/game.js          打卡 / 取题 / 判分（与 api.js mock 分支 1:1 同构）
server/contest.js       积分赛 + 排行榜 + 题库导入
docs/DEPLOY-WINDOWS.md  Windows 内网部署手册（nssm 服务 / HTTPS 反代 / 备份与升级）
scripts/test-web.js     前端 mock 全链路 + 设计/可访问性回归锁
scripts/test-api.js     后端 API 全链路验证
scripts/backup-db.ps1   SQLite 备份（db + -wal/-shm + SHA256 清单 + 轮转，可选 nssm 停服）
scripts/build-fonts.py  由 Google Fonts 切片构建 700/900 子集 woff2 + glyphs.txt
scripts/dom-check-*.js  各页面 DOM 验收（需 8088 服务 + Edge）
scripts/cdp-shot.js / tools/mobile-shot.js  截图工具
tools/bake-heightmap.py 生成 assets/map3d/heightmap.png（生成物，勿手改）
samples/map3d/          地图方案探索样例，不是生产代码
fonts/glyphs.txt        字重子集的字符快照（逐行一个字符），构建脚本的输入输出
assets/route/*.webp     11 个节点封面图（nodes.js 的 images.cover 引用）
assets/video/*.mp4      8 个节点的影像资料（nodes.js 的 video 块引用；720p H.264，合计约 71 MB）
competition-timeline/   专题站：4 个页面 + admin + :8899 留言服务 + pub 离线单文件 + .tools 构建脚本（详见其 README）
```

## 代码约定

- **无构建**：改完直接刷新页面；不要引入 package.json、打包器、npm 依赖或 CDN 资源。
- **模块形态**：`;(function (root) { ... })(typeof self !== 'undefined' ? self : this)`；需要被 Node 测试 require 的文件用 UMD 头（`module.exports = factory()`），已有：`config / format / progress / api / mock/nodes / mock/questions`。
- **全局命名空间**：`CZ_CONFIG / CZ_FORMAT / CZ_PROGRESS / CZ_API / CZ_UI / CZ_VIEWS / CZ_MAP3D / CZ_WEATHER`。`index.html` 的脚本顺序是隐式依赖（如 `api.js` 依赖 mock 数据已就绪），**新增模块要插在依赖之后**。
- **视图契约**：`CZ_VIEWS[name] = { mount(rootEl, params) { ... } }`，可返回清理函数（WebGL / 定时器 / 事件监听必须在离开时释放）。新增页面 = 新文件 + `index.html` 脚本标签 + `router.js` 的 `parseHash` / `TAB_OF`。
- **取数单一入口**：视图只调 `CZ_API.*`，不直接 `fetch`、不直接读 localStorage。`CZ_API` 返回 Promise，错误对象带 `code` / `message`。
- **错误码契约**：`CZ_API` 失败时 `err.code` 为 `TIMEOUT`（10 秒超时）/ `BAD_RESPONSE`（后端返回非 JSON，如反代 HTML 错误页）/ 后端业务码（如 `RATE_LIMITED`、`TOO_MANY_REQUESTS`），视图按 `code` 分支给文案，不要只显示 `message`。
- **状态单一来源**：节点态（`locked/open/checkedIn/quizPassed`）与毕业态只从 `CZ_PROGRESS.computeStates` 取，不要在各视图里另写判断。
- **前后端同构**：`js/api.js` 的 mock 分支与 `server/game.js` / `server/contest.js` 是同一套规则的两份实现（60 分通关、10 题毕业考、20 题 × 5 分积分赛、30 分钟时限）。**改规则必须两边同时改**（`getConfigDoc` 也各有一份）。
- **风格**：2 空格缩进、单引号、不写行尾分号、中文注释解释「为什么」而不仅是「做什么」；每个文件头部注释说明职责。

## 数据与内容（完全数据驱动）

- 节点/题目/文案全部在数据文件里，**视图不得硬编码内容文本**；换素材只换 `js/mock/*`。
- 题目格式：`{ _id, nodeCode, type: 'single'|'multiple'|'judge', question, options[], answer: [下标], explanation }`（另有 `difficulty` / `status`）；`answer` 恒为下标数组，判断题 `options` 必须是 `["正确","错误"]`。
- 文案交付状态：**9 个节点已按文案组 Word 交付**（瑞金/湘江/遵义/四渡赤水/金沙江/大渡河/雪山/草地/会宁），配套题目也已重写；**飞夺泸定桥、激战腊子口 仍是占位文案**，其「占位」标记要保留，别把整站都当成品描述。
- 节点封面图已交付：`assets/route/<code>.webp`，由 `nodes.js` 的 `images.cover` 引用；画师的 `illustrations` 数组仍为空（渲染层需保留主题色块兜底）。
- `detail.blocks` 现有 7 种 type：`heading / paragraph / image / quote / video / timeline / dataCard`（未知 type 静默忽略）。`video` 形如 `{ type:'video', src:'assets/video/<code>.mp4', poster:'assets/route/<code>.webp', caption? }`，渲染为 `<video controls playsinline preload="metadata">`，**必须排在 heading 之前**（用户要求位于「历史背景」上方）。
- 竞赛题库：出题人直接编辑 `server/question-bank.json`，重启服务自动导入。**导入按 `id` 幂等去重（INSERT OR IGNORE）——修改已有 id 的题干不会被更新**，需换新 id 或清掉 `bank_questions` 对应行；竞赛要求库内 ≥ 20 题。
- 新增文案里的汉字若不在 `fonts/glyphs.txt` 中，会逐字回落到系统衬线（不会豆腐块，但一句话里两种字形）；出正式文案后需要重跑字体重建（见「已知坑」）。**当前就处于这个状态**：内容已交付但字体子集未重建。

## 不可破坏的约束

1. **答案永不下发**（http 模式）：`getQuiz` 剥离 `answer`/`explanation`，判分只在服务端；`questions.js` 只能经 `js/mock/loader.js` 在 mock 模式注入，**不得在 `index.html` 加 `<script src="js/mock/questions.js">`**（`scripts/test-web.js` 会断言这一点）。
2. **静态白名单**：`server/server.js` 只对外提供 `index.html`、`favicon.ico/svg` 和 `css/ js/ fonts/ assets/` 目录，隐藏段、`..`、源码、脚本、多级 md、db 一律 404。新增顶层资源目录必须同时改 `STATIC_DIRS`、`STATIC_EXT` 与对应测试，否则线上 404。视频扩展名 `.mp4` 已在 `STATIC_EXT` 中（`assets/video/`），MIME 走 `video/mp4`。
3. **HTML 转义**：任何来自数据/用户/接口的字符串进 `innerHTML` 前必须过 `CZ_FORMAT.escapeHtml`。
4. **零外部依赖、离线可用**：不引 CDN 字体/图片/地图/JS；three.js 用 `js/vendor/`；世界地图不用。
5. **字体契约（测试锁定）**：`fonts/noto-serif-sc.css` 只允许 ≤2 个 @font-face（700 + 900）、**不得恢复 unicode-range 分片方案**、两个 woff2 src 都要存在且 >100KB。改字体走 `scripts/build-fonts.py`，不要手写 @font-face。
6. **设计系统**：色板/字号/圆角/阴影以 `css/style.css` 的 `:root` 令牌为准（`DESIGN.md` 是描述性文档，可能滞后于批次改动）；四态色不可自创；阴影一律带偏移（禁零偏移光晕）；无胶囊形；图标只用 `CZ_UI.icon()` 的自绘 SVG，**禁 emoji、禁外部图标库、禁字形 ★**；焦点环全站 `--red-dark`，**只有 tabBar 允许金环**。
7. **字节级回归锁**：`favicon.svg`（677 B）、字体 woff2、部分 CSS 尺寸被测试按精确值锁定——不要「顺手」重排这些文件或改动换行符；确需改动时同时更新测试，并在说明里写清原因。
8. **`.impeccable/detect.json` 里的告警不是待办**：登录页星空 twinkle、山峦 clip-path、hero 斜纹、地图网格属于 brief 锁定的世界语言，已接受；不要为消警告而删掉这些。
9. **生成物不要手改**：`fonts/noto-serif-sc{,-700,-900}.*`、`fonts/glyphs.txt`、`assets/map3d/heightmap.png`、`js/vendor/three.min.js`、`competition-timeline/pub/*.html`。
10. **专题站托管只走嵌套白名单**：主站放行 `/competition-timeline/` 必须经过 `STATIC_NESTED`，**不得把 `competition-timeline` 加进 `STATIC_DIRS`**（那会把 `server/data.db`、`初始管理员.txt`、`admin.html` 一起暴露）。
11. **反代边界**：主站只转发 `/api/comments*`，`/api/admin/*` 永不转发；专题站的 admin 只应通过 :8899 本机/内网访问。

## 已知坑

- **换行符（Windows）**：仓库没有 `.gitattributes`，而全局 `core.autocrlf=true` 会把 LF 转成 CRLF，导致 `favicon.svg` 变成 684 B、字节级测试失败。本仓库已设 `core.autocrlf=false`；重装/换克隆后先确认这一点，必要时 `git rm --cached -r . && git reset --hard`。
- **本机访问 GitHub 的两个坑**：① `schannel` 后端会报 `SEC_E_NO_CREDENTIALS`（curl 也一样），凡是 `git fetch/pull` 都加 `-c http.sslBackend=openssl`；② 若 `github.com` 解析到的 IP 连不上（曾出现 `20.205.243.166` 超时），可用本地 CONNECT 代理指向可用的 GitHub 边缘 IP（例如 `20.27.177.113`）后 `git -c http.proxy=http://127.0.0.1:<端口> -c http.sslBackend=openssl fetch`。两者都是环境问题，不属于项目代码。
- **`scripts/test-api.js` 在本机沙箱下会有 2 项失败**（端口占用子进程用例：`child_process.spawn` 的管道 stdio 被 DSH 沙箱拦截，退出码记为 null、stderr 为空）。手工等价验证：占住端口后 `PORT=<端口> node server/server.js` 应以退出码 1 结束并打印「启动失败：端口 … 已被占用（EADDRINUSE）」+ 换端口/netstat 提示。正常终端预期 127/127。
- `scripts/test-web.js` 在运行时把 `config.USE_MOCK` 改 true，验证的是 mock 分支；`js/api.js` 在 Node 下用内存存储兜底（无 localStorage）。
- `scripts/test-api.js` 在 `require('../server/server')` **之前**设置 `DB_PATH` 指向临时库；测试自己负责清理，别指向 `server/data.db`（SQLite 还会留下 `-wal`/`-shm`，只删 `data.db` 删不干净）。
- `README.md`（主站）有两处过期描述：开头「地图用 Leaflet CDN」（实际内联 SVG，零联网）与测试断言数「19 / 71 项」（实际 61 / 127）；另外根 README 完全没提 `competition-timeline` 专题站。以代码、测试与 `competition-timeline/README.md` 为准。
- `scripts/build-fonts.py` 需要 fonttools + brotli，并读取 `fonts/urls.txt`（**该文件未入库**）与 101 个原始切片；因此本仓库无法直接重建字体。没有原始切片来源时，改动文案只能接受回落到系统宋体，不要伪造 woff2。
- **内容交付后字体子集没重建（现存）**：`ea84a48` 填充了 9 个节点文案与全部题目，但 `fonts/glyphs.txt` / woff2 未更新；扫描 `js/**`（除 `vendor`）+ `server/**` + `index.html` 实测有 **80 个 ≥U+2000 字符不在子集内**（如 苏/晚/委/赶/赴/援/捐/灌/浴…），这些字会逐字回落系统宋体。`test-web` 的覆盖断言只查 `server/question-bank.json`，**测试全绿 ≠ 字形齐全**；重建须在有原始切片的机器上跑 `python scripts/build-fonts.py`，再把 `fonts/glyphs.txt` 与两个 woff2 一起提交。
- 浏览器验收脚本硬编码 Edge 路径 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`；`scripts/dom-check-*` 与 `scripts/play-*` 还硬编码 `http://localhost:8088/?mock=1`——必须先起后端，换机器要改路径。
- **视频依赖 Range**：静态服务对 `.mp4` 返回 `206 Partial Content` + `Content-Range`（iOS Safari 不拿到 206 就不播，拖进度条也依赖它），其他扩展名仍是整文件 200。改 `serveStatic` 时别把这段删了；新增视频用 `ffmpeg -c:v libx264 -crf 30 -preset medium -movflags +faststart -c:a aac -b:a 64k`（源素材 228 MB → 产出 71 MB）。
- 静态响应按扩展名分层：html/css/js/json 走 `no-cache` + ETag（可拿 304），图片/字体给 1 天；文本类按 `Accept-Encoding` 返回 gzip 并带 `Vary`。**HEAD 请求仍是 405**（测试锁定为「保持改造前语义」），不要顺手加 HEAD 分支。
- `/__version` 忽略 `js/vendor/`，改其他 js/css 会触发 `?live=1` 重载。
- 用 pwsh 读中文文件请走 read 工具或显式 `-Encoding utf8`：本机 PowerShell 的 `Get-Content` 会把无 BOM 的 UTF-8 中文读成乱码（文件本身没问题，`server/server.js` 带 BOM，其余无 BOM，保持现状）。
- `server/data.db` 首次启动自动创建（连同 `-wal`/`-shm`，三者均已 gitignore）；重置演示数据直接删这三个文件再重启。进程在 SIGINT/SIGTERM 时会优雅关库；生产备份用 `scripts/backup-db.ps1`（三件套 + SHA256 清单 + 轮转），不要只拷 `data.db`。
- **生产部署照 `docs/DEPLOY-WINDOWS.md` 走**（nssm 注册服务、HTTPS 反代、备份、升级步骤都在里面），不要凭记忆另发明一套流程。
- **部署要起两个服务**：主站 `:8088` + 专题站留言 `:8899`（建议 nssm 各注册一个服务）。`docs/DEPLOY-WINDOWS.md` 目前只写主站，专题站/8899 与 `COMMENTS_UPSTREAM` 需按上面「专题站」一节补步骤；只起主站时 `/api/comments` 返回 503 属预期，不是 bug。
- **专题站初始管理员口令**：`competition-timeline/server/初始管理员.txt` 只是首次启动的明文提示，改密后不会更新，**不代表当前密码**；该文件已 gitignore，改密后直接删除。
- **留言反代没有自动化测试**：`test-api` 只锁定嵌套白名单，`proxyComments` 的 200/503 与「admin 不转发」要手工验证——起 8899 后 `curl http://127.0.0.1:8088/api/comments` 应返回上游 JSON；停掉 8899 应得 503 `COMMENTS_UNAVAILABLE`；`/api/admin/me` 仍应走主站自己的 401。
- `competition-timeline/pub/*.html` 是 `build_single.py` 的产物；改页面/样式/字体后必须重跑构建，不要手改产物（与 `fonts/` 生成物同规则）。
- file:// 模式下没有 fetch/后端，任何新的网络调用都要有 mock 分支，否则双击预览会坏。
- 静态模式下长按「我的」页昵称卡片可重置本地进度（调试用），别再叠加其他隐藏手势。

## 改完怎么验（Definition of Done）

1. `node scripts/test-web.js` → `ALL PASSED（61 项）`
2. `node scripts/test-api.js` → 本机沙箱 125 通过 / 2 失败（见「已知坑」，那 2 项要手工验证 EADDRINUSE）；正常终端应为 127/127
3. 动了 UI：`node server/server.js` 后浏览 `http://localhost:8088/?mock=1#/`（建议带 `?live=1`），用 `scripts/cdp-shot.js` 或 `tools/mobile-shot.js` 出 390×844 截图自查首屏、tabBar 不遮挡、四态颜色、无横向滚动、焦点环可见。
4. 动了判分/账号/竞赛：两种模式都要走一遍真实流程（打卡 → 取题 → 交卷 → 毕业 → 竞赛），不能只跑单测。
5. 动了专题站/托管：同时起主站 8088 与留言 8899，验证 `/competition-timeline/` 页面可开、`/competition-timeline/admin.html` 与 `/competition-timeline/server/server.js` 均 404、留言可读写、停掉 8899 后 `/api/comments` 返回 503。
6. 改了文案/题目：确认新增汉字都在 `fonts/glyphs.txt` 里（不在就会回落系统宋体，见「已知坑」）；有原始切片的机器上重跑 `scripts/build-fonts.py`，把 `glyphs.txt` 与两个 woff2 一起提交。
7. **不得为了让测试通过而删断言、放宽断言或改测试预期**；测试是行为契约（例如静态白名单 404、答案不下发、字体 ≤2 个 @font-face）。

## 提交

- 分支 `main`，跟踪 `origin/main`（GitHub：`Requiemkayne/changzheng-web`），无 CI；提交信息用中文描述改动。
- 只提交源码与必要数据；`server/data.db*`、`node_modules/`、日志、`.env` 已在 `.gitignore`。
