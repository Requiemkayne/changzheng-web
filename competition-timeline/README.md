# 日夜磨一剑 · 鹭岛摘金奖 —— 备赛攻坚纪实时间线

按 **赛前 → 赛中 → 赛后** 时间线整理 [上海市经济管理学校原文](https://www.shems.edu.cn/P/C/236940.htm) 的单页静态网页。

## 打开方式

双击 `index.html` 打开总览页，再进入各篇报道（Chrome / Edge）。
**纯静态、零构建、零外部依赖**（字体本地自托管，图片本地存放）。

## 目录

```
competition-timeline/
├── index.html              系列报道总览页（三篇入口，站点首页）
├── series-1.html           系列报道（一）日夜磨一剑 · 鹭岛摘金奖（时间线 + 留言区）
├── series-2.html           系列报道（二）把训练当比赛 · 闭环淬炼
├── series-3.html           系列报道（三）灯火长明 · 百次调试
├── admin.html              管理后台页面（/admin）
├── css/style.css           设计系统（令牌与共享组件）
├── css/index.css           系列报道总览页页面级样式
├── css/series-2.css        系列报道（二）页面级样式
├── css/series-3.css        系列报道（三）页面级样式
├── css/admin.css           管理后台样式
├── js/comments.js          前台留言逻辑（服务端 / 本地双模式）
├── js/admin.js             后台逻辑（登录、审核、删除、账号管理）
├── server/server.js        留言服务 + 管理接口（零依赖：Node 内置 http / node:sqlite / crypto）
├── server/data.db          SQLite 数据库（留言 + 管理员，首次运行自动创建）
├── server/初始管理员.txt    首次启动生成的初始密码（登录后请删除）
├── 启动留言服务.bat         一键启动服务并打开浏览器
├── fonts/                  思源宋体子集（400/700/900 三个 woff2，仅含本页字符，共约 510 KB）
├── assets/img/             页面配图：系列一 4 张 + 赛场图集 5 张（图片已压至 1400–1600px）
├── assets/img-orig/        配图原始尺寸备份（photo-* / s2-* / s3-* / gallery-*），只作母版，不被页面引用
├── pub/index.html          单文件版 · 总览：CSS/字体全部内嵌（跨页链接保留）
├── pub/series-1.html       单文件版（一）：CSS/字体/图片/脚本全部内嵌，可离线单发
├── pub/series-2.html       单文件版（二）：同样全内嵌
├── pub/series-3.html       单文件版（三）：同样全内嵌
├── .tools/                 构建工具（serve.py / 字体子集化 / 单文件打包）
└── .draft/                 开发临时目录（探针脚本、截图、测试基线）—— 不对外提供，静态服务已拒绝
```

**离线单文件**：`pub/index.html` 已把 CSS、字体、图片、留言脚本全部内嵌（约 1.08 MB），
`pub/series-2.html` 内嵌 `css/series-2.css` 与五张配图（约 2.58 MB），`pub/series-3.html` 同样内嵌三张配图与三档字体（约 2.20 MB），
双击即可离线查看，留言功能同样可用（无服务时自动用本机存储），也可单独发给他人。

## 多页与单文件

站点现有四篇页面：首页 `index.html`（系列报道总览，三篇入口）、`series-1.html`（系列一 时间线）、
`series-2.html`（系列二）、`series-3.html`（系列三）。`pub/` 下为构建产物，命令：

```
python .tools/build_single.py index.html    pub/index.html
python .tools/build_single.py series-1.html pub/series-1.html
python .tools/build_single.py series-2.html pub/series-2.html
python .tools/build_single.py series-3.html pub/series-3.html
```

用法：`python .tools/build_single.py [入口页] [输出路径]`（两个参数都可省略，省略时等价于
`index.html` → `pub/index.html`）。脚本会把该页引用的字体、该页**实际**用到的 CSS（含
`css/series-2.css` 这类页面级样式）、`assets/img/` 图片、`<script src>` 脚本全部内联，
外部 http(s) 与跨页链接保持原样。构建产物 `pub/` 是一个可离线浏览的完整小站：
`index.html`（总览）、`series-1.html`、`series-2.html`、`series-3.html` 互相链接可用。

**分页导航**：四个前台页的**返回**都在吸顶顶栏的最左侧（32×32 纯图标按钮，名称走 `aria-label`，
滚动时常驻可见）；三个系列页另在**留言区上方**有「下一个分页」入口，
串成 `series-1 → series-2 → series-3 → index` 的链路（总览页**不设**下一篇按钮，三篇入口由
「系列报道」卡片承担）：

| 页面 | 返回（顶栏左上角） | 下一个分页（留言区上方） |
|---|---|---|
| `index.html` | 返回长征主站 `../index.html#/` | 无（按用户要求不设） |
| `series-1.html` | 返回总览 `index.html` | 系列报道（二） |
| `series-2.html` | 返回总览 `index.html` | 系列报道（三） |
| `series-3.html` | 返回总览 `index.html` | 返回总览 `index.html`（kicker 文案「返回总览」） |

两枚入口都是普通 `<a>` 且带 `data-keep-search`：页内脚本会把当前 `?demo=1 / ?live=1`
拼进链接，回主站不会被路由守卫弹到登录页。返回指向**固定页面**而不是 `history.back()`，
直接分享链接打开也不会死链；顶栏仍是「返回 + 品牌」单行（`.shell-back + .brand { flex: 1 1 auto }`
让品牌吃掉余量，系列跳转仍由页脚承担）。样式集中在 `css/style.css` 的
`.shell-back / .page-nav-foot / .page-next`，打印时随顶栏一起隐藏。

**字体版本（`?v=`）**：字体为本地子集，`fonts/noto-serif-sc.css` 由 `.tools/subset_font.py`
生成（扫描全部 `*.html` 与 `*.css` 的字符）。当前 woff2 引用与所有页面引用统一为 `?v=4`；
新增中文文案后重跑 `python .tools/subset_font.py`，并把各页 `?v=` 递增即可。

> **已知事项**：`index.html`、`series-2.html`、`admin.html` 三处的 `?v=` 落后于字体 CSS
> （`?v=3` / `?v=2` vs `?v=4`），浏览器可能命中缓存里的旧样式表（指向旧 woff2 分片）而缺字。
> 冲掉缓存的办法：把这三处查询串改成 `?v=4`（Ctrl+F5 也能临时解决）。
> 三份离线单文件不受影响——字体已直接内联为 `data:` URI，没有版本号可缓存。

## 留言区与管理后台

### 前台（访客）

- **昵称**：可选，不填显示「匿名」，会记住上次填写的昵称
- **字数**：上限 200 字，实时显示剩余字数，超限禁用提交
- **校验**：内容为空或超长时给出提示并高亮输入框
- **审核**：提交后提示「待管理员审核后显示」，通过后才会出现在列表
- **本人删除**：只能看到并删除**自己发表**的留言，他人留言没有删除按钮
- **安全**：留言以纯文本渲染（`textContent`），HTML/脚本不会被执行

### 按篇目分栏（`page`）

留言按**篇目**分栏存放与展示，同一套服务同时服务系列（一）（二）（三）：

| 页面 | 篇目值 | 说明 |
|---|---|---|
| `index.html`（总览） | — | 无留言区 |
| `series-1.html`（系列一） | `series-1` | 缺省篇目：请求不带 `page` 时按此篇处理，兼容旧链接 |
| `series-2.html`（系列二） | `series-2` | 页面根节点 `data-page="series-2"` |
| `series-3.html`（系列三） | `series-3` | 页面根节点 `data-page="series-3"` |
| `pub/*`（单文件版） | 同上 | 内联脚本读 `data-page`，离线时按篇隔离 localStorage 键 |

- 页面篇目由 `<html data-page="…">` 决定，脚本**不硬编码**篇目
- **公开接口必须指定具体篇目**：`GET /api/comments?page=series-2` 只返回该篇已通过的留言；
  缺省/空值 → `series-1`（首页旧行为不破）；其他值（含 `all`）→ `400 BAD_PAGE`
- 发表时篇目取自请求体 `page`，缺省落 `series-1`；非法值同样 `400 BAD_PAGE`
- 管理接口的 `page` 多接受一个 `all`（全部篇目），其余取值仍按白名单校验
- 数据库 `comments.page` 列（`TEXT NOT NULL DEFAULT 'series-1'`）；旧库启动时自动补列，老数据落系列一

### 本人删除的归属校验

不做登录，也不靠昵称判断，而是用「归属令牌」：

1. 发表成功时，服务端生成一次性令牌，**只返回给发表者**，数据库仅存其 SHA-256 哈希
2. 令牌保存在发表者浏览器的 localStorage（`tl-comments-own`）
3. 前台只对令牌匹配的留言渲染「删除」按钮
4. 删除时 `DELETE /api/comments/:id` 带令牌，服务端用 `timingSafeEqual` 比对哈希
5. 令牌不对 → `403 只能删除自己发表的留言`；不带令牌 → `400 缺少删除凭证`

> 因此换设备、换浏览器或清理浏览器数据后，将无法再删除此前发表的留言
> （仍有管理员可在后台删除）。

### 后台（管理员）

访问 <http://127.0.0.1:8899/admin>，用初始账号登录（首次启动时控制台打印，并写入
`server/初始管理员.txt`）：

| 能力 | 说明 |
|---|---|
| 留言审核 | 按「待审核 / 已通过 / 已拒绝 / 全部」分栏，单条通过或拒绝 |
| **按篇筛选** | 第二栏「全部 / 系列（一）/ 系列（二）」，与状态栏相互独立、可组合；每条留言显示所属篇目；统计数字随篇目收敛 |
| 批量操作 | 全选或多选后批量通过、批量拒绝、批量置顶/取消置顶、批量删除 |
| **置顶优秀留言** | 已通过的留言可「置顶」，前台优先展示并加盖「优秀」金印；可取消置顶 |
| 删除留言 | 单条删除，二次确认 |
| 清空 | 清空「已拒绝」或清空全部留言 |
| 管理员账号 | 新增管理员、删除管理员（不能删自己、至少保留一个） |
| 改密码 | 修改自己的登录密码 |
| 审计信息 | 列表展示每条留言的 IP、提交时间、审核人 |

### 置顶与「优秀」印章

- 仅**已通过**的留言可置顶；待审核 / 已拒绝的留言没有置顶按钮
- 前台排序：`置顶优先 → 置顶时间 → 发表时间`，置顶留言始终在最上方
- 置顶留言在前台加盖「优秀」印章，样式严格对齐 `DESIGN.md` 的 `.stamp / .stamp-gold`：
  - 方形 62×62px、边框 2.5px、圆角 6px、旋转 −3°、透明度 0.88
  - 字体 Noto Serif SC 900 / 18px / 字距 3px，烫金色 `#8F6E0B`
  - 径向渐变叠层模拟印泥斑驳，入场动画 `stampIn`（缩放 1.9→1 + 旋转 −14°→−3° + 模糊 3px→0）
- 管理后台列表中，置顶项显示淡金底 + 金边，并带一枚 34px 的「优秀」小印

### 存储方式（自动切换）

| 场景 | 存储位置 | 效果 |
|---|---|---|
| 运行 `启动留言服务.bat`（或 `node server/server.js`） | **SQLite 数据库** `server/data.db` | 留言持久保存，**所有人共享**，带审核流程 |
| 直接双击 `index.html` / `series-2.html`（无服务） | 浏览器 localStorage | 仅本机可见，无审核，可自助删除；按篇目分别存键 |
| 双击 `pub/*.html`（离线单文件） | 浏览器 localStorage | 同上，脚本与样式已内联，无网络请求 |

页面底部会用一行小字标明当前处于哪种模式。

### 启动服务

双击 **`启动留言服务.bat`**，或命令行运行：

```
node server/server.js
```

然后访问 <http://127.0.0.1:8899/>（前台，系列一）或 <http://127.0.0.1:8899/series-2>（系列二，
即 `series-2.html`），后台为 <http://127.0.0.1:8899/admin>。`启动留言服务.bat` 做的事就是
「检查 node → 打开默认浏览器到 `http://127.0.0.1:8899/` → 前台运行 `node server\server.js`」，
关闭窗口即停止服务，未引入任何第三方依赖。

> **注意**：`server/初始管理员.txt` 只是**首次启动**时打印的明文提示（账号 `admin` + 当时随机
> 生成的密码），登录改过密码后它并不会被更新，**可能不代表当前生产环境的密码**。
> 该文件已不在静态白名单内（外部无法下载），但仍建议改密后删除。

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8899 | 监听端口 |
| `DB_PATH` | `server/data.db` | 数据库文件位置 |
| `ADMIN_PASSWORD` | 随机生成 | 首次启动时初始管理员密码 |

### 接口

**公开**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/comments?page=` | 只返回**该篇**「已通过」的留言（最新在前，最多 200 条）；`page` 取 `series-1` / `series-2` / `series-3`，缺省 `series-1`，其他值 `400 BAD_PAGE` |
| POST | `/api/comments` | 发表留言 `{ name, text, page }`，进入待审核，返回 `ownerToken`；`page` 缺省 `series-1` |
| DELETE | `/api/comments/:id` | 删除**自己的**留言，需带 `{ token }` 或 `X-Owner-Token` 头 |
| GET | `/api/health` | 健康检查，返回总数与待审数 |

**管理（需登录 Cookie）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/login` | 登录 `{ username, password }` |
| POST | `/api/admin/logout` | 退出 |
| GET | `/api/admin/me` | 当前身份 |
| GET | `/api/admin/comments?status=&page=` | 留言列表，状态（pending / approved / rejected / all）× 篇目（all / series-1 / series-2）组合过滤，响应带 `page` 与按篇统计 `counts` |
| POST | `/api/admin/audit` | 审核 `{ ids: [], action: 'approve'｜'reject' }` |
| POST | `/api/admin/pin` | 置顶 `{ ids: [], pinned: true｜false }`（仅已通过可置顶） |
| DELETE | `/api/admin/comments/:id` | 删除单条 |
| POST | `/api/admin/clear` | 清空 `{ scope: 'all'｜'pending'｜'approved'｜'rejected' }` |
| GET / POST | `/api/admin/users` | 管理员列表 / 新增 |
| DELETE | `/api/admin/users/:id` | 删除管理员 |
| POST | `/api/admin/password` | 修改自己密码 `{ oldPassword, newPassword }` |

### 安全措施

- 密码使用 **scrypt + 随机盐** 存储，只存哈希，比对用 `timingSafeEqual`
- 会话为随机 32 字节 token，存 **HttpOnly + SameSite=Strict Cookie**，有效期 8 小时
- 登录失败单 IP 10 分钟最多 5 次；发表留言单 IP 10 分钟最多 20 条
- 写操作校验同源（Origin/Referer），跨站请求被拒
- 留言以纯文本渲染，杜绝 XSS；静态目录做了路径穿越防护
- **静态资源白名单**（见下节）：仓库里只有站点资源对公网可见

### 静态资源白名单

静态服务**不再暴露仓库根目录**，改为显式白名单（`server/server.js` 的 `resolveStatic()`）：

| 结果 | 路径 |
|---|---|
| 200 | 根目录的 `*.html`（`index.html` / `series-1.html` / `series-2.html` / `series-3.html` / `admin.html`，将来新增的系列页自动放行）、`/admin` 与 `/admin/`（映射 `admin.html`）、`/css/*`、`/js/*`、`/fonts/*`、`/assets/*`、`/favicon.*`、`/pub/*` |
| 404 | 其余一切：`/server/**`（`server.js`、`data.db`、`data.db-wal`、`data.db-shm`、`初始管理员.txt`）、`/.tools/**`、`/.draft/**`、任何以 `.` 开头的路径段、`*.md`、`*.py`、`*.bat`、`*.db`、不存在的路径 |

- 拒绝一律回 **404**（不是 403），不泄露文件是否存在
- 路径穿越防护保留：URL 编码的 `..`（`%2e%2e`）、反斜杠、`%2f` 混排都在解析后按路径段拒绝
- **`/api/` 路由先于静态匹配**，接口行为完全不受白名单影响

回归自检（都在 `.draft/`，只用临时库，不碰 `server/data.db`）：

```
node .draft/whitelist-check.js       # 静态白名单断言矩阵（PORT=8906）
node .draft/page-column/test.js      # 留言按篇分栏 接口 + 页面自证（PORT=8901）
```

### 查看/备份数据

`server/data.db` 是标准 SQLite 文件，可直接用 DB Browser for SQLite 等工具打开，
或复制该文件完成备份。表结构：

- `comments`：id / name / text / ip / created_at / status / audited_at / audited_by / owner_hash / pinned / pinned_at / page
- `users`：id / username / pass_hash / role / created_at / disabled


## 页面结构

> 下列表格只列正文区块；四页共同的**分页导航**（顶栏左上角返回 + 留言区上方的下一分页）见
> 「多页与单文件」一节。

| 区块 | 内容 |
|---|---|
| 顶栏 | 深红 shell + 金线；左上返回图标 + 品牌单行（锚点跳转与系列回链已按用户要求删除） |
| Hero | 军旗斜纹 + 金色天光；大标题「日夜磨一剑 · 鹭岛摘金奖」；四格统计（4 名队员 / 154 支队伍 / 9·23 / 金奖） |
| 时间线总览 | 金红菱形节点线，三节点锚点 |
| 引言 | 赛事背景与团队组成 |
| 赛前 | 5 步：团队组建 → 时间与场地 → 应对困难 → 教师指导 → 赛项要求 |
| 赛中 | 4 步：时间地点 → 赛场规模 → 现场表现 → 比赛结果（摘金盖章动画） |
| 赛后 | 3 步：专业能力 → 方法与素养 → 成长意义 |
| 赛场图集 | 5 张独立照片错落堆叠（小角度旋转、前后分层、柔和投影），悬停/键盘聚焦时扶正放大；点击（或回车/空格）打开灯箱放大查看，FLIP 从原位展开、带卡片倾角回收；查看期间该卡片临时升到最前（落位不被遮挡），收缩为纯位移（无淡入淡出、无回弹），落位同一帧交还原层次；无关闭按钮，点空白处或 Esc 收回 |
| 留言区 | 昵称 + 留言输入、字数提示、留言列表、逐条删除 |

### 系列报道（三）「灯火长明 · 百次调试」（`series-3.html`）

| 区块 | 内容 |
|---|---|
| 顶栏 | 深红 shell；左上返回图标 + 品牌单行（锚点与系列回链已删除，改由页脚与分页导航承担） |
| Hero | 眉标（赛事名 + 人工智能赛道）；两行主标「灯火长明 / 百次调试」；四格统计（4 名队员 / 119 支队伍 / 9·21—9·25 / 银奖） |
| 引言 | 赛事背景与承办校；成员构成（姓名 + 班级 + 班主任）、指导教师 |
| 赛前 | 5 卡：组队定员 → 研读规程 → 日夜攻坚 → 模拟赛场 → 后方保障 |
| 赛中 | 4 卡：赛项内涵 → 四个环节 → 沉着应战 → 成果转化（「银」字印章盖章动画） |
| 赛后 | 3 卡：能力沉淀 → 素养延展 → 默契协作 |
| 来源块 | 发布时间 / 供稿 / 编辑 / 原文署名 / 原文链接（236942） |
| 页脚 | 系列归档说明 + 同系列（一）（二）与「系列总览」入口 |

## 视觉规范（对齐应用根目录的 `../DESIGN.md`）

尺寸全部取自原项目 `css/style.css`，实测值与规范一一对应：

| 项目 | 规范值 | 实测 |
|---|---|---|
| 布局列宽 | `max-width: 480px` 居中 | 480px |
| 页面内边距 | `padding: 18px` | 18px |
| 卡片内边距 / 圆角 | `16px` / `--r-lg 12px` | 16px / 12px |
| 卡片间距 | `margin-bottom: 14px` | 14px |
| 区块间距 | 24px | 24px |
| Hero 主标 | `32px / 900 / 字距 10px` | 32px / 10px |
| 页面大标 | `26px / 900` | 26px |
| 区块标 | `18px / 700 / 字距 2px` | 18px |
| 正文 | `15px / 1.65` | 15px |
| 印章 | `62 × 62px` | 62 × 62px |
| 桌面（>520px） | 金侧线 1px/18% + 深红落影 | 已生效 |

- **配色**：深红五阶 `#4A0510 → #6E0918 → #A8182C → #C8102E → #D43A4E`；烫金 `#C9A227 / #E8C86A / #8F6E0B`；宣纸 `#F5EFE0` / 卡片 `#FFFDF6`；墨字 `#33261A` / 次要 `#6E6350`
- **字体**：标题 Noto Serif SC 700/900（大标大字距模拟铅印），正文系统黑体栈
- **形状**：方形倒角 12 / 8 / 5px，徽章 3px，**无胶囊**；金线 1px / 45%
- **装饰**：菱形节点（禁字形 ★）、金线 hairline；**无 emoji、无彩色圆点**
- **签名动作**：赛中结果「金奖」印章 `stampIn` 盖下动画（scale 1.9→1 + rotate −14°→−3° + 模糊 3px→0）
- **投影**：一律有偏移、红色调（`rgba(74,5,16,…)`），禁零偏移光晕
- **可访问性**：全部图片带 alt、焦点金环可见、`prefers-reduced-motion` 关闭动效、打印样式

## 素材来源

- 文字：上海市经济管理学校《【技炫青春 能创未来】系列报道（一）日夜磨一剑 鹭岛摘金奖》
- 文字（三）：上海市经济管理学校《【技炫青春 能创未来】系列报道（三）灯火长明 百次调试｜学校人工智能赛道银奖团队日夜攻坚纪实》，原文 <https://www.shems.edu.cn/P/C/236942.htm>
- 图片：原文配图（版权归原文作者及学校所有，仅作内容展示）
