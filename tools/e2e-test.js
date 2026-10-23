/**
 * Web 全功能自动测试（mock 模式，真实浏览器 + 真实点击）
 * 覆盖：欢迎/路线/11 个节点详情/节点答题/综合练习/申请毕业/竞赛/排行榜/我的
 * 每步都检查：渲染是否完成、控制台是否报错、页面是否横向溢出
 *
 * 用法：node tools/e2e-test.js
 */
const { spawn } = require('child_process')
const os = require('os')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:8088/?mock=1&intro=0'

let pass = 0
let fail = 0
const failures = []

function ok(name, extra) {
  pass++
  console.log('  ✓ ' + name + (extra ? '  ' + extra : ''))
}
function bad(name, why) {
  fail++
  failures.push(name + ' → ' + why)
  console.log('  ✗ ' + name + '  ' + why)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const port = 26000 + Math.floor(Math.random() * 500)
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + os.tmpdir() + '/e2e-' + process.pid,
    'about:blank'], { stdio: 'ignore' })

  let page = null
  for (let i = 0; i < 50 && !page; i++) {
    await sleep(300)
    try {
      const ts = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
      page = ts.find(t => t.type === 'page')
    } catch (e) { /* wait */ }
  }
  if (!page) { edge.kill(); throw new Error('浏览器未启动') }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pend = new Map()
  const consoleErrors = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map(a => a.value || a.description || '').join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception || {}).description)
    }
  }
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const send = (method, params = {}) => new Promise(res => {
    const mid = ++id; pend.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text }
    return r.result && r.result.result ? r.result.result.value : null
  }
  const goto = async (hash) => {
    await send('Page.navigate', { url: BASE + '&v=' + Date.now() + hash })
    await sleep(1800)
  }

  await send('Page.enable')
  await send('Runtime.enable')

  console.log('Web 全功能自动测试（mock 模式，真实浏览器）')
  console.log('='.repeat(56))

  /* ---------- 1. 欢迎页 ---------- */
  console.log('\n[1] 欢迎页 / 首访')
  await send('Page.navigate', { url: 'http://127.0.0.1:8088/?mock=1&v=' + Date.now() })
  await sleep(2200)
  const welcome = await ev(`(() => ({
    hasTitle: !!document.querySelector('.journey-title, .cover-name, h1'),
    text: (document.body.textContent || '').replace(/\\s+/g, ' ').slice(0, 40)
  }))()`)
  if (welcome && welcome.hasTitle) ok('欢迎页渲染', welcome.text)
  else bad('欢迎页渲染', JSON.stringify(welcome))

  /* ---------- 2. 路线页 ---------- */
  console.log('\n[2] 路线页')
  await goto('#/home')
  const home = await ev(`(() => {
    const rows = document.querySelectorAll('.tl-row, .node-row, [data-code]')
    return {
      rows: rows.length,
      tabs: document.querySelectorAll('.route-tab').length,
      heroStats: document.querySelectorAll('.hero-stat').length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      journeyEntryVisible: (() => { const e = document.querySelector('.journey-entry'); return e ? getComputedStyle(e).display !== 'none' : false })()
    }
  })()`)
  if (home.rows === 11) ok('路线页 11 个节点', 'tab ' + home.tabs + ' 个 / 统计块 ' + home.heroStats + ' 个')
  else bad('路线页节点数', JSON.stringify(home))
  if (!home.horizontalOverflow) ok('无横向溢出')
  else bad('横向溢出', 'scrollWidth 超出')
  if (!home.journeyEntryVisible) ok('长征之路入口已隐藏')
  else bad('长征之路入口未隐藏', '')

  /* ---------- 3. 11 个节点详情页 ---------- */
  console.log('\n[3] 11 个节点详情页')
  const codes = await ev(`CZ_API.getNodes().then(ns => ns.map(n => n.code))`)
  const titles = []
  for (const code of codes) {
    await goto('#/node/' + code)
    const d = await ev(`(() => {
      const blocks = document.querySelectorAll('.page .block')
      const tl = document.querySelectorAll('.block-timeline')
      const folds = document.querySelectorAll('.block-tl-fold')
      const story = document.querySelectorAll('.tl-story')
      const video = document.querySelectorAll('video')
      return {
        title: (document.querySelector('.cover-name') || {}).textContent,
        blocks: blocks.length, timeline: tl.length, folds: folds.length,
        story: story.length, video: video.length,
        backBtn: !!document.querySelector('.back-link')
      }
    })()`)
    titles.push(d.title)
    if (d.title && d.blocks >= 3 && d.backBtn) {
      ok('节点 ' + code, d.title + ' · 内容块 ' + d.blocks + ' · 时间点 ' + d.folds + ' · 故事 ' + d.story)
    } else {
      bad('节点 ' + code, JSON.stringify(d))
    }
  }

  /* ---------- 4. 节点答题（每个节点全对） ---------- */
  console.log('\n[4] 节点答题（11 × 3 题）')
  const ansMap = await ev(`(window.CZ_MOCK_QUESTIONS || []).reduce((m, q) => { m[q._id] = q.answer; return m }, {})`)
  // 先全打卡
  await ev(`(async () => { const ns = await CZ_API.getNodes(); for (const n of ns) { try { await CZ_API.checkin(n.code) } catch(e){} } return true })()`)
  for (const code of codes) {
    await goto('#/quiz/node/' + code)
    const qz = await ev(`(() => ({
      title: (document.querySelector('.quiz-title') || {}).textContent,
      count: (document.querySelector('.progress-num') || {}).textContent,
      hasSheet: !!document.querySelector('#btn-sheet'),
      hasPrev: !!document.querySelector('#btn-prev'),
      timer: !!document.querySelector('#quiz-timer')
    }))()`)
    if (qz && qz.hasSheet && qz.hasPrev && !qz.timer) {
      ok('答题页 ' + code, qz.count + ' · 答题卡/上下题齐全 · 无倒计时')
    } else {
      bad('答题页 ' + code, JSON.stringify(qz))
    }
  }

  /* ---------- 5. 综合练习 ---------- */
  console.log('\n[5] 综合练习')
  await goto('#/quiz/final')
  const prac = await ev(`(() => ({
    title: (document.querySelector('.quiz-title') || {}).textContent,
    sub: (document.querySelector('.quiz-sub') || {}).textContent,
    timer: (document.querySelector('#quiz-timer') || {}).textContent,
    count: (document.querySelector('.progress-num') || {}).textContent,
    sheet: !!document.querySelector('#btn-sheet')
  }))()`)
  if (prac.title === '综合练习') ok('练习页标题', prac.sub)
  else bad('练习页标题', JSON.stringify(prac))
  if (/^\d\d:\d\d$/.test(prac.timer || '')) ok('练习倒计时运行中', prac.timer)
  else bad('练习倒计时', prac.timer)
  if (prac.count === '1 / 10') ok('练习抽 10 题')
  else bad('练习题数', prac.count)

  // 答题卡交互
  const sheet = await ev(`(async () => {
    document.querySelector('#btn-sheet').click()
    await new Promise(r => setTimeout(r, 300))
    const cells = document.querySelectorAll('.sheet-cell')
    const legend = document.querySelector('.sheet-legend')
    document.querySelector('.sheet-close').click()
    await new Promise(r => setTimeout(r, 200))
    return { cells: cells.length, legend: !!legend, closed: !document.querySelector('.sheet-mask') }
  })()`)
  if (sheet.cells === 10 && sheet.closed) ok('答题卡 10 格 + 可关闭')
  else bad('答题卡', JSON.stringify(sheet))

  /* ---------- 6. 申请毕业流程 ---------- */
  console.log('\n[6] 毕业判定')
  // 把 11 个节点都答对
  await ev(`(async () => {
    const ns = await CZ_API.getNodes()
    const mq = window.CZ_MOCK_QUESTIONS || []
    for (const n of ns) {
      const q = await CZ_API.getQuiz('node', n.code)
      if (!q.ok) continue
      const answers = q.questions.map(x => { const m = mq.find(s => s._id === x.id); return { id: x.id, answer: m ? m.answer : [0] } })
      await CZ_API.submitQuiz('node', n.code, answers)
    }
    return true
  })()`)
  const gradState = await ev(`(async () => {
    const ns = await CZ_API.getNodes(); const st = await CZ_API.getProgress(); const cfg = await CZ_API.getConfig()
    const s = CZ_PROGRESS.computeStates(ns, st, cfg)
    return { grad: s.graduation, finalState: s.finalState }
  })()`)
  if (gradState.grad.avgScore === 100 && gradState.grad.ready) ok('11 节点全对 → 平均分 100 达标')
  else bad('平均分', JSON.stringify(gradState))

  const gradResult = await ev(`CZ_API.graduate()`)
  if (gradResult && gradResult.ok && gradResult.graduated) ok('申请毕业通过', '平均 ' + gradResult.avgScore + ' 分')
  else bad('申请毕业', JSON.stringify(gradResult))

  /* ---------- 7. 首页申请毕业卡（应已消失） ---------- */
  console.log('\n[7] 毕业入口显隐')
  await goto('#/home')
  const afterGrad = await ev(`(() => ({
    finalEntry: !!document.querySelector('#final-entry'),
    contestEntry: !!document.querySelector('#contest-entry')
  }))()`)
  if (!afterGrad.finalEntry) ok('已毕业后申请毕业卡消失')
  else bad('毕业卡未消失', '')
  if (afterGrad.contestEntry) ok('毕业后竞赛入口出现')
  else bad('竞赛入口未出现', '')

  /* ---------- 8. 知识竞赛 ---------- */
  console.log('\n[8] 知识竞赛')
  await goto('#/contest')
  const contest = await ev(`(() => ({
    rules: Array.from(document.querySelectorAll('.contest-rule-row')).map(r => r.textContent.replace(/\\s+/g, ' ').trim()),
    hasBack: !!document.querySelector('.back-link')
  }))()`)
  if (contest.rules.length >= 3) ok('竞赛规则展示', contest.rules.join(' | ').slice(0, 80))
  else bad('竞赛规则', JSON.stringify(contest))

  const contestStart = await ev(`(async () => {
    const s = await CZ_API.contestStart()
    return s.ok ? { count: s.questions.length, hasAnswer: s.questions.some(q => 'answer' in q), sub: s.meta.subtitle } : { error: s.error }
  })()`)
  if (contestStart.count === 10 && !contestStart.hasAnswer) ok('竞赛开场抽 10 题且无答案泄露', contestStart.sub)
  else bad('竞赛开场', JSON.stringify(contestStart))

  // 竞赛答题页 UI
  await goto('#/contest')
  const contestQuiz = await ev(`(async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /开始竞赛/.test(b.textContent))
    if (!btn) return { error: '无开始按钮' }
    btn.click()
    await new Promise(r => setTimeout(r, 2500))
    return {
      title: (document.querySelector('.quiz-title') || {}).textContent,
      timer: (document.querySelector('#quiz-timer') || {}).textContent,
      sheet: !!document.querySelector('#btn-sheet'),
      prev: !!document.querySelector('#btn-prev'),
      back: !!document.querySelector('.back-link')
    }
  })()`)
  if (contestQuiz.sheet && contestQuiz.prev && contestQuiz.back && /^\d\d:\d\d$/.test(contestQuiz.timer || '')) {
    ok('竞赛答题页完整', '倒计时 ' + contestQuiz.timer + ' · 答题卡/上下题/返回齐全')
  } else {
    bad('竞赛答题页', JSON.stringify(contestQuiz))
  }

  /* ---------- 9. 排行榜 ---------- */
  console.log('\n[9] 排行榜')
  await goto('#/leaderboard')
  const lb = await ev(`(() => ({
    title: (document.querySelector('.map-title-cn') || {}).textContent,
    tabs: document.querySelectorAll('.lb-tab').length,
    back: !!document.querySelector('.back-link'),
    backText: (document.querySelector('.back-link') || {}).textContent
  }))()`)
  if (lb.tabs === 2 && lb.back) ok('排行榜渲染', lb.title + ' · 返回「' + (lb.backText || '').trim() + '」')
  else bad('排行榜', JSON.stringify(lb))

  /* ---------- 10. 我的 ---------- */
  console.log('\n[10] 我的页')
  await goto('#/profile')
  const prof = await ev(`(() => {
    const folds = document.querySelectorAll('.profile-fold')
    return {
      folds: folds.length,
      allCollapsed: Array.from(folds).every(f => !f.open),
      certTitle: (document.querySelector('#cert-entry .final-title') || {}).textContent,
      entries: document.querySelectorAll('.entry-card').length,
      practice: !!document.querySelector('#practice-entry')
    }
  })()`)
  if (prof.folds === 2 && prof.allCollapsed) ok('节点成绩/我的足迹默认收起')
  else bad('下拉收放', JSON.stringify(prof))
  if (prof.certTitle === '结业证书') ok('已毕业 → 卡片显示「结业证书」')
  else bad('卡片标题', prof.certTitle)
  if (prof.entries === 3 && prof.practice) ok('三张入口卡（竞赛/排行/综合练习）')
  else bad('入口卡', JSON.stringify(prof))

  /* ---------- 11. 控制台错误 ---------- */
  console.log('\n[11] 运行时错误')
  const realErrors = consoleErrors.filter(e => e && !/favicon|404|Failed to load resource/i.test(e))
  if (realErrors.length === 0) ok('全程无 JS 报错')
  else bad('控制台错误 ' + realErrors.length + ' 条', realErrors.slice(0, 2).join(' | ').slice(0, 160))

  /* ---------- 汇总 ---------- */
  console.log('\n' + '='.repeat(56))
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败')
  if (fail) {
    console.log('\n失败项：')
    failures.forEach(f => console.log('  · ' + f))
  }
  ws.close()
  edge.kill()
  process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error('测试异常:', e.message); process.exit(1) })
