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

  return {
    USE_MOCK: USE_MOCK,
    API_BASE: '',            // 后端接口根地址（'' = 同源；后端部署他处时填 http://ip:port）
    CACHE_TTL: 10 * 60 * 1000
  }
})
