// 验收：开场流程 —— 首次访问 → journey 开场 → 跳过/结束 → 登录页
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 21000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1' // 无 hash、干净 user-data-dir → 模拟首次访问
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-opening-' + process.pid,
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
    if (r.result && r.result.exceptionDetails) return 'EXCEPTION: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200)
    return r.result && r.result.result ? r.result.result.value : '(no value)'
  }
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(os.tmpdir(), name), Buffer.from(r.result.data, 'base64'))
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  await sleep(1000)

  console.log('首次访问 hash:', await evalJs('location.hash'))
  console.log('journey 在场:', await evalJs(`document.querySelector('.journey') ? 'yes' : 'NO'`))
  console.log('旧 intro 已删:', await evalJs(`document.querySelector('.intro') ? '还在!' : '已删'`))
  console.log('跳过按钮文案:', await evalJs(`document.querySelector('#journey-back').innerText`))
  await shot('opening-hero.png')

  // 点跳过 → 应去登录页
  await evalJs(`document.querySelector('#journey-back').click()`)
  await sleep(700)
  console.log('跳过后 hash:', await evalJs('location.hash'))
  console.log('登录页在场:', await evalJs(`document.querySelector('.login-card') ? 'yes' : 'NO'`))
  await shot('opening-login.png')

  // 回 journey 滚到底 → 点「开始长征」→ 也应去登录页
  await evalJs(`location.hash = '#/journey'`)
  await sleep(700)
  await evalJs('window.scrollTo(0, 99999)')
  await sleep(500)
  await evalJs(`document.querySelector('#journey-start').click()`)
  await sleep(700)
  console.log('结束按钮后 hash:', await evalJs('location.hash'))

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
