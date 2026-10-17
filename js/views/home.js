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
      rootEl.innerHTML = '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>加载中…</div></div>'

      Promise.all([api.getConfig(), api.getNodes(), api.getProgress()])
        .then(([config, nodes, progress]) => {
          const states = progressUtil.computeStates(nodes, progress, config)
          render(rootEl, config, nodes, progress, states)
        })
        .catch(err => {
          console.error('首页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
    }
  }

  // 路线 Tab：行军路线（全部节点）/ 重要战役 / 历史事件
  const TABS = [
    { key: 'march', label: '行军路线' },
    { key: 'battle', label: '重要战役' },
    { key: 'event', label: '历史事件' }
  ]

  function filterNodes(nodes, key) {
    return key === 'march' ? nodes : nodes.filter(n => n.category === key)
  }

  function tlHtml(nodes, states) {
    let html = ''
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
    return html
  }

  function render(rootEl, config, nodes, progress, states) {
    const graduated = states.finalState === 'passed'
    const finalCardCls = 'card final-card' + (states.finalState === 'locked' ? ' final-locked' : '')
    const finalText = graduated
      ? '已毕业 · 得分 ' + states.finalBest + ' 分'
      : states.finalState === 'open' ? '全部节点已打卡，点击开始毕业考试' : '打卡全部 ' + nodes.length + ' 个节点后解锁'

    const spirit = root.CZ_SPIRIT
    const ann = spirit ? spirit.anniversary : null

    let html =
      '<div class="page">' +
      '<div class="hero">' +
        (ann ? '<div class="hero-badge"><span class="hero-badge-line"></span>' + F.escapeHtml(ann.badge) + '<span class="hero-badge-line"></span></div>' : '') +
        '<div class="hero-star">' + UI.icon('star') + '</div>' +
        '<div class="hero-title">重走长征路</div>' +
        '<div class="hero-sub">' + (ann ? F.escapeHtml(ann.theme) : '十一个关键节点 · 传承长征精神') + '</div>' +
        '<div class="hero-stats">' +
          '<div class="hero-stat"><div class="hero-stat-num">' + states.checkedCount + '/' + states.total + '</div><div class="hero-stat-label">打卡节点</div></div>' +
          '<div class="hero-stat"><div class="hero-stat-num">' + states.passedCount + '/' + states.total + '</div><div class="hero-stat-label">答题通关</div></div>' +
          '<div class="hero-stat"><div class="hero-stat-num">' + (graduated ? UI.icon('star') : '—') + '</div><div class="hero-stat-label">毕业</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="card journey-entry" id="journey-entry">' +
        '<div class="journey-entry-ic">' + UI.icon('map') + '</div>' +
        '<div style="flex:1">' +
          '<div class="journey-entry-name">沉浸式长征路</div>' +
          '<div class="journey-entry-sub">红飘带滚动叙事 · 从历史到今朝</div>' +
        '</div>' +
        UI.icon('chevron', 'tl-arrow') +
      '</div>' +
      '<div class="route-tabs">' +
        TABS.map(t => '<button type="button" class="route-tab' + (t.key === 'march' ? ' route-tab-active' : '') + '" data-tab="' + t.key + '">' + F.escapeHtml(t.label) + '</button>').join('') +
      '</div>' +
      '<div id="tl-wrap">' + tlHtml(nodes, states) + '</div>'

    // 伟大长征精神（五条官方表述）
    if (spirit && spirit.spirit) {
      html +=
        '<div class="card spirit-card">' +
          '<div class="spirit-head">' +
            '<div class="spirit-star">' + UI.icon('star') + '</div>' +
            '<div class="spirit-title">伟大长征精神</div>' +
          '</div>' +
          '<div class="spirit-list">' +
            spirit.spirit.map((s, i) =>
              '<div class="spirit-item">' +
                '<span class="spirit-k">' + F.escapeHtml(s.k) + '</span>' +
                '<span class="spirit-t">' + F.escapeHtml(s.t) + '</span>' +
              '</div>'
            ).join('') +
          '</div>' +
          (spirit.quote ? '<div class="spirit-quote">—— ' + F.escapeHtml(spirit.quote) + '</div>' : '') +
        '</div>'
    }

    // 总结答题入口
    html +=
      '<div class="' + finalCardCls + '" id="final-entry">' +
        '<div class="final-icon">' + UI.icon(graduated ? 'medal' : 'trophy') + '</div>' +
        '<div style="flex:1">' +
          '<div class="final-title">' + F.escapeHtml(config.finalExam.title) + '</div>' +
          '<div class="final-sub">' + F.escapeHtml(finalText) + '</div>' +
        '</div>' +
        UI.icon('chevron', 'tl-arrow') +
      '</div>'

    // 竞赛入口（毕业解锁后展示）
    if (graduated) {
      html +=
        '<div class="entry-grid">' +
          '<div class="card entry-card entry-card-red" id="contest-entry">' +
            '<div class="entry-ic">' + UI.icon('trophy') + '</div>' +
            '<div class="entry-name">知识竞赛</div>' +
            '<div class="entry-sub">来赛一场</div>' +
          '</div>' +
          '<div class="card entry-card" id="lb-entry">' +
            '<div class="entry-ic">' + UI.icon('medal') + '</div>' +
            '<div class="entry-name">排行榜</div>' +
            '<div class="entry-sub">谁是先锋</div>' +
          '</div>' +
        '</div>'
    }

    html += '</div>'

    rootEl.innerHTML = html
    bind(rootEl, nodes, states)

    // 锚定到当前应到达节点（路由重置滚动后执行）
    setTimeout(() => {
      const el = document.getElementById('node-' + states.currentCode)
      if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' })
    }, 60)
  }

  function bind(rootEl, nodes, states) {
    // 节点行点击 → 详情
    const bindRows = container => {
      container.querySelectorAll('[data-code]').forEach(row => {
        row.addEventListener('click', () => {
          location.hash = '#/node/' + row.dataset.code
        })
      })
    }
    bindRows(rootEl)

    // 沉浸式长征路入口
    const journeyEntry = rootEl.querySelector('#journey-entry')
    if (journeyEntry) journeyEntry.addEventListener('click', () => { location.hash = '#/journey' })

    // 路线 Tab 切换：行军路线（全部）/ 重要战役 / 历史事件
    const tabs = rootEl.querySelectorAll('.route-tab')
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.tab
        tabs.forEach(t => t.classList.toggle('route-tab-active', t === tab))
        const wrap = rootEl.querySelector('#tl-wrap')
        wrap.innerHTML = tlHtml(filterNodes(nodes, key), states)
        bindRows(wrap)
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
    // 竞赛 / 排行榜入口（毕业解锁后渲染）
    const contestEntry = rootEl.querySelector('#contest-entry')
    const lbEntry = rootEl.querySelector('#lb-entry')
    if (contestEntry) contestEntry.addEventListener('click', () => { location.hash = '#/contest' })
    if (lbEntry) lbEntry.addEventListener('click', () => { location.hash = '#/leaderboard' })
  }
})(typeof self !== 'undefined' ? self : this)
