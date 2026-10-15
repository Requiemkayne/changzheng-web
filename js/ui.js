/**
 * 共享 UI 工具：徽章 / 节点行 / 弹窗 / toast
 * 所有内容文案渲染前必须过 escapeHtml（见 format.js）
 */
;(function (root) {
  const F = root.CZ_FORMAT

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
            '<span class="score-right">' + right + '<span class="tl-arrow">›</span></span>' +
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

  root.CZ_UI = { badgeHTML, nodeRowHTML, dialog, toast }
})(typeof self !== 'undefined' ? self : this)
