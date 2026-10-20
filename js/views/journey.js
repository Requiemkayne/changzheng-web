/**
 * 欢迎页（简版开场）—— 单屏：纪念徽标 + 标题 + 七节点速览 + 开始按钮
 *
 * 原「红飘带滚动叙事」多幕长页已简化：不再有滚动驱动动画、场景卡、
 * 历史/今日图片交叉淡化。文案与节点仍由 mock/journey.js 驱动，
 * 改内容只动数据文件，无需改本视图。
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const UI = root.CZ_UI
  const config = root.CZ_CONFIG
  const api = root.CZ_API

  // 出口：未登录 → 登录页；已登录 → 首页（mock 模式走登录页，可游客进入）
  function exitDest() {
    return (!config.USE_MOCK && api.isLoggedIn()) ? '#/' : '#/login'
  }

  // 金句按中文逗号断成两行，避免窄屏把词拆开；没有逗号时保持单行
  function quoteHtml(text) {
    return String(text || '')
      .split('，')
      .map(seg => F.escapeHtml(seg))
      .join('，<br>')
  }

  VIEWS.journey = {
    mount(rootEl) {
      const jd = root.CZ_MOCK_JOURNEY
      if (!jd) {
        rootEl.innerHTML = '<div class="page-center">加载失败，请刷新重试</div>'
        return
      }

      const chips = jd.nodes.map(n =>
        '<span class="welcome-chip"><b>' + String(n.order).padStart(2, '0') + '</b>' +
        F.escapeHtml(n.name) + '</span>'
      ).join('')

      rootEl.innerHTML =
        '<div class="journey welcome">' +
          '<div class="welcome-badge">纪念红军长征胜利 90 周年</div>' +
          '<h1 class="welcome-title">' + F.escapeHtml(jd.title) + '</h1>' +
          '<div class="welcome-sub">' + F.escapeHtml(jd.subtitle) + ' · 于都出发 会宁会师</div>' +
          '<div class="welcome-rule"></div>' +
          '<div class="welcome-route">' + chips + '</div>' +
          '<p class="welcome-quote">' + quoteHtml(jd.ending.text) + '</p>' +
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
