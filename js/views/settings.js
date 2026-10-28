'use strict';
/**
 * 我的 · 设置页
 *
 * 「我的」页只留一张「设置」入口卡片，具体操作都收在这里：
 *   - 修改密码（学生自己改，需验证旧密码）
 *   - 退出登录（仅 http 模式；mock 模式是游客，改密码与退出都不可用）
 *
 * mock 模式：游客没有账号密码，密码/退出显示为不可用说明。
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const config = root.CZ_CONFIG
  const api = root.CZ_API
  const F = root.CZ_FORMAT
  const UI = root.CZ_UI

  function mount(rootEl, params) {
    const isMock = config.USE_MOCK

    // 先取当前用户与进度（游客模式没有 user）
    const ready = Promise.all([
      api.me().catch(() => null),
      api.getProgress().catch(() => null),
    ])

    ready.then(([me, progress]) => {
      // api.me() 直接返回 user 对象（未登录会 reject，上面已 catch 成 null）
      const user = me || null

      rootEl.innerHTML =
        '<div class="page">' +
          '<div class="settings-head">' +
            '<button class="settings-back" id="settings-back" type="button" aria-label="返回我的">' +
              UI.icon('chevron', 'settings-back-ic') +
            '</button>' +
            '<h1 class="settings-title">设 置</h1>' +
          '</div>' +

          // 账号信息
          '<div class="card settings-card">' +
            '<div class="settings-row settings-row-static">' +
              '<span class="settings-label">账号</span>' +
              '<span class="settings-value">' + (user ? F.escapeHtml(user.username) : '游客体验') + '</span>' +
            '</div>' +
          '</div>' +

          // 修改密码（游客模式不可用）
          '<div class="card settings-card">' +
            '<h2 class="settings-section">修改密码</h2>' +
            (isMock
              ? '<div class="settings-note">游客体验模式没有账号密码，登录后再来修改。</div>'
              : '<div class="settings-form">' +
                  '<input class="form-input" id="setting-old-pass" type="password" maxlength="64" placeholder="当前密码" autocomplete="current-password">' +
                  '<input class="form-input" id="setting-new-pass" type="password" maxlength="64" placeholder="新密码（6-64 位）" autocomplete="new-password">' +
                  '<input class="form-input" id="setting-new-pass2" type="password" maxlength="64" placeholder="再次输入新密码" autocomplete="new-password">' +
                  '<div class="form-error" id="setting-pass-error"></div>' +
                  '<button class="btn btn-primary" type="button" id="setting-pass-save">修改密码</button>' +
                '</div>') +
          '</div>' +

          // 退出登录（仅 http）
          (isMock ? '' :
            '<div class="card settings-card settings-card-danger">' +
              '<h2 class="settings-section">退出登录</h2>' +
              '<div class="settings-note">退出后本机回到未登录状态，进度保留在账号里，重新登录即可找回。</div>' +
              '<button class="btn btn-ghost settings-logout" type="button" id="setting-logout">退出登录</button>' +
            '</div>') +
        '</div>'

      bind(rootEl, isMock, user)
    })
  }

  function bind(rootEl, isMock, user) {
    const back = rootEl.querySelector('#settings-back')
    if (back) back.addEventListener('click', () => { location.hash = '#/profile' })

    // ---------- 修改密码 ----------
    const savePass = rootEl.querySelector('#setting-pass-save')
    if (savePass) {
      const errEl = rootEl.querySelector('#setting-pass-error')
      const showErr = (msg) => {
        if (!errEl) return
        errEl.style.color = ''
        errEl.textContent = msg
      }
      savePass.addEventListener('click', () => {
        const oldPass = rootEl.querySelector('#setting-old-pass').value
        const newPass = rootEl.querySelector('#setting-new-pass').value
        const newPass2 = rootEl.querySelector('#setting-new-pass2').value

        if (!oldPass) { showErr('请输入当前密码'); return }
        if (newPass.length < 6 || newPass.length > 64) { showErr('新密码需 6-64 位'); return }
        if (newPass !== newPass2) { showErr('两次输入的新密码不一致'); return }
        if (newPass === oldPass) { showErr('新密码不能和当前密码相同'); return }

        savePass.disabled = true
        savePass.textContent = '提交中…'
        if (errEl) errEl.textContent = ''
        api.changePassword(oldPass, newPass).then(() => {
          UI.toast('密码已修改，下次登录请用新密码')
          rootEl.querySelector('#setting-old-pass').value = ''
          rootEl.querySelector('#setting-new-pass').value = ''
          rootEl.querySelector('#setting-new-pass2').value = ''
          savePass.disabled = false
          savePass.textContent = '修改密码'
          if (errEl) {
            errEl.style.color = 'var(--ok, #2e7d32)'
            errEl.textContent = '密码已修改成功'
          }
        }).catch(err => {
          showErr((err && err.message) || '修改失败，请重试')
          savePass.disabled = false
          savePass.textContent = '修改密码'
        })
      })
    }

    // ---------- 退出登录 ----------
    const logoutBtn = rootEl.querySelector('#setting-logout')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        UI.dialog('退出登录', '退出后本机将回到未登录状态，进度保留在账号里，重新登录即可找回。', [
          { text: '取消' },
          { text: '退出', primary: true, onClick: () => {
            api.logout().then(() => {
              UI.toast('已退出')
              location.hash = '#/login'
            })
          } },
        ])
      })
    }
  }

  VIEWS.settings = { mount }
})(typeof self !== 'undefined' ? self : this)
