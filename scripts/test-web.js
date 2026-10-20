/**
 * 网页版验证（node 环境跑，无需浏览器）
 *   1. 数据一致性：11 节点 / 43 题 / 引用有效 / 答案不越界 / 题型格式
 *   2. 全链路：未打卡取题被拒 → 打卡 → 取题无答案泄露 → 判分 → 进度 → final 毕业
 * 运行：node web/scripts/test-web.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
// 强制 mock 模式（config.USE_MOCK 当前指向后端模式；本测试验证 mock 数据与链路）
const config = require('../js/config')
config.USE_MOCK = true
const api = require('../js/api')
const progress = require('../js/progress')
const nodes = require('../js/mock/nodes')
const questions = require('../js/mock/questions')

let passed = 0
function ok(name) {
  passed++
  console.log('  ✓ ' + name)
}

/* ================= 1. 数据一致性 ================= */

console.log('[1] 数据一致性')

assert.strictEqual(nodes.length, 11, '节点数应为 11')
nodes.forEach((n, i) => assert.strictEqual(n.order, i + 1, n.code + ' order 应连续'))
assert.strictEqual(new Set(nodes.map(n => n.code)).size, 11, '节点 code 应唯一')
for (const n of nodes) {
  const loc = n.location
  assert(loc.longitude > 70 && loc.longitude < 140, n.code + ' 经度越界')
  assert(loc.latitude > 15 && loc.latitude < 55, n.code + ' 纬度越界')
}
ok('11 节点 order 连续 / code 唯一 / 经纬度有效')

assert.strictEqual(questions.length, 43, '题目总数应为 43')
assert.strictEqual(new Set(questions.map(q => q._id)).size, 43, '题目 _id 应唯一')
ok('43 题 _id 唯一')

for (const n of nodes) {
  assert.strictEqual(n.quiz.questionIds.length, n.quiz.questionCount, n.code + ' questionIds 与 questionCount 不符')
  assert.strictEqual(questions.filter(q => q.nodeCode === n.code).length, 3, n.code + ' 应恰有 3 题')
  for (const qid of n.quiz.questionIds) {
    const q = questions.find(x => x._id === qid)
    assert(q, n.code + ' 引用无效题目 ' + qid)
    assert.strictEqual(q.nodeCode, n.code, qid + ' nodeCode 与引用不符')
  }
}
assert.strictEqual(questions.filter(q => q.nodeCode === 'final').length, 10, 'final 池应为 10 题')
ok('questionIds 引用有效 / 每节点 3 题 / final 池 10 题')

for (const q of questions) {
  assert(Array.isArray(q.answer) && q.answer.length >= 1, q._id + ' answer 应为非空数组')
  for (const a of q.answer) assert(a >= 0 && a < q.options.length, q._id + ' 答案下标越界')
  if (q.type === 'single' || q.type === 'judge') assert.strictEqual(q.answer.length, 1, q._id + ' 单选/判断只应 1 个答案')
  if (q.type === 'judge') {
    assert.deepStrictEqual(q.options, ['正确', '错误'], q._id + ' 判断题 options 格式错误')
  }
  assert(q.type === 'single' || q.type === 'multiple' || q.type === 'judge', q._id + ' type 非法')
}
ok('answer 不越界 / 题型格式正确')

/* ================= 2. 全链路 ================= */

