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

  VIEWS.login = {
    mount(rootEl) {
      let mode = 'login' // 'login' | 'register'

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
                '<input class="form-input" id="auth-username" maxlength="16" placeholder="用户名" autocomplete="username">' +
                '<input class="form-input" id="auth-password" type="password" maxlength="64" placeholder="密码（6-64 位）" autocomplete="current-password">' +
                '<input class="form-input" id="auth-nickname" maxlength="20" placeholder="昵称（选填，默认同用户名）" style="display:none">' +
                '<div class="form-error" id="auth-error"></div>' +
                '<button class="btn btn-primary" type="submit" id="auth-submit">登 录</button>' +
              '</form>' +
              '<div class="login-tip">打卡进度云端保存 · 换设备不丢失</div>' +
            '</div>' +
            '<div class="login-footer">不 忘 初 心 · 牢 记 使 命</div>' +
          '</div>' +
        '</div>'

      const tabs = rootEl.querySelectorAll('.auth-tab')
      const nicknameInput = rootEl.querySelector('#auth-nickname')
      const submitBtn = rootEl.querySelector('#auth-submit')
      const errorEl = rootEl.querySelector('#auth-error')

      function setMode(m) {
        mode = m
        tabs.forEach(t => t.classList.toggle('auth-tab-active', t.dataset.mode === m))
        nicknameInput.style.display = m === 'register' ? '' : 'none'
        submitBtn.textContent = m === 'login' ? '登 录' : '注 册'
        errorEl.textContent = ''
      }

      tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)))

      rootEl.querySelector('#auth-form').addEventListener('submit', e => {
        e.preventDefault()
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
