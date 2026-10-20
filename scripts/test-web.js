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

  /* ================= 6. 批次⑥：可访问性与体验收尾 ================= */
  console.log('\n[6] 批次⑥：可访问性与体验收尾（回归锁）')

  const profSrc = fs.readFileSync(path.join(webRoot, 'js', 'views', 'profile.js'), 'utf8')
  const contestSrc = fs.readFileSync(path.join(webRoot, 'js', 'views', 'contest.js'), 'utf8')
  const lbSrc = fs.readFileSync(path.join(webRoot, 'js', 'views', 'leaderboard.js'), 'utf8')
  // 产品文件 CRLF、scripts LF：跨行锚点一律先归一化（\r\n → \n 不增删行，atIdx/at 仍指回原文件行号）
  const lf = s => s.replace(/\r\n/g, '\n')
  const nHtml = lf(html)
  const nCss = lf(cssSrc)
  const nMap3d = lf(map3dSrc)
  const nQuiz = lf(quizSrc)
  const nProf = lf(profSrc)
  const nContest = lf(contestSrc)
  const nLb = lf(lbSrc)
  // 注释里提到的旧写法（如「原先额外写的静态 opacity:0」）不是契约：注释原地替换为空格，偏移与行号不变
  const nCssCode = nCss.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))

  /** 从 openIdx 处的 '{' 起按花括号配对截取一段源码（供 vm 真跑函数体） */
  function blockAt(src, openIdx) {
    let depth = 0
    for (let i = openIdx; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) return src.slice(openIdx, i + 1)
    }
    return ''
  }
  /** 取某选择器【行首起头】的那条规则的声明体（避免 .stamp 误match .stamp-gold） */
  function cssBody(sel) {
    for (let from = 0; ;) {
      const i = nCssCode.indexOf(sel, from)
      if (i < 0) return null
      const after = i + sel.length
      const ws = nCssCode.slice(after).match(/^\s*/)[0].length
      const atHead = /(^|\n)\s*$/.test(nCssCode.slice(Math.max(0, i - 40), i))
      if (nCssCode[after + ws] === '{' && atHead) {
        const open = after + ws + 1
        const close = nCssCode.indexOf('}', open)
        return close < 0 ? null : nCssCode.slice(open, close)
      }
      from = after
    }
  }

  // ①【契约】favicon：index.html 显式声明 svg 图标，仓库根真的有该文件
  const FAVICON_LINK = '<link rel="icon" type="image/svg+xml" href="favicon.svg">'
  assert(nHtml.indexOf(FAVICON_LINK) >= 0,
    '期望 index.html 声明 ' + FAVICON_LINK + '（不声明就会去探测 /favicon.ico，浏览器控制台 404、标签页空白），实际 ' +
    JSON.stringify((nHtml.match(/<link[^>]*rel="icon"[^>]*>/) || ['(无 rel="icon" 标签)'])[0]) +
    ' @ ' + at('index.html', nHtml, '<link rel="icon"'))
  const favPath = path.join(webRoot, 'favicon.svg')
  assert(fs.existsSync(favPath),
    '期望 仓库根存在 favicon.svg（否则 index.html 的 link 指向 404），实际文件不存在 @ favicon.svg')
  const favBuf = fs.readFileSync(favPath)
  const favTxt = favBuf.toString('utf8')
  assert.strictEqual(favBuf.length, 677,
    '期望 favicon.svg 为 677 字节（批次⑥ 交付实体），实际 ' + favBuf.length + ' 字节 @ favicon.svg')
  assert(favTxt.indexOf('<svg') >= 0 && favTxt.indexOf('viewBox') >= 0,
    '期望 favicon.svg 是带 viewBox 的 <svg> 矢量图（任意尺寸都清晰、无位图毛边），实际缺少 ' +
    (favTxt.indexOf('<svg') < 0 ? '<svg' : 'viewBox') + ' @ favicon.svg:1')
  ok('favicon：index.html 声明 svg 图标 / 根目录 favicon.svg 677 字节且为带 viewBox 的 <svg>')

  // ②【契约】map3d 容器：整块沙盘按 role=img + 中文 aria-label 叙述
  const roleImgIdx = nMap3d.indexOf("container.setAttribute('role', 'img')")
  assert(roleImgIdx >= 0,
    '期望 js/map3d.js 给 container 设 role="img"（canvas 内容读屏不可达，整块沙盘要按「一张图」叙述），实际未找到该调用')
  const ariaIdx = nMap3d.indexOf("container.setAttribute('aria-label',")
  assert(ariaIdx > roleImgIdx,
    '期望 role="img" 之后紧跟 container.setAttribute(\'aria-label\', …)（role=img 必须带可读名字，否则读屏只念 image），实际 ' +
    (ariaIdx < 0 ? '未找到 aria-label 赋值' : 'aria-label 早于 role=img') +
    ' @ ' + atIdx('js/map3d.js', nMap3d, roleImgIdx))
  const ariaLine = nMap3d.slice(ariaIdx, nMap3d.indexOf('\n', ariaIdx))
  assert(ariaLine.indexOf('三维') >= 0 && ariaLine.indexOf('长征') >= 0,
    '期望 aria-label 是中文说明「三维…长征…」（读屏用户据此知道这块是立体沙盘而非装饰图），实际 ' +
    JSON.stringify(ariaLine.slice(0, 160)) + ' @ ' + atIdx('js/map3d.js', nMap3d, ariaIdx))
  ok('map3d.js 契约：container 设 role="img" + 中文 aria-label（含「三维」「长征」）')

  // ③【契约】announceFallback：先摘 role/aria-label，再插带 role=status/aria-live 的兜底节点
  const afIdx = nMap3d.indexOf('function announceFallback(msg) {')
  assert(afIdx >= 0,
    '期望 js/map3d.js 存在 function announceFallback(msg)（加载失败/上下文中断的唯一播报出口），实际未找到')
  const afSrc = blockAt(nMap3d, nMap3d.indexOf('{', afIdx))
  const iRmRole = afSrc.indexOf("container.removeAttribute('role')")
  const iRmLabel = afSrc.indexOf("container.removeAttribute('aria-label')")
  const iInsert = afSrc.indexOf("box.className = 'map3d-fallback'")
  const iStatus = afSrc.indexOf("box.setAttribute('role', 'status')")
  const iLive = afSrc.indexOf("box.setAttribute('aria-live', 'polite')")
  assert(iRmRole >= 0 && iRmLabel >= 0,
    '期望 announceFallback 里 container.removeAttribute(\'role\') 与 (\'aria-label\') 都出现（role=img 的子树对读屏隐藏，不先摘掉兜底文案播不出来），实际 role=' +
    (iRmRole >= 0) + ' aria-label=' + (iRmLabel >= 0) + ' @ ' + atIdx('js/map3d.js', nMap3d, afIdx))
  assert(iInsert >= 0,
    '期望 announceFallback 插入 div.map3d-fallback，实际未找到该 className @ ' + atIdx('js/map3d.js', nMap3d, afIdx))
  assert(iRmRole < iInsert && iRmLabel < iInsert,
    '期望 摘 role/aria-label 发生在插入 .map3d-fallback 之前（顺序反了 live region 落在 aria-hidden 子树里，等于哑巴），实际 ' +
    '摘 role @ 第 ' + iRmRole + ' 字符 / 摘 aria-label @ 第 ' + iRmLabel + ' / 插入 @ 第 ' + iInsert +
    ' @ ' + atIdx('js/map3d.js', nMap3d, afIdx))
  assert(iStatus >= 0 && iLive >= 0 && iStatus < iLive,
    '期望 兜底 div 带 role="status" 与 aria-live="polite"（且先设 role 再设 aria-live），实际 role=' +
    (iStatus >= 0) + ' aria-live=' + (iLive >= 0) + ' @ ' + atIdx('js/map3d.js', nMap3d, afIdx))
  ok('map3d.js 契约：announceFallback 先摘 role/aria-label 再插 .map3d-fallback（role=status + aria-live=polite）')

  // ④【契约】destroy 收尾：role/aria-label 必须一起清掉（容器会被复用，残留 role=img 会吞掉后续 alt 文本）
  const destroyIdx = nMap3d.indexOf('destroy() {')
  assert(destroyIdx >= 0, '期望 js/map3d.js 有 destroy() 方法，实际未找到')
  const destroyBody = blockAt(nMap3d, nMap3d.indexOf('{', destroyIdx))
  assert(destroyBody.indexOf("container.removeAttribute('role')") >= 0 &&
    destroyBody.indexOf("container.removeAttribute('aria-label')") >= 0,
    '期望 destroy() 里清掉 container 的 role 与 aria-label（否则退出 3D 后容器仍是「一张图」，2D 视图的读屏语义被盖掉），实际 role=' +
    (destroyBody.indexOf("container.removeAttribute('role')") >= 0) +
    ' aria-label=' + (destroyBody.indexOf("container.removeAttribute('aria-label')") >= 0) +
    ' @ ' + atIdx('js/map3d.js', nMap3d, destroyIdx))
  ok('map3d.js 契约：destroy() 清掉 container 的 role / aria-label')

  // ⑤【契约】reduced-motion 只停惯性/雨雪/星光，渲染循环不许被 REDUCED 短路
  assert(nMap3d.indexOf('const REDUCED =') >= 0,
    '期望 js/map3d.js 只计算一次 const REDUCED（matchMedia 判定），实际未找到')
  const yawIdx = nMap3d.indexOf('yawVel = !REDUCED &&')
  assert(yawIdx >= 0,
    '期望 松手惯性 yawVel 参与 !REDUCED 判定（减少动态效果下不许再甩镜头），实际 ' +
    JSON.stringify((nMap3d.match(/yawVel = [^\n]*/) || ['(未找到 yawVel 赋值)'])[0].slice(0, 100)) +
    ' @ ' + atIdx('js/map3d.js', nMap3d, nMap3d.indexOf('yawVel =')))
  assert(/if \(rain\.visible && !REDUCED\)/.test(nMap3d) && /if \(snow\.visible && !REDUCED\)/.test(nMap3d),
    '期望 雨丝与雪片的位移各自包在 !REDUCED 里（减少动态效果只冻结粒子，天气色与雾照常），实际 rain=' +
    /if \(rain\.visible && !REDUCED\)/.test(nMap3d) + ' snow=' + /if \(snow\.visible && !REDUCED\)/.test(nMap3d) +
    ' @ ' + at('js/map3d.js', nMap3d, 'if (rain.visible &&'))
  assert(nMap3d.indexOf('if (!REDUCED) s.rotation.z') >= 0,
    '期望 星点微光抖动也参与 !REDUCED（只留朝向），实际未找到 if (!REDUCED) s.rotation.z @ ' +
    at('js/map3d.js', nMap3d, 'stars.forEach'))
  const loopIdx = nMap3d.indexOf('function loop() {')
  assert(loopIdx >= 0, '期望 js/map3d.js 有 function loop() 渲染循环，实际未找到')
  const loopSrc = blockAt(nMap3d, nMap3d.indexOf('{', loopIdx))
  assert(loopSrc.indexOf('renderer.render(scene, camera)') >= 0,
    '期望 渲染循环里仍无条件调用 renderer.render(scene, camera)（REDUCED 停渲染＝3D 黑屏），实际该调用 ' +
    (loopSrc.indexOf('renderer.render(scene, camera)') >= 0 ? '存在' : '缺失') + ' @ ' + atIdx('js/map3d.js', nMap3d, loopIdx))
  assert(!/if \([^)]*\bREDUCED\b[^)]*\) return/.test(loopSrc),
    '期望 渲染循环不被 REDUCED 短路（不得出现 if (REDUCED) return —— 那会把整块沙盘停成黑屏），实际 ' +
    JSON.stringify((loopSrc.match(/if \([^)]*\bREDUCED\b[^)]*\) return/) || [''])[0]) + ' @ ' + atIdx('js/map3d.js', nMap3d, loopIdx))
  ok('map3d.js 契约：REDUCED 只停 inertial 惯性 / 雨雪位移 / 星点抖动，渲染循环照常 render')

  // ⑥【契约】prefers-reduced-motion 总则：全局时长压到 0.01ms（带 fill-mode 的动画立即落到终态）
  const RM = '@media (prefers-reduced-motion: reduce)'
  let rmGeneralIdx = -1
  for (let i = nCssCode.indexOf(RM); i >= 0; i = nCssCode.indexOf(RM, i + 1)) {
    const w = nCssCode.slice(i, i + 460)
    if (w.indexOf('*::before, *::after') >= 0 && /animation-duration:\s*0*\.01ms/.test(w)) { rmGeneralIdx = i; break }
  }
  assert(rmGeneralIdx >= 0,
    '期望 css/style.css 有 prefers-reduced-motion 总则（*, *::before, *::after { animation-duration: .01ms }），实际未找到该组合')
  const rmWin = nCssCode.slice(rmGeneralIdx, rmGeneralIdx + 460)
  assert(/transition-duration:\s*0*\.01ms/.test(rmWin),
    '期望 总则同时压 transition-duration 到 .01ms（只压 animation 的话过渡仍会长时间位移），实际该段 ' +
    JSON.stringify(rmWin.slice(0, 260)) + ' @ ' + atIdx('css/style.css', nCss, rmGeneralIdx))
  assert(/animation-iteration-count:\s*1\s*!important/.test(rmWin),
    '期望 总则把 animation-iteration-count 压成 1（无限循环动画在 .01ms 下会疯转），实际该段 ' +
    JSON.stringify(rmWin.slice(0, 260)) + ' @ ' + atIdx('css/style.css', nCss, rmGeneralIdx))
  ok('style.css 契约：prefers-reduced-motion 总则（animation-duration / transition-duration 均 .01ms、迭代 1 次）')

  // ⑦【契约】.map-node 的降级兜底：animation:none!important（缺了它 nodePop 的 from 会让节点永久不可见）
  const animNodeFb = /\.map-svg\.map-anim\s+\.map-node\s*\{\s*animation:\s*none\s*!important/
  assert(animNodeFb.test(nCssCode),
    '期望 css/style.css 存在 .map-svg.map-anim .map-node { animation: none !important; }（reduced-motion 下的兜底；' +
    '缺了它节点停在 nodePop 的 from 关键帧 opacity:0，地图上一个点都点不到），实际未找到 @ ' +
    at('css/style.css', nCss, '.map-svg.map-anim .map-node'))
  const animNodeStatic = cssBody('.map-svg.map-anim .map-node')
  assert(animNodeStatic !== null && !/opacity:\s*0\s*[;}]/.test(animNodeStatic),
    '期望 .map-svg.map-anim .map-node 的静态样式里没有 opacity:0（有的话 animation:none 兜底后就永久不可见），实际 ' +
    JSON.stringify(animNodeStatic) + ' @ ' + at('css/style.css', nCss, '.map-svg.map-anim .map-node'))
  ok('style.css 契约：.map-svg.map-anim .map-node 有 animation:none!important 兜底且静态无 opacity:0')

  // ⑧【契约】100dvh 覆盖必须紧跟 100vh（顺序反过来老浏览器会拿到失败的 dvh 值）
  const dvhHits = nCssCode.match(/min-height:\s*100dvh/g) || []
  const vhDvhPairs = nCssCode.match(/min-height:\s*100vh\s*;\s*min-height:\s*100dvh\s*;/g) || []
  assert.strictEqual(dvhHits.length, 3,
    '期望 css/style.css 恰有 3 处 min-height:100dvh（首屏 / 地图页 / 证书页），实际 ' + dvhHits.length + ' 处')
  let dvhLines = []
  for (let i = nCssCode.indexOf('min-height: 100dvh'); i >= 0; i = nCssCode.indexOf('min-height: 100dvh', i + 1)) {
    dvhLines.push(atIdx('css/style.css', nCss, i))
  }
  assert.strictEqual(vhDvhPairs.length, 3,
    '期望 三处 min-height:100dvh 各自紧跟 min-height:100vh 之后（vh 先写、dvh 后覆盖），实际 vh→dvh 相邻成对 ' +
    vhDvhPairs.length + ' 处；dvh 出现在 ' + dvhLines.join(' / '))
  ok('style.css 契约：三处 min-height:100dvh 均紧跟 min-height:100vh（vh 先、dvh 覆盖）')

  // ⑨【契约】焦点环：默认与浅底组件用 --red-dark，深红 tabBar 内改 --gold + 外晕
  const focusBase = cssBody(':focus-visible')
  assert(focusBase && /outline:\s*2px solid var\(--red-dark\)/.test(focusBase),
    '期望 默认 :focus-visible 用 outline: 2px solid var(--red-dark)（金环对纸底仅 ≈2.1:1，键盘落点看不见），实际 ' +
    JSON.stringify(focusBase) + ' @ ' + at('css/style.css', nCss, ':focus-visible'))
  const focusTab = cssBody('#tabbar .tab:focus-visible')
  assert(focusTab && /outline:\s*2px solid var\(--gold\)/.test(focusTab) && /box-shadow:/.test(focusTab),
    '期望 #tabbar .tab:focus-visible 用 var(--gold) 且有 box-shadow 外晕（深红底上红环只有 ≈1.7:1），实际 ' +
    JSON.stringify(focusTab) + ' @ ' + at('css/style.css', nCss, '#tabbar .tab:focus-visible'))
  for (const sel of ['.option:focus-visible', '.map-node:focus-visible', ':where(button.map-chip):focus-visible']) {
    const body = cssBody(sel)
    assert(body && /outline:\s*2px solid var\(--red-dark\)/.test(body),
      '期望 ' + sel + ' 的焦点环是 outline: 2px solid var(--red-dark)（浅纸底上 ≈10.8:1），实际 ' +
      JSON.stringify(body) + ' @ ' + at('css/style.css', nCss, sel))
  }
  ok('style.css 契约：焦点环 —— 默认/#tabbar 之外深红、.option/.map-node/:where(button.map-chip) 均 --red-dark')

  const stripBody = cssBody('.map-strip')
  assert(stripBody !== null && /padding:\s*12px\s+6px/.test(stripBody),
    '期望 .map-strip 的横向内边距为 6px（2px 会把首/末 .map-chip 的 2px 焦点环裁掉：overflow-x:auto 直接切掉出界像素，键盘走到两端看不见落点），实际 ' +
    JSON.stringify(stripBody) + ' @ ' + at('css/style.css', nCss, '.map-strip'))
  assert(stripBody !== null && /margin:\s*0\s+-4px/.test(stripBody),
    '期望 .map-strip 用 margin: 0 -4px 抵消这 6px 内边距（否则内容盒左右各内缩 4px，快切条整体漂移），实际 ' +
    JSON.stringify(stripBody) + ' @ ' + at('css/style.css', nCss, '.map-strip'))
  const goldOutlines = nCssCode.match(/outline:\s*2px solid var\(--gold\)/g) || []
  assert(goldOutlines.length === 1,
    '期望全站只剩 1 处 outline: 2px solid var(--gold)（只有 #tabbar 深红底需要金环，纸底金环仅 2.12:1），实际 ' + goldOutlines.length + ' 处 @ ' +
    at('css/style.css', nCss, 'outline: 2px solid var(--gold)'))
  ok('style.css 契约：.map-strip 内边距 6px + margin 0 -4px（焦点环不被 overflow 裁掉、版式零位移）/ 全站仅 tabBar 一处金环')

  // ⑩【契约】对比度：分数单位无 opacity、印章实心且几何未变
  const scoreUnit = cssBody('.score-unit')
  assert(scoreUnit !== null && !/opacity/.test(scoreUnit),
    '期望 .score-unit 不带 opacity（自身或父级透明度会把 #FFFFFF 小字压到 4.5:1 以下），实际 ' + JSON.stringify(scoreUnit) +
    ' @ ' + at('css/style.css', nCss, '.score-unit'))
  assert(scoreUnit !== null && /color:\s*#FFFFFF/i.test(scoreUnit),
    '期望 .score-unit color 为 #FFFFFF（深红底上最高对比），实际 ' + JSON.stringify(scoreUnit) +
    ' @ ' + at('css/style.css', nCss, '.score-unit'))
  const stampBody = cssBody('.stamp')
  assert(stampBody !== null && /opacity:\s*1\s*[;}]/.test(stampBody),
    '期望 .stamp 的 opacity 为 1（半透明红章叠在深红底上不足 4.5:1），实际 ' + JSON.stringify(stampBody) +
    ' @ ' + at('css/style.css', nCss, '.stamp'))
  for (const geo of [/width:\s*62px/, /height:\s*62px/, /border-radius:\s*6px/, /transform:\s*rotate\(-3deg\)/]) {
    assert(stampBody !== null && geo.test(stampBody),
      '期望 .stamp 几何保持 ' + geo + '（印章是签名动作，尺寸/倾角变了整页签名感就散了），实际 ' + JSON.stringify(stampBody) +
      ' @ ' + at('css/style.css', nCss, '.stamp'))
  }
  const stampInIdx = nCssCode.indexOf('@keyframes stampIn')
  const stampInBody = stampInIdx < 0 ? '' : blockAt(nCssCode, nCssCode.indexOf('{', stampInIdx))
  assert(/100%\s*\{[^}]*opacity:\s*1\b/.test(stampInBody),
    '期望 @keyframes stampIn 的 100% 显式声明 opacity: 1（reduced-motion 下时长压到 .01ms，终态缺 opacity 就会停在半透明/消失），实际 ' +
    JSON.stringify(stampInBody.slice(-160)) + ' @ ' + at('css/style.css', nCss, '@keyframes stampIn'))
  const heroPassedStamp = cssBody('.hero-passed .stamp')
  assert(heroPassedStamp !== null && /color:\s*#3A030C/i.test(heroPassedStamp),
    '期望 .hero-passed .stamp 的 color 为 #3A030C（金底上的红章要深于此才能在金色渐变上 ≥4.5:1），实际 ' +
    JSON.stringify(heroPassedStamp) + ' @ ' + at('css/style.css', nCss, '.hero-passed .stamp'))
  ok('style.css 契约：.score-unit 无 opacity 且 #FFFFFF / .stamp opacity:1 与几何不变 / stampIn 100% opacity:1 / .hero-passed .stamp #3A030C')

  // ⑪【行为】profile.js onActivate：抽出函数体在 vm 里真跑 Enter / 空格 / 非本元素守卫
  const oaIdx = nProf.indexOf('function onActivate(el, fn) {')
  assert(oaIdx >= 0,
    '期望 js/views/profile.js 存在 function onActivate(el, fn)（role=button 卡片唯一的键盘激活入口），实际未找到')
  const oaOpen = nProf.indexOf('{', oaIdx)
  const oaSrc = nProf.slice(oaIdx, oaOpen + blockAt(nProf, oaOpen).length) // 整段 function 声明（只取函数体会变成块语句，return 非法）
  assert(/'Enter'/.test(oaSrc) && /' '|'Spacebar'/.test(oaSrc),
    '期望 onActivate 同时处理 Enter 与 空格（空格要走 \' \' / \'Spacebar\' 两个键名），实际 ' + JSON.stringify(oaSrc) +
    ' @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  assert(/e\.target !== el/.test(oaSrc),
    '期望 onActivate 有 e.target !== el 守卫（卡片里还嵌着按钮，冒泡上来会连带触发两次），实际 ' + JSON.stringify(oaSrc) +
    ' @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  const oaCtx = {}
  oaCtx.self = oaCtx
  vm.createContext(oaCtx)
  vm.runInContext(oaSrc, oaCtx)
  const mkKeyEl = () => { const h = {}; return { handlers: h, addEventListener(t, fn) { h[t] = fn } } }
  const keyEl = mkKeyEl()
  let activations = 0
  let prevented = 0
  oaCtx.onActivate(keyEl, () => { activations++ })
  assert(typeof keyEl.handlers.keydown === 'function',
    '期望 onActivate 在元素上注册 keydown 监听，实际未注册 @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  const fireKey = (ev) => keyEl.handlers.keydown(Object.assign({ preventDefault() { prevented++ } }, ev))
  fireKey({ key: 'Enter', target: keyEl })
  const afterEnter = activations
  fireKey({ key: ' ', target: keyEl })
  const afterSpace = activations
  fireKey({ key: 'a', target: keyEl })
  const afterOther = activations
  fireKey({ key: 'Enter', target: { tag: 'BUTTON' } })
  const afterChild = activations
  assert.strictEqual(afterEnter, 1,
    '期望 Enter 触发一次回调（键盘用户必须能打卡/进证书页），实际触发 ' + afterEnter + ' 次 @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  assert.strictEqual(afterSpace, 2,
    '期望 空格 也触发（role=button 的原生语义是空格激活），实际累计 ' + afterSpace + ' 次 @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  assert.strictEqual(afterOther, 2,
    '期望 其它按键（a）不触发激活，实际累计 ' + afterOther + ' 次 @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  assert.strictEqual(afterChild, 2,
    '期望 e.target 不是本元素时（子按钮的 Enter 冒泡上来）不触发，实际累计 ' + afterChild + ' 次 @ ' + atIdx('js/views/profile.js', nProf, oaIdx))
  assert.strictEqual(prevented, 2,
    '期望 命中激活分支时调用 e.preventDefault()（否则空格会顺带滚屏/触发别的默认行为），实际 ' + prevented + ' 次 @ ' +
    atIdx('js/views/profile.js', nProf, oaIdx))
  let nullSafe = true
  try { oaCtx.onActivate(null, () => { activations++ }) } catch (e) { nullSafe = false }
  assert(nullSafe && activations === 2,
    '期望 onActivate(null, fn) 直接返回不抛错（卡片可能没渲染），实际 抛错=' + !nullSafe + ' 累计=' + activations + ' @ ' +
    atIdx('js/views/profile.js', nProf, oaIdx))
  ok('profile.js 行为（vm 真跑）：onActivate 的 Enter / 空格分支生效、非本元素冒泡被守卫挡住、preventDefault 到位、null 安全')

  // ⑫【契约】profile.js 五处 role=button + tabindex=0，昵称已是 h1
  const roleBtnCases = [
    { name: '.score-row', anchor: 'class="score-row"', re: /class="score-row"[\s\S]{0,160}?role="button"[\s\S]{0,80}?tabindex="0"/ },
    { name: '#user-card-action', anchor: 'id="user-card-action"', re: /id="user-card-action"[\s\S]{0,80}?role="button"[\s\S]{0,60}?tabindex="0"/ },
    { name: '#cert-entry', anchor: 'id="cert-entry"', re: /id="cert-entry"[\s\S]{0,80}?role="button"[\s\S]{0,60}?tabindex="0"/ },
    { name: '#contest-entry', anchor: 'id="contest-entry"', re: /id="contest-entry"[\s\S]{0,80}?role="button"[\s\S]{0,60}?tabindex="0"/ },
    { name: '#lb-entry', anchor: 'id="lb-entry"', re: /id="lb-entry"[\s\S]{0,80}?role="button"[\s\S]{0,60}?tabindex="0"/ }
  ]
  for (const c of roleBtnCases) {
    assert(c.re.test(nProf),
      '期望 profile.js 的 ' + c.name + ' 同时带 role="button" 与 tabindex="0"（读屏报「按钮」、键盘能 Tab 到并激活），实际 ' +
      at('js/views/profile.js', nProf, c.anchor) + ' 附近缺其中一项')
  }
  assert(nProf.indexOf('<h1 class="user-name"') >= 0,
    '期望 .user-name 是 <h1>（我的页主标题；<div> 会让读屏标题大纲里没有「昵称」），实际 ' +
    JSON.stringify((nProf.match(/<[a-z0-9]+ class="user-name"/) || ['(未找到该 class)'])[0]) +
    ' @ ' + at('js/views/profile.js', nProf, 'class="user-name"'))
  ok('profile.js 契约：.score-row / #user-card-action / #cert-entry / #contest-entry / #lb-entry 均 role=button+tabindex=0，.user-name 为 <h1>')

  // ⑬【契约】contest 进度条 progressbar 语义 / leaderboard 两个 lb-tab 的 aria-pressed
  const pbIdx = nContest.indexOf('role="progressbar"')
  assert(pbIdx >= 0,
    '期望 js/views/contest.js 的答题进度条带 role="progressbar"（纯视觉进度条读屏完全不知道进度），实际未找到 @ ' +
    at('js/views/contest.js', nContest, 'progress-track'))
  const pbLine = nContest.slice(nContest.lastIndexOf('\n', pbIdx) + 1, nContest.indexOf('\n', pbIdx))
  assert(pbLine.indexOf('aria-valuenow="') >= 0 && pbLine.indexOf('aria-valuemin="') >= 0 &&
    pbLine.indexOf('aria-valuemax="') >= 0,
    '期望 同一元素上同时给 aria-valuemin / aria-valuemax / aria-valuenow（只有 role 不报数值等于哑巴），实际 ' +
    JSON.stringify(pbLine.slice(0, 200)) + ' @ ' + atIdx('js/views/contest.js', nContest, pbIdx))
  const lbTabHits = nLb.match(/class="lb-tab[\s\S]{0,140}?aria-pressed="/g) || []
  assert.strictEqual(lbTabHits.length, 2,
    '期望 leaderboard.js 的两个 .lb-tab（累计总分 / 单场最佳）都带 aria-pressed（读屏才知道当前选的是哪一榜），实际命中 ' +
    lbTabHits.length + ' 处 @ ' + at('js/views/leaderboard.js', nLb, 'class="lb-tab'))
  ok('contest.js / leaderboard.js 契约：进度条 role=progressbar + aria-valuenow，两个 .lb-tab 均带 aria-pressed')

  // ⑭【契约】quiz.js 结果页标题层级与分数的可读名
  const quizSem = [
    { tag: 'h1', cls: 'result-title', why: '通关结果是结果页唯一一级标题' },
    { tag: 'h2', cls: 'review-title', why: '答题解析是结果页的二级标题' },
    { tag: 'h2', cls: 'cert-title', why: '结业证书标题是二级标题' }
  ]
  for (const c of quizSem) {
    assert(nQuiz.indexOf('<' + c.tag + ' class="' + c.cls + '"') >= 0,
      '期望 quiz.js 的 .' + c.cls + ' 是 <' + c.tag + '>（' + c.why + '），实际 ' +
      JSON.stringify((nQuiz.match(new RegExp('<[a-z0-9]+ class="' + c.cls + '"')) || ['(未找到该 class)'])[0]) +
      ' @ ' + at('js/views/quiz.js', nQuiz, 'class="' + c.cls + '"'))
  }
  assert(/class="result-score" role="img" aria-label="本场得分/.test(nQuiz),
    '期望 .result-score 带 role="img" 与 aria-label（大号分数是纯视觉呈现，读屏跳过就丢分），实际 ' +
    JSON.stringify((nQuiz.match(/class="result-score"[\s\S]{0,80}/) || ['(未找到 .result-score)'])[0]) +
    ' @ ' + at('js/views/quiz.js', nQuiz, 'class="result-score"'))
  ok('quiz.js 契约：.result-title 为 <h1>、.review-title / .cert-title 为 <h2>、.result-score 带 role=img + aria-label')

  /* ========== 7. webfont 自托管契约（首屏单文件，构建脚本 scripts/build-fonts.py） ========== */
  // 只看去注释后的 CSS：注释里会提到 unicode-range 这个词
  const fontCssRaw = fs.readFileSync(path.join(webRoot, 'fonts', 'noto-serif-sc.css'), 'utf8')
  const fontCss = fontCssRaw.replace(/\/\*[\s\S]*?\*\//g, '')

  const faceCount = (fontCss.match(/@font-face\s*\{/g) || []).length
  assert(faceCount > 0 && faceCount <= 2,
    '期望 fonts/noto-serif-sc.css 去注释后 @font-face 不超过 2 条（700 / 900 各一个全字符集单文件），实际 ' + faceCount)
  assert(!/unicode-range/i.test(fontCss),
    '期望不再有 unicode-range 切片（单文件覆盖 fonts/glyphs.txt 全字符集，首屏字体请求 <=2），实际仍命中 ' +
    JSON.stringify((fontCss.match(/unicode-range[^;]*;/) || ['(无)'])[0]))
  assert(/font-family:\s*'Noto Serif SC'/.test(fontCss),
    "期望保留 font-family: 'Noto Serif SC'（css/style.css 的 --font-title 引用的就是这个族名），实际未命中")
  assert(/font-display:\s*swap/.test(fontCss),
    '期望保留 font-display: swap（字体未就绪时先显示回退字体），实际未命中')
  for (const w of [700, 900]) {
    assert(new RegExp('font-weight:\\s*' + w + '\\b').test(fontCss),
      '期望有 font-weight: ' + w + ' 的 @font-face（900 是标题纲，缺了会掉到 700 的粗度），实际未命中')
  }
  const fontSrcs = (fontCss.match(/url\(([^)]+)\)/g) || [])
    .map(s => s.replace(/^url\(/, '').replace(/\)$/, '').replace(/['"]/g, '').trim())
  assert.strictEqual(fontSrcs.length, 2, '期望恰好 2 个 woff2 src，实际 ' + JSON.stringify(fontSrcs))
  for (const rel of fontSrcs) {
    const p = path.join(webRoot, 'fonts', rel)
    assert(fs.existsSync(p), '期望 src 引用的字体文件存在：fonts/' + rel)
    const size = fs.statSync(p).size
    assert(size > 100 * 1024, '期望 fonts/' + rel + ' > 100KB（整块中文字形子集），实际 ' + size + ' B')
  }
  ok('fonts 自托管契约：@font-face <=2 / 无 unicode-range / 700 与 900 都在 / 两个 woff2 src 均存在且 >100KB')

  const glyphPath = path.join(webRoot, 'fonts', 'glyphs.txt')
  assert(fs.existsSync(glyphPath), '期望 fonts/glyphs.txt 存在（构建输入：字符集快照）')
  // 注释行以 "# " 开头；字符行里的 '#' 是单独一行（前面没有空格），因此不会被误当注释
  const glyphChars = fs.readFileSync(glyphPath, 'utf8').split('\n').filter(l => l && !l.startsWith('# '))
  assert(glyphChars.length > 1000,
    '期望 fonts/glyphs.txt 行数 > 1000（ASCII + 中文标点 + 内容扫描字符），实际 ' + glyphChars.length)
  ok('fonts/glyphs.txt 存在且为逐行字符快照（' + glyphChars.length + ' 个）')

  // 回归锁：后端模式下 /api/quiz 从 SQLite 下发题目/选项/解析正文，种子里每个 >=U+2000 的字符
  // 都必须进了子集字符集，否则正文会逐字回落到 Songti SC / SimSun（一句话里两种衬线体）。
  const bankPath = path.join(webRoot, 'server', 'question-bank.json')
  assert(fs.existsSync(bankPath), '期望 server/question-bank.json 存在（后端题库种子，/api/quiz 的正文来源）')
  const bankText = fs.readFileSync(bankPath, 'utf8')
  const glyphSet = new Set(glyphChars)
  const bankCps = new Set([...bankText].filter(ch => ch.codePointAt(0) >= 0x2000))
  const bankMissing = [...bankCps].filter(ch => !glyphSet.has(ch))
  assert.strictEqual(bankMissing.length, 0,
    '期望 server/question-bank.json 里每个 >=U+2000 的字符都出现在 fonts/glyphs.txt 里（否则 /api/quiz 下发的正文缺字，' +
    '逐字回落到 Songti SC / SimSun；补字后重跑 scripts/build-fonts.py），实际缺 ' + bankMissing.length + ' 个：' +
    bankMissing.map(ch => JSON.stringify(ch) + ' U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ') +
    ' @ ' + at('server/question-bank.json', bankText, bankMissing[0] || ''))
  ok('fonts 覆盖回归：server/question-bank.json 的 ' + bankCps.size + ' 个 >=U+2000 字符全在 fonts/glyphs.txt 里（0 缺失）')

  /* ================= 6 END ================= */

}

chain().then(() => {
  console.log('\nALL PASSED（' + passed + ' 项）')
}).catch(err => {
  console.error('\nFAILED:', err.message)
  process.exit(1)
})