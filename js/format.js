/** 时间格式化 + HTML 转义（网页版） */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_FORMAT = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function pad(n) {
    return n < 10 ? '0' + n : '' + n
  }

  /** 时间戳 → 2025年1月5日 */
  function formatDate(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
  }

  /** 时间戳 → 2025-01-05 */
  function formatDateShort(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  /** 时间戳 → 2025年1月5日 14:30 */
  function formatDateTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return formatDate(ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  /**
   * HTML 转义 —— 所有内容文案渲染前必过此函数。
   * 文案组内容可能含 < > & " 等字符，防止注入/标签错乱。
   */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  return { formatDate, formatDateShort, formatDateTime, escapeHtml }
})
