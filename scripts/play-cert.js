// 一次性验收：mock 模式 final 全对 → 毕业证书金句渲染
const { spawn } = require('child_process')
const fs = require('fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const port = 17000 + Math.floor(Math.random() * 500)
  const url = 'http://localhost:8088/?mock=1&intro=0#/quiz/final'
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + require('os').tmpdir() + '/cdp-cert-' + process.pid,
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

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 40 && !loads; i++) await sleep(250)

  // seed：全打卡未毕业 + 注入 final 正确答案表（node 侧直接 require 生成 map）
  const qs = require('../js/mock/questions')
  const finalMap = {}
  qs.filter(q => q.nodeCode === 'final').forEach(q => { finalMap[q._id] = q.answer })
  const seed = `(() => {
    const codes = ['ruijin','xiangjiang','zunyi','sidu-chishui','jinshajiang','daduhe','luding','xueshan','caodi','lazikou','huining']
    const now = Date.now()
    const p = { nickname: '验证人', checkins: {}, quizScores: {}, finalExam: { attempts: 0, best: 0, passed: false, lastTime: null } }
    codes.forEach(c => { p.checkins[c] = now; p.quizScores[c] = { attempts: 1, best: 100, passed: true, lastTime: now } })
    localStorage.setItem('cz_progress', JSON.stringify(p))
    window.__FINAL_ANS = ${JSON.stringify(finalMap)}
  })()`
  await evalJs(seed)
  await send('Page.reload')
  for (let i = 0; i < 40 && loads < 2; i++) await sleep(250)
  await sleep(1500)

  // 10 题全对：每步读当前题干对应 id（quiz.js 渲染顺序即 questions 数组），按序取 map
  console.log('开考:', await evalJs(`document.querySelector('#app').innerText.split('\\n').slice(0, 4).join(' | ')`))
  const ids = Object.keys(finalMap)
  let step = 0
  for (let i = 0; i < 10; i++) {
    // 当前题 id：从页面文本推不出 id，改从 quiz 内部状态取 —— 直接用 window.__FINAL_ANS 的键按渲染序（抽题序未知）
    // 兜底：读页面题干文本匹配 questions.js 题干 → id
    const qText = await evalJs(`document.querySelector('.q-text') ? document.querySelector('.q-text').innerText : ''`)
    const q = qs.find(x => x.question === qText)
    if (!q) { console.log('第 ' + (i + 1) + ' 题未匹配题干:', qText.slice(0, 30)); break }
    const ans = q.answer
    await evalJs(`(() => { const opts = document.querySelectorAll('.option'); opts[${ans[0]}].click() })()`)
    await sleep(150)
    const isLast = i === 9
    if (isLast) {
      await evalJs(`document.querySelector('#btn-next').click()`)
    } else {
      await evalJs(`document.querySelector('#btn-next').click()`)
    }
    await sleep(250)
  }
  await sleep(1500)
  console.log('证书:', await evalJs(`document.querySelector('.certificate') ? document.querySelector('.certificate').innerText.split('\\n').join(' | ') : 'MISSING'`))
  console.log('cert-quote:', await evalJs(`document.querySelector('.cert-quote') ? document.querySelector('.cert-quote').innerText.split('\\n').join(' | ') : 'MISSING'`))

  ws.close(); edge.kill()
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
