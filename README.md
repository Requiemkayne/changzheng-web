# 「长征」网页版

沿长征路线虚拟打卡 11 个核心节点，浏览历史知识、挑战答题闯关、重走长征路。

**纯静态 HTML/CSS/JS，零构建零依赖**（地图用 Leaflet CDN）。

## 功能

- **路线打卡**：11 个节点（瑞金出发→湘江战役→遵义会议→四渡赤水→巧渡金沙江→强渡大渡河→飞夺泸定桥→爬雪山→过草地→激战腊子口→会宁会师），浏览知识后虚拟打卡
- **答题闯关**：每打卡一个节点解锁该节点答题关卡（3 题/关）
- **总结答题**：走完全部 11 节点后解锁「毕业考试」，通过后获得结业证书
- **路线地图**：11 节点真实地理展示，状态色标（待打卡/已打卡/已通关），Leaflet + OSM 瓦片
- **我的足迹**：进度统计、节点成绩、打卡时间线

**完全数据驱动**：历史文案、插画、题目全部数据化（当前在 `js/mock/` 占位数据），前端只写渲染框架。文案组/画师交付后直接换数据文件，**无需改代码**。

## 运行

- **直接双击** `index.html` 即可运行（Chrome/Edge），进度存浏览器 localStorage
- 或起本地静态服务：`python -m http.server 8000` 后访问 `http://localhost:8000/`
- 手机看：同局域网手机访问 `http://<电脑IP>:8000/`

## 结构

```
├── index.html            壳 + hash 路由 + 底部 tabBar
├── css/style.css         设计系统（长征红/勋章金/宣纸米白）
├── scripts/test-web.js   验证脚本（数据一致性 + 全链路 15 项断言）
└── js/
    ├── config.js         ★ USE_MOCK 开关（接后端时置 false 并实现 api.js 的 http 分支）
    ├── api.js            数据访问统一层（7 方法）
    ├── progress.js       节点状态机（唯一状态判定源）
    ├── ui.js             节点行/徽章/弹窗/toast 共享组件
    ├── router.js         hash 路由：#/、#/node/code、#/quiz/node/code、#/quiz/final、#/map、#/profile
    ├── mock/             占位数据（nodes.js 11 节点 / questions.js 43 题）
    └── views/            home / node-detail / quiz / map / profile
```

## 说明

- **数据驱动**：内容在 `js/mock/nodes.js`（节点文案/图片/题目关联）与 `js/mock/questions.js`（题库）。题目三种题型 `single` 单选 / `multiple` 多选 / `judge` 判断，`answer` 恒为下标数组
- **答案安全**：取题时 `api.js` 剥离 `answer`/`explanation`，判分只在本层内比对——接入后端后此逻辑移到服务端
- 地图页需联网（OSM 瓦片国内较慢）；离线自动降级为路线列表
- 长按「我的」页昵称卡片可重置本地进度（调试用）
- 答题页 `#/quiz/node/<code>` 与 `#/quiz/final` 共用一套代码，题目数据驱动
- 内容更新后跑 `node scripts/test-web.js` 验证（数据一致性 + 全链路断言）

## 接入后端

`js/config.js` 置 `USE_MOCK: false`，并在 `js/api.js` 的 `http()` 中实现接口（7 方法签名不变）：

| 方法 | 接口 | 说明 |
|---|---|---|
| `getConfig` | GET config | 全局配置 |
| `getNodes` | GET nodes | 全部节点（published） |
| `getProgress` | GET progress | 当前用户进度 |
| `getCheckins` | GET checkins | 打卡流水 |
| `saveNickname` | POST profile | 昵称 |
| `checkin` | POST checkin | 打卡（服务端校验 + 写流水） |
| `getQuiz` / `submitQuiz` | POST quiz | 取题（服务端剥离答案）/ 判分（服务端比对） |
