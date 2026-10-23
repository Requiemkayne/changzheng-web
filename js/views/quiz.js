/**
 * 答题页 —— 节点关卡 / 总结答题（毕业考试）共用
 * 步进式一屏一题：单选/判断点击即选，多选切换；提交后逐题解析；final 通过渲染毕业证书
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const UI = root.CZ_UI

  // 返回：优先浏览器后退；直接打开的入口页（history 里没有站内上一页，或来自站外）退回首页，别把用户卡在原地
  function goBack() {
    const ref = document.referrer || ''
    const fromOtherSite = ref !== '' && ref.indexOf(location.origin) !== 0
    if (history.length > 1 && !fromOtherSite) history.back()
    else location.hash = '#/'
  }

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
      let isLastNode = false   // 是否 11 节点中的最后一个（完成答题后直达总分结算页）

      rootEl.innerHTML = '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>正在出题…</div></div>'

      Promise.all([api.getQuiz(mode, code), api.getNodes()]).then(([r, nodes]) => {
        if (!r.ok) return handleUnlockError(rootEl, r.error, mode, code)
        questions = r.questions
        meta = r.meta
        isLastNode = mode === 'node' && Array.isArray(nodes) && nodes.length > 0 &&
          nodes[nodes.length - 1].code === code
        startTimer()
        renderQuiz()
      }).catch(err => {
        console.error('取题失败', err)
        rootEl.innerHTML =
          '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>取题失败，请返回重试</div>' +
          '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
      })

      /* ---------- 答题态 ---------- */

      // 毕业考总限时：开始时间写 sessionStorage，刷新后接着算，不让人靠刷新重来
      const FINAL_KEY = 'cz_final_started_at'
      let deadline = 0
      let timerId = null
      let disposed = false

      function goStep(n) {
        if (n < 0 || n >= questions.length) return
        answerMap[step] = selected.slice()
        step = n
        selected = (answerMap[n] || []).slice()
        renderQuiz()
        try { window.scrollTo(0, 0) } catch (e) {}
      }

      function answeredCount() {
        let n = 0
        for (let i = 0; i < questions.length; i++) {
          const cur = i === step ? selected : answerMap[i]
          if (cur && cur.length) n++
        }
        return n
      }

      function fmtTime(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000))
        const m = Math.floor(total / 60)
        const s = total % 60
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
      }

      function timeLimit() {
        // 配置可能被旧缓存盖住（CACHE_TTL 内），毕业考无论如何按 3 分钟兜底
        if (mode !== 'final') return 0
        return Number(meta.timeoutMs) > 0 ? Number(meta.timeoutMs) : 3 * 60 * 1000
      }

      function startTimer() {
        const limit = timeLimit()
        if (!limit || timerId) return
        let started = Number(sessionStorage.getItem(FINAL_KEY) || 0)
        const now = Date.now()
        // 超过 12 小时的旧记录视为过期，重新计时
        if (!started || now - started > 12 * 60 * 60 * 1000) {
          started = now
          try { sessionStorage.setItem(FINAL_KEY, String(started)) } catch (e) {}
        }
        deadline = started + limit
        tick()
        timerId = setInterval(tick, 500)
      }

      function tick() {
        if (disposed) return
        const remain = deadline - Date.now()
        const el = rootEl.querySelector('#quiz-timer')
        if (el) {
          el.textContent = fmtTime(remain)
          if (remain <= 30000) el.classList.add('is-urgent')
          if (remain <= 0) el.textContent = '00:00'
        }
        if (remain <= 0 && !submitting) {
          stopTimer()
          submit(true)
        }
      }

      function stopTimer() {
        if (timerId) { clearInterval(timerId); timerId = null }
      }

      function renderQuiz() {
        const q = questions[step]
        const typeText = q.type === 'multiple' ? '多选题' : q.type === 'judge' ? '判断题' : '单选题'
        const isLast = step >= questions.length - 1
        const percent = Math.round((step + 1) / questions.length * 100)
        const done = answeredCount()
        const remain = deadline ? deadline - Date.now() : timeLimit()

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
          '<button type="button" class="back-link">‹ 返回</button>' +
          '<div class="quiz-head">' +
            '<div class="quiz-title">' + F.escapeHtml(meta.title) + '</div>' +
            '<div class="quiz-sub">' + F.escapeHtml(meta.subtitle) + '</div>' +
            '<div class="quiz-topbar">' +
              '<button type="button" class="sheet-btn" id="btn-sheet">' +
                UI.icon('list') + '答题卡' +
                '<span class="sheet-count">' + done + '/' + questions.length + '</span>' +
              '</button>' +
              (mode === 'final'
                ? '<div class="quiz-timer' + (remain <= 30000 ? ' is-urgent' : '') + '" id="quiz-timer" role="timer" aria-label="剩余时间">' +
                    fmtTime(remain) + '</div>'
                : '') +
            '</div>' +
            '<div class="progress-track"><div class="progress-inner" style="width:' + percent + '%"></div></div>' +
            '<div class="progress-num">' + (step + 1) + ' / ' + questions.length + '</div>' +
          '</div>' +
          '<div class="card">' +
            '<span class="q-type-tag">' + typeText + '</span>' +
            '<div class="q-text">' + F.escapeHtml(q.question) + '</div>' +
            options +
          '</div>' +
          '<div class="quiz-actions quiz-nav">' +
            '<button class="btn btn-ghost" id="btn-prev"' + (step === 0 ? ' disabled' : '') + '>上一题</button>' +
            '<button class="btn btn-primary' + (submitting ? ' btn-loading' : '') + '" id="btn-next"' + (submitting ? ' disabled' : '') + '>' +
              (submitting ? '提交中…' : (isLast ? '提交答卷' : '下一题')) +
            '</button>' +
          '</div>' +
          '</div>'

        bindQuiz()
      }

      function bindQuiz() {
        const backBtn = rootEl.querySelector('.back-link')
        if (backBtn) backBtn.addEventListener('click', goBack)

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
            answerMap[step] = selected.slice()   // 选完就记，答题卡实时反映
            renderQuiz()
          })
        })

        const prev = rootEl.querySelector('#btn-prev')
        if (prev) prev.addEventListener('click', () => goStep(step - 1))

        const next = rootEl.querySelector('#btn-next')
        if (next) {
          next.addEventListener('click', () => {
            answerMap[step] = selected.slice()
            if (step < questions.length - 1) goStep(step + 1)
            else submit(false)
          })
        }

        const sheetBtn = rootEl.querySelector('#btn-sheet')
        if (sheetBtn) sheetBtn.addEventListener('click', openSheet)
      }

      /* ---------- 答题卡 ---------- */
      function openSheet() {
        answerMap[step] = selected.slice()
        const done = answeredCount()
        const cells = questions.map((_, i) => {
          const cur = i === step ? selected : answerMap[i]
          const has = cur && cur.length
          return '<button type="button" class="sheet-cell' + (has ? ' is-done' : '') +
            (i === step ? ' is-current' : '') + '" data-jump="' + i + '"' +
            ' aria-label="第' + (i + 1) + '题' + (has ? '，已答' : '，未答') + '">' +
            (i + 1) + '</button>'
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

      function submit(auto) {
        if (submitting) return
        answerMap[step] = selected.slice()
        const left = questions.length - answeredCount()
        // 超时自动交卷，或已全部作答：直接提交
        if (auto || left === 0) { doSubmit(auto); return }
        UI.dialog('还有题目没答',
          '还有 ' + left + ' 题未作答，未作答按 0 分计。确定现在交卷吗？',
          [
            { text: '继续答题', primary: false, onClick: () => {} },
            { text: '确定交卷', primary: true, onClick: () => doSubmit(false) }
          ])
      }

      function doSubmit(auto) {
        submitting = true
        stopTimer()
        renderQuiz()
        const answers = questions.map((q, i) => ({ id: q.id, answer: answerMap[i] || [] }))
        api.submitQuiz(mode, code, answers).then(r => {
          if (!r.ok) return handleUnlockError(rootEl, r.error, mode, code)
          try { sessionStorage.removeItem(FINAL_KEY) } catch (e) {}
          renderResult(r, auto)
        }).catch(err => {
          console.error('提交失败', err)
          submitting = false
          UI.toast('提交失败，请重试')
          renderQuiz()
        })
      }

      /* ---------- 结果态 ---------- */

      function renderResult(r, auto) {
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
                '<h2 class="cert-title">结业证书</h2>' +
                '<div class="cert-line" aria-hidden="true"></div>' +
                '<div class="cert-text">重走长征路 · 传承长征魂</div>' +
                '<div class="cert-text">已走完全部 11 个节点并完成总结答题</div>' +
                '<div class="cert-score">毕业得分 ' + r.score + ' 分</div>' +
                (root.CZ_SPIRIT && root.CZ_SPIRIT.quote
                  ? '<div class="cert-quote">' + F.escapeHtml(root.CZ_SPIRIT.quote) + '<div class="cert-quote-src">—— 习近平</div></div>'
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
          '<button type="button" class="back-link">‹ 返回节点列表</button>' +
          '<div class="result-hero ' + (r.passed ? 'hero-passed' : 'hero-failed') + '">' +
            stamp +
            '<h1 class="result-title">' + (r.passed ? '恭喜通关' : '差一点，再试一次') + '</h1>' +
            '<div class="result-score" role="img" aria-label="本场得分 ' + r.score + ' 分"><span class="score-num">' + r.score + '</span><span class="score-unit">分</span></div>' +
            '<div class="result-detail">答对 ' + r.correctCount + ' / ' + r.total + ' 题 · 历史最佳 ' + r.best + ' 分 · 第 ' + r.attempts + ' 次挑战</div>' +
          '</div>' +
          cert +
          '<div class="card review">' +
            '<h2 class="review-title">答题解析</h2>' +
            review +
          '</div>' +
          '<div class="quiz-actions">' +
            (mode === 'node'
              ? '<a class="btn btn-primary" href="' + (isLastNode ? '#/result' : '#/') + '">' +
                (isLastNode ? '查看总分结算' : '返回节点列表') + '</a>'
              : '<a class="btn btn-primary" href="#/">返回首页</a>') +
            '<button class="btn btn-ghost action-gap" id="btn-restart">重新挑战</button>' +
          '</div>' +
          '</div>'

        // 返回列表：用 button 而非 <a href>，history 为空时也能正确回跳
        const backBtnResult = rootEl.querySelector('.back-link')
        if (backBtnResult) {
          backBtnResult.addEventListener('click', () => { location.hash = '#/' })
        }

        // 超时交卷时给一句说明，避免用户不知道发生了什么
        if (auto) {
          const tip = document.createElement('div')
          tip.className = 'quiz-timeup-tip'
          tip.textContent = '答题时间到，已自动交卷。'
          const hero = rootEl.querySelector('.result-hero')
          if (hero && hero.parentNode) hero.parentNode.insertBefore(tip, hero.nextSibling)
        }

        rootEl.querySelector('#btn-restart').addEventListener('click', () => {
          step = 0; selected = []; submitting = false
          Object.keys(answerMap).forEach(k => delete answerMap[k])
          stopTimer()
          deadline = 0
          try { sessionStorage.removeItem(FINAL_KEY) } catch (e) {}
          startTimer()
          renderQuiz()
          window.scrollTo(0, 0)
        })
      }

      // 离开页面：清掉倒计时，避免它在后台继续跑
      return () => {
        disposed = true
        stopTimer()
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
    rootEl.innerHTML = '<div class="page-center">' + UI.icon('lock', 'page-center-icon') + '<h1 class="page-center-title" style="font:inherit;margin:0">' + F.escapeHtml(d.title) + '</h1></div>'
    UI.dialog(d.title, d.content, [{ text: d.ok, primary: true, onClick: () => {
      if (error === 'NOT_CHECKED_IN') location.hash = '#/node/' + code
      else location.hash = '#/'
    }}])
  }
})(typeof self !== 'undefined' ? self : this)
