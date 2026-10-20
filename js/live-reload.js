/* 开发期自动刷新：URL 带 ?live=1 时生效
 * 每 2.5 秒问一次服务器版本戳（index.html / css / js / 高程数据的修改时间之和），
 * 变了就自动重载，手机上不用手动刷新就能看到最新改动。
 * 不带这个参数时脚本直接返回，不影响正常访问。
 */
(function (root) {
  'use strict'

  var q = new URLSearchParams(location.search)
  if (q.get('live') !== '1') return

  var POLL = 2500
  var stamp = null
  var busy = false

  function restoreScroll() {
    var y = sessionStorage.getItem('cz-live-scroll')
    if (y) {
      sessionStorage.removeItem('cz-live-scroll')
      try { window.scrollTo(0, Number(y)) } catch (e) { /* 忽略 */ }
    }
  }

  function tick() {
    if (busy || document.hidden) return
    busy = true
    fetch('/__version', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (d) {
        if (!d || typeof d.v !== 'number') return
        if (stamp === null) { stamp = d.v; return }
        if (d.v !== stamp) {
          // 记住滚动位置，刷新后回到原处
          try { sessionStorage.setItem('cz-live-scroll', String(window.scrollY || 0)) } catch (e) {}
          location.reload()
        }
      })
      .catch(function () { /* 网络抖动忽略，下次再试 */ })
      .then(function () { busy = false })
  }

  if (document.readyState === 'complete') restoreScroll()
  else window.addEventListener('load', restoreScroll)

  setInterval(tick, POLL)
  tick()
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick()
  })

  // 顶部一枚很小的小圆点，提示"自动刷新已开"
  window.addEventListener('load', function () {
    var dot = document.createElement('div')
    dot.className = 'cz-live-dot'
    dot.title = '自动刷新已开启（?live=1）'
    dot.textContent = 'LIVE'
    document.body.appendChild(dot)
  })
})(window)
