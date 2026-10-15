/**
 * 首页 —— 路线时间轴（小程序 index 页的网页等价物）
 * 结构：进度 hero 卡 + 四阶段时间轴（状态色标/当前节点呼吸动画）+ 总结答题入口
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const progressUtil = root.CZ_PROGRESS
  const UI = root.CZ_UI

  VIEWS.home = {
    mount(rootEl) {
      rootEl.innerHTML = '<div class="page-center"><div class="page-center-icon">🏮</div><div>加载中…</div></div>'

      Promise.all([api.getConfig(), api.getNodes(), api.getProgress()])
        .then(([config, nodes, progress]) => {
          const states = progressUtil.computeStates(nodes, progress, config)
          render(rootEl, config, nodes, progress, states)
        })
        .catch(err => {
          console.error('首页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center"><div class="page-center-icon">🏮</div><div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
    }
  }

  function render(rootEl, config, nodes, progress, states) {
    const graduated = states.finalState === 'passed'
    const finalCardCls = 'card final-card' + (states.finalState === 'locked' ? ' final-locked' : '')
    const finalText = graduated
      ? '已毕业 · 得分 ' + states.finalBest + ' 分'
      : states.finalState === 'open' ? '全部节点已打卡，点击开始毕业考试' : '打卡全部 ' + nodes.length + ' 个节点后解锁'

    let html =
      '<div class="page">' +
      '<div class="hero">' +
        '<div class="hero-star">★</div>' +
        '<div class="hero-kicker">两万五千里</div>' +
        '<div class="hero-title">重走长征路</div>' +
        '<div class="hero-sub">十一个关键节点 · 传承长征精神</div>' +
        '<div class="hero-stats">' +
          '<div class="hero-stat"><div class="hero-stat-num">' + states.checkedCount + '/' + states.total + '</div><div class="hero-stat-label">打卡节点</div></div>' +
          '<div class="hero-stat"><div class="hero-stat-num">' + states.passedCount + '/' + states.total + '</div><div class="hero-stat-label">答题通关</div></div>' +
          '<div class="hero-stat"><div class="hero-stat-num">' + (graduated ? '★' : '—') + '</div><div class="hero-stat-label">毕业</div></div>' +
        '</div>' +
      '</div>'

    // 时间轴（stage 分组）
    let lastStage = null
    nodes.forEach((node, i) => {
      const st = states.byCode[node.code]
      const isLast = i === nodes.length - 1
      if (node.stage !== lastStage) {
        lastStage = node.stage
        html += '<div class="tl-stage">' + F.escapeHtml(node.stage) + '</div>'
      }
      html += '<div class="tl">' + UI.nodeRowHTML(node, st, {
        current: st.state === 'open' && node.code === states.currentCode,
        isLast
      }) + '</div>'
    })

    // 总结答题入口
    html +=
      '<div class="' + finalCardCls + '" id="final-entry">' +
        '<div class="final-icon">' + (graduated ? '🎖' : '🏆') + '</div>' +
        '<div style="flex:1">' +
          '<div class="final-title">' + F.escapeHtml(config.finalExam.title) + '</div>' +
          '<div class="final-sub">' + F.escapeHtml(finalText) + '</div>' +
        '</div>' +
        '<span class="tl-arrow">›</span>' +
      '</div>' +
      '</div>'

    rootEl.innerHTML = html
    bind(rootEl, states)

    // 锚定到当前应到达节点（路由重置滚动后执行）
    setTimeout(() => {
      const el = document.getElementById('node-' + states.currentCode)
      if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' })
    }, 60)
  }

  function bind(rootEl, states) {
    // 节点行点击 → 详情
    rootEl.querySelectorAll('[data-code]').forEach(row => {
      row.addEventListener('click', () => {
        location.hash = '#/node/' + row.dataset.code
      })
    })
    // 总结答题入口
    const entry = rootEl.querySelector('#final-entry')
    entry.addEventListener('click', () => {
      if (states.finalState === 'locked') {
        UI.toast('打卡全部节点后解锁')
        return
      }
      location.hash = '#/quiz/final'
    })
  }
})(typeof self !== 'undefined' ? self : this)
