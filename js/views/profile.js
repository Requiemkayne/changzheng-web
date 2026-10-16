/**
 * 我的页 —— 昵称 / 统计 / 节点成绩清单 / 足迹时间线 / 毕业证书入口
 * mock 模式：本地单用户，长按昵称卡片（600ms）重置进度（调试用）
 * http 模式：未登录由路由守卫拦截跳登录页；已登录可退出（长按重置隐藏）
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const progressUtil = root.CZ_PROGRESS
  const UI = root.CZ_UI
  const config = root.CZ_CONFIG

  VIEWS.profile = {
    mount(rootEl) {
      if (config.USE_MOCK) {
        loadMain(rootEl, null)
      } else {
        // http 模式：确认登录态，未登录跳登录页（第一屏）
        api.me()
          .then(user => loadMain(rootEl, user))
          .catch(() => { location.hash = '#/login' })
      }
    }
  }

  /* ---------- 主内容（已登录 / mock） ---------- */

  function loadMain(rootEl, user) {
    rootEl.innerHTML = '<div class="page-center">' + UI.icon('user', 'page-center-icon') + '<div>加载中…</div></div>'

    Promise.all([api.getConfig(), api.getNodes(), api.getProgress(), api.getCheckins()])
      .then(([cfg, nodes, progress, checkins]) => {
        render(rootEl, cfg, nodes, progress, checkins, user)
      })
      .catch(err => {
        console.error('我的页加载失败', err)
        rootEl.innerHTML =
          '<div class="page-center">' + UI.icon('user', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
          '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message || String(err)) + '</div></div>'
      })
  }

  function render(rootEl, cfg, nodes, progress, checkins, user) {
    const states = progressUtil.computeStates(nodes, progress, cfg)
    // mock：昵称存进度；http：昵称在账号里（服务端 users 表）
    const nickname = user ? (user.nickname || user.username) : (progress.nickname || '长征战士')
    const graduated = states.finalState === 'passed'
    const certSub = graduated
      ? '已毕业 · 得分 ' + states.finalBest + ' 分'
      : states.finalState === 'open' ? '全部节点已打卡，点击开始毕业考试' : '打卡全部节点后解锁'

    // 成绩清单
    let scoreRows = ''
    nodes.forEach(node => {
      const st = states.byCode[node.code]
      scoreRows +=
        '<div class="score-row" data-code="' + node.code + '">' +
          '<div>' +
            '<div class="score-name">' + F.escapeHtml(node.name) + '</div>' +
            '<div class="score-sub">' + F.escapeHtml(node.date) + '</div>' +
          '</div>' +
          '<div class="score-right">' +
            UI.badgeHTML(st.state) +
            (st.quizPassed ? '<div class="score-best">' + st.quizBest + '<span class="score-best-unit"> 分</span></div>' : '') +
          '</div>' +
        '</div>'
    })

    // 足迹时间线
    let foot = ''
    if (checkins.length) {
      checkins.forEach(c => {
        foot +=
          '<div class="foot-item">' +
            '<span class="foot-dot"></span>' +
            '<span class="foot-name">' + F.escapeHtml(c.nodeName) + '</span>' +
            '<span class="foot-date">' + F.escapeHtml(F.formatDateTime(c.time)) + '</span>' +
          '</div>'
      })
    } else {
      foot = '<div class="empty" style="padding:24px 0">还没有足迹，去路线页开始长征吧</div>'
    }

    const editHint = config.USE_MOCK
      ? '点击编辑昵称 · 长按重置进度（调试用）'
      : '账号 ' + F.escapeHtml(user.username) + ' · 点击编辑昵称'
    const logoutBtn = config.USE_MOCK ? '' :
      '<button class="btn btn-mini btn-mini-ghost action-gap" id="btn-logout">退出登录</button>'

    rootEl.innerHTML =
      '<div class="page">' +
      '<div class="card user-card" id="user-card">' +
        '<div class="avatar">' + UI.icon('star') + '</div>' +
        '<div style="flex:1">' +
          '<div class="user-name" id="user-name">' + F.escapeHtml(nickname) + '</div>' +
          '<div class="user-edit-hint">' + editHint + '</div>' +
          logoutBtn +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="stats-grid">' +
        '<div class="stat"><div class="stat-num">' + states.checkedCount + '/' + states.total + '</div><div class="stat-label">打卡节点</div></div>' +
        '<div class="stat"><div class="stat-num">' + states.passedCount + '/' + states.total + '</div><div class="stat-label">答题通关</div></div>' +
        '<div class="stat"><div class="stat-num">' + (graduated ? states.finalBest : '—') + '</div><div class="stat-label">毕业得分</div></div>' +
      '</div></div>' +

      '<div class="card cert-entry" id="cert-entry">' +
        '<div class="final-icon">' + UI.icon('cap') + '</div>' +
        '<div style="flex:1">' +
          '<div class="final-title">结业证书</div>' +
          '<div class="final-sub">' + F.escapeHtml(certSub) + '</div>' +
        '</div>' +
        UI.icon('chevron', 'tl-arrow') +
      '</div>' +

      '<div class="entry-grid">' +
        '<div class="card entry-card" id="contest-entry">' +
          '<div class="entry-ic">' + UI.icon('trophy') + '</div>' +
          '<div class="entry-name">知识竞赛</div>' +
          '<div class="entry-sub">' + (graduated ? '来赛一场' : '毕业解锁') + '</div>' +
        '</div>' +
        '<div class="card entry-card" id="lb-entry">' +
          '<div class="entry-ic">' + UI.icon('medal') + '</div>' +
          '<div class="entry-name">排行榜</div>' +
          '<div class="entry-sub">谁是先锋</div>' +
        '</div>' +
      '</div>' +

      '<div class="section-title">节点成绩</div>' +
      '<div class="card">' + scoreRows + '</div>' +

      '<div class="section-title">我的足迹</div>' +
      '<div class="card">' + foot + '</div>' +
      '</div>'

    bind(rootEl, cfg, nodes, progress, checkins, states, user)
  }

  function bind(rootEl, cfg, nodes, progress, checkins, states, user) {
    // 昵称编辑
    const userCard = rootEl.querySelector('#user-card')
    userCard.addEventListener('click', () => {
      const current = user ? (user.nickname || user.username) : (progress.nickname || '长征战士')
      const nameBox = rootEl.querySelector('#user-name')
      nameBox.innerHTML =
        '<input class="name-input" id="name-input" maxlength="12" placeholder="请输入昵称" value="' + F.escapeHtml(current === '长征战士' ? '' : current) + '">' +
        '<div class="name-actions">' +
          '<button class="btn-mini btn-mini-primary" id="name-save">保存</button>' +
          '<button class="btn-mini btn-mini-ghost" id="name-cancel">取消</button>' +
        '</div>'
      rootEl.querySelector('#name-save').addEventListener('click', e => {
        e.stopPropagation()
        const name = rootEl.querySelector('#name-input').value.trim()
        if (!name) { UI.toast('请输入昵称'); return }
        api.saveNickname(name).then(() => {
          if (user) user.nickname = name
          else progress.nickname = name
          UI.toast('已保存')
          render(rootEl, cfg, nodes, progress, checkins, user)
        }).catch(() => UI.toast('保存失败'))
      })
      rootEl.querySelector('#name-cancel').addEventListener('click', e => {
        e.stopPropagation()
        render(rootEl, cfg, nodes, progress, checkins, user)
      })
    })

    // 退出登录（仅 http 模式）
    const logoutBtn = rootEl.querySelector('#btn-logout')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', e => {
        e.stopPropagation()
        UI.dialog('退出登录', '退出后本机将回到未登录状态，进度保留在账号里，重新登录即可找回。', [
          { text: '取消' },
          { text: '退出', primary: true, onClick: () => {
            api.logout().then(() => {
              UI.toast('已退出')
              location.hash = '#/login'
            })
          }}
        ])
      })
    }

    // 长按重置进度（仅 mock 模式；http 模式数据在服务端，本地清除无效）
    if (config.USE_MOCK) {
      let pressTimer = null
      userCard.addEventListener('pointerdown', () => {
        pressTimer = setTimeout(() => {
          UI.dialog('重置进度', '将清除本地打卡记录与答题成绩，用于开发调试。确定？', [
            { text: '取消' },
            { text: '确定重置', primary: true, onClick: () => {
              try {
                localStorage.removeItem('cz_progress')
                localStorage.removeItem('cz_checkins')
                localStorage.removeItem('cz_web_cache_config')
                localStorage.removeItem('cz_web_cache_nodes')
              } catch (e) { /* 存储不可用时忽略 */ }
              UI.toast('已重置')
              render(rootEl, cfg, nodes, { checkins: {}, quizScores: {}, finalExam: {} }, [], null)
            }}
          ])
        }, 600)
      })
      userCard.addEventListener('pointerup', () => clearTimeout(pressTimer))
      userCard.addEventListener('pointerleave', () => clearTimeout(pressTimer))
    }

    // 毕业证书入口
    rootEl.querySelector('#cert-entry').addEventListener('click', () => {
      if (states.finalState === 'locked') {
        UI.toast('打卡全部节点后解锁')
        return
      }
      location.hash = '#/quiz/final'
    })

    // 竞赛 / 排行榜入口
    rootEl.querySelector('#contest-entry').addEventListener('click', () => { location.hash = '#/contest' })
    rootEl.querySelector('#lb-entry').addEventListener('click', () => { location.hash = '#/leaderboard' })

    // 成绩清单 → 详情
    rootEl.querySelectorAll('.score-row').forEach(row => {
      row.addEventListener('click', () => { location.hash = '#/node/' + row.dataset.code })
    })
  }
})(typeof self !== 'undefined' ? self : this)
