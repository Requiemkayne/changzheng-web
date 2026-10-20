/**
 * 页面级天气特效 —— 覆盖整个可视区域（含内容区，不含底部导航）
 *
 * CZ_WEATHER.apply('rain' | 'snow' | 'fog' | 'cloud' | 'clear')
 * CZ_WEATHER.clear()
 *
 * 设计约束：
 *   1) 纯视觉层，pointer-events: none，不拦截任何点击/滑动
 *   2) 强度克制，透明度极低，不遮挡文字与地图
 *   3) 尊重 prefers-reduced-motion：只保留轻微色调，不绘制粒子
 *   4) 单例 canvas + rAF，切换天气不重建 DOM；页面不可见时暂停
 */
;(function (root) {
  const TINT = {
    clear: null,
    cloud: 'rgba(116,126,140,0.16)',
    rain: 'rgba(48,70,92,0.24)',
    snow: 'rgba(255,255,255,0.26)',
    fog: 'rgba(204,198,182,0.30)'
  }

  let wrap = null, canvas = null, ctx = null, raf = 0
  let mode = 'clear', w = 0, h = 0, dpr = 1
  let last = 0
  let drops = [], flakes = [], blobs = []

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  function ensure() {
    if (wrap) return
    wrap = document.createElement('div')
    wrap.className = 'wx-layer'
    canvas = document.createElement('canvas')
    wrap.appendChild(canvas)
    ctx = canvas.getContext('2d')
    // 垫在底部导航之前：天气盖内容，但不盖导航
    const tabbar = document.getElementById('tabbar')
    if (tabbar && tabbar.parentNode) tabbar.parentNode.insertBefore(wrap, tabbar)
    else document.body.appendChild(wrap)
    resize()
    addEventListener('resize', resize)
    layout(mode)
  }

  function resize() {
    if (!canvas) return
    dpr = Math.min(devicePixelRatio || 1, 2)
    w = innerWidth; h = innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layout(mode)
  }

  function layout(next) {
    drops = []; flakes = []; blobs = []
    if (next === 'rain') {
      const n = Math.min(240, Math.round(w * h / 6200))
      for (let i = 0; i < n; i++) {
        drops.push({
          x: Math.random() * w, y: Math.random() * h,
          len: 14 + Math.random() * 22,
          sp: 620 + Math.random() * 480
        })
      }
    } else if (next === 'snow') {
      const n = Math.min(200, Math.round(w * h / 8200))
      for (let i = 0; i < n; i++) {
        flakes.push({
          x: Math.random() * w, y: Math.random() * h,
          r: 1.1 + Math.random() * 2.4,
          sp: 22 + Math.random() * 46,
          ph: Math.random() * Math.PI * 2
        })
      }
    } else if (next === 'fog' || next === 'cloud') {
      const n = next === 'fog' ? 7 : 5
      for (let i = 0; i < n; i++) {
        blobs.push({
          x: Math.random() * w, y: Math.random() * h,
          r: (next === 'fog' ? 200 : 260) + Math.random() * 260,
          sp: (next === 'fog' ? 6 : 10) + Math.random() * 12,
          a: (next === 'fog' ? 0.05 : 0.04) + Math.random() * 0.05
        })
      }
    }
  }

  function apply(next) {
    mode = next || 'clear'
    ensure()
    document.body.classList.remove('wx-cloud', 'wx-rain', 'wx-snow', 'wx-fog')
    if (mode !== 'clear') document.body.classList.add('wx-' + mode)
    layout(mode)
    if (mode === 'clear') { stop(); draw(0); return }
    if (reduced) { stop(); draw(0); return }
    start()
  }

  function clear() { apply('clear') }

  function draw(dt) {
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)

    const tint = TINT[mode]
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h) }

    if (mode === 'rain') {
      ctx.strokeStyle = 'rgba(150,178,200,0.60)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const d of drops) {
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - 1.6, d.y + d.len)
      }
      ctx.stroke()
    } else if (mode === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      for (const f of flakes) {
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (mode === 'fog' || mode === 'cloud') {
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
        g.addColorStop(0, 'rgba(252,250,244,' + b.a + ')')
        g.addColorStop(1, 'rgba(252,250,244,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function step(dt) {
    if (mode === 'rain') {
      for (const d of drops) {
        d.y += d.sp * dt
        d.x -= 26 * dt
        if (d.y > h + 20) { d.y = -20; d.x = Math.random() * w }
        if (d.x < -20) d.x = w + 10
      }
    } else if (mode === 'snow') {
      const t = performance.now() / 1000
      for (const f of flakes) {
        f.y += f.sp * dt
        f.x += Math.sin(t * 0.7 + f.ph) * 14 * dt
        if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w }
        if (f.x < -6) f.x = w + 4
        if (f.x > w + 6) f.x = -4
      }
    } else if (mode === 'fog' || mode === 'cloud') {
      for (const b of blobs) {
        b.x += b.sp * dt
        if (b.x - b.r > w) b.x = -b.r
      }
    }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame)
    const t = ts || 0
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016)
    last = t
    if (document.hidden) return
    step(dt)
    draw(dt)
  }

  function start() {
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  function destroy() {
    stop()
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap)
    wrap = canvas = ctx = null
    mode = 'clear'
    removeEventListener('resize', resize)
    document.body.classList.remove('wx-cloud', 'wx-rain', 'wx-snow', 'wx-fog')
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else if (mode !== 'clear' && !reduced) start()
  })

  root.CZ_WEATHER = {
    apply,
    clear,
    destroy,
    current: () => mode
  }
})(typeof self !== 'undefined' ? self : this)
