/**
 * 欢迎页（方案 A · 字碑式）—— 单屏：竖排「重走长征路」+ 竖排年份 + 出发 / 跳过
 *
 * 信息压到最少：没有徽标、节点速览、金句。标题、年份、按钮文案仍由
 * js/mock/journey.js 驱动，改内容只动数据文件。
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const UI = root.CZ_UI
  const api = root.CZ_API

  // 出口：已进入（http 登录 / mock 游客体验）→ 首页；未进入 → 登录页
  // 未进入一律走登录页：mock 模式在那里提供「游客体验」入口（js/views/login.js）
  function exitDest() {
    return api.isLoggedIn() ? '#/' : '#/login'
  }

  VIEWS.journey = {
    mount(rootEl) {
      const jd = root.CZ_MOCK_JOURNEY
      if (!jd) {
        rootEl.innerHTML = '<div class="page-center">加载失败，请刷新重试</div>'
        return
      }

      rootEl.innerHTML =
        '<div class="journey welcome welcome-stele">' +
          '<div class="stele">' +
            '<h1 class="welcome-title stele-title">' + F.escapeHtml(jd.title) + '</h1>' +
            '<div class="stele-meta">' +
              '<span class="stele-year">' + F.escapeHtml(jd.subtitle) + '</span>' +
              '<span class="stele-rule" aria-hidden="true"></span>' +
            '</div>' +
          '</div>' +
          '<div class="welcome-actions">' +
            '<button class="btn btn-primary welcome-start" id="journey-start" type="button">' +
              UI.icon('flag', 'btn-ic') + ' ' + F.escapeHtml(jd.ending.action) +
            '</button>' +
            '<button class="welcome-skip" id="journey-back" type="button">跳过</button>' +
          '</div>' +
        '</div>'

      const go = () => { location.hash = exitDest() }
      rootEl.querySelector('#journey-start').addEventListener('click', go)
      rootEl.querySelector('#journey-back').addEventListener('click', go)
    }
  }
})(typeof self !== 'undefined' ? self : this)
