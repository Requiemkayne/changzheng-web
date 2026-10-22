/**
 * 共享 UI 工具：图标（自绘 SVG）/ 徽章 / 节点行 / 弹窗 / toast
 * 所有内容文案渲染前必须过 escapeHtml（见 format.js）
 */
;(function (root) {
  const F = root.CZ_FORMAT

  /**
   * 自绘图标集（24 viewBox，stroke 1.8 统一，fill none 除 star 实心外）
   * 世界语言：旗帜 / 行军图 / 印章 / 勋章 —— 不用 emoji、不用外部图标库
   */
  const ICON_PATHS = {
    star: '<path fill="currentColor" stroke="none" d="M12 2 6.12 20.09 21.51 8.91 2.49 8.91 17.88 20.09Z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2.5 3.5L16 11H5"/>',
    map: '<path d="M3 19l5-6 4 3 9-9"/><circle cx="12" cy="12" r="1.4"/><path d="M9 20.5l3-1.5 3 1.5"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.5-3.6 4.4-5.2 7.5-5.2s6 1.6 7.5 5.2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    medal: '<circle cx="12" cy="9" r="5"/><path d="m9 14-1.5 7 4.5-3 4.5 3L15 14"/>',
    trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/><path d="M12 12v3M8.5 19h7M9 15.5h6"/>',
    cap: '<path d="M3 9l9-4.5L21 9l-9 4.5L3 9z"/><path d="M6.5 11v4.2c3.5 2 7.5 2 11 0V11"/><path d="M21 9v5"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    replay: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/>',
    xmark: '<path d="M6 6l12 12M18 6L6 18"/>',
    lantern: '<rect x="9" y="3.5" width="6" height="2" rx="1"/><path d="M12 5.5c-3.5 0-6 2.2-6 5.3V19h12v-8.2c0-3.1-2.5-5.3-6-5.3z"/><path d="M4.5 12.5h15M8.5 19h-2M17.5 19h-2"/>'
  }

  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' +
      (ICON_PATHS[name] || '') + '</svg>'
  }

  const BADGE_TEXT = {
    locked: '未解锁',
    open: '待打卡',
    checkedIn: '已打卡 · 待答题',
    quizPassed: '已通关'
  }

  function badgeHTML(state) {
    return '<span class="badge badge-' + state + '">' + BADGE_TEXT[state] + '</span>'
  }

  /**
   * 节点行（首页时间轴 / 我的页成绩清单共用）
   * opts: { asCard: 是否卡片样式, showBest: 是否显示最佳分, current: 是否当前节点 }
   */
  function nodeRowHTML(node, st, opts) {
    const o = opts || {}
    const name = F.escapeHtml(node.name)
    const sub = F.escapeHtml(node.subtitle)
    const date = F.escapeHtml(node.date)
    const loc = F.escapeHtml(node.location.name)
    const done = st.state === 'checkedIn' || st.state === 'quizPassed'
    const passed = st.state === 'quizPassed'
    const dotCls = 'tl-dot' +
      (passed ? ' tl-dot-passed' : done ? ' tl-dot-done' : st.state === 'open' ? ' tl-dot-open' : '') +
      (o.current ? ' tl-dot-current' : '')
    const itemCls = 'tl-item' + (done ? ' tl-done' : '') + (o.isLast ? ' tl-last' : '')
    const right = o.showBest && passed
      ? '<span class="score-best">' + st.quizBest + '<span class="score-best-unit"> 分</span></span>'
      : badgeHTML(st.state)

    // 历史事件封面：仅当节点配了 cover 才渲染，纯装饰层（不拦截点击）
    const cover = node.images && node.images.cover ? String(node.images.cover) : ''
    const coverHTML = cover
      ? '<div class="tl-photo" aria-hidden="true" style="background-image:url(' +
        encodeURI(cover).replace(/[)'"]/g, '') + ')"></div>'
      : ''

    return (
      '<div class="' + itemCls + '" id="node-' + node.code + '" data-code="' + node.code + '">' +
        '<span class="' + dotCls + '"></span>' +
        '<div class="card tl-card' + (cover ? ' tl-card-photo' : '') + (o.asCard === false ? '' : '') + '">' +
          coverHTML +
          '<div class="tl-name-row">' +
            '<span class="tl-name">' + name + '</span>' +
            '<span class="score-right">' + right + icon('chevron', 'tl-arrow') + '</span>' +
          '</div>' +
          '<div class="tl-sub">' + sub + '</div>' +
          '<div class="tl-meta">' + date + ' · ' + loc + '</div>' +
        '</div>' +
      '</div>'
    )
  }

  /* ---------- 弹窗（wx.showModal 等价物） ---------- */

  /**
   * dialog('确认重置', '将清除本地进度…', [{text:'取消'},{text:'确定', primary:true, onClick}])
   */
  let dlgSeq = 0
  function dialog(title, content, buttons) {
    const opener = document.activeElement      // 触发元素，关闭时归还焦点
    const mask = document.createElement('div')
    mask.className = 'dlg-mask'
    const titleId = 'dlg-title-' + (++dlgSeq)
    const hasTitle = title !== undefined && title !== null && title !== ''
    let html =
      // role/aria-modal + 有标题则 aria-labelledby 指向标题节点，无标题退回 aria-label
      '<div class="dlg" role="dialog" aria-modal="true" ' +
      (hasTitle
        ? 'aria-labelledby="' + titleId + '"'
        : 'aria-label="' + F.escapeHtml(String(content || '提示')) + '"') + '>' +
      '<div class="dlg-title"' + (hasTitle ? ' id="' + titleId + '"' : '') + '>' + F.escapeHtml(title) + '</div>' +
      '<div class="dlg-content">' + F.escapeHtml(content) + '</div>' +
      '<div class="dlg-btns">'
    buttons.forEach((b, i) => {
      html += '<button class="btn ' + (b.primary ? 'btn-primary' : 'btn-ghost') + '" data-i="' + i + '">' + F.escapeHtml(b.text) + '</button>'
    })
    html += '</div></div>'
    mask.innerHTML = html
    mask.addEventListener('click', e => {
      if (e.target === mask) close()
    })
    mask.querySelectorAll('.dlg-btns .btn').forEach(btnEl => {
      btnEl.addEventListener('click', () => {
        const b = buttons[Number(btnEl.dataset.i)]
        close()
        if (b.onClick) b.onClick()
      })
    })
    let closed = false
    function close() {
      if (closed) return
      closed = true
      document.removeEventListener('keydown', onKeyDown, true)
      if (mask.parentNode) mask.parentNode.removeChild(mask)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault()
        close()
      }
    }
    document.body.appendChild(mask)
    document.addEventListener('keydown', onKeyDown, true)
    const first = mask.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (first) first.focus()
  }

  /* ---------- toast（wx.showToast 等价物） ---------- */

  let toastTimer = null
  function toast(msg) {
    let el = document.getElementById('toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'toast'
      el.setAttribute('role', 'status')
      el.setAttribute('aria-live', 'polite')
      el.setAttribute('aria-atomic', 'true')
      document.body.appendChild(el)
    }
    // 已存在的容器也补齐语义（读屏只在「已存在 → 文本变化」时播报）
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('aria-atomic', 'true')
    el.textContent = msg
    el.classList.add('toast-show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.classList.remove('toast-show'), 1800)
  }

  /* ---------- 沙盘地图解锁弹窗（线上答题挑战模块） ---------- */

  const UNLOCK_SEEN_KEY = 'cz_unlock_seen'

  /** 该节点是否已看过解锁弹窗（设备本地记录） */
  function isUnlockSeen(code) {
    try {
      const seen = JSON.parse(localStorage.getItem(UNLOCK_SEEN_KEY) || '{}')
      return !!seen[code]
    } catch (e) { return false }
  }

  /** 标记已看过 */
  function markUnlockSeen(code) {
    try {
      const seen = JSON.parse(localStorage.getItem(UNLOCK_SEEN_KEY) || '{}')
      seen[code] = 1
      localStorage.setItem(UNLOCK_SEEN_KEY, JSON.stringify(seen))
    } catch (e) { /* 存储不可用时忽略，不影响主流程 */ }
  }

  /**
   * 沙盘地图弹窗：成功解锁新节点时弹出，三类标记
   *   - 当前最新解锁节点（五角星特殊标识）
   *   - 已走过、完成的历史节点（实心圆）
   *   - 未解锁、未完成的节点（灰空心）
   * 短暂展示自动关闭 + 【跳过】按钮；关闭后回调 onClose（进入该节点学习页）
   */
  function unlockMapDialog(nodes, states, code, onClose) {
    markUnlockSeen(code)

    const target = nodes.find(n => n.code === code)
    const W = 340, H = 210
    const PAD_X = 34, PAD_Y = 42
    const LNG_MIN = 101.2, LNG_MAX = 117.1
    const LAT_MIN = 24.6, LAT_MAX = 36.6
    const px = n => PAD_X + (n.location.longitude - LNG_MIN) / (LNG_MAX - LNG_MIN) * (W - 2 * PAD_X)
    const py = n => PAD_Y + (LAT_MAX - n.location.latitude) / (LAT_MAX - LAT_MIN) * (H - 2 * PAD_Y)

    const pts = nodes.map(n => ({ node: n, x: px(n), y: py(n), st: states.byCode[n.code] }))
    const polyline = pts.map(p => p.x + ',' + p.y).join(' ')

    // 节点标记：最新解锁=五角星，历史=实心圆，未解锁=灰空心
    let nodesHtml = ''
    pts.forEach(p => {
      const isCurrent = p.node.code === code
      const done = p.st && (p.st.state === 'checkedIn' || p.st.state === 'quizPassed')
      if (isCurrent) {
        // 五角星特殊标识（最新解锁）
        nodesHtml +=
          '<g class="unlock-node">' +
            '<circle cx="' + p.x + '" cy="' + p.y + '" r="17" fill="rgba(232,200,106,0.18)" stroke="#E8C86A" stroke-width="1.2" stroke-dasharray="3 3"/>' +
            '<path class="unlock-star" d="M12 2 6.12 20.09 21.51 8.91 2.49 8.91 17.88 20.09Z" transform="translate(' + (p.x - 12) + ',' + (p.y - 12) + ')"/>' +
            '<text class="unlock-label unlock-label-current" x="' + p.x + '" y="' + (p.y - 24) + '">最新解锁 · ' + F.escapeHtml(p.node.name) + '</text>' +
          '</g>'
      } else if (done) {
        const gold = p.st.state === 'quizPassed'
        nodesHtml +=
          '<g class="unlock-node">' +
            '<circle cx="' + p.x + '" cy="' + p.y + '" r="8" fill="' + (gold ? '#C6A343' : '#821626') + '" stroke="' + (gold ? '#F5E9C8' : '#E8C86A') + '" stroke-width="1.5"/>' +
            '<text class="unlock-label" x="' + p.x + '" y="' + (p.y + 24) + '">' + F.escapeHtml(p.node.name) + '</text>' +
          '</g>'
      } else {
        nodesHtml +=
          '<g class="unlock-node">' +
            '<circle cx="' + p.x + '" cy="' + p.y + '" r="8" fill="#B7AD97" stroke="#F5EFE0" stroke-width="1.5"/>' +
            '<text class="unlock-label unlock-label-gray" x="' + p.x + '" y="' + (p.y + 24) + '">' + F.escapeHtml(p.node.name) + '</text>' +
          '</g>'
      }
    })

    const mask = document.createElement('div')
    mask.className = 'unlock-mask'
    mask.innerHTML =
      '<div class="unlock-dlg" role="dialog" aria-label="节点解锁">' +
        '<div class="unlock-head">' +
          '<div class="unlock-star-badge">' + icon('star') + '</div>' +
          '<div class="unlock-title">节点解锁成功</div>' +
          '<div class="unlock-sub">' + F.escapeHtml((target && target.name) || '') + ' · 新节点已开放</div>' +
        '</div>' +
        '<div class="unlock-map">' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
            '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="6" class="unlock-map-frame"/>' +
            '<polyline class="unlock-route" points="' + polyline + '"/>' +
            nodesHtml +
          '</svg>' +
        '</div>' +
        '<div class="unlock-legend">' +
          '<span><i class="ul-dot ul-star"></i>最新解锁</span>' +
          '<span><i class="ul-dot ul-done"></i>已走过</span>' +
          '<span><i class="ul-dot ul-locked"></i>未解锁</span>' +
        '</div>' +
        '<button class="btn btn-ghost unlock-skip" id="unlock-skip" type="button">跳过</button>' +
      '</div>'

    function close() {
      clearTimeout(timer)
      if (mask.parentNode) mask.parentNode.removeChild(mask)
      if (onClose) onClose()
    }
    document.body.appendChild(mask)
    mask.querySelector('#unlock-skip').addEventListener('click', close)
    const timer = setTimeout(close, 3500)
  }

  root.CZ_UI = { icon, badgeHTML, nodeRowHTML, dialog, toast, unlockMapDialog, isUnlockSeen, markUnlockSeen, ICON_PATHS }
})(typeof self !== 'undefined' ? self : this)
