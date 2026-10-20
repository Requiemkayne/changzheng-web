// 验收：欢迎页（单屏简版开场）—— 结构、节点速览、两个出口按钮
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 21000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/journey'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + os.tmpdir() + '/cdp-journey-' + process.pid,
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
    console.log('截图:', path.join(os.tmpdir(), name))
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  await sleep(800)

  console.log('hash:', await evalJs('location.hash'))
  console.log('欢迎页在场:', await evalJs(`document.querySelector('.journey.welcome') ? 'yes' : 'NO'`))
  console.log('标题:', await evalJs(`document.querySelector('.welcome-title').innerText`))
  console.log('副标题:', await evalJs(`document.querySelector('.welcome-sub').innerText`))
  console.log('节点速览数:', await evalJs(`document.querySelectorAll('.welcome-chip').length`))
  console.log('首/尾节点:', await evalJs(`document.querySelectorAll('.welcome-chip')[0].innerText + ' … ' + document.querySelectorAll('.welcome-chip')[6].innerText`))
  console.log('旧滚动叙事残留(.j-scene/.jr-dot):', await evalJs(`document.querySelectorAll('.j-scene').length + ' / ' + document.querySelectorAll('.jr-dot').length`))
  console.log('tabbar 隐藏:', await evalJs(`document.getElementById('tabbar').style.display`))
  console.log('是否需要滚动:', await evalJs(`document.documentElement.scrollHeight > window.innerHeight ? 'yes' : 'no'`))
  console.log('横向溢出:', await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? 'yes(' + document.documentElement.scrollWidth + ')' : 'no'`))
  console.log('胶囊都在视口内:', await evalJs(`Array.prototype.every.call(document.querySelectorAll('.welcome-chip'), el => el.getBoundingClientRect().right <= window.innerWidth + 0.5) ? 'yes' : 'NO'`))
  await shot('welcome-page.png')

  // 出口：mock 模式点「开始长征」→ 登录页
  await evalJs(`document.querySelector('#journey-start').click()`)
  await sleep(700)
  console.log('点开始长征后 hash:', await evalJs('location.hash'))
  console.log('登录页在场:', await evalJs(`document.querySelector('.login-card') ? 'yes' : 'NO'`))

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
