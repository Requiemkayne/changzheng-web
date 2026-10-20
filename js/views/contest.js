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
        '<a class="back-link" href="javascript:history.back()">‹ 返回</a>' +
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

    function renderStep() {
      const q = questions[step]
      const isLast = step >= questions.length - 1
      const canNext = selected.length > 0 && !submitting
      const percent = Math.round((step + 1) / questions.length * 100)

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
        '<div class="quiz-head">' +
          '<h1 class="quiz-title">' + F.escapeHtml(r.meta.title) + '</h1>' +
          '<div class="quiz-sub">' + F.escapeHtml(r.meta.subtitle) + '</div>' +
          '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '" aria-label="答题进度：第 ' + (step + 1) + ' 题，共 ' + questions.length + ' 题"><div class="progress-inner" aria-hidden="true" style="width:' + percent + '%"></div></div>' +
          '<div class="progress-num">' + (step + 1) + ' / ' + questions.length + '</div>' +
        '</div>' +
        '<div class="card">' +
          '<span class="q-type-tag">第 ' + (step + 1) + ' 题</span>' +
          '<h2 class="q-text">' + F.escapeHtml(q.question) + '</h2>' +
          options +
        '</div>' +
        '<div class="quiz-actions">' +
          '<button class="btn btn-primary' + (submitting ? ' btn-loading' : '') + '" id="btn-next" ' + (canNext ? '' : 'disabled') + '>' +
            (submitting ? '提交中…' : (isLast ? '交卷' : '下一题')) +
          '</button>' +
        '</div>' +
        '</div>'

      rootEl.querySelectorAll('.option').forEach(el => {
        el.addEventListener('click', () => {
          selected = [Number(el.dataset.opt)]
          renderStep()
        })
      })
      rootEl.querySelector('#btn-next').addEventListener('click', () => {
        answerMap[step] = selected.slice()
        if (step < questions.length - 1) {
          step++
          selected = []
          renderStep()
          window.scrollTo(0, 0)
        } else {
          submit()
        }
      })
    }

    function submit() {
      submitting = true
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
