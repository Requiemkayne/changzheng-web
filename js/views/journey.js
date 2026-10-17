/**
 * 滚动叙事页 —— 中央红飘带路线（于都出发 → 会宁会师，7 节点）
 * 交互：向下滚动，红飘带逐段向前延伸；每节点场景卡停留期间
 *       历史画面（油画/老照片）交叉淡化过渡到今日实景。
 * 素材驱动：数据在 mock/journey.js；图片留空时显示主题占位，
 *       素材放 assets/journey/{code}-old.jpg / {code}-now.jpg 即自动加载。
 * 零依赖：scroll + rAF 节流驱动，无滚动驱动动画 API 兼容问题。
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const UI = root.CZ_UI
  const config = root.CZ_CONFIG
  const api = root.CZ_API

  // 叙事页出口：未登录 → 登录页；已登录 → 首页（mock 模式走登录页，可游客进入）
  function exitDest() {
    return (!config.USE_MOCK && api.isLoggedIn()) ? '#/' : '#/login'
  }

  // 蛇形飘带（viewBox 0 0 100 100，pathLength=100 便于延伸控制）
  // 节点落点在每个拐弯回到中线处，y 平均分布
  const RIBBON_D = 'M50 100 C18 90, 82 80, 50 70 S 18 50, 50 40 S 82 20, 50 10 C40 7, 60 5, 50 2'

  VIEWS.journey = {
    mount(rootEl) {
      const jd = root.CZ_MOCK_JOURNEY
      if (!jd) {
        rootEl.innerHTML = '<div class="page-center">加载失败，请刷新重试</div>'
        return
      }
      const cleanup = render(rootEl, jd) // unmount 时解绑滚动监听
      return () => { if (cleanup) cleanup() }
    }
  }

  function render(rootEl, jd) {
    const n = jd.nodes.length
    const stepY = 86 / (n - 1)   // 节点 y：98 起，向上每步递减，到 98-86=12
    const nodeY = i => 98 - stepY * i

    // 媒体层：有图用 img（onerror 回退占位），无图用占位块
    const layer = (img, cls, phCls, phText) => {
      if (img) {
        return '<div class="j-layer ' + cls + '">' +
          '<div class="j-ph ' + phCls + '"><span>' + F.escapeHtml(phText) + '</span></div>' +
          '<img src="' + F.escapeHtml(img) + '" alt="" loading="lazy" ' +
            'onerror="this.style.display=\'none\'">' +
          '</div>'
      }
      return '<div class="j-layer ' + cls + '"><div class="j-ph ' + phCls + '"><span>' + F.escapeHtml(phText) + '</span></div></div>'
    }

    let scenes = ''
    jd.nodes.forEach((node, i) => {
      const idx = String(node.order).padStart(2, '0')
      scenes +=
        '<section class="j-scene" data-i="' + i + '">' +
          '<div class="j-sticky">' +
            '<div class="j-card">' +
              '<div class="j-media">' +
                layer(node.images.history, 'j-hist', 'j-ph-hist', node.name + ' · 历史') +
                layer(node.images.modern, 'j-mod', 'j-ph-mod', node.name + ' · 今日') +
                '<span class="j-tag j-tag-hist">历史画面</span>' +
                '<span class="j-tag j-tag-mod">今日实景</span>' +
                '<div class="j-caption j-cap-hist">' + F.escapeHtml(node.caption.history) + '</div>' +
                '<div class="j-caption j-cap-mod">' + F.escapeHtml(node.caption.modern) + '</div>' +
              '</div>' +
              '<div class="j-text">' +
                '<div class="j-head">' +
                  '<span class="j-order">' + idx + '</span>' +
                  '<span class="j-name">' + F.escapeHtml(node.name) + '</span>' +
                '</div>' +
                '<div class="j-meta">' + F.escapeHtml(node.date) + ' · ' + F.escapeHtml(node.place) + '</div>' +
                '<div class="j-summary">' + F.escapeHtml(node.summary) + '</div>' +
                '<div class="j-hint">' + UI.icon('chevron', '') + ' 继续下滑 · 从历史到今朝</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>'
    })

    rootEl.innerHTML =
      '<div class="journey">' +
        '<div class="journey-ribbon" aria-hidden="true">' +
          '<svg class="jr-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
            '<path class="jr-base" d="' + RIBBON_D + '"/>' +
            '<path class="jr-fill" d="' + RIBBON_D + '" pathLength="100"/>' +
            '<path class="jr-gold" d="' + RIBBON_D + '" pathLength="100"/>' +
          '</svg>' +
          '<div class="jr-dots">' +
            jd.nodes.map((node, i) =>
              '<i class="jr-dot" data-i="' + i + '" style="top:' + nodeY(i) + '%"><span>' + node.order + '</span></i>'
            ).join('') +
          '</div>' +
        '</div>' +
        '<div class="journey-top">' +
          '<div class="journey-top-title">长征之路</div>' +
          '<button class="journey-back" id="journey-back" type="button">跳过 ' + UI.icon('chevron', '') + '</button>' +
        '</div>' +
        '<main class="journey-main">' +
          '<section class="j-hero">' +
            '<div class="j-hero-badge">纪念红军长征胜利 90 周年</div>' +
            '<div class="j-hero-title">' + F.escapeHtml(jd.title) + '</div>' +
            '<div class="j-hero-sub">' + F.escapeHtml(jd.subtitle) + ' · 于都出发 会宁会师</div>' +
            '<div class="j-hero-hint">' + UI.icon('chevron', '') + ' 向下滑动 · 重走长征路</div>' +
          '</section>' +
          scenes +
          '<section class="j-end">' +
            '<div class="j-end-star">' + UI.icon('star') + '</div>' +
            '<div class="j-end-title">' + F.escapeHtml(jd.ending.title) + '</div>' +
            '<div class="j-end-text">' + F.escapeHtml(jd.ending.text) + '</div>' +
            '<button class="btn btn-primary j-end-btn" id="journey-start" type="button">' + UI.icon('flag', 'btn-ic') + ' ' + F.escapeHtml(jd.ending.action) + '</button>' +
          '</section>' +
        '</main>' +
      '</div>'

    rootEl.querySelector('#journey-back').addEventListener('click', () => { location.hash = exitDest() })
    rootEl.querySelector('#journey-start').addEventListener('click', () => { location.hash = exitDest() })

    // 飘带延伸层初始隐藏（首屏 hero 停留后再随滚动延伸）
    const fillEl = rootEl.querySelector('.jr-fill')
    const goldEl = rootEl.querySelector('.jr-gold')
    const dots = rootEl.querySelectorAll('.jr-dot')
    const scenesEls = rootEl.querySelectorAll('.j-scene')

    function drive() {
      const docH = document.documentElement
      const winH = window.innerHeight || 1
      const maxScroll = Math.max(1, docH.scrollHeight - winH)
      const t = Math.min(1, Math.max(0, window.scrollY / maxScroll))
      const off = (100 * (1 - t)).toFixed(2)
      fillEl.style.strokeDashoffset = off
      goldEl.style.strokeDashoffset = off

      scenesEls.forEach((sec, i) => {
        const r = sec.getBoundingClientRect()
        // 段进度：段顶端进视口底部 p=0，段底端贴视口底部 p=1（sticky 停留期间平滑推进）
        const p = Math.min(1, Math.max(0, (winH - r.top) / (r.height || 1)))
        // 交叉淡化窗口：前 25% 历史定显，中 50% 过渡，后 25% 现代定显
        const f = Math.min(1, Math.max(0, (p - 0.25) / 0.5))
        sec.querySelector('.j-hist').style.opacity = (1 - f).toFixed(3)
        sec.querySelector('.j-mod').style.opacity = f.toFixed(3)
        sec.querySelector('.j-cap-hist').style.opacity = (1 - f).toFixed(3)
        sec.querySelector('.j-cap-mod').style.opacity = f.toFixed(3)
        sec.querySelector('.j-tag-hist').style.opacity = (1 - f).toFixed(3)
        sec.querySelector('.j-tag-mod').style.opacity = f.toFixed(3)
        sec.querySelector('.j-hint').style.opacity = (f < 0.98 ? 1 : 0).toFixed(3)
        dots[i].classList.toggle('jr-lit', p > 0.35)
      })
    }

    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { ticking = false; drive() })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    drive()

    function cleanup() {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
    return cleanup
  }
})(typeof self !== 'undefined' ? self : this)
