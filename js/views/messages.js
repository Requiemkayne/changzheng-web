'use strict';
/**
 * 我的 · 消息中心
 *
 * 收两类通知：
 *   1. 找回密码申请的处理结果（管理员同意 → 密码已重置为 111111 / 已拒绝）
 *   2. 我在专题站发的留言审核情况（通过 / 待审核 / 未通过）
 *
 * 未读红点：localStorage['cz_msg_seen'] 记录上次进入本页的时间，
 * 凡处理时间晚于它的结果都算未读。离开页面时把 seen 推进到最新。
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const config = root.CZ_CONFIG
  const api = root.CZ_API
  const F = root.CZ_FORMAT
  const UI = root.CZ_UI

  const SEEN_KEY = 'cz_msg_seen'
  const OWNER_KEY = 'tl-comments-own'

  function getSeen() {
    try { return Number(localStorage.getItem(SEEN_KEY) || 0) } catch (e) { return 0 }
  }
  function setSeen(ts) {
    try { localStorage.setItem(SEEN_KEY, String(ts)) } catch (e) { /* 隐私模式忽略 */ }
  }
  function getOwner() {
    try { return localStorage.getItem(OWNER_KEY) || '' } catch (e) { return '' }
  }

  /** 拉取两类消息，返回统一结构（供页面渲染与红点共用） */
  function fetchAll() {
    const owner = getOwner()
    return Promise.all([
      api.getPasswordRequests().catch(() => []),
      api.getMyComments(owner).catch(() => []),
    ]).then(([pws, comments]) => {
      const pwItems = (pws || []).map((r) => ({
        kind: 'password',
        id: 'pw-' + r.id,
        title: '找回密码申请',
        status: r.status,
        statusText: r.status === 'approved' ? '已重置为 111111'
          : r.status === 'rejected' ? '未通过' : '等待老师处理',
        body: r.status === 'approved'
          ? '老师已同意，你的密码已重置为 111111，请用它重新登录。'
          : r.status === 'rejected'
            ? '老师未通过这次申请，如有疑问请联系班主任。'
            : '申请已提交，等老师处理。',
        note: r.note || '',
        ts: r.resolvedAt || r.createdAt,
        resolvedAt: r.resolvedAt || 0,
      }))

      const cmItems = (comments || []).map((c) => ({
        kind: 'comment',
        id: 'cm-' + c.id,
        title: '留言审核',
        status: c.status,
        statusText: c.status === 'approved' ? '已通过'
          : c.status === 'rejected' ? '未通过' : '待审核',
        body: c.text || '',
        note: c.page ? ('篇目：' + c.page) : '',
        ts: c.auditedAt || c.createdAt,
        resolvedAt: c.auditedAt || 0,
      }))

      const all = pwItems.concat(cmItems).sort((a, b) => (b.ts || 0) - (a.ts || 0))
      const seen = getSeen()
      const unread = all.filter((m) => (m.resolvedAt || 0) > seen).length
      return { all, unread }
    })
  }

  /** 供「我的」页与 tabBar 计算红点 */
  function unreadCount() {
    if (config.USE_MOCK) return Promise.resolve(0)
    return fetchAll().then((d) => d.unread).catch(() => 0)
  }

  function timeText(ts) {
    if (!ts) return ''
    return F.formatDateTime ? F.formatDateTime(ts) : new Date(ts).toLocaleString('zh-CN')
  }

  function mount(rootEl) {
    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="settings-head">' +
          '<button class="settings-back" id="msg-back" type="button" aria-label="返回我的">' +
            UI.icon('chevron', 'settings-back-ic') +
          '</button>' +
          '<h1 class="settings-title">消 息</h1>' +
        '</div>' +
        '<div class="card" id="msg-list-card">' +
          '<div class="empty" style="padding:28px 0">正在加载…</div>' +
        '</div>' +
      '</div>'

    const back = rootEl.querySelector('#msg-back')
    if (back) back.addEventListener('click', () => { location.hash = '#/profile' })

    fetchAll().then(({ all, unread }) => {
      const card = rootEl.querySelector('#msg-list-card')
      if (!card) return

      if (!all.length) {
        card.innerHTML =
          '<div class="empty" style="padding:32px 0">' +
            '还没有消息<br><span style="font-size:12px;color:var(--muted)">留言被审核、找回密码有结果时会出现在这里</span>' +
          '</div>'
        setSeen(Date.now())
        refreshBadge()
        return
      }

      let html = ''
      if (unread > 0) {
        html += '<div class="msg-unread-tip">有 ' + unread + ' 条新消息</div>'
      }
      all.forEach((m) => {
        const isNew = (m.resolvedAt || 0) > getSeen()
        html +=
          '<div class="msg-item' + (isNew ? ' msg-item-new' : '') + '">' +
            '<div class="msg-head">' +
              '<span class="msg-kind">' + (m.kind === 'password' ? '密码' : '留言') + '</span>' +
              '<span class="msg-status msg-status-' + m.status + '">' + F.escapeHtml(m.statusText) + '</span>' +
              (isNew ? '<span class="msg-dot" aria-label="未读"></span>' : '') +
            '</div>' +
            (m.body ? '<p class="msg-body">' + F.escapeHtml(m.body) + '</p>' : '') +
            (m.note ? '<p class="msg-note">' + F.escapeHtml(m.note) + '</p>' : '') +
            '<div class="msg-time">' + F.escapeHtml(timeText(m.ts)) + '</div>' +
          '</div>'
      })
      card.innerHTML = html

      // 进页面即视为已读：红点会消失，未读高亮保留到本次渲染
      setSeen(Date.now())
      refreshBadge()
    })
  }

  /** 刷新「我的」入口与 tabBar 上的红点 */
  function refreshBadge() {
    if (config.USE_MOCK) return
    unreadCount().then((n) => {
      const dot = document.querySelector('#tabbar .tab[data-tab="profile"] .tab-dot')
      if (dot) dot.hidden = n === 0
      const entryDot = document.querySelector('#messages-entry .entry-dot')
      if (entryDot) entryDot.hidden = n === 0
    })
  }

  VIEWS.messages = { mount }

  root.CZ_MESSAGES = { unreadCount, refreshBadge, SEEN_KEY }
})(typeof self !== 'undefined' ? self : this)
