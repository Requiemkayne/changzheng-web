/**
 * 登录页 —— 第一屏（http 模式未登录时强制进入）
 * 艺术化全屏：深红夜空 + 闪烁星点 + 层叠山峦 + 金框纸感表单卡
 * 登录/注册成功后跳 #/（首页）
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const UI = root.CZ_UI
  const config = root.CZ_CONFIG

  VIEWS.login = {
    mount(rootEl) {
      let mode = 'login' // 'login' | 'register'
      // 静态托管（mock 模式）没有后端，账号体系不可用 → 提供游客入口；
      // http 模式（真后端）保持原有登录/注册流程，不出现该入口
      const isMock = !!(config && config.USE_MOCK)

      rootEl.innerHTML =
        '<div class="login-page">' +
          '<div class="login-stars"></div>' +
          '<div class="login-mtn login-mtn-1"></div>' +
          '<div class="login-mtn login-mtn-2"></div>' +
          '<div class="login-mtn login-mtn-3"></div>' +
          '<div class="login-content">' +
            '<div class="login-brand">' +
              '<span class="login-star">' + UI.icon('star') + '</span>' +
              '<div class="login-title">重走长征路</div>' +
              '<div class="login-hairline"></div>' +
              '<div class="login-sub">十一个关键节点 · 传承长征精神</div>' +
            '</div>' +
            '<div class="login-card">' +
              '<div class="auth-tabs">' +
                '<div class="auth-tab auth-tab-active" data-mode="login">登录</div>' +
                '<div class="auth-tab" data-mode="register">注册</div>' +
              '</div>' +
              '<form id="auth-form">' +
                '<input class="form-input" id="auth-username" maxlength="8" inputmode="numeric" placeholder="8 位学号" autocomplete="username">' +
                '<input class="form-input" id="auth-password" type="password" maxlength="64" placeholder="密码（6-64 位）" autocomplete="current-password">' +
                '<input class="form-input" id="auth-nickname" maxlength="20" placeholder="昵称（选填，默认同用户名）" style="display:none">' +
                '<div class="form-error" id="auth-error"></div>' +
                '<div class="forgot-area" id="forgot-area">' +
                  '<button class="forgot-link" id="forgot-link" type="button">忘记密码？</button>' +
                '</div>' +
                '<div class="forgot-panel" id="forgot-panel">' +
                  '<div class="forgot-tip">提交后由老师统一处理，重置后的密码为 <b>111111</b></div>' +
                  '<input class="form-input" id="forgot-note" maxlength="100" placeholder="补充说明（选填，如：高二3班 张三）">' +
                  '<div class="forgot-actions">' +
                    '<button class="btn btn-primary" type="button" id="forgot-submit">提交申请</button>' +
                    '<button class="btn btn-ghost" type="button" id="forgot-cancel">取消</button>' +
                  '</div>' +
                  '<div class="form-error" id="forgot-error"></div>' +
                '</div>' +
                '<button class="btn btn-primary" type="submit" id="auth-submit">登 录</button>' +
                (isMock
                  ? '<button class="btn btn-ghost action-gap" type="button" id="guest-entry">游客体验 · 先随便看看</button>'
                  : '') +
              '</form>' +
              '<div class="login-tip">' +
                (isMock ? '游客体验无需账号 · 进度保存在本机浏览器' : '打卡进度云端保存 · 换设备不丢失') +
              '</div>' +
            '</div>' +
            '<div class="login-footer">不 忘 初 心 · 牢 记 使 命</div>' +
          '</div>' +
        '</div>'

      const tabs = rootEl.querySelectorAll('.auth-tab')
      const nicknameInput = rootEl.querySelector('#auth-nickname')
      const submitBtn = rootEl.querySelector('#auth-submit')
      const errorEl = rootEl.querySelector('#auth-error')

      const passwordInput = rootEl.querySelector('#auth-password')
      const INITIAL_PASSWORD = '111111'   // 与学校约定：新账号初始密码固定 111111，首次登录后请提醒学生自行修改

      function setMode(m) {
        mode = m
        tabs.forEach(t => t.classList.toggle('auth-tab-active', t.dataset.mode === m))
        nicknameInput.style.display = m === 'register' ? '' : 'none'
        submitBtn.textContent = m === 'login' ? '登 录' : '注 册'
        errorEl.textContent = ''
        // 注册模式下预填初始密码，登录模式清空，避免把初始密码带进正式登录
        if (passwordInput) passwordInput.value = m === 'register' ? INITIAL_PASSWORD : ''
        if (mode === 'register') {
          errorEl.textContent = '账号填写 8 位学号，初始密码 111111（登录后请自行修改）'
          errorEl.style.color = ''
        }
        const forgotArea = rootEl.querySelector('#forgot-area')
        const forgotPanel = rootEl.querySelector('#forgot-panel')
        if (forgotArea) forgotArea.style.display = (m === 'login' && !isMock) ? 'block' : 'none'
        if (forgotPanel) forgotPanel.style.display = 'none'
      }

      tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)))

      /* ---------- 忘记密码 ---------- */
      const forgotLink = rootEl.querySelector('#forgot-link')
      const forgotPanel = rootEl.querySelector('#forgot-panel')
      const forgotSubmit = rootEl.querySelector('#forgot-submit')
      const forgotCancel = rootEl.querySelector('#forgot-cancel')
      const forgotError = rootEl.querySelector('#forgot-error')

      if (forgotLink) {
        forgotLink.addEventListener('click', () => {
          // 必须先在登录表单里填好 8 位学号，才允许展开找回面板：
          // 否则学生会在面板里乱点，最后提交时才发现学号没填。
          const usernameInput = rootEl.querySelector('#auth-username')
          const u = usernameInput ? usernameInput.value.trim() : ''
          if (!/^\d{8}$/.test(u)) {
            if (errorEl) {
              errorEl.style.color = ''
              errorEl.textContent = '请先在上方「8 位学号」里填写你的学号，再点忘记密码'
            }
            if (usernameInput) {
              usernameInput.focus()
              usernameInput.classList.add('input-shake')
              setTimeout(() => usernameInput.classList.remove('input-shake'), 500)
            }
            return
          }
          if (forgotPanel) forgotPanel.style.display = 'block'
          if (forgotError) forgotError.textContent = ''
          // 把学号带进面板，避免重复输入
          const noteInput = rootEl.querySelector('#forgot-note')
          if (noteInput) noteInput.placeholder = '补充说明（选填，如：高二3班 张三）'
          if (errorEl) errorEl.textContent = ''
        })
      }
      if (forgotCancel) {
        forgotCancel.addEventListener('click', () => {
          if (forgotPanel) forgotPanel.style.display = 'none'
        })
      }
      if (forgotSubmit) {
        forgotSubmit.addEventListener('click', () => {
          const username = rootEl.querySelector('#auth-username').value.trim()
          const noteInput = rootEl.querySelector('#forgot-note')
          const note = noteInput ? noteInput.value.trim() : ''
          if (!/^\d{8}$/.test(username)) {
            if (forgotError) forgotError.textContent = '请先在上方填写 8 位学号'
            return
          }
          forgotSubmit.disabled = true
          forgotSubmit.textContent = '提交中…'
          api.forgotPassword(username, note).then(r => {
            if (forgotError) {
              forgotError.style.color = 'var(--ok, #2e7d32)'
              forgotError.textContent = (r && r.message) || '已提交，请等待老师处理'
            }
            forgotSubmit.textContent = '已提交'
            setTimeout(() => { if (forgotPanel) forgotPanel.style.display = 'none' }, 2500)
          }).catch(err => {
            if (forgotError) {
              forgotError.style.color = ''
              forgotError.textContent = err.message || '提交失败，请重试'
            }
            forgotSubmit.disabled = false
            forgotSubmit.textContent = '提交申请'
          })
        })
      }

      // 游客体验：建立本地游客态 → 进首页（mock 模式下登录页唯一的可用出口）
      const guestBtn = rootEl.querySelector('#guest-entry')
      if (guestBtn) {
        guestBtn.addEventListener('click', () => {
          api.guestLogin().then(() => {
            UI.toast('已进入游客体验')
            if (location.hash === '' || location.hash === '#' || location.hash === '#/') {
              root.CZ_ROUTER.refresh()
            } else {
              location.hash = '#/'
            }
          }).catch(err => {
            errorEl.textContent = (err && err.message) || '进入失败，请重试'
          })
        })
      }

      rootEl.querySelector('#auth-form').addEventListener('submit', e => {
        e.preventDefault()
        // mock 模式没有后端账号：不发起请求，直接引导走游客入口
        if (isMock) {
          errorEl.textContent = '当前为游客体验模式，请点击下方「游客体验」进入'
          return
        }
        const username = rootEl.querySelector('#auth-username').value.trim()
        const password = rootEl.querySelector('#auth-password').value
        const nickname = nicknameInput.value.trim()
        errorEl.textContent = ''
        submitBtn.disabled = true
        submitBtn.classList.add('btn-loading')
        submitBtn.textContent = mode === 'login' ? '登录中…' : '注册中…'

        const action = mode === 'login'
          ? api.login(username, password)
          : api.register(username, password, nickname)

        action.then(r => {
          UI.toast(mode === 'login' ? '欢迎回来，' + F.escapeHtml(r.user.nickname) : '注册成功')
          // 进入首页：hash 已为 #/ 时 hashchange 不触发，直接强制重渲染
          if (location.hash === '' || location.hash === '#' || location.hash === '#/') {
            root.CZ_ROUTER.refresh()
          } else {
            location.hash = '#/'
          }
        }).catch(err => {
          console.error('认证失败', err)
          errorEl.textContent = err.message || '操作失败，请重试'
          submitBtn.disabled = false
          submitBtn.classList.remove('btn-loading')
          submitBtn.textContent = mode === 'login' ? '登 录' : '注 册'
        })
      })
    }
  }
})(typeof self !== 'undefined' ? self : this)
