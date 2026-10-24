/**
 * 报道页的小交互：目录抽屉 / 侧栏 + 阅读进度 + 回到顶部
 * 只做展示层，不碰任何文章内容
 */
;(function () {
  'use strict'

  function init() {
    var toc = document.getElementById('toc')
    var openBtn = document.getElementById('toc-open')
    var list = document.querySelector('.toc-list')

    // 抽屉遮罩
    var scrim = null
    if (toc) {
      scrim = document.createElement('div')
      scrim.className = 'toc-scrim'
      document.body.appendChild(scrim)
    }

    function openToc() {
      if (!toc) return
      toc.classList.add('is-open')
      if (scrim) scrim.classList.add('is-on')
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true')
    }
    function closeToc() {
      if (!toc) return
      toc.classList.remove('is-open')
      if (scrim) scrim.classList.remove('is-on')
      if (openBtn) openBtn.setAttribute('aria-expanded', 'false')
    }

    if (openBtn) openBtn.addEventListener('click', function () {
      if (toc && toc.classList.contains('is-open')) closeToc()
      else openToc()
    })
    if (scrim) scrim.addEventListener('click', closeToc)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeToc()
    })

    // 点目录项：平滑滚到对应章节，并收起抽屉
    if (toc) {
      toc.querySelectorAll('a[href^="#"]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          var id = a.getAttribute('href').slice(1)
          var target = id ? document.getElementById(id) : null
          if (!target) return
          e.preventDefault()
          closeToc()
          var top = target.getBoundingClientRect().top + window.pageYOffset - 12
          try {
            window.scrollTo({ top: top, behavior: 'smooth' })
          } catch (err) {
            window.scrollTo(0, top)
          }
          history.replaceState(null, '', '#' + id)
        })
      })
    }

    /* ---- 阅读进度 + 回到顶部 ---- */
    var bar = document.getElementById('read-bar')
    var toTop = document.getElementById('to-top')
    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    }

    function update() {
      var doc = document.documentElement
      var max = doc.scrollHeight - doc.clientHeight
      var y = window.pageYOffset || doc.scrollTop
      if (bar) {
        var pct = max > 0 ? Math.min(100, Math.max(0, (y / max) * 100)) : 0
        bar.style.width = pct.toFixed(2) + '%'
      }
      if (toTop) toTop.classList.toggle('is-on', y > window.innerHeight * 1.5)
    }

    var ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      window.setTimeout(function () { ticking = false; update() }, 60)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
