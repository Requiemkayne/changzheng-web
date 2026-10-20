/**
 * 网页版配置（与 miniprogram/config.js 同构）
 *
 * USE_MOCK 运行时自动判定：
 *   mock 模式  → file:// 双击打开 / GitHub Pages / ?mock=1 强制
 *   http 模式  → 通过 node server/server.js 访问（http://localhost:8088），?http=1 强制
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_CONFIG = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  let USE_MOCK = false

  // 仅浏览器环境探测；Node（server / test）按 false 处理
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search)
    if (q.get('mock') === '1') {
      USE_MOCK = true
    } else if (q.get('http') === '1') {
      USE_MOCK = false
    } else {
      // 静态托管环境（无后端）：file:// 或 GitHub Pages → mock
      USE_MOCK = location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)
    }
  }

  /* ================= 开发用：演示账号自动登录（默认关闭） =================
   * 默认 null → 正式行为：http 模式未登录一律进登录页。
   * 本地免登录预览：URL 加 ?demo=1（如 http://localhost:8088/?demo=1）。
   * ⚠ 账号密码写在前端，因此仅在本地/内网地址生效；
   *   公网域名（部署后）即使带 ?demo=1 也不会启用，避免被人直接登进演示账号。
   */
  let DEV_AUTO_LOGIN = null
  const HOST = (typeof location !== 'undefined' && location.hostname) || ''
  const IS_LOCAL_HOST = HOST === 'localhost' ||
    /^127\./.test(HOST) ||
    HOST === '::1' || HOST === '[::1]' ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(HOST)
  if (typeof location !== 'undefined' && IS_LOCAL_HOST &&
      new URLSearchParams(location.search).get('demo') === '1') {
    DEV_AUTO_LOGIN = { username: 'demo', password: 'demo1234', nickname: '演示用户' }
  }

  return {
    USE_MOCK: USE_MOCK,
    API_BASE: '',            // 后端接口根地址（'' = 同源；后端部署他处时填 http://ip:port）
    CACHE_TTL: 10 * 60 * 1000,
    DEV_AUTO_LOGIN: DEV_AUTO_LOGIN   // 见上方说明，默认关闭
  }
})
