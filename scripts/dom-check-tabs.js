// 验收：路线页 Tab 分类 —— 行军路线（全部）/ 重要战役 / 历史事件
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 19000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-tabs-' + process.pid,
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
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 1100, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)
  // 种子：前 2 节点已打卡
  const seed = `(() => {
    const now = Date.now()
    const p = { nickname: '验证人', checkins: {}, quizScores: {}, finalExam: { attempts: 0, best: 0, passed: false, lastTime: null } }
    ;['ruijin','xiangjiang'].forEach(c => { p.checkins[c] = now })
    localStorage.setItem('cz_progress', JSON.stringify(p))
  })()`
  await evalJs(seed)
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 2; i++) await sleep(250)
  await sleep(1500)

  console.log('Tab 标签:', await evalJs(`Array.from(document.querySelectorAll('.route-tab')).map(t => t.innerText).join(' | ')`))
  console.log('默认激活:', await evalJs(`document.querySelector('.route-tab-active') ? document.querySelector('.route-tab-active').innerText : 'NONE'`))
  console.log('行军路线节点数:', await evalJs(`document.querySelectorAll('#tl-wrap .tl-item').length`))

  // 切「重要战役」
  await evalJs(`document.querySelectorAll('.route-tab')[1].click()`)
  await sleep(300)
  console.log('重要战役激活:', await evalJs(`document.querySelector('.route-tab-active').innerText`))
  console.log('重要战役节点:', await evalJs(`Array.from(document.querySelectorAll('#tl-wrap .tl-name')).map(n => n.innerText).join(' | ')`))

  // 切「历史事件」
  await evalJs(`document.querySelectorAll('.route-tab')[2].click()`)
  await sleep(300)
  console.log('历史事件激活:', await evalJs(`document.querySelector('.route-tab-active').innerText`))
  console.log('历史事件节点:', await evalJs(`Array.from(document.querySelectorAll('#tl-wrap .tl-name')).map(n => n.innerText).join(' | ')`))

  // 切回「行军路线」+ 点节点行验证跳转绑定仍生效
  await evalJs(`document.querySelectorAll('.route-tab')[0].click()`)
  await sleep(300)
  console.log('切回后节点数:', await evalJs(`document.querySelectorAll('#tl-wrap .tl-item').length`))
  await shot('route-tabs.png')

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
