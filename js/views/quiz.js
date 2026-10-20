/**
 * 答题页 —— 节点关卡 / 总结答题（毕业考试）共用
 * 步进式一屏一题：单选/判断点击即选，多选切换；提交后逐题解析；final 通过渲染毕业证书
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const UI = root.CZ_UI

  VIEWS.quiz = {
    mount(rootEl, params) {
      const mode = params.mode === 'final' ? 'final' : 'node'
      const code = params.code || ''
      let step = 0
      let selected = []        // 当前题已选下标
      const answerMap = {}     // 历史题已选下标（提交时组装）
      let questions = []
      let meta = null
      let submitting = false

      rootEl.innerHTML = '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>正在出题…</div></div>'

      api.getQuiz(mode, code).then(r => {
        if (!r.ok) return handleUnlockError(rootEl, r.error, mode, code)
        questions = r.questions
        meta = r.meta
        renderQuiz()
      }).catch(err => {
        console.error('取题失败', err)
        rootEl.innerHTML =
          '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>取题失败，请返回重试</div>' +
          '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
      })

      /* ---------- 答题态 ---------- */

      function renderQuiz() {
        const q = questions[step]
        const typeText = q.type === 'multiple' ? '多选题' : q.type === 'judge' ? '判断题' : '单选题'
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
          '<a class="back-link" href="javascript:history.back()">‹ 返回</a>' +
          '<div class="quiz-head">' +
            '<div class="quiz-title">' + F.escapeHtml(meta.title) + '</div>' +
            '<div class="quiz-sub">' + F.escapeHtml(meta.subtitle) + '</div>' +
            '<div class="progress-track"><div class="progress-inner" style="width:' + percent + '%"></div></div>' +
            '<div class="progress-num">' + (step + 1) + ' / ' + questions.length + '</div>' +
          '</div>' +
          '<div class="card">' +
            '<span class="q-type-tag">' + typeText + '</span>' +
            '<div class="q-text">' + F.escapeHtml(q.question) + '</div>' +
            options +
          '</div>' +
          '<div class="quiz-actions">' +
            '<button class="btn btn-primary' + (submitting ? ' btn-loading' : '') + '" id="btn-next" ' + (canNext ? '' : 'disabled') + '>' +
              (submitting ? '提交中…' : (isLast ? '提交答卷' : '下一题')) +
            '</button>' +
          '</div>' +
          '</div>'

        bindQuiz()
      }

      function bindQuiz() {
        const q = questions[step]
        rootEl.querySelectorAll('.option').forEach(el => {
          el.addEventListener('click', () => {
            const i = Number(el.dataset.opt)
            if (q.type === 'multiple') {
              const pos = selected.indexOf(i)
              if (pos > -1) selected.splice(pos, 1)
              else selected.push(i)
            } else {
              selected = [i]
            }
            renderQuiz()
          })
        })
        const btn = rootEl.querySelector('#btn-next')
        if (btn) {
          btn.addEventListener('click', () => {
            answerMap[step] = selected.slice()
            if (step < questions.length - 1) {
              step++
              selected = []
              renderQuiz()
              window.scrollTo(0, 0)
            } else {
              submit()
            }
          })
        }
      }

      function submit() {
        submitting = true
        renderQuiz()
        const answers = questions.map((q, i) => ({ id: q.id, answer: answerMap[i] || [] }))
        api.submitQuiz(mode, code, answers).then(r => {
          if (!r.ok) return handleUnlockError(rootEl, r.error, mode, code)
          renderResult(r)
        }).catch(err => {
          console.error('提交失败', err)
          submitting = false
          UI.toast('提交失败，请重试')
          renderQuiz()
        })
      }

      /* ---------- 结果态 ---------- */

      function renderResult(r) {
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

        let cert = ''
        if (r.isFinalPassed) {
          cert =
            '<div class="certificate card">' +
              '<div class="cert-inner">' +
                '<div class="cert-star">' + UI.icon('star') + '</div>' +
                '<div class="cert-title">结业证书</div>' +
                '<div class="cert-line"></div>' +
                '<div class="cert-text">重走长征路 · 传承长征魂</div>' +
                '<div class="cert-text">已走完全部 11 个节点并完成总结答题</div>' +
                '<div class="cert-score">毕业得分 ' + r.score + ' 分</div>' +
                (root.CZ_SPIRIT && root.CZ_SPIRIT.quote
                  ? '<div class="cert-quote">' + root.CZ_SPIRIT.quote + '<div class="cert-quote-src">—— 习近平</div></div>'
                  : '') +
                '<div class="cert-seal cert-seal-in">长征</div>' +
              '</div>' +
            '</div>'
        }

        // 签名动作：通关盖章（红章落在金底上最醒目），失败不盖章
        const stamp = r.passed
          ? '<div class="stamp stamp-in"><span>通 关</span></div>'
          : '<div class="result-emoji">' + UI.icon('flag') + '</div>'

        rootEl.innerHTML =
          '<div class="page">' +
          '<a class="back-link" href="javascript:history.back()">‹ 返回</a>' +
          '<div class="result-hero ' + (r.passed ? 'hero-passed' : 'hero-failed') + '">' +
            stamp +
            '<div class="result-title">' + (r.passed ? '恭喜通关' : '差一点，再试一次') + '</div>' +
            '<div class="result-score"><span class="score-num">' + r.score + '</span><span class="score-unit">分</span></div>' +
            '<div class="result-detail">答对 ' + r.correctCount + ' / ' + r.total + ' 题 · 历史最佳 ' + r.best + ' 分 · 第 ' + r.attempts + ' 次挑战</div>' +
          '</div>' +
          cert +
          '<div class="card review">' +
            '<div class="review-title">答题解析</div>' +
            review +
          '</div>' +
          '<div class="quiz-actions">' +
            '<button class="btn btn-primary" id="btn-restart">重新挑战</button>' +
            '<button class="btn btn-ghost action-gap" id="btn-back">返回</button>' +
          '</div>' +
          '</div>'

        rootEl.querySelector('#btn-restart').addEventListener('click', () => {
          step = 0; selected = []; submitting = false
          Object.keys(answerMap).forEach(k => delete answerMap[k])
          renderQuiz()
          window.scrollTo(0, 0)
        })
        rootEl.querySelector('#btn-back').addEventListener('click', () => {
          if (mode === 'final') location.hash = '#/'
          else location.hash = '#/node/' + code
        })
      }
    }
  }

  function handleUnlockError(rootEl, error, mode, code) {
    const map = {
      NOT_CHECKED_IN: { title: '尚未打卡', content: '需先到该节点完成打卡，才能挑战答题。', ok: '去打卡' },
      NOT_ALL_CHECKED_IN: { title: '尚未解锁', content: '打卡全部节点后才能参加总结答题（毕业考试）。', ok: '回路线' },
      PREV_NOT_CHECKED_IN: { title: '顺序未到', content: '需先完成上一节点的打卡。', ok: '回路线' },
      NODE_NOT_FOUND: { title: '节点不存在', content: '内容已调整，请返回路线重新进入。', ok: '返回' }
    }
    const d = map[error] || { title: '取题失败', content: '请稍后重试。', ok: '返回' }
    rootEl.innerHTML = '<div class="page-center">' + UI.icon('lock', 'page-center-icon') + '<div>' + F.escapeHtml(d.title) + '</div></div>'
    UI.dialog(d.title, d.content, [{ text: d.ok, primary: true, onClick: () => {
      if (error === 'NOT_CHECKED_IN') location.hash = '#/node/' + code
      else location.hash = '#/'
    }}])
  }
})(typeof self !== 'undefined' ? self : this)
