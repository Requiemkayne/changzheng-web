// 验收：我的页学习统计卡 —— 累计答题 / 正确率 / 答题次数（含旧数据兼容）
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function grab() {
  const port = 20000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/profile'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-prof-' + process.pid,
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
  // 种子：3 打卡 + 2 通关 + stats 7/10 + attempts
  const seed = `(() => {
    const now = Date.now()
    const p = {
      nickname: '验证人',
      checkins: { ruijin: now, xiangjiang: now, zunyi: now },
      quizScores: {
        ruijin: { attempts: 2, best: 100, passed: true, lastTime: now },
        xiangjiang: { attempts: 3, best: 67, passed: true, lastTime: now }
      },
      finalExam: { attempts: 1, best: 80, passed: false, lastTime: now },
      stats: { correctCount: 7, totalCount: 10 }
    }
    localStorage.setItem('cz_progress', JSON.stringify(p))
  })()`
  await evalJs(seed)
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 2; i++) await sleep(250)
  await sleep(1500)

  console.log('学习统计卡:', await evalJs(`document.querySelector('.learn-card') ? document.querySelector('.learn-card').innerText.split('\\n').join(' | ') : 'MISSING'`))
  console.log('三个数字:', await evalJs(`Array.from(document.querySelectorAll('.learn-num')).map(n => n.innerText).join(' | ')`))
  await shot('profile-learn.png')

  // 旧数据兼容：无 stats 字段 → 全 0，不报错
  await evalJs(`localStorage.setItem('cz_progress', JSON.stringify({ checkins: {ruijin: Date.now()}, quizScores: {}, finalExam: {} }))`)
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 3; i++) await sleep(250)
  await sleep(1200)
  console.log('旧数据兼容:', await evalJs(`Array.from(document.querySelectorAll('.learn-num')).map(n => n.innerText).join(' | ')`))

  ws.close(); edge.kill()
}
grab().catch(e => { console.error('FAIL', e.message); process.exit(1) })