async function chain() {
  console.log('[2] 全链路')

  // 未打卡取题被拒
  let r = await api.getQuiz('node', 'ruijin')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error, 'NOT_CHECKED_IN')
  ok('未打卡取题被拒（NOT_CHECKED_IN）')

  // final 未全打卡被拒
  r = await api.getQuiz('final')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error, 'NOT_ALL_CHECKED_IN')
  ok('final 未解锁被拒（NOT_ALL_CHECKED_IN）')

  // 依次打卡 11 节点
  for (const n of nodes) {
    r = await api.checkin(n.code)
    assert.strictEqual(r.ok, true, n.code + ' 打卡失败')
    assert.strictEqual(r.alreadyChecked, false)
  }
  r = await api.checkin('ruijin')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.alreadyChecked, true)
  ok('11 节点依次打卡 + 重复打卡幂等')

  // 取题无答案泄露
  r = await api.getQuiz('node', 'ruijin')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.questions.length, 3)
  for (const q of r.questions) {
    assert(!('answer' in q), 'answer 字段泄露')
    assert(!('explanation' in q), 'explanation 字段泄露')
  }
  ok('取题无答案泄露（answer/explanation 已剥离）')

  // 判分：错一题 67 分
  const qs = r.questions
  const answersWithOneWrong = qs.map((q, i) => {
    const full = questions.find(x => x._id === q.id)
    if (i === 0) return { id: q.id, answer: [(full.answer[0] + 1) % full.options.length] }
    return { id: q.id, answer: full.answer }
  })
  r = await api.submitQuiz('node', 'ruijin', answersWithOneWrong)
  assert.strictEqual(r.score, 67)
  assert.strictEqual(r.passed, true)
  assert.strictEqual(r.correctCount, 2)
  ok('错一题 67 分 / 及格判定正确')

  // 全对 → 100，best=100
  r = await api.submitQuiz('node', 'ruijin', qs.map(q => ({
    id: q.id, answer: questions.find(x => x._id === q.id).answer
  })))
  assert.strictEqual(r.score, 100)
  assert.strictEqual(r.best, 100)
  assert.strictEqual(r.attempts, 2)
  ok('全对 100 分 / best 与 attempts 累计')

  // 全错 → 0 分，best 保持 100，passed 保持 true
  r = await api.submitQuiz('node', 'ruijin', qs.map(q => ({ id: q.id, answer: [99] })))
  assert.strictEqual(r.score, 0)
  assert.strictEqual(r.passed, false)
  assert.strictEqual(r.best, 100)
  ok('全错 0 分 / best 保持 100 / passed 不回落')

  // 进度与流水
  const p = await api.getProgress()
  assert.strictEqual(Object.keys(p.checkins).length, 11)
  assert.strictEqual(p.quizScores.ruijin.passed, true)
  assert.strictEqual(p.quizScores.ruijin.best, 100)
  const flow = await api.getCheckins()
  assert.strictEqual(flow.length, 11)
  ok('进度 11 打卡 / ruijin 通关 / 流水 11 条')

  // 学习统计：3 次提交共 9 题，答对 2+3+0=5
  assert.ok(p.stats && p.stats.totalCount === 9 && p.stats.correctCount === 5)
  ok('学习统计累计 9 题 / 5 对')

  // final 毕业链路
  r = await api.getQuiz('final')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.questions.length, 10)
  for (const q of r.questions) assert(!('answer' in q), 'final 题目答案泄露')
  r = await api.submitQuiz('final', null, r.questions.map(q => ({
    id: q.id, answer: questions.find(x => x._id === q.id).answer
  })))
  assert.strictEqual(r.score, 100)
  assert.strictEqual(r.isFinalPassed, true)
  const p2 = await api.getProgress()
  assert.strictEqual(p2.finalExam.passed, true)
  assert.strictEqual(p2.finalExam.best, 100)
  ok('final 满分毕业 / 毕业状态写入')

  // 状态机最终态
  const st = progress.computeStates(nodes, p2, { sequentialUnlock: false })
  assert.strictEqual(st.finalState, 'passed')
  assert.strictEqual(st.checkedCount, 11)
  assert.strictEqual(st.passedCount, 1)
  assert.strictEqual(st.byCode.ruijin.state, 'quizPassed')
  assert.strictEqual(st.byCode.xiangjiang.state, 'checkedIn')
  ok('状态机：finalState=passed / 各节点状态正确')

  // 顺序模式（独立空进度）
  const empty = { checkins: {}, quizScores: {}, finalExam: {} }
  const st2 = progress.computeStates(nodes, empty, { sequentialUnlock: true })
  assert.strictEqual(st2.byCode.ruijin.state, 'open')
  assert.strictEqual(st2.byCode.xiangjiang.state, 'locked')
  const half = { checkins: { ruijin: 1 }, quizScores: {}, finalExam: {} }
  const st3 = progress.computeStates(nodes, half, { sequentialUnlock: true })
  assert.strictEqual(st3.byCode.xiangjiang.state, 'open')
  ok('顺序模式：首节点 open / 后续 locked → 打卡后解锁')

  /* ================= 3. 前端题库按需加载 ================= */
  console.log('\n[3] 前端题库按需加载（后端模式不无条件下发答案）')

  // index.html 里不能再有静态的 questions.js 标签
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  assert(!html.includes('src="js/mock/questions.js"'), 'index.html 仍静态引入 questions.js（后端模式会下发答案）')
  assert(html.includes('src="js/mock/loader.js"'), 'index.html 未引入 js/mock/loader.js')
  ok('index.html：无 questions.js 标签 / 有 loader.js 标签')

  // 用假 document 跑一次 loader.js，验证两种模式行为差异
  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'mock', 'loader.js'), 'utf8')
  function runLoader(czConfig) {
    const writes = []
    const ctx = { document: { write: s => writes.push(s) } }
    if (czConfig) ctx.CZ_CONFIG = czConfig
    ctx.self = ctx // loader.js 用 typeof self 取 root
    vm.createContext(ctx)
    vm.runInContext(loaderSrc, ctx)
    return writes
  }
  const mockWrites = runLoader({ USE_MOCK: true })
  assert.strictEqual(mockWrites.length, 1, 'mock 模式应注入 1 次脚本，实际 ' + JSON.stringify(mockWrites))
  assert(mockWrites[0].includes('js/mock/questions.js'), 'mock 模式注入的不是 questions.js：' + mockWrites[0])
  ok('loader.js：USE_MOCK=true → document.write 注入 questions.js')

  const httpWrites = runLoader({ USE_MOCK: false })
  assert.strictEqual(httpWrites.length, 0, '后端模式不得注入题库，实际写了 ' + JSON.stringify(httpWrites))
  const noCfgWrites = runLoader(null)
  assert.strictEqual(noCfgWrites.length, 0, '无 CZ_CONFIG 不得注入，实际写了 ' + JSON.stringify(noCfgWrites))
  ok('loader.js：USE_MOCK=false / 无配置 → 零注入（答案不再无条件下发）')

  /* ================= 4. 批次③：3D 沙盘 / 天气 / 地图 ================= */
  console.log('\n[4] 批次③：3D 沙盘 / 天气 / 地图（回归锁）')

  const webRoot = path.join(__dirname, '..')
  const map3dSrc = fs.readFileSync(path.join(webRoot, 'js', 'map3d.js'), 'utf8')
  const mapViewSrc = fs.readFileSync(path.join(webRoot, 'js', 'views', 'map.js'), 'utf8')
  const wxSrc = fs.readFileSync(path.join(webRoot, 'js', 'weather.js'), 'utf8')
  const cssSrc = fs.readFileSync(path.join(webRoot, 'css', 'style.css'), 'utf8')

  // 断言失败信息要能定位：把偏移换算成「文件:行号」
  function atIdx(file, src, idx) {
    return idx < 0 ? file + ':(未找到该代码)' : file + ':' + (src.slice(0, idx).split('\n').length)
  }
  function at(file, src, needle) {
    return atIdx(file, src, src.indexOf(needle))
  }

  // 用 stub 的 localStorage / matchMedia / document 直接跑 js/weather.js（真行为，不是读源码）
  function runWeather(env) {
    env = env || {}
    const store = Object.assign({}, env.store || {})
    const mqFns = []
    let rafSeq = 0
    const ctx2d = {
      setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {},
      lineTo() {}, stroke() {}, arc() {}, fill() {},
      createRadialGradient: () => ({ addColorStop() {} })
    }
    const mq = {
      matches: !!env.reducedMotion,
      addEventListener(type, fn) { if (type === 'change') mqFns.push(fn) },
      removeEventListener() {}
    }
    const sandbox = {
      localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v) }
      },
      matchMedia: () => mq,
      document: {
        hidden: false,
        body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
        createElement: () => ({ style: {}, width: 0, height: 0, getContext: () => ctx2d, appendChild() {} }),
        getElementById: () => null,
        addEventListener() {}
      },
      addEventListener() {}, removeEventListener() {},
      requestAnimationFrame: () => ++rafSeq,
      cancelAnimationFrame() {},
      innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
      performance: { now: () => 0 },
      console
    }
    sandbox.self = sandbox
    vm.createContext(sandbox)
    vm.runInContext(wxSrc, sandbox)
    return {
      wx: sandbox.CZ_WEATHER,
      store,
      fireMotionChange(matches) { mq.matches = matches; mqFns.forEach(fn => fn()) }
    }
  }

  // ①【行为】fxOn() 缺省跟随系统「减少动态效果」
  const wxLoose = runWeather({ reducedMotion: false })
  assert.strictEqual(wxLoose.wx.isEnabled(), true,
    '期望 系统未开 prefers-reduced-motion 且 localStorage 无 cz_wx_fx 时 isEnabled()=true，实际 ' +
    wxLoose.wx.isEnabled() + ' @ ' + at('js/weather.js', wxSrc, 'function fxOn'))
  const wxReduced = runWeather({ reducedMotion: true })
  assert.strictEqual(wxReduced.wx.isEnabled(), false,
    '期望 系统开 prefers-reduced-motion 且无 cz_wx_fx 时 isEnabled()=false，实际 ' +
    wxReduced.wx.isEnabled() + ' @ ' + at('js/weather.js', wxSrc, 'function fxOn'))
  ok('weather.js 行为：fxOn() 缺省跟随 matchMedia(prefers-reduced-motion)')

  // ②【行为】cz_wx_fx 读写 / setEnabled 语义 / 系统偏好变化实时响应
  const wxStored = runWeather({ reducedMotion: false, store: { cz_wx_fx: '0' } })
  assert.strictEqual(wxStored.wx.isEnabled(), false,
    '期望 已存 cz_wx_fx="0" 时 isEnabled()=false（用户显式关优先于系统偏好），实际 ' +
    wxStored.wx.isEnabled() + ' @ ' + at('js/weather.js', wxSrc, 'function readPref'))
  const wxCase = runWeather({ reducedMotion: true })
  wxCase.wx.setEnabled(true)
  assert.strictEqual(wxCase.wx.isEnabled(), true,
    '期望 setEnabled(true) 后 isEnabled()=true（可推翻系统 reduced-motion），实际 ' +
    wxCase.wx.isEnabled() + ' @ ' + at('js/weather.js', wxSrc, 'function setEnabled'))
  assert.strictEqual(wxCase.store.cz_wx_fx, '1',
    '期望 setEnabled(true) 往 localStorage 写 cz_wx_fx="1"，实际 ' +
    JSON.stringify(wxCase.store.cz_wx_fx) + ' @ ' + at('js/weather.js', wxSrc, 'function savePref'))
  wxCase.wx.setEnabled(false)
  assert.strictEqual(wxCase.wx.isEnabled(), false,
    '期望 setEnabled(false) 后 isEnabled()=false，实际 ' + wxCase.wx.isEnabled() +
    ' @ ' + at('js/weather.js', wxSrc, 'function setEnabled'))
  assert.strictEqual(wxCase.store.cz_wx_fx, '0',
    '期望 setEnabled(false) 往 localStorage 写 cz_wx_fx="0"，实际 ' +
    JSON.stringify(wxCase.store.cz_wx_fx) + ' @ ' + at('js/weather.js', wxSrc, 'function savePref'))
  // 用户显式选过 → 系统偏好变化不得推翻；没选过 → 必须实时跟随
  wxCase.wx.setEnabled(true)
  wxCase.fireMotionChange(true)
  assert.strictEqual(wxCase.wx.isEnabled(), true,
    '期望 用户显式 setEnabled(true) 后 mq change 不推翻用户选择，实际 ' + wxCase.wx.isEnabled() +
    ' @ ' + at('js/weather.js', wxSrc, 'const onMq'))
  const wxFollow = runWeather({ reducedMotion: false })
  wxFollow.fireMotionChange(true)
  assert.strictEqual(wxFollow.wx.isEnabled(), false,
    '期望 用户未显式选择时 mq change 实时关掉特效，实际 ' + wxFollow.wx.isEnabled() +
    ' @ ' + at('js/weather.js', wxSrc, 'const onMq'))
  ok('weather.js 行为：cz_wx_fx 读写 + setEnabled/isEnabled 语义 + mq change 实时响应')

  // ③【契约】destroy() 必须真正释放 WebGL 上下文（顺序 + try/catch + 句柄清理）
  const lossIdx = map3dSrc.indexOf('renderer.forceContextLoss()')
  const disposeIdx = map3dSrc.indexOf('renderer.dispose()')
  assert(lossIdx >= 0,
    '期望 js/map3d.js 存在 renderer.forceContextLoss()（只 dispose 不结束上下文，连续进出 3D 会吃满浏览器配额），' +
    '实际未找到 forceContextLoss')
  assert(disposeIdx >= 0, '期望 js/map3d.js 存在 renderer.dispose()，实际未找到')
  assert(/try\s*\{\s*renderer\.forceContextLoss\(\)\s*\}\s*catch/.test(map3dSrc),
    '期望 forceContextLoss() 包在 try{}catch{} 里（无 WebGL 时可能抛错拖垮 destroy），实际不是该形式 @ ' +
    at('js/map3d.js', map3dSrc, 'renderer.forceContextLoss()'))
  assert(lossIdx < disposeIdx,
    '期望 forceContextLoss() 出现在 renderer.dispose() 之前（先释放上下文再 dispose），实际顺序颠倒：' +
    'dispose() @ ' + at('js/map3d.js', map3dSrc, 'renderer.dispose()') + ' 早于 forceContextLoss() @ ' +
    at('js/map3d.js', map3dSrc, 'renderer.forceContextLoss()'))
  assert(map3dSrc.indexOf("dom.addEventListener('webglcontextlost'") >= 0,
    '期望 js/map3d.js 注册 webglcontextlost 监听（丢失时要 preventDefault + 停帧 + 通知外部），实际未找到')
  const destroyHead = map3dSrc.indexOf('destroy() {')
  const destroySrc = destroyHead < 0 ? '' : map3dSrc.slice(destroyHead, map3dSrc.indexOf('root.CZ_MAP3D'))
  for (const need of ["dom.removeEventListener('webglcontextlost'", 'stopRaf()', 'clearTimers()']) {
    assert(destroySrc.indexOf(need) >= 0,
      '期望 destroy() 里出现 ' + need + '，实际未找到（上下文丢失后会留下悬挂监听 / rAF / 定时器） @ ' +
      (destroyHead < 0 ? 'js/map3d.js:(无 destroy 方法)' : atIdx('js/map3d.js', map3dSrc, destroyHead)))
  }
  ok('map3d.js 契约：destroy() 先 forceContextLoss() 再 dispose() + 摘 webglcontextlost / 停 rAF / 清定时器')

  // ④【契约】WebGL 不可用必须抛 err.code='WEBGL_UNAVAILABLE'，且抛错早于改容器内容
  const codeIdx = map3dSrc.indexOf("err.code = 'WEBGL_UNAVAILABLE'")
  assert(codeIdx >= 0,
    "期望 js/map3d.js 在 WebGL 不可用时抛 err.code='WEBGL_UNAVAILABLE'（不得静默降级），实际未找到该赋值")
  assert(/err\.code = 'WEBGL_UNAVAILABLE'[\s\S]{0,400}?throw err/.test(map3dSrc),
    '期望 设置 WEBGL_UNAVAILABLE 后把 err 抛出（上层据此回 2D），实际抛出缺失或被吞掉 @ ' +
    at('js/map3d.js', map3dSrc, "err.code = 'WEBGL_UNAVAILABLE'"))
  const firstTouchIdx = map3dSrc.indexOf('container.innerHTML')
  assert(firstTouchIdx >= 0 && codeIdx < firstTouchIdx,
    '期望 判定 WebGL 失败早于任何 container.innerHTML 改写（否则先清容器再抛错，留下半初始化画布并被误报成网络问题），' +
    '实际 container.innerHTML 首次出现在 ' + atIdx('js/map3d.js', map3dSrc, firstTouchIdx) +
    '，而 WEBGL_UNAVAILABLE 在 ' + atIdx('js/map3d.js', map3dSrc, codeIdx))
  ok('map3d.js 契约：WebGL 不可用抛 WEBGL_UNAVAILABLE（先抛错、后碰容器）')

  // ⑤【契约】views/map.js：WEBGL_UNAVAILABLE → 回 2D / threePromise 不缓存 rejected / 不再 scrollIntoView
  const wxCatchIdx = mapViewSrc.indexOf("err.code === 'WEBGL_UNAVAILABLE'")
  assert(wxCatchIdx >= 0,
    "期望 js/views/map.js 的 catch 分支判定 err.code === 'WEBGL_UNAVAILABLE'（设备不支持≠加载失败），实际未找到")
  const fbIdx = mapViewSrc.indexOf('fallbackTo2D(', wxCatchIdx)
  assert(fbIdx > wxCatchIdx && fbIdx - wxCatchIdx < 300,
    '期望 判定 WEBGL_UNAVAILABLE 后就地调用 fallbackTo2D(...) 切回 2D，实际 ' +
    (fbIdx < 0 ? '该分支内没有 fallbackTo2D 调用' : '距判定点 ' + (fbIdx - wxCatchIdx) + ' 字符才调用') +
    ' @ ' + atIdx('js/views/map.js', mapViewSrc, wxCatchIdx))
  const promiseCreateIdx = mapViewSrc.indexOf('threePromise = new Promise')
  // 从赋值点之后再找：文件顶部还有一句 \`let threePromise = null\` 的声明，不能拿它充数
  const promiseNullIdx = promiseCreateIdx < 0 ? -1 : mapViewSrc.indexOf('threePromise = null', promiseCreateIdx)
  assert(promiseCreateIdx >= 0 && promiseNullIdx > promiseCreateIdx,
    '期望 loadThree 失败后把 threePromise 置 null（否则 rejected promise 被永久缓存，重试永久卡死），实际 ' +
    (promiseNullIdx < 0 ? 'new Promise 之后没有任何 threePromise = null' : 'null 赋值位置异常') +
    ' @ ' + atIdx('js/views/map.js', mapViewSrc, promiseCreateIdx))
  assert(/\.catch\(err => \{[\s\S]{0,300}?threePromise = null/.test(mapViewSrc),
    '期望 threePromise = null 落在 loadThree 的 .catch 里（失败即清缓存），实际 ' +
    'threePromise = null @ ' + at('js/views/map.js', mapViewSrc, 'threePromise = null') + ' 不在该 catch 块内')
  assert(mapViewSrc.indexOf('scrollIntoView') < 0,
    '期望 js/views/map.js 不再出现 scrollIntoView(（整页滚动会把地图顶出屏幕），实际仍出现在 ' +
    at('js/views/map.js', mapViewSrc, 'scrollIntoView'))
  assert(mapViewSrc.indexOf('window.scrollBy({') >= 0,
    '期望 改由 revealFloat() 用 window.scrollBy({ top: … }) 只补浮窗被 tabBar 盖住的重叠量，' +
    '实际未找到 scrollBy 调用')
  ok('views/map.js 契约：WEBGL_UNAVAILABLE → fallbackTo2D / threePromise 失败置 null / 无 scrollIntoView 改 scrollBy')

  // ⑥【契约】.map-node 可聚焦 <g> + 44px 触控热区 + 快切条是 <button>
  assert(/<g class="map-node"[\s\S]{0,240}?tabindex="0" role="button"[\s\S]{0,240}?aria-label="/.test(mapViewSrc),
    '期望 .map-node 是 <g> 且同时带 tabindex="0" / role="button" / aria-label=（键盘与读屏可达），实际散落位置为 ' +
    'g @ ' + at('js/views/map.js', mapViewSrc, '<g class="map-node"') +
    ' / tabindex @ ' + at('js/views/map.js', mapViewSrc, 'tabindex="0" role="button"') +
    ' / aria-label @ ' + at('js/views/map.js', mapViewSrc, "' aria-label="))
  assert(/class="map-node-hit"[\s\S]{0,140}?r="23"/.test(mapViewSrc),
    '期望节点内含 <circle class="map-node-hit" … r="23">（直径 46 单位 → 移动端 ≥44px 热区），实际 ' +
    'map-node-hit @ ' + at('js/views/map.js', mapViewSrc, 'map-node-hit') + ' 附近无 r="23"')
  assert(mapViewSrc.indexOf('<button type="button" class="map-chip"') >= 0,
    '期望 底部快切条元素是 <button class="map-chip">（原生可聚焦可回车），实际未找到该标签 @ ' +
    at('js/views/map.js', mapViewSrc, 'class="map-chip" data-i='))
  ok('views/map.js 契约：.map-node 为可聚焦 <g>(tabindex/role/aria-label) + r=23 触控热区 + .map-chip 是 <button>')

  // ⑦【契约】style.css：天气标签隐藏 / 快切条零特异性 / 焦点环
  assert(/\.map3d-wx\[hidden\]\s*\{\s*display:\s*none/.test(cssSrc),
    '期望 css/style.css 有 .map3d-wx[hidden] { display: none; }（2D 模式下天气标签必须真的消失，' +
    '否则 .map3d-wx 的 display:flex 会盖掉 hidden），实际 @ ' +
    at('css/style.css', cssSrc, '.map3d-wx {'))
  const whereIdx = cssSrc.indexOf(':where(button.map-chip)')
  assert(whereIdx >= 0,
    '期望 css/style.css 用零特异性的 :where(button.map-chip) 只压 UA 默认外观，实际未找到该选择器')
  const bareRe = /(?:^|[\n,{}])\s*button\.map-chip\s*(?:,|\{)/g
  const bare = bareRe.exec(cssSrc)
  assert(!bare,
    '期望 button.map-chip 只以 :where(button.map-chip) 形式出现（裸选择器特异性 0,0,1 会盖掉 .map-chip 的底色/描边/圆角），' +
    '实际存在裸选择器 @ ' +
    // 正则整体吃掉了换行，行号要按选择器本体所在位置算
    (bare ? atIdx('css/style.css', cssSrc, bare.index + bare[0].indexOf('button.map-chip')) : ''))
  assert(/\.map-node:focus-visible\s*\{/.test(cssSrc),
    '期望 css/style.css 有 .map-node:focus-visible 焦点环（键盘用户必须看得见落点），实际 @ ' +
    at('css/style.css', cssSrc, '.map-node {'))
  ok('style.css 契约：[hidden] 隐藏 / :where(button.map-chip) 零特异性 / .map-node:focus-visible')

  /* ================= 5. 批次⑤：演示登录 / mock 覆盖 / 对话框与 toast 语义 / 转义 ================= */
  console.log('\n[5] 批次⑤：演示登录 / mock 覆盖 / 对话框与 toast 语义 / 转义（回归锁）')

  const cfgSrc = fs.readFileSync(path.join(webRoot, 'js', 'config.js'), 'utf8')
  const uiSrc = fs.readFileSync(path.join(webRoot, 'js', 'ui.js'), 'utf8')
  const quizSrc = fs.readFileSync(path.join(webRoot, 'js', 'views', 'quiz.js'), 'utf8')
  const fmtSrc = fs.readFileSync(path.join(webRoot, 'js', 'format.js'), 'utf8')
  const cfgAt = needle => at('js/config.js', cfgSrc, needle)

  // 用 stub 的 location 真跑 js/config.js（vm 沙箱里没有 URLSearchParams，须显式注入）
  function runConfig(loc) {
    const ctx = { location: loc, URLSearchParams: URLSearchParams }
    ctx.self = ctx
    vm.createContext(ctx)
    vm.runInContext(cfgSrc, ctx)
    return ctx.CZ_CONFIG
  }
  const TUNNEL = { hostname: 'abc-def.trycloudflare.com', protocol: 'https:' }

  // ①【行为】隧道域名不再无条件自动登录，必须显式 ?demo=1
  const tunnelBare = runConfig({ search: '', hostname: TUNNEL.hostname, protocol: TUNNEL.protocol })
  assert.strictEqual(tunnelBare.DEV_AUTO_LOGIN, null,
    '期望 隧道域名（trycloudflare）不带任何参数时 DEV_AUTO_LOGIN=null（凭据硬编码在前端，域名像隧道不等于可放行），实际 ' +
    JSON.stringify(tunnelBare.DEV_AUTO_LOGIN) + ' @ ' + cfgAt('const wantDemo'))
  const tunnelDemo = runConfig({ search: '?demo=1', hostname: TUNNEL.hostname, protocol: TUNNEL.protocol })
  assert(tunnelDemo.DEV_AUTO_LOGIN && tunnelDemo.DEV_AUTO_LOGIN.username === 'demo',
    '期望 隧道域名 + ?demo=1 → DEV_AUTO_LOGIN 非空（username=demo），实际 ' +
    JSON.stringify(tunnelDemo.DEV_AUTO_LOGIN) + ' @ ' + cfgAt('const wantDemo'))
  assert.strictEqual(runConfig({ search: '?demo=1&login=1', hostname: TUNNEL.hostname, protocol: TUNNEL.protocol }).DEV_AUTO_LOGIN, null,
    '期望 ?demo=1&login=1 → DEV_AUTO_LOGIN=null（?login=1 优先关掉演示登录），实际仍自动登录 @ ' +
    cfgAt('if (wantDemo && !forceLogin)'))
  assert.strictEqual(runConfig({ search: '?demo=1', hostname: 'changzheng.example.com', protocol: 'https:' }).DEV_AUTO_LOGIN, null,
    '期望 自有公网域名 + ?demo=1 → DEV_AUTO_LOGIN=null（不把演示账号暴露到正式站点），实际仍自动登录 @ ' +
    cfgAt('const IS_TUNNEL_HOST'))
  ok('config.js 行为：隧道域名不再无条件自动登录（裸访问 null / ?demo=1 生效 / ?login=1 优先关闭 / 公网域名不生效）')

  // ②【行为】本地与局域网同样只认显式 ?demo=1
  const localDemo = runConfig({ search: '?demo=1', hostname: '192.168.1.7', protocol: 'http:' })
  assert(localDemo.DEV_AUTO_LOGIN && localDemo.DEV_AUTO_LOGIN.username === 'demo',
    '期望 局域网 192.168.1.7 + ?demo=1 → DEV_AUTO_LOGIN 非空，实际 ' + JSON.stringify(localDemo.DEV_AUTO_LOGIN) +
    ' @ ' + cfgAt('const IS_LOCAL_HOST'))
  assert.strictEqual(runConfig({ search: '', hostname: 'localhost', protocol: 'http:' }).DEV_AUTO_LOGIN, null,
    '期望 本地 localhost 不带 ?demo=1 → DEV_AUTO_LOGIN=null，实际 ' +
    JSON.stringify(runConfig({ search: '', hostname: 'localhost', protocol: 'http:' }).DEV_AUTO_LOGIN) + ' @ ' + cfgAt('const wantDemo'))
  ok('config.js 行为：本地 / 局域网同样只认显式 ?demo=1')

  // ③【行为】?mock=1 / ?mock=0 强制覆盖 file:// 与 *.github.io 自动判定
  const mockCases = [
    { loc: { search: '', hostname: '', protocol: 'file:' }, want: true, why: 'file:// 双击打开应走 mock' },
    { loc: { search: '?mock=0', hostname: '', protocol: 'file:' }, want: false, why: '?mock=0 必须在 file:// 下强制后端' },
    { loc: { search: '?mock=1', hostname: 'u.github.io', protocol: 'https:' }, want: true, why: '?mock=1 必须强制 mock' },
    { loc: { search: '?mock=0', hostname: 'u.github.io', protocol: 'https:' }, want: false, why: '?mock=0 必须压过 *.github.io 自动判定' },
    { loc: { search: '', hostname: '127.0.0.1', protocol: 'http:' }, want: false, why: 'http 静态服务默认走后端' }
  ]
  for (const c of mockCases) {
    const got = runConfig(c.loc).USE_MOCK
    assert.strictEqual(got, c.want,
      '期望 ' + c.why + '：' + JSON.stringify(c.loc) + ' → USE_MOCK=' + c.want + '，实际 ' + got +
      ' @ ' + cfgAt("const mockParam = q.get('mock')"))
  }
  ok('config.js 行为：?mock=1 / ?mock=0 强制覆盖 file:// 与 *.github.io 自动判定（5 组合）')

  // ④【行为】ui.js dialog 的可访问语义（真跑，桩 DOM 只负责收集 innerHTML）
  function runUi() {
    const made = []
    let byId = {}
    function mkEl(tag) {
      const el = {
        tag, className: '', id: '', innerHTML: '', textContent: '', attrs: {},
        classList: { add(c) { el.shownWith = c }, remove(c) { el.hiddenWith = c } },
        setAttribute(k, v) { el.attrs[k] = v },
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        appendChild() {}, focus() {}, parentNode: null
      }
      made.push(el)
      return el
    }
    const body = mkEl('body')
    const sandbox = {
      document: {
        activeElement: null,
        body,
        createElement: mkEl,
        getElementById: id => byId[id] || null,
        addEventListener() {}, removeEventListener() {},
        contains: () => true
      },
      setTimeout: () => 0,
      clearTimeout() {},
      console
    }
    sandbox.self = sandbox
    vm.createContext(sandbox)
    vm.runInContext(fmtSrc, sandbox)   // 真 escapeHtml
    vm.runInContext(uiSrc, sandbox)
    return { ui: sandbox.CZ_UI, made, body, setById(map) { byId = map } }
  }
  const uiRun = runUi()
  uiRun.ui.dialog('确认重置', '将清除本地进度', [{ text: '取消' }, { text: '确定', primary: true }])
  const maskWithTitle = uiRun.made.filter(e => e.className === 'dlg-mask')[0]
  assert(maskWithTitle, '期望 ui.dialog() 往 document.body 追加 .dlg-mask 节点，实际一个都没创建 @ ' +
    at('js/ui.js', uiSrc, 'function dialog'))
  const dlgHtml = maskWithTitle.innerHTML
  assert(/role="dialog"/.test(dlgHtml) && /aria-modal="true"/.test(dlgHtml),
    '期望 对话框根节点同时带 role="dialog" 与 aria-modal="true"，实际 ' + JSON.stringify(dlgHtml.slice(0, 120)) +
    ' @ ' + at('js/ui.js', uiSrc, 'role="dialog"'))
  const labelledBy = (dlgHtml.match(/aria-labelledby="([^"]+)"/) || [])[1]
  assert(labelledBy && dlgHtml.indexOf('id="' + labelledBy + '"') >= 0,
    '期望 有标题时 aria-labelledby 指向标题节点 id（读屏才会念标题），实际 aria-labelledby=' +
    JSON.stringify(labelledBy) + ' / 标题节点 ' + JSON.stringify((dlgHtml.match(/class="dlg-title"[^>]*/) || [])[0]) +
    ' @ ' + at('js/ui.js', uiSrc, 'aria-labelledby='))
  uiRun.ui.dialog('', '<b>提示</b>', [{ text: '好' }])
  const maskNoTitle = uiRun.made.filter(e => e.className === 'dlg-mask')[1]
  assert(maskNoTitle, '期望 第二次 dialog() 也创建 .dlg-mask 节点，实际没有 @ ' + at('js/ui.js', uiSrc, 'function dialog'))
  const dlgHtml2 = maskNoTitle.innerHTML
  assert(!/aria-labelledby/.test(dlgHtml2),
    '期望 无标题时不再输出 aria-labelledby（指向不存在的节点等于没有名字），实际 ' + JSON.stringify(dlgHtml2.slice(0, 120)) +
    ' @ ' + at('js/ui.js', uiSrc, "aria-label="))
  assert(dlgHtml2.indexOf('aria-label="&lt;b&gt;提示&lt;/b&gt;"') >= 0,
    '期望 无标题时退回 aria-label 且内容经 escapeHtml（不得出现裸 <b>），实际 ' + JSON.stringify(dlgHtml2.slice(0, 120)) +
    ' @ ' + at('js/ui.js', uiSrc, "aria-label="))
  ok('ui.js 行为：dialog 带 role=dialog / aria-modal=true，有标题走 aria-labelledby、无标题退 aria-label（内容已转义）')

  // ⑤【行为】toast 新建与复用两条路径都必须补上 role/aria-live/aria-atomic
  const WANT_TOAST_ARIA = { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }
  const uiToast = runUi()
  uiToast.ui.toast('已保存')
  const toastEl = uiToast.made.filter(e => e.id === 'toast')[0]
  assert(toastEl, '期望 toast() 首次调用创建 #toast 容器，实际没有创建 @ ' + at('js/ui.js', uiSrc, 'function toast'))
  assert.deepStrictEqual(toastEl.attrs, WANT_TOAST_ARIA,
    '期望 新建的 #toast 带 role=status / aria-live=polite / aria-atomic=true，实际 ' + JSON.stringify(toastEl.attrs) +
    ' @ ' + at('js/ui.js', uiSrc, "setAttribute('role', 'status')"))
  assert.strictEqual(toastEl.textContent, '已保存',
    '期望 toast() 把文案写进 #toast，实际 ' + JSON.stringify(toastEl.textContent) + ' @ ' + at('js/ui.js', uiSrc, 'el.textContent = msg'))
  const staleToast = {
    id: 'toast', attrs: {}, textContent: '', classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v }
  }
  uiToast.setById({ toast: staleToast })
  uiToast.ui.toast('已删除')
  assert.deepStrictEqual(staleToast.attrs, WANT_TOAST_ARIA,
    '期望 复用已存在的 #toast 时也补齐 role=status / aria-live=polite / aria-atomic=true（否则读屏不会播报「已存在 → 文本变化」），实际 ' +
    JSON.stringify(staleToast.attrs) + ' @ ' + at('js/ui.js', uiSrc, '已存在的容器也补齐语义'))
  assert.strictEqual(staleToast.textContent, '已删除',
    '期望 复用路径也更新文案，实际 ' + JSON.stringify(staleToast.textContent) + ' @ ' + at('js/ui.js', uiSrc, 'el.textContent = msg'))
  ok('ui.js 行为：toast 新建与复用两条路径都设 role=status / aria-live=polite / aria-atomic=true')

  // ⑥【契约】证书引言必须过 escapeHtml（每处都紧跟 F.escapeHtml(，不许裸拼接）
  assert(/F\.escapeHtml\(root\.CZ_SPIRIT\.quote\)/.test(quizSrc),
    '期望 证书引言渲染为 F.escapeHtml(root.CZ_SPIRIT.quote)（文案里的 < & " 必须转义），实际未找到该形式 @ ' +
    at('js/views/quiz.js', quizSrc, 'cert-quote'))
  // 反例：不许出现「+ root.CZ_SPIRIT.quote」这种绕过 escapeHtml 的裸拼接
  // （root.CZ_SPIRIT && root.CZ_SPIRIT.quote 只是存在性判定，不是拼接，不在此列）
  const bareQuote = /\+\s*root\.CZ_SPIRIT\.quote\b/.exec(quizSrc)
  assert(!bareQuote,
    '期望 js/views/quiz.js 不存在 " + root.CZ_SPIRIT.quote" 裸拼接（绕过 escapeHtml 会把 < & " 直接拼进证书 HTML），实际 @ ' +
    atIdx('js/views/quiz.js', quizSrc, bareQuote ? bareQuote.index : -1) +
    ' 片段 ' + JSON.stringify(bareQuote ? quizSrc.slice(bareQuote.index, bareQuote.index + 40) : ''))
  ok('views/quiz.js 契约：证书引言一律 F.escapeHtml(root.CZ_SPIRIT.quote)，无裸拼接')
}

chain().then(() => {
  console.log('\nALL PASSED（' + passed + ' 项）')
}).catch(err => {
  console.error('\nFAILED:', err.message)
  process.exit(1)
})