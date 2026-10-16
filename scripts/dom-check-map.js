// 验收：地图页升级 —— 地形示意（省界/河流/山脉）+ 图例五行 + 点节点弹浮窗
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 18000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/map'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-map-' + process.pid,
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
    fs.writeFileSync(require('path').join(__dirname, '..', '..', '.tokenicode', 'tmp', name), Buffer.from(r.result.data, 'base64'))
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 1200, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  // 种子：前 3 节点已打卡（验四态配色）
  const seed = `(() => {
    const now = Date.now()
    const p = { nickname: '验证人', checkins: {}, quizScores: {}, finalExam: { attempts: 0, best: 0, passed: false, lastTime: null } }
    ;['ruijin','xiangjiang','zunyi'].forEach(c => { p.checkins[c] = now })
    localStorage.setItem('cz_progress', JSON.stringify(p))
  })()`
  await evalJs(seed)
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 2; i++) await sleep(250)
  await sleep(1800)

  console.log('省界线:', await evalJs(`document.querySelectorAll('.map-province').length`))
  console.log('河流线:', await evalJs(`document.querySelectorAll('.map-river').length`))
  console.log('山脉三角:', await evalJs(`document.querySelectorAll('.map-mountain').length`))
  console.log('图例项:', await evalJs(`document.querySelectorAll('.map-legend span').length`))
  console.log('图例文本:', await evalJs(`document.querySelector('.map-legend').innerText.split('\\n').join(' | ')`))
  console.log('免责声明:', await evalJs(`document.querySelector('.map-note') ? document.querySelector('.map-note').innerText : 'MISSING'`))
  console.log('节点数:', await evalJs(`document.querySelectorAll('.map-node').length`))
  await shot('map-upgrade.png')

  // 点第 4 个节点 → 浮窗
  await evalJs(`document.querySelectorAll('.map-node')[3].dispatchEvent(new MouseEvent('click', {bubbles:true}))`)
  await sleep(600)
  console.log('浮窗显示:', await evalJs(`document.getElementById('map-float').style.display`))
  console.log('浮窗内容:', await evalJs(`document.querySelector('.map-float-card') ? document.querySelector('.map-float-card').innerText.split('\\n').join(' | ') : 'MISSING'`))
  await shot('map-float.png')

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
