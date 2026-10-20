// 手机视口截图（CDP）：node tools/mobile-shot.js <url> <out.png> [w] [h] [clickSelector]
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const [url, out, wArg, hArg, clickSel] = process.argv.slice(2)
const W = Number(wArg || 390), H = Number(hArg || 844)

async function main() {
  if (!url || !out) {
    console.error('用法: node tools/mobile-shot.js <url> <out.png> [w] [h] [clickSelector]')
    process.exit(1)
  }
  const port = 23000 + Math.floor(Math.random() * 400)
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + os.tmpdir() + '/cdp-shot-' + process.pid, url], { stdio: 'ignore' })

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
  let id = 0
  const pending = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, res)
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)) } }, 20000)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
    return r.result && r.result.result ? r.result.result.value : null
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
  await sleep(3500)

  if (clickSel) {
    await evalJs(`document.querySelector(${JSON.stringify(clickSel)}).click()`)
    await sleep(3500)
  }

  console.log('innerWidth:', await evalJs('window.innerWidth'))
  console.log('横向溢出:', await evalJs('document.documentElement.scrollWidth > window.innerWidth ? "YES" : "no"'))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log('截图:', path.resolve(out))
  ws.close(); edge.kill()
}

main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
