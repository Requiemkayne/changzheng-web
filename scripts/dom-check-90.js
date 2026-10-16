// 一次性验收：90 周年文案渲染（精神卡 + intro 徽标/金句 + 证书金句 DOM）
const { spawn } = require('child_process')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 16000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1#/'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-90-' + process.pid,
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
  let id = 0; const pending = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
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

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  await sleep(1500)

  console.log('hero-badge:', await evalJs(`document.querySelector('.hero-badge') ? document.querySelector('.hero-badge').innerText : 'MISSING'`))
  console.log('hero-sub:', await evalJs(`document.querySelector('.hero-sub') ? document.querySelector('.hero-sub').innerText : 'MISSING'`))
  console.log('spirit-card:', await evalJs(`document.querySelector('.spirit-card') ? document.querySelector('.spirit-card').innerText.split('\\n').join(' | ') : 'MISSING'`))
  console.log('spirit-item 数量:', await evalJs(`document.querySelectorAll('.spirit-item').length`))
  console.log('spirit-quote:', await evalJs(`document.querySelector('.spirit-quote') ? document.querySelector('.spirit-quote').innerText : 'MISSING'`))

  // intro 自动播（新 profile，sessionStorage 干净）——页面加载后即进入 intro，先抓 intro 文本
  const introText = await evalJs(`document.querySelector('.intro') ? document.querySelector('.intro').innerText.split('\\n').join(' | ') : 'MISSING'`)
  console.log('intro-text:', introText)

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
