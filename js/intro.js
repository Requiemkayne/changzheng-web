/**
 * 开场动画 —— 深红夜幕中路线绘出 + 「两万五千里」大字揭幕
 * 同一标签页会话内只播一次（sessionStorage）；「跳过」立即结束
 * prefers-reduced-motion：直接跳过
 */
;(function (root) {
  const DUR = { draw: 2200, hold: 1700 }   // 路线描线 / 定格时长

  function play() {
    // 本会话已播过 / 用户要求减少动效 / ?intro=0 调试跳过 → 不播
    try {
      if (sessionStorage.getItem('cz_intro_played') === '1') return
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (new URLSearchParams(location.search).get('intro') === '0') return
      sessionStorage.setItem('cz_intro_played', '1')
    } catch (e) { /* 存储不可用时仍播一次 */ }

    const UI = root.CZ_UI
    const star = UI && UI.ICON_PATHS ? UI.ICON_PATHS.star : ''
    // 11 个节点沿路线分布（抽象路线，非真实经纬度）
    const dots = [
      [40, 250], [74, 226], [108, 200], [138, 186], [166, 200],
      [192, 184], [216, 154], [244, 132], [276, 112], [318, 88], [360, 70]
    ]
    const routeD = 'M40 250 L74 226 L108 200 L138 186 L166 200 L192 184 L216 154 L244 132 L276 112 L318 88 L360 70'

    const spirit = root.CZ_SPIRIT
    const ann = spirit ? spirit.anniversary : null

    const el = document.createElement('div')
    el.className = 'intro'
    el.innerHTML =
      '<button class="intro-skip" aria-label="跳过开场动画">跳过</button>' +
      '<svg class="intro-svg" viewBox="0 0 400 300" aria-hidden="true">' +
        '<path class="intro-route" d="' + routeD + '" pathLength="100"/>' +
        '<g class="intro-dots">' + dots.map((d, i) =>
          '<circle class="intro-dot" cx="' + d[0] + '" cy="' + d[1] + '" r="4" style="animation-delay:' + (0.6 + i * 0.16) + 's"/>'
        ).join('') + '</g>' +
        '<g transform="translate(40,250) scale(1.2) translate(-12,-12)"><g class="intro-star intro-star-a">' + star + '</g></g>' +
        '<g transform="translate(360,70) scale(1.2) translate(-12,-12)"><g class="intro-star intro-star-b">' + star + '</g></g>' +
      '</svg>' +
      (ann ? '<div class="intro-badge">' + ann.badge + '</div>' : '') +
      '<div class="intro-title">两万五千里</div>' +
      '<div class="intro-sub">' + (ann ? ann.theme : '重走长征路 · 传承长征精神') + '</div>' +
      '<div class="intro-years"><span>1934.10</span><span>1936.10</span></div>' +
      (spirit && spirit.quote ? '<div class="intro-quote">' + spirit.quote + '</div>' : '')

    document.body.appendChild(el)

    let done = false
    function finish() {
      if (done) return
      done = true
      el.classList.add('intro-out')
      setTimeout(() => { el.remove() }, 450)
    }
    el.querySelector('.intro-skip').addEventListener('click', finish)
    setTimeout(finish, DUR.draw + DUR.hold)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', play)
  } else {
    play()
  }
})(typeof self !== 'undefined' ? self : this)
