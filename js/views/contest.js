/**
 * 竞赛页 —— 固定题数积分赛（毕业解锁）
 * 介绍（规则/我的成绩）→ 步进答题（同 quiz 交互）→ 结算（分数/解析/看榜）
 * 判分在服务端（或 mock 本地），答案不下发
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const UI = root.CZ_UI

  // 返回：优先浏览器后退；直接打开的入口页（history 空栈或站外跳来）退到 fallback，别把用户卡在原地
  // 直接打开本页（history 空栈）时退到这里的 BACK_FALLBACK
  const BACK_FALLBACK = '#/'

  function goBack() {
    const ref = document.referrer || ''
    const fromOtherSite = ref !== '' && ref.indexOf(location.origin) !== 0
    if (history.length > 1 && !fromOtherSite) history.back()
    else location.hash = BACK_FALLBACK
  }

  VIEWS.contest = {
    mount(rootEl) {
      rootEl.innerHTML = '<div class="page-center">' + UI.icon('trophy', 'page-center-icon') + '<div>加载中…</div></div>'

      api.contestStatus().then(s => {
        if (!s.ok) return loadFailed(rootEl, '竞赛状态获取失败')
        if (!s.graduated) return renderLocked(rootEl)
        renderIntro(rootEl, s)
      }).catch(err => {
        console.error('竞赛状态加载失败', err)
        loadFailed(rootEl, err.message)
      })
    }
  }

  function loadFailed(rootEl, msg) {
    rootEl.innerHTML =
      '<div class="page-center">' + UI.icon('trophy', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
      '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(msg) + '</div></div>'
  }

  /* ---------- 未毕业锁态 ---------- */

  function renderLocked(rootEl) {
    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="contest-locked card">' +
          '<div class="contest-locked-ic">' + UI.icon('trophy') + '</div>' +
          '<h1 class="contest-locked-title">竞赛尚未解锁</h1>' +
          '<div class="contest-locked-sub">走完 11 个节点并完成毕业考试后，即可参加知识竞赛</div>' +
          '<button class="btn btn-primary" id="contest-back">回到长征路线</button>' +
        '</div>' +
      '</div>'
    rootEl.querySelector('#contest-back').addEventListener('click', () => { location.hash = '#/' })
  }

  /* ---------- 介绍态 ---------- */

  function renderIntro(rootEl, s) {
    const st = s.myStats
    const rows =
      '<div class="contest-rule-row"><span class="contest-rule-k">赛制</span><span class="contest-rule-v">每场 ' + s.rules.questionCount + ' 题 · 每题 ' + s.rules.pointsPerQuestion + ' 分 · 满分 ' + s.rules.fullScore + ' 分</span></div>' +
      '<div class="contest-rule-row"><span class="contest-rule-k">题库</span><span class="contest-rule-v">全库随机抽题 · 当前题库 ' + s.bankCount + ' 题</span></div>' +
      '<div class="contest-rule-row"><span class="contest-rule-k">排行</span><span class="contest-rule-v">累计总分榜 + 单场最佳榜</span></div>'

    rootEl.innerHTML =
      '<div class="page">' +
        '<button type="button" class="back-link">‹ 返回我的</button>' +
        '<div class="contest-hero">' +
          (root.CZ_SPIRIT && root.CZ_SPIRIT.anniversary
            ? '<div class="contest-hero-badge">' + F.escapeHtml(root.CZ_SPIRIT.anniversary.badge) + '</div>'
            : '') +
          '<div class="contest-hero-ic">' + UI.icon('trophy') + '</div>' +
          '<h1 class="contest-hero-title">' + F.escapeHtml(s.rules.title) + '</h1>' +
          '<div class="contest-hero-sub">红军不怕远征难 · 万水千山只等闲</div>' +
        '</div>' +
        '<div class="contest-stats" role="group" aria-label="我的竞赛成绩：已赛场次、累计总分、单场最佳">' +
          '<div class="contest-stat"><div class="contest-stat-num">' + st.plays + '</div><div class="contest-stat-label">已赛场次</div></div>' +
          '<div class="contest-stat"><div class="contest-stat-num">' + st.totalScore + '</div><div class="contest-stat-label">累计总分</div></div>' +
          '<div class="contest-stat"><div class="contest-stat-num">' + st.bestScore + '</div><div class="contest-stat-label">单场最佳</div></div>' +
        '</div>' +
        '<div class="card contest-rule">' +
          '<h2 class="contest-rule-title">竞赛规则</h2>' +
          rows +
        '</div>' +
        '<div class="quiz-actions">' +
          '<button class="btn btn-primary" id="contest-start">' + UI.icon('flag', 'btn-ic') + ' 开始竞赛</button>' +
          '<button class="btn btn-ghost action-gap" id="contest-lb">' + UI.icon('medal', 'btn-ic') + ' 排行榜</button>' +
        '</div>' +
      '</div>'

    rootEl.querySelector('#contest-start').addEventListener('click', startContest)
    rootEl.querySelector('#contest-lb').addEventListener('click', () => { location.hash = '#/leaderboard' })
    rootEl.querySelector('.back-link').addEventListener('click', goBack)
  }

  /* ---------- 答题态（同 quiz 步进交互） ---------- */

  function startContest() {
    const rootEl = document.getElementById('app')
    rootEl.innerHTML = '<div class="page-center">' + UI.icon('trophy', 'page-center-icon') + '<div>正在出题…</div></div>'

    api.contestStart().then(r => {
      if (!r.ok) {
        if (r.error === 'NOT_GRADUATED') return renderLocked(rootEl)
        if (r.error === 'BANK_TOO_SMALL') {
          rootEl.innerHTML = '<div class="page-center">' + UI.icon('trophy', 'page-center-icon') + '<div>' + F.escapeHtml(r.message) + '</div></div>'
          return
        }
        return loadFailed(rootEl, r.message || r.error)
      }
      runQuiz(rootEl, r)
    }).catch(err => {
      console.error('竞赛开场失败', err)
      loadFailed(rootEl, err.message)
    })
  }

  function runQuiz(rootEl, r) {
    const questions = r.questions
    const contestId = r.contestId
    const t0 = Date.now()
    let step = 0
    let selected = []
    const answerMap = {}
    let submitting = false

    // 竞赛有 30 分钟总时限：从开场算，到点前 60 秒转红
    const limit = Number(r.meta.timeoutMs) > 0 ? Number(r.meta.timeoutMs) : 30 * 60 * 1000
    const deadline = t0 + limit
    let timerId = null

    function fmtTime(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000))
      const m = Math.floor(total / 60)
      const s = total % 60
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
    }

    function tickTimer() {
      const el = rootEl.querySelector('#quiz-timer')
      const remain = deadline - Date.now()
      if (el) {
        el.textContent = fmtTime(remain)
        if (remain <= 60000) el.classList.add('is-urgent')
      }
      if (remain <= 0 && !submitting) {
        stopTimer()
        submit(true)
      }
    }

    function stopTimer() {
      if (timerId) { clearInterval(timerId); timerId = null }
    }

    // 只在第一次渲染时挂上计时器，之后 renderStep 都会复用同一个
    function startTimer() {
      if (timerId) return
      tickTimer()
      timerId = setInterval(tickTimer, 500)
    }

    function answeredCount() {
      let n = 0
      for (let k = 0; k < questions.length; k++) {
        const cur = k === step ? selected : answerMap[k]
        if (cur && cur.length) n++
      }
      return n
    }

    function goStep(n) {
      if (n < 0 || n >= questions.length) return
      answerMap[step] = selected.slice()
      step = n
      selected = (answerMap[n] || []).slice()
      renderStep()
      try { window.scrollTo(0, 0) } catch (e) {}
    }

    function openSheet() {
      answerMap[step] = selected.slice()
      const done = answeredCount()
      const cells = questions.map((_, k) => {
        const cur = k === step ? selected : answerMap[k]
        const has = cur && cur.length
        return '<button type="button" class="sheet-cell' + (has ? ' is-done' : '') +
          (k === step ? ' is-current' : '') + '" data-jump="' + k + '"' +
          ' aria-label="第' + (k + 1) + '题' + (has ? '，已答' : '，未答') + '">' +
          (k + 1) + '</button>'
      }).join('')

      const mask = document.createElement('div')
      mask.className = 'sheet-mask'
      mask.innerHTML =
        '<div class="sheet-panel" role="dialog" aria-modal="true" aria-label="答题卡">' +
          '<div class="sheet-head">' +
            '<h2 class="sheet-title">答题卡</h2>' +
            '<button type="button" class="sheet-close" aria-label="关闭">' + UI.icon('xmark') + '</button>' +
          '</div>' +
          '<div class="sheet-grid">' + cells + '</div>' +
          '<div class="sheet-legend">' +
            '<span><i class="sheet-dot is-done"></i>已答 ' + done + ' 题</span>' +
            '<span><i class="sheet-dot"></i>未答 ' + (questions.length - done) + ' 题</span>' +
          '</div>' +
          '<button type="button" class="btn btn-primary sheet-done">继续答题</button>' +
        '</div>'
      document.body.appendChild(mask)

      function close() {
        if (mask.parentNode) mask.parentNode.removeChild(mask)
        document.removeEventListener('keydown', onKey)
      }
      function onKey(e) { if (e.key === 'Escape') close() }
      mask.addEventListener('click', e => { if (e.target === mask) close() })
      mask.querySelector('.sheet-close').addEventListener('click', close)
      mask.querySelector('.sheet-done').addEventListener('click', close)
      mask.querySelectorAll('.sheet-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const n = Number(cell.dataset.jump)
          close()
          goStep(n)
        })
      })
      document.addEventListener('keydown', onKey)
    }

    function renderStep() {
      const q = questions[step]
      const isLast = step >= questions.length - 1
      const percent = Math.round((step + 1) / questions.length * 100)
      const done = answeredCount()
      const remain = deadline - Date.now()

      let options = ''
      q.options.forEach((opt, i) => {
        const sel = selected.indexOf(i) > -1
        options +=
          '<button type="button" class="option' + (sel ? ' option-selected' : '') + '" data-opt="' + i + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
            '<div class="option-marker' + (sel ? ' marker-selected' : '') + '">' + (sel ? UI.icon('check') : '') + '</div>' +
            '<div class="option-text">' + F.escapeHtml(opt) + '</div>' +
          '</button>'
      })

      rootEl.innerHTML =
        '<div class="page">' +
        '<button type="button" class="back-link">‹ 退出竞赛</button>' +
        '<div class="quiz-head">' +
          '<h1 class="quiz-title">' + F.escapeHtml(r.meta.title) + '</h1>' +
          '<div class="quiz-sub">' + F.escapeHtml(r.meta.subtitle) + '</div>' +
          '<div class="quiz-topbar">' +
            '<button type="button" class="sheet-btn" id="btn-sheet">' +
              UI.icon('list') + '答题卡' +
              '<span class="sheet-count">' + done + '/' + questions.length + '</span>' +
            '</button>' +
            '<div class="quiz-timer' + (remain <= 60000 ? ' is-urgent' : '') + '" id="quiz-timer" role="timer" aria-label="剩余时间">' +
              fmtTime(remain) + '</div>' +
          '</div>' +
          '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '" aria-label="答题进度：第 ' + (step + 1) + ' 题，共 ' + questions.length + ' 题"><div class="progress-inner" aria-hidden="true" style="width:' + percent + '%"></div></div>' +
          '<div class="progress-num">' + (step + 1) + ' / ' + questions.length + '</div>' +
        '</div>' +
        '<div class="card">' +
          '<span class="q-type-tag">第 ' + (step + 1) + ' 题</span>' +
          '<h2 class="q-text">' + F.escapeHtml(q.question) + '</h2>' +
          options +
        '</div>' +
        '<div class="quiz-actions quiz-nav">' +
          '<button class="btn btn-ghost" id="btn-prev"' + (step === 0 ? ' disabled' : '') + '>上一题</button>' +
          '<button class="btn btn-primary' + (submitting ? ' btn-loading' : '') + '" id="btn-next"' + (submitting ? ' disabled' : '') + '>' +
            (submitting ? '提交中…' : (isLast ? '交卷' : '下一题')) +
          '</button>' +
        '</div>' +
        '</div>'

      const backBtn = rootEl.querySelector('.back-link')
      if (backBtn) backBtn.addEventListener('click', () => {
        UI.dialog('退出竞赛？', '本场进度不会保存，已答的题会作废。', [
          { text: '继续答题', primary: false, onClick: () => {} },
          { text: '退出竞赛', primary: true, onClick: () => { stopTimer(); location.hash = '#/contest' } }
        ])
      })

      rootEl.querySelectorAll('.option').forEach(el => {
        el.addEventListener('click', () => {
          selected = [Number(el.dataset.opt)]
          answerMap[step] = selected.slice()
          renderStep()
        })
      })
      const prev = rootEl.querySelector('#btn-prev')
      if (prev) prev.addEventListener('click', () => goStep(step - 1))
      const sheetBtn = rootEl.querySelector('#btn-sheet')
      if (sheetBtn) sheetBtn.addEventListener('click', openSheet)

      rootEl.querySelector('#btn-next').addEventListener('click', () => {
        answerMap[step] = selected.slice()
        if (step < questions.length - 1) goStep(step + 1)
        else {
          const left = questions.length - answeredCount()
          if (left > 0) {
            UI.dialog('还有题目没答', '还有 ' + left + ' 题未作答，未作答按 0 分计。确定交卷吗？', [
              { text: '继续答题', primary: false, onClick: () => {} },
              { text: '确定交卷', primary: true, onClick: () => submit(false) }
            ])
          } else {
            submit(false)
          }
        }
      })

      startTimer()
    }

    function submit(auto) {
      submitting = true
      stopTimer()
      renderStep()
      const answers = questions.map((q, i) => ({ id: q.id, answer: answerMap[i] || [] }))
      const durationMs = Date.now() - t0
      api.contestSubmit(contestId, answers, durationMs).then(res => {
        if (!res.ok) {
          if (res.error === 'CONTEST_EXPIRED') UI.toast('场次已超时，请重新开始')
          else UI.toast(res.message || '交卷失败，请重试')
          submitting = false
          return renderStep()
        }
        stopTimer()
        renderResult(rootEl, res)
      }).catch(err => {
        console.error('交卷失败', err)
        submitting = false
        UI.toast('交卷失败，请重试')
        renderStep()
      })
    }

    renderStep()
  }

  /* ---------- 结算态 ---------- */

  function renderResult(rootEl, r) {
    let review = ''
    r.results.forEach(x => {
      let answerLine = ''
      if (!x.correct && x.correctAnswer && x.correctAnswer.length) {
        const texts = x.correctAnswer.map(i => x.options[i]).join('、')
        answerLine = '<div class="review-answer">正确答案：' + F.escapeHtml(texts) + '</div>'
      }
      review +=
        '<div class="review-item">' +
          '<div class="review-q">' +
            '<span class="review-mark ' + (x.correct ? 'mark-right' : 'mark-wrong') + '">' + UI.icon(x.correct ? 'check' : 'xmark') + '</span>' +
            '<span>' + F.escapeHtml(x.question) + '</span>' +
          '</div>' +
          answerLine +
          (x.explanation ? '<div class="review-exp">' + F.escapeHtml(x.explanation) + '</div>' : '') +
        '</div>'
    })

    const st = r.myStats
    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="result-hero hero-passed">' +
          '<div class="contest-trophy">' + UI.icon('trophy') + '</div>' +
          '<h1 class="result-title">竞赛完成</h1>' +
          '<div class="result-score" role="img" aria-label="本场得分 ' + r.score + ' 分"><span class="score-num">' + r.score + '</span><span class="score-unit">分</span></div>' +
          '<div class="result-detail">答对 ' + r.correctCount + ' / ' + r.total + ' 题 · 累计 ' + st.totalScore + ' 分 · 单场最佳 ' + st.bestScore + ' 分</div>' +
        '</div>' +
        '<div class="card review">' +
          '<h2 class="review-title">答题解析</h2>' +
          review +
        '</div>' +
        '<div class="quiz-actions">' +
          '<button class="btn btn-primary" id="btn-lb">' + UI.icon('medal', 'btn-ic') + ' 查看排行榜</button>' +
          '<button class="btn btn-ghost action-gap" id="btn-again">' + UI.icon('replay', 'btn-ic') + ' 再赛一场</button>' +
        '</div>' +
      '</div>'

    rootEl.querySelector('#btn-lb').addEventListener('click', () => { location.hash = '#/leaderboard' })
    rootEl.querySelector('#btn-again').addEventListener('click', startContest)
  }
})(typeof self !== 'undefined' ? self : this)
