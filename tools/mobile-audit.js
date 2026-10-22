// 手机端体检：390×844 视口下检查横向溢出、触摸目标、字号、遮挡
const { spawn } = require('child_process')
const os = require('os')
const fs = require('fs')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:8088/?mock=1&intro=0'
const PAGES = [
  ['首页', '#/home'],
  ['节点详情', '#/node/luding'],
  ['答题页', '#/quiz/node/luding'],
  ['地图', '#/map'],
  ['我的', '#/profile'],
  ['青春经管', '/competition-timeline/']
]
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CHECK = `(() => {
  const out = { issues: [] }
  const W = window.innerWidth, H = window.innerHeight
  // 1) 横向溢出
  if (document.documentElement.scrollWidth > W + 1) {
    out.issues.push('横向溢出：scrollWidth=' + document.documentElement.scrollWidth + ' > ' + W)
  }
  // 2) 触摸目标过小
  const clickable = Array.from(document.querySelectorAll('a,button,[role=button],[data-code]'))
    .filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.top < H * 3
    })
  const small = clickable.filter(el => {
    const r = el.getBoundingClientRect()
    return r.width < 44 || r.height < 44
  })
  if (small.length) {
    out.issues.push('触摸目标 <44px：' + small.length + ' 个（' +
      small.slice(0, 3).map(e => (e.textContent || e.tagName).trim().slice(0, 10)).join('、') + '）')
  }
  // 3) 过小字号
  const tiny = Array.from(document.querySelectorAll('p,span,div,li,td,th,h4'))
    .filter(el => {
      if (!el.textContent || !el.textContent.trim()) return false
      if (el.children.length > 2) return false
      const fs = parseFloat(getComputedStyle(el).fontSize)
      return fs < 11 && el.getBoundingClientRect().height > 0
    })
  if (tiny.length > 3) out.issues.push('字号 <11px 的文本块：' + tiny.length + ' 处')
  // 4) 底部遮挡（最后一个块被 tabBar 压住）
  const bar = document.getElementById('tabbar')
  out.tabbarH = bar ? Math.round(bar.getBoundingClientRect().height) : 0
  // 5) 图片/视频数量与体积
  out.media = {
    imgs: document.querySelectorAll('img').length,
    bgImgs: Array.from(document.querySelectorAll('[style*="background-image"]')).length,
    videos: document.querySelectorAll('video').length
  }
  // 6) 首屏可见内容高度占比
  out.foldRatio = Math.round((document.body.scrollHeight / H) * 10) / 10
  // 7) 固定定位元素
  out.fixed = Array.from(document.querySelectorAll('*')).filter(el => {
    const cs = getComputedStyle(el)
    return cs.position === 'fixed' && el.getBoundingClientRect().height > 20
  }).map(el => (el.id || el.className || el.tagName).toString().split(' ')[0]).slice(0, 6)
  return out
})()`

async function main() {
  const port = 25000 + Math.floor(Math.random() * 400)
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + os.tmpdir() + '/mobile-check-' + process.pid,
    'about:blank'], { stdio: 'ignore' })

  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(300)
    try {
      const ts = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
      page = ts.find(t => t.type === 'page')
    } catch (e) { /* wait */ }
  }
  if (!page) { edge.kill(); throw new Error('no page') }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pend = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  }
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const send = (method, params = {}) => new Promise(res => {
    const mid = ++id; pend.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const ev = async x => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
    return r.result && r.result.result ? r.result.result.value : null
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  })

  console.log('手机端体检（390×844）\n' + '='.repeat(52))
  for (const [name, hash] of PAGES) {
    await send('Page.navigate', { url: BASE + hash })
    await sleep(2600)
    const res = await ev(CHECK)
    console.log('\n【' + name + '】')
    if (res.issues.length === 0) console.log('  ✓ 无横向溢出 / 触摸目标合规 / 字号正常')
    else res.issues.forEach(i => console.log('  ✗ ' + i))
    console.log('  底部栏高 ' + res.tabbarH + 'px | 媒体 img:' + res.media.imgs +
      ' bg:' + res.media.bgImgs + ' video:' + res.media.videos +
      ' | 页面长 ' + res.foldRatio + ' 屏')
    if (res.fixed.length) console.log('  固定元素: ' + res.fixed.join(', '))
  }

  ws.close()
  edge.kill()
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
