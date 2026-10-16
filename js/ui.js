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

    return (
      '<div class="' + itemCls + '" id="node-' + node.code + '" data-code="' + node.code + '">' +
        '<span class="' + dotCls + '"></span>' +
        '<div class="card tl-card' + (o.asCard === false ? '' : '') + '">' +
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
  function dialog(title, content, buttons) {
    const mask = document.createElement('div')
    mask.className = 'dlg-mask'
    let html =
      '<div class="dlg">' +
      '<div class="dlg-title">' + F.escapeHtml(title) + '</div>' +
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
    function close() { document.body.removeChild(mask) }
    document.body.appendChild(mask)
  }

  /* ---------- toast（wx.showToast 等价物） ---------- */

  let toastTimer = null
  function toast(msg) {
    let el = document.getElementById('toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'toast'
      document.body.appendChild(el)
    }
    el.textContent = msg
    el.classList.add('toast-show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.classList.remove('toast-show'), 1800)
  }

  root.CZ_UI = { icon, badgeHTML, nodeRowHTML, dialog, toast }
})(typeof self !== 'undefined' ? self : this)
