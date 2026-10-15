/**
 * 网页版配置（与 miniprogram/config.js 同构）
 *
 * USE_MOCK=true  → 本地 mock 数据 + localStorage 进度，双击 index.html 即可运行
 * USE_MOCK=false → 预留后端接口（api.js 中返回明确错误，接入后端时实现）
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_CONFIG = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    USE_MOCK: true,          // 唯一配置点：接后端时置 false 并实现 api.js 中的 fetch 分支
    API_BASE: '',            // 预留：后端接口根地址
    CACHE_TTL: 10 * 60 * 1000
  }
})
