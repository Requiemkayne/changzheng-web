/**
 * CDP 截图工具 —— 用 Chrome DevTools Protocol 精确控制 Edge headless
 * 用法: node scripts/cdp-shot.js <file-url> <out.png> [width] [height] [wait-ms]
 * 零依赖（Node 22 内置 WebSocket + fetch）
 * 截图同时输出诊断 JSON：scrollY / innerHeight / tabbar rect
 */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const { spawn } = require('child_process')
const { writeFileSync, readFileSync } = require('fs')

const [, , url, out, width = '400', height = '800', wait = '6000', seedFile] = process.argv
const PORT = 9333 + Math.floor(Math.random() * 500)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const edge = spawn(EDGE, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=' + require('os').tmpdir() + '/cdp-' + process.pid,
    url
  ], { stdio: 'ignore' })

  try {
    let targets = null
    for (let i = 0; i < 40; i++) {
      await sleep(250)
      try {
        targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        if (targets.length) break
      } catch (e) { /* 还没起来 */ }
    }
    if (!targets || !targets.length) throw new Error('CDP 连接失败')
    console.log('TARGETS ' + targets.map(t => t.type + ':' + (t.url || '').slice(0, 60)).join(' | '))
    const page = targets.find(t => t.type === 'page') || targets[0]

    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let id = 0
    const pending = new Map()
    const events = []
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
      else if (m.method === 'Page.loadEventFired') events.push('load')
    }
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

    const send = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id
      pending.set(mid, res)
      setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('CDP 超时: ' + method)) } }, 15000)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })

    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: +width, height: +height, deviceScaleFactor: 1, mobile: false
    })
    // 页面随 Edge 启动加载；等 load 事件（防止拿到空白初始 context）
    for (let i = 0; i < 40 && !events.length; i++) await sleep(250)
    if (!events.length) {
      const r = await send('Runtime.evaluate', {
        expression: 'JSON.stringify({href: location.href, ready: document.readyState, html: document.documentElement.outerHTML.slice(0,200)})',
        returnByValue: true
      })
      console.log('NOTREADY ' + (r.result && r.result.result ? r.result.result.value : JSON.stringify(r)))
    }
    // 可选：注入 localStorage 种子数据（造进度/成绩），再刷新让页面用新数据渲染
    if (seedFile) {
      const seedJs = readFileSync(seedFile, 'utf8')
      await send('Runtime.evaluate', { expression: seedJs, returnByValue: true })
      await send('Page.reload')
      await sleep(800)
    }

    await sleep(+wait)

    // 诊断
    const diag = await send('Runtime.evaluate', {
      expression: `(() => {
        const t = document.getElementById('tabbar')
        const r = t ? t.getBoundingClientRect() : null
        return JSON.stringify({
          scrollY: window.scrollY, innerH: window.innerHeight,
          tabTop: r ? Math.round(r.top) : null, tabH: r ? Math.round(r.height) : null,
          bodyH: document.body.scrollHeight, title: document.title
        })
      })()`,
      returnByValue: true
    })
    console.log('DIAG ' + diag.result.result.value)

    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
    console.log('SHOT ' + out)

    // 第二帧：滚回顶部（验证 hero/tabbar 完整形态）
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' })
    await sleep(400)
    const shot2 = await send('Page.captureScreenshot', { format: 'png' })
    const out2 = out.replace(/\.png$/, '.top.png')
    writeFileSync(out2, Buffer.from(shot2.result.data, 'base64'))
    console.log('SHOT ' + out2)
    ws.close()
  } finally {
    edge.kill()
  }
}

main().catch(e => { console.error('FAIL ' + e.message); process.exit(1) })
