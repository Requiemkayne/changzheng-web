/**
 * 地图页 —— 内联 SVG 长征路线图（零联网零依赖，不加载世界地图）
 * 11 节点按真实经纬度等距投影（equirectangular）绘制：
 *   宣纸底纹 + 金网格 + 双金框 + 红金路线 + 四态节点 + 起终点五角星
 * 点击节点 → 节点详情；底部快切条高亮对应节点
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const progressUtil = root.CZ_PROGRESS
  const UI = root.CZ_UI

  VIEWS.map = {
    mount(rootEl) {
      rootEl.innerHTML = '<div class="page-center">' + UI.icon('map', 'page-center-icon') + '<div>加载中…</div></div>'

      Promise.all([api.getConfig(), api.getNodes(), api.getProgress()])
        .then(([config, nodes, progress]) => {
          const states = progressUtil.computeStates(nodes, progress, config)
          renderMap(rootEl, nodes, states)
        })
        .catch(err => {
          console.error('地图页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center">' + UI.icon('map', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
    }
  }

  /* ---------- 投影与配色 ---------- */

  const W = 360, H = 520            // viewBox 尺寸
  const PAD_X = 42, PAD_Y = 56      // 边距（给标签留空间）
  // 实际范围：lng 102.23~116.03，lat 25.53~35.68（含留白放大）
  const LNG_MIN = 101.2, LNG_MAX = 117.1
  const LAT_MIN = 24.6, LAT_MAX = 36.6

  function px(n) {
    return PAD_X + (n.location.longitude - LNG_MIN) / (LNG_MAX - LNG_MIN) * (W - 2 * PAD_X)
  }
  function py(n) {
    return PAD_Y + (LAT_MAX - n.location.latitude) / (LAT_MAX - LAT_MIN) * (H - 2 * PAD_Y)
  }

  // 节点四态配色（与图例一致）
  const NODE_STYLE = {
    open:      { fill: '#FFF6E2', stroke: '#A8182C', text: '#A8182C' },
    checkedIn: { fill: '#A8182C', stroke: '#E8C86A', text: '#FFF4DC' },
    quizPassed:{ fill: '#C9A227', stroke: '#FFFFFF', text: '#6E0918' },
    locked:    { fill: '#B7AD97', stroke: '#FFFFFF', text: '#F7F2E7' }
  }

  /* ---------- 渲染 ---------- */

  function renderMap(rootEl, nodes, states) {
    const pts = nodes.map((n, i) => ({
      node: n,
      i,
      x: px(n),
      y: py(n),
      st: states.byCode[n.code]
    }))

    const polyline = pts.map(p => p.x + ',' + p.y).join(' ')

    // 节点：圆 + 序号；起终点加五角星（自绘 path，不用字形）
    // 五角星以 (x, y) 为中心，r≈13：24 系标准星形缩放 1.3
    const star = (x, y, cls) =>
      '<path class="map-star ' + cls + '" d="M12 2 6.12 20.09 21.51 8.91 2.49 8.91 17.88 20.09Z" ' +
      'transform="translate(' + x + ',' + y + ') scale(1.3) translate(-12,-12)"/>'
    let nodesHtml = ''
    pts.forEach(p => {
      const s = NODE_STYLE[p.st.state] || NODE_STYLE.open
      const labelAbove = p.i % 2 === 0
      const ly = labelAbove ? p.y - 26 : p.y + 29
      nodesHtml +=
        '<g class="map-node" data-code="' + p.node.code + '" data-i="' + p.i + '">' +
          (p.i === 0 ? star(p.x, p.y - 34, 'map-star-start') : '') +
          (p.i === nodes.length - 1 ? star(p.x, p.y - 34, 'map-star-end') : '') +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="15" fill="' + s.fill + '" stroke="' + s.stroke + '" stroke-width="2.5"/>' +
          '<text class="map-num" x="' + p.x + '" y="' + (p.y + 4.5) + '" fill="' + s.text + '">' + p.node.order + '</text>' +
          '<text class="map-label" x="' + p.x + '" y="' + ly + '">' + F.escapeHtml(p.node.name) + '</text>' +
        '</g>'
    })

    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="map-title">' +
          '<div class="map-title-cn">长征路线图</div>' +
          '<div class="map-title-sub">瑞金出发 · 会宁会师 · 两万五千里</div>' +
        '</div>' +
        '<div class="map-frame">' +
          '<svg class="map-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
            '<defs>' +
              '<pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">' +
                '<path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(201,162,39,0.10)" stroke-width="1"/>' +
              '</pattern>' +
            '</defs>' +
            '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="url(#grid)"/>' +
            '<rect class="map-frame-outer" x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" rx="8"/>' +
            '<rect class="map-frame-inner" x="13" y="13" width="' + (W - 26) + '" height="' + (H - 26) + '" rx="5"/>' +
            '<polyline class="map-route" points="' + polyline + '"/>' +
            '<polyline class="map-route-gold" points="' + polyline + '"/>' +
            nodesHtml +
          '</svg>' +
        '</div>' +
        '<div class="map-legend">' +
          '<span><i class="legend-open"></i>待打卡</span>' +
          '<span><i class="legend-checked"></i>已打卡</span>' +
          '<span><i class="legend-passed"></i>已通关</span>' +
          '<span><i class="legend-locked"></i>未解锁</span>' +
        '</div>' +
        '<div class="map-strip" id="map-strip"></div>' +
      '</div>'

    // 节点点击 → 详情
    rootEl.querySelectorAll('.map-node').forEach(g => {
      g.addEventListener('click', () => { location.hash = '#/node/' + g.dataset.code })
    })

    // 底部快切条：高亮对应节点
    const strip = rootEl.querySelector('#map-strip')
    strip.innerHTML = nodes.map((n, i) =>
      '<div class="map-chip" data-i="' + i + '">' + n.order + ' ' + F.escapeHtml(n.name) + '</div>'
    ).join('')
    strip.addEventListener('click', e => {
      const chip = e.target.closest('.map-chip')
      if (!chip) return
      const i = Number(chip.dataset.i)
      strip.querySelectorAll('.map-chip').forEach(c => c.classList.toggle('chip-active', c === chip))
      rootEl.querySelectorAll('.map-node').forEach(g => {
        g.classList.toggle('map-node-hl', Number(g.dataset.i) === i)
      })
    })
  }
})(typeof self !== 'undefined' ? self : this)
