// 一次性验收：mock 模式完整打一场竞赛（开赛→步进答题→交卷→结果→榜单变化）
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const seed = fs.readFileSync('scripts/seed-contest.js', 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const port = 13000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/contest'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-play-' + process.pid,
    url], { stdio: 'ignore' })
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(250)
    try {
      const ts = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
      page = ts.find(t => t.type === 'page')
    } catch (e) { /* 未就绪 */ }
  }
  if (!page) { edge.kill(); throw new Error('no page') }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const pending = new Map(); let loads = 0
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    else if (m.method === 'Page.loadEventFired') loads++
  }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, res)
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout: ' + method)) } }, 15000)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
    return r.result && r.result.result ? r.result.result.value : null
  }
  const text = () => evalJs("document.querySelector('#app').innerText.replace(/\\n/g, ' | ')")

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  await send('Runtime.evaluate', { expression: seed })
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 2; i++) await sleep(250)
  await sleep(1200)

  // 点开始竞赛
  await evalJs("document.querySelector('#contest-start').click()")
  await sleep(1000)
  const q1 = await text()
  console.log('=== 开赛后（第 1 题）===')
  console.log(q1.slice(0, 400))

  // 每题点第一个选项，共 20 题（末题按钮变「交卷」）
  for (let i = 1; i <= 20; i++) {
    const picked = await evalJs("(el => { el.click(); return el.innerText })(document.querySelector('.option'))")
    await sleep(120)
    const state = await evalJs("({ n: document.querySelector('.quiz-progress-num') ? document.querySelector('.quiz-progress-num').innerText : null, next: (document.querySelector('#btn-next')||{}).innerText || null })")
    if (i === 20) console.log('第 20 题点选 → 选「' + picked + '」 按钮: ' + state.next)
    // 点下一题
    const clicked = await evalJs("(() => { const b = document.querySelector('#btn-next'); if (b && !b.disabled) { b.click(); return true } return false })()")
    await sleep(200)
    if (!clicked && i < 20) { console.log('第 ' + i + ' 题后按钮不可点（可能提交中）'); break }
  }
  // 等待交卷结果
  await sleep(1200)
  console.log('=== 结果页 ===')
  console.log(await text())

  // 切排行榜看变化
  await evalJs("location.hash = '#/leaderboard'")
  await sleep(1200)
  console.log('=== 赛后排行榜 ===')
  console.log(await text())

  // 我的页入口状态
  await evalJs("location.hash = '#/profile'")
  await sleep(1200)
  const entry = await evalJs("document.querySelector('#contest-entry').innerText.replace(/\\n/g, ' | ')")
  console.log('=== 我的页竞赛入口 ===')
  console.log(entry)

  ws.close(); edge.kill()
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
