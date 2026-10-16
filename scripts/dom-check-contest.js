// 一次性验收：竞赛页毕业/未毕业态 + 排行榜空态 + lb-me 高亮
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const seed = fs.readFileSync('scripts/seed-contest.js', 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab(hash, useSeed, selectors) {
  const port = 12000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#' + hash
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-dom3-' + process.pid + '-' + Math.floor(Math.random() * 99999),
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
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  // 必须等首屏 load 后再注入（否则 localStorage 写进 about:blank 上下文）
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  await send('Runtime.evaluate', { expression: useSeed ? seed : 'localStorage.clear()' })
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 2; i++) await sleep(250)
  await sleep(1300)

  console.log('=== #' + hash + (useSeed ? ' (毕业种子)' : ' (空进度)') + ' ===')
  for (const sel of selectors) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText.replace(/\\n/g, ' | ') : 'MISSING:' + ${JSON.stringify(sel)} })()`,
      returnByValue: true
    })
    const v = r.result && r.result.result && r.result.result.value
    console.log(sel + ' → ' + (v || '(evaluate 失败: ' + JSON.stringify(r.result && r.result.exceptionDetails || {}).slice(0, 150) + ')'))
  }
  ws.close(); edge.kill()
}

async function main() {
  await grab('/contest', true, ['.contest-hero', '.contest-stats', '.contest-rule', '#contest-start', '#contest-lb'])
  await grab('/contest', false, ['#app'])
  await grab('/leaderboard', true, ['.lb-list', '.lb-myrank', '.lb-me', '.lb-tab.lb-tab-active'])
  await grab('/leaderboard', false, ['#app'])
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
