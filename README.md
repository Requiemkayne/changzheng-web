# 「长征」网页版

沿长征路线虚拟打卡 11 个核心节点，浏览历史知识、挑战答题闯关、重走长征路。

**纯静态 HTML/CSS/JS，零构建零依赖**（地图用 Leaflet CDN）。

## 功能

- **路线打卡**：11 个节点（瑞金出发→湘江战役→遵义会议→四渡赤水→巧渡金沙江→强渡大渡河→飞夺泸定桥→爬雪山→过草地→激战腊子口→会宁会师），浏览知识后虚拟打卡
- **答题闯关**：每打卡一个节点解锁该节点答题关卡（3 题/关）
- **总结答题**：走完全部 11 节点后解锁「毕业考试」，通过后获得结业证书
- **路线地图**：11 节点按真实经纬度等距投影绘制内联 SVG 路线图（零联网零依赖，不加载世界地图），状态色标（待打卡/已打卡/已通关）
- **我的足迹**：进度统计、节点成绩、打卡时间线

**完全数据驱动**：历史文案、插画、题目全部数据化（当前在 `js/mock/` 占位数据），前端只写渲染框架。文案组/画师交付后直接换数据文件，**无需改代码**。

## 运行

**模式一：静态预览（默认）**
- 直接双击 `index.html` 即可运行（Chrome/Edge），进度存浏览器 localStorage

**模式二：本地后端 + 账号系统**
- `js/config.js` 置 `USE_MOCK: false`
- `node server/server.js`（零依赖，需 Node ≥ 22.5）
- 访问 `http://localhost:8088`，手机同局域网访问 `http://<电脑IP>:8088/`
- 数据库自动建在 `server/data.db`（可 `DB_PATH` 环境变量改路径）

## 结构

```
├── index.html            壳 + hash 路由 + 底部 tabBar
├── css/style.css         设计系统（长征红/勋章金/宣纸米白）
├── scripts/test-web.js   验证脚本（mock 数据一致性 + 全链路 15 项断言）
├── scripts/test-api.js   验证脚本（后端 API 全链路 39 项断言）
├── server/               本地后端（零依赖：Node 内置 http/sqlite/crypto）
│   ├── server.js         入口：静态服务 + /api 路由
│   ├── db.js             SQLite 建表（users/sessions/progress/checkin_logs）
│   ├── auth.js           注册/登录/scrypt 密码哈希/会话令牌/限速
│   └── game.js           打卡/取题/判分（与前端 mock 同构，答案不下发）
└── js/
    ├── config.js         ★ USE_MOCK 开关（后端模式置 false）
    ├── api.js            数据访问统一层（后端分支已实现 + 账号方法）
    ├── progress.js       节点状态机（唯一状态判定源）
    ├── ui.js             节点行/徽章/弹窗/toast 共享组件
    ├── router.js         hash 路由 + 路由守卫（http 模式未登录一律进登录页）
    ├── mock/             占位数据（nodes.js 11 节点 / questions.js 43 题）
    └── views/            login / home / node-detail / quiz / map / profile
```

## 说明

- **数据驱动**：内容在 `js/mock/nodes.js`（节点文案/图片/题目关联）与 `js/mock/questions.js`（题库）。题目三种题型 `single` 单选 / `multiple` 多选 / `judge` 判断，`answer` 恒为下标数组
- **答案安全**：静态模式（mock）答案在本地文件里，仅供内部预览；**后端模式下取题接口剥离 `answer`/`explanation`，判分只在服务端**，浏览器拿不到答案
- 地图页为内联 SVG 手绘路线图，完全离线可用，不依赖任何地图服务
- 长按「我的」页昵称卡片可重置本地进度（仅静态模式，调试用）
- 答题页 `#/quiz/node/<code>` 与 `#/quiz/final` 共用一套代码，题目数据驱动
- 内容更新后跑 `node scripts/test-web.js` 验证（数据一致性 + 全链路断言）

## 本地后端（账号系统）

后端模式（`USE_MOCK: false` + `node server/server.js`）提供：

- **登录即第一屏**：后端模式下未登录打开网站一律进入艺术化登录页（星空/山峦/金框卡），登录后放行原路由
- **注册/登录**：账号+密码（scrypt 哈希 + 随机盐存储，登录失败 5 次锁 10 分钟）
- **云端进度**：打卡/成绩存 SQLite，换设备登录后同步
- **服务端判分**：题目答案永不下发浏览器，杜绝改前端作弊

| 方法 | 接口 | 鉴权 | 说明 |
|---|---|---|---|
| register / login | POST register / login | 公开 | 返回 token |
| me / logout | GET me / POST logout | ✓ | 用户信息 / 退出 |
| getConfig | GET config | 公开 | 全局配置 |
| getNodes | GET nodes | 公开 | 全部节点（published） |
| getProgress | GET progress | 可选 | 未登录返回 null（游客可浏览） |
| getCheckins | GET checkins | ✓ | 打卡流水 |
| saveNickname | POST profile | ✓ | 昵称 |
| checkin | POST checkin | ✓ | 打卡（服务端校验 + 写流水） |
| getQuiz | GET quiz?mode&code | ✓ | 取题（服务端剥离答案） |
| submitQuiz | POST quiz/submit | ✓ | 判分（服务端比对） |

**迁移服务器**：把整个 `web/` 文件夹拷到服务器，`node server/server.js` 即可（端口 `PORT`、数据库 `DB_PATH` 环境变量可调）。上公网务必用 Nginx 反代加 HTTPS（否则密码明文传输）；多实例并发时可将 SQLite 升级 PostgreSQL（表结构不绑定 SQLite 特性）。
