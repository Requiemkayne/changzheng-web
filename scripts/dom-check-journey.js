// 验收：滚动叙事页 —— 红飘带随滚动延伸 + 节点点亮 + 历史→现代交叉淡化
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 21000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/journey'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-journey-' + process.pid,
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
  const scrollTo = async y => {
    await evalJs(`window.scrollTo(0, ${y})`)
    await sleep(450)
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  await sleep(1000)

  console.log('场景数:', await evalJs(`document.querySelectorAll('.j-scene').length`))
  console.log('节点圆点数:', await evalJs(`document.querySelectorAll('.jr-dot').length`))
  console.log('tabbar 隐藏:', await evalJs(`document.getElementById('tabbar').style.display`))
  console.log('初始 fill dashoffset:', await evalJs(`document.querySelector('.jr-fill').style.strokeDashoffset`))
  await shot('journey-hero.png')

  // 场景 0（于都）：段范围 [800, 2000]，p=(winH-rect.top)/1200，f=(p-0.25)/0.5
  // f=0 在 scrollY≈300（段顶 rect.top=500），f=1 在 scrollY≈900（rect.top=-100）
  await scrollTo(300)
  console.log('场景0 f≈0 hist/mod:', await evalJs(`document.querySelectorAll('.j-scene')[0].querySelector('.j-hist').style.opacity + ' / ' + document.querySelectorAll('.j-scene')[0].querySelector('.j-mod').style.opacity`))
  await shot('journey-hist.png')

  await scrollTo(900)
  console.log('场景0 f≈1 hist/mod:', await evalJs(`document.querySelectorAll('.j-scene')[0].querySelector('.j-hist').style.opacity + ' / ' + document.querySelectorAll('.j-scene')[0].querySelector('.j-mod').style.opacity`))
  console.log('场景0 节点点亮:', await evalJs(`document.querySelectorAll('.jr-dot')[0].className`))
  console.log('滚动中 dashoffset:', await evalJs(`document.querySelector('.jr-fill').style.strokeDashoffset`))
  await shot('journey-modern.png')

  // 滚到底：飘带延伸完，尾节点点亮，结尾按钮在
  await scrollTo(99999)
  console.log('底部 fill dashoffset:', await evalJs(`document.querySelector('.jr-fill').style.strokeDashoffset`))
  console.log('尾节点点亮:', await evalJs(`document.querySelectorAll('.jr-dot')[6].className`))
  console.log('结尾按钮:', await evalJs(`document.querySelector('#journey-start') ? document.querySelector('#journey-start').innerText : 'MISSING'`))
  await shot('journey-end.png')

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
