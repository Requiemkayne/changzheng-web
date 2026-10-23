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
    const grad = states.graduation || { avgScore: 0, passScore: 70, ready: false }
    const certSub = graduated
      ? '已毕业 · 节点答题平均 ' + (states.finalBest || grad.avgScore) + ' 分'
      : states.finalState === 'open'
        ? (grad.ready
            ? '节点答题平均 ' + grad.avgScore + ' 分，已达毕业线，点此毕业'
            : '节点答题平均 ' + grad.avgScore + ' 分 · 还差 ' + Math.max(0, grad.passScore - grad.avgScore) + ' 分')
        : '打卡全部节点后解锁'

    // 成绩清单
    let scoreRows = ''
    nodes.forEach(node => {
      const st = states.byCode[node.code]
      scoreRows +=
        '<div class="score-row" data-code="' + node.code + '" role="button" tabindex="0">' +
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

    // 学习统计（兼容旧数据无 stats 字段）
    const stats = progress.stats || { correctCount: 0, totalCount: 0 }
    const rate = stats.totalCount > 0 ? Math.round(stats.correctCount / stats.totalCount * 100) : 0
    let attemptsTotal = 0
    nodes.forEach(n => {
      const q = progress.quizScores && progress.quizScores[n.code]
      if (q) attemptsTotal += q.attempts || 0
    })
    attemptsTotal += (progress.finalExam && progress.finalExam.attempts) || 0

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
          '<h1 class="user-name" id="user-name">' + F.escapeHtml(nickname) + '</h1>' +
          '<div class="user-edit-hint" id="user-card-action" role="button" tabindex="0">' + editHint + '</div>' +
          logoutBtn +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="stats-grid" role="group" aria-label="打卡节点、答题通关、毕业得分三项统计">' +
        '<div class="stat"><div class="stat-num">' + states.checkedCount + '/' + states.total + '</div><div class="stat-label">打卡节点</div></div>' +
        '<div class="stat"><div class="stat-num">' + states.passedCount + '/' + states.total + '</div><div class="stat-label">答题通关</div></div>' +
        '<div class="stat"><div class="stat-num">' + (graduated ? states.finalBest : '—') + '</div><div class="stat-label">毕业得分</div></div>' +
      '</div></div>' +

      '<div class="card learn-card">' +
        '<div class="learn-head">' + UI.icon('cap', 'learn-head-ic') + '<h2 class="learn-title">学习统计</h2></div>' +
        '<div class="learn-grid" role="group" aria-label="累计答题数、正确率、答题次数三项统计">' +
          '<div class="learn-item"><div class="learn-num">' + stats.totalCount + '</div><div class="learn-label">累计答题（题）</div></div>' +
          '<div class="learn-item"><div class="learn-num">' + rate + '%</div><div class="learn-label">正确率</div></div>' +
          '<div class="learn-item"><div class="learn-num">' + attemptsTotal + '</div><div class="learn-label">答题次数（次）</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="card cert-entry" id="cert-entry" role="button" tabindex="0">' +
        '<div class="final-icon">' + UI.icon('cap') + '</div>' +
        '<div style="flex:1">' +
          '<h2 class="final-title">' + (graduated ? '结业证书' : '申请毕业') + '</h2>' +
          '<div class="final-sub">' + F.escapeHtml(certSub) + '</div>' +
        '</div>' +
        UI.icon('chevron', 'tl-arrow') +
      '</div>' +

      '<div class="entry-grid">' +
        '<div class="card entry-card" id="contest-entry" role="button" tabindex="0">' +
          '<div class="entry-ic">' + UI.icon('trophy') + '</div>' +
          '<h2 class="entry-name">知识竞赛</h2>' +
          '<div class="entry-sub">' + (graduated ? '来赛一场' : '毕业解锁') + '</div>' +
        '</div>' +
        '<div class="card entry-card" id="lb-entry" role="button" tabindex="0">' +
          '<div class="entry-ic">' + UI.icon('medal') + '</div>' +
          '<h2 class="entry-name">排行榜</h2>' +
          '<div class="entry-sub">谁是先锋</div>' +
        '</div>' +
        '<div class="card entry-card" id="practice-entry" role="button" tabindex="0">' +
          '<div class="entry-ic">' + UI.icon('replay') + '</div>' +
          '<h2 class="entry-name">综合练习</h2>' +
          '<div class="entry-sub">11 个节点随机 10 题 · 限时 3 分钟</div>' +
        '</div>' +
      '</div>' +

      '<details class="profile-fold">' +
        '<summary class="profile-fold-head">' +
          '<h2 class="section-title">节点成绩</h2>' +
          '<span class="fold-cue" aria-hidden="true"></span>' +
        '</summary>' +
        '<div class="card">' + scoreRows + '</div>' +
      '</details>' +

      '<details class="profile-fold">' +
        '<summary class="profile-fold-head">' +
          '<h2 class="section-title">我的足迹</h2>' +
          '<span class="fold-cue" aria-hidden="true"></span>' +
        '</summary>' +
        '<div class="card">' + foot + '</div>' +
      '</details>' +
      '</div>'

    bind(rootEl, cfg, nodes, progress, checkins, states, user)
  }

  // role=button + tabindex 元素的键盘激活：Enter / Space；e.target 必须是自己，避免子按钮连带触发
  function onActivate(el, fn) {
    if (!el) return
    el.addEventListener('keydown', e => {
      if (e.target !== el) return
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        fn(e)
      }
    })
  }

  function bind(rootEl, cfg, nodes, progress, checkins, states, user) {
    // 昵称编辑（卡片本身接收鼠标点击；键盘走 user-card-action）
    const userCard = rootEl.querySelector('#user-card')
    const openNameEditor = () => {
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
    }
    userCard.addEventListener('click', openNameEditor)
    onActivate(rootEl.querySelector('#user-card-action'), openNameEditor)

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
              // 竞赛记录一并清零（排行榜在 mock 下由竞赛记录派生，同步归零）
              api.clearContestRecords().then(() => {
                UI.toast('已重置')
                render(rootEl, cfg, nodes, { checkins: {}, quizScores: {}, finalExam: {} }, [], null)
              })
            }}
          ])
        }, 600)
      })
      userCard.addEventListener('pointerup', () => clearTimeout(pressTimer))
      userCard.addEventListener('pointerleave', () => clearTimeout(pressTimer))
    }

    // 毕业证书入口
    const certEntry = rootEl.querySelector('#cert-entry')
    // 毕业不再单独考试：直接按 11 个节点的答题平均分判定
    function showDiploma(r) {
      const g = states.graduation || { avgScore: 0, passScore: 70 }
      const score = (r && r.avgScore) || g.avgScore
      const name = user ? (user.nickname || user.username) : (progress.nickname || '长征战士')
      const mask = document.createElement('div')
      mask.className = 'sheet-mask'
      mask.innerHTML =
        '<div class="sheet-panel diploma-panel" role="dialog" aria-modal="true" aria-label="结业证书">' +
          '<div class="sheet-head">' +
            '<h2 class="sheet-title">恭喜毕业</h2>' +
            '<button type="button" class="sheet-close" aria-label="关闭">' + UI.icon('xmark') + '</button>' +
          '</div>' +
          '<div class="certificate card">' +
            '<div class="cert-inner">' +
              '<div class="cert-star">' + UI.icon('star') + '</div>' +
              '<h2 class="cert-title">结业证书</h2>' +
              '<div class="cert-line" aria-hidden="true"></div>' +
              '<div class="cert-text">' + F.escapeHtml(name) + '</div>' +
              '<div class="cert-text cert-text-tight">11 个节点全部完成 · 平均 ' + score + ' 分</div>' +
              '<div class="cert-seal cert-seal-in">长征</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-primary diploma-close">收下证书</button>' +
        '</div>'
      document.body.appendChild(mask)
      function close() {
        if (mask.parentNode) mask.parentNode.removeChild(mask)
        document.removeEventListener('keydown', onKey)
      }
      function onKey(e) { if (e.key === 'Escape') close() }
      mask.addEventListener('click', e => { if (e.target === mask) close() })
      mask.querySelector('.sheet-close').addEventListener('click', close)
      mask.querySelector('.diploma-close').addEventListener('click', close)
      document.addEventListener('keydown', onKey)
    }

    const goCert = () => {
      if (states.finalState === 'locked') {
        UI.toast('先走完全部 11 个节点')
        return
      }
      if (states.finalState === 'passed') { showDiploma(); return }
      const g = states.graduation || { avgScore: 0, passScore: 70, ready: false }
      if (!g.ready) {
        UI.dialog('还不能毕业',
          '11 个节点的答题平均分是 ' + g.avgScore + ' 分，毕业线 ' + g.passScore + ' 分。回去把答错过的节点再答一遍，成绩取每个节点的最好一次。',
          [
            { text: '去刷分', primary: true, onClick: () => { location.hash = '#/' } },
            { text: '知道了', primary: false, onClick: () => {} }
          ])
        return
      }
      api.graduate().then(res => {
        if (!res.ok) {
          UI.dialog('还不能毕业', res.message || '条件未满足', [{ text: '知道了', primary: true, onClick: () => {} }])
          return
        }
        if (!progress.finalExam) progress.finalExam = { attempts: 0, best: 0, passed: false, lastTime: null }
        progress.finalExam.passed = true
        states.finalState = 'passed'
        showDiploma(res)
        UI.toast('恭喜毕业')
      }).catch(err => {
        UI.toast((err && err.message) || '申请失败，请重试')
      })
    }
    certEntry.addEventListener('click', goCert)
    onActivate(certEntry, goCert)

    // 竞赛 / 排行榜入口
    const contestEntry = rootEl.querySelector('#contest-entry')
    const lbEntry = rootEl.querySelector('#lb-entry')
    const practiceEntry = rootEl.querySelector('#practice-entry')
    const goPractice = () => { location.hash = '#/quiz/final' }
    if (practiceEntry) {
      practiceEntry.addEventListener('click', goPractice)
      onActivate(practiceEntry, goPractice)
    }
    const goContest = () => { location.hash = '#/contest' }
    const goLb = () => { location.hash = '#/leaderboard' }
    contestEntry.addEventListener('click', goContest)
    onActivate(contestEntry, goContest)
    lbEntry.addEventListener('click', goLb)
    onActivate(lbEntry, goLb)

    // 成绩清单 → 详情
    rootEl.querySelectorAll('.score-row').forEach(row => {
      const goNode = () => { location.hash = '#/node/' + row.dataset.code }
      row.addEventListener('click', goNode)
      onActivate(row, goNode)
    })
  }
})(typeof self !== 'undefined' ? self : this)
