/**
 * 排行榜页 —— 竞赛累计总分榜 / 单场最佳榜（公开，未登录可看）
 * 前 50 名：名次（前三奖牌）/ 昵称 / 分数 / 场次；底部「我的排名」卡
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const UI = root.CZ_UI

  VIEWS.leaderboard = {
    mount(rootEl) {
      let type = 'total'

      rootEl.innerHTML = '<div class="page-center">' + UI.icon('medal', 'page-center-icon') + '<div>加载中…</div></div>'
      load(type)

      function load(t) {
        type = t
        api.contestLeaderboard(type).then(r => {
          if (!r.ok) throw new Error(r.message || '加载失败')
          render(rootEl, r, load)
        }).catch(err => {
          console.error('排行榜加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center">' + UI.icon('medal', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
      }
    }
  }

  function medal(rank) {
    if (rank === 1) return '<span class="lb-medal lb-medal-1">' + UI.icon('medal') + '</span>'
    if (rank === 2) return '<span class="lb-medal lb-medal-2">' + UI.icon('medal') + '</span>'
    if (rank === 3) return '<span class="lb-medal lb-medal-3">' + UI.icon('medal') + '</span>'
    return '<span class="lb-rank">' + rank + '</span>'
  }

  function render(rootEl, r, onTab) {
    let rows = ''
    r.list.forEach(item => {
      rows +=
        '<div class="lb-row' + (r.myRank && item.rank === r.myRank ? ' lb-me' : '') + '">' +
          medal(item.rank) +
          '<div class="lb-name">' + F.escapeHtml(item.name) + '</div>' +
          '<div class="lb-plays">' + item.plays + ' 场</div>' +
          '<div class="lb-score">' + item.score + '<span class="lb-score-unit"> 分</span></div>' +
        '</div>'
    })

    const empty = r.list.length
      ? ''
      : '<div class="lb-empty">' +
          '<div class="lb-empty-ic">' + UI.icon('medal') + '</div>' +
          '<div>榜单虚位以待</div>' +
          '<div class="lb-empty-sub">毕业解锁竞赛后，来抢占榜首</div>' +
        '</div>'

    const myRank = r.myRank
      ? '<div class="lb-myrank">我的排名：第 <b>' + r.myRank + '</b> 名</div>'
      : ''

    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="map-title">' +
          '<div class="map-title-cn">竞赛排行榜</div>' +
          '<div class="map-title-sub">知识竞赛 · 争当先锋</div>' +
        '</div>' +
        '<div class="lb-tabs">' +
          '<button class="lb-tab' + (r.type === 'total' ? ' lb-tab-active' : '') + '" data-t="total" type="button">累计总分</button>' +
          '<button class="lb-tab' + (r.type === 'best' ? ' lb-tab-active' : '') + '" data-t="best" type="button">单场最佳</button>' +
        '</div>' +
        '<div class="lb-list card">' +
          rows +
          empty +
        '</div>' +
        myRank +
        '<div class="quiz-actions">' +
          '<button class="btn btn-primary" id="lb-go">' + UI.icon('trophy', 'btn-ic') + ' 参加竞赛</button>' +
        '</div>' +
      '</div>'

    rootEl.querySelectorAll('.lb-tab').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.t === r.type) return
        onTab(el.dataset.t)
      })
    })
    rootEl.querySelector('#lb-go').addEventListener('click', () => { location.hash = '#/contest' })
  }
})(typeof self !== 'undefined' ? self : this)
