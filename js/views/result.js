/**
 * 总分结算页 —— 完成最后一个节点答题后直达
 * 展示：全部节点合计总分（各节点答题 best 之和）+ 实时排名（服务端按同口径全量计算）
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const UI = root.CZ_UI

  // 返回：有站内上一页就后退，直接打开的（history 空栈或站外跳来）回节点列表
  // 直接打开本页（history 空栈）时退到这里的 BACK_FALLBACK
  const BACK_FALLBACK = '#/'

  function goBack() {
    const ref = document.referrer || ''
    const fromOtherSite = ref !== '' && ref.indexOf(location.origin) !== 0
    if (history.length > 1 && !fromOtherSite) history.back()
    else location.hash = BACK_FALLBACK
  }

  VIEWS.result = {
    mount(rootEl, params) {
      rootEl.innerHTML = '<div class="page-center">' + UI.icon('medal', 'page-center-icon') + '<div>正在结算…</div></div>'
      Promise.all([api.getNodes(), api.getProgress(), api.challengeLeaderboard()])
        .then(([nodes, progress, lb]) => {
          render(rootEl, nodes, progress, lb)
        })
        .catch(err => {
          console.error('结算页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center">' + UI.icon('medal', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
    }
  }

  function render(rootEl, nodes, progress, lb) {
    const scores = progress.quizScores || {}
    let total = 0
    let completed = 0
    nodes.forEach(n => {
      const q = scores[n.code]
      if (q && q.best > 0) total += q.best
      if (q && q.passed) completed++
    })
    const doneAll = completed === nodes.length
    const myRank = lb.myRank
    const myId = lb.myId
    const list = (lb.list || []).filter(x => x && x.total > 0)

    let rankHtml
    if (!list.length) {
      rankHtml =
        '<div class="lb-empty"><div class="lb-empty-ic">' + UI.icon('medal') + '</div>' +
        '<div class="lb-empty-sub">榜单空 · 完成答题挑战后，你的总分将出现在这里</div></div>'
    } else {
      rankHtml = '<div class="lb-list">' + list.map(x => {
        const mine = myId != null && x.userId === myId
        return '<div class="lb-row' + (mine ? ' lb-me' : '') + '">' +
          '<div class="lb-rank">' + rankBadge(x.rank) + '</div>' +
          '<div class="lb-name">' + F.escapeHtml(x.name) + '</div>' +
          '<div class="lb-score">' + x.total + '<span class="lb-score-unit">分</span></div>' +
          '<div class="lb-completed">' + x.completed + ' 节点</div>' +
        '</div>'
      }).join('') + '</div>'
    }

    rootEl.innerHTML =
      '<div class="page">' +
      '<button type="button" class="back-link">‹ 返回路线</button>' +
      '<div class="result-hero hero-result">' +
        '<div class="result-title">总分结算</div>' +
        '<div class="result-score"><span class="score-num score-num-big">' + total + '</span><span class="score-unit">分</span></div>' +
        '<div class="result-detail">' + completed + ' / ' + nodes.length + ' 节点通关' +
          (myRank != null ? ' · 我的排名 第 ' + myRank + ' 名' : '') +
        '</div>' +
        (doneAll ? '' : '<div class="result-hint">完成第 ' + nodes.length + ' 个节点答题后自动抵达本页；合计总分按各节点最佳成绩累计</div>') +
      '</div>' +
      '<div class="card">' +
        '<div class="lb-head">实时排名<small>按 ' + nodes.length + ' 节点合计总分 · 前 ' + list.length + ' 名</small></div>' +
        rankHtml +
      '</div>' +
      '<div class="quiz-actions">' +
        '<a class="btn btn-primary" href="#/">返回节点列表</a>' +
      '</div>' +
      '</div>'

    // 顶部返回键：绑定到 goBack（有站内上一页就后退，否则回首页）
    const backBtn = rootEl.querySelector('.back-link')
    if (backBtn) backBtn.addEventListener('click', goBack)
  }

  function rankBadge(rank) {
    if (rank === 1) return '<span class="lb-rank-badge rank-gold">' + rank + '</span>'
    if (rank === 2) return '<span class="lb-rank-badge rank-silver">' + rank + '</span>'
    if (rank === 3) return '<span class="lb-rank-badge rank-bronze">' + rank + '</span>'
    return '<span class="lb-rank-badge">' + rank + '</span>'
  }
})(typeof self !== 'undefined' ? self : this)
