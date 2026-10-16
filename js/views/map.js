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
    open:      { fill: '#FFF6E2', stroke: '#821626', text: '#821626' },
    checkedIn: { fill: '#821626', stroke: '#E8C86A', text: '#FFF4DC' },
    quizPassed:{ fill: '#C6A343', stroke: '#FFFFFF', text: '#6E0918' },
    locked:    { fill: '#B7AD97', stroke: '#FFFFFF', text: '#F7F2E7' }
  }

  /* ---------- 简化地理底图（示意，非精确边界） ---------- */

  const geo = (lng, lat) => [px({ location: { longitude: lng, latitude: lat } }), py({ location: { longitude: lng, latitude: lat } })]
  const geoPath = segs => 'M' + segs.map(s => geo(s[0], s[1]).join(',')).join('L')

  // 省界示意（虚线淡金，仅表方位，不表精确边界）
  const PROVINCE_LINES = [
    [[114.0, 25.6], [113.8, 26.8], [114.2, 28.4]],        // 赣湘界
    [[109.6, 26.2], [109.2, 27.2], [108.9, 28.4]],        // 湘黔界
    [[104.8, 25.8], [104.4, 26.8], [103.8, 27.8]],        // 黔滇界
    [[102.8, 27.8], [103.2, 28.3], [103.9, 28.6]],        // 川滇界
    [[103.0, 33.4], [105.0, 33.7], [107.0, 33.9]]         // 川甘界
  ].map(geoPath)

  // 河流示意
  const RIVERS = [
    geoPath([[103.0, 26.2], [103.4, 27.2], [103.1, 28.4], [103.5, 29.4]]),   // 金沙江
    geoPath([[112.7, 25.8], [112.9, 27.0], [113.1, 28.3]]),                  // 湘江
    geoPath([[102.3, 29.3], [102.8, 29.5], [103.3, 29.4]])                   // 大渡河
  ]

  // 山脉示意（小三角符号）
  const MOUNTAINS = [
    [102.7, 31.2], [103.6, 30.8], [104.2, 32.0],        // 夹金山 / 岷山
    [106.2, 35.2], [105.8, 34.6]                          // 六盘山
  ].map(m => geo(m[0], m[1]))

  /* ---------- 渲染 ---------- */

  function renderMap(rootEl, nodes, states) {
    const pts = nodes.map((n, i) => ({
      node: n,
      i,
      x: px(n),
      y: py(n),
      st: states.byCode[n.code]
    }))

    // 路线 d（隐藏 path：供描线动画与星火 animateMotion 引用）
    const routeD = 'M' + pts.map(p => p.x + ',' + p.y).join('L')

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
        '<g class="map-node" data-code="' + p.node.code + '" data-i="' + p.i + '" style="animation-delay:' + (1.35 + p.i * 0.15) + 's">' +
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
            // 简化地理底图（省界 / 河流 / 山脉，示意性）
            PROVINCE_LINES.map(d => '<path class="map-province" d="' + d + '"/>').join('') +
            RIVERS.map(d => '<path class="map-river" d="' + d + '"/>').join('') +
            MOUNTAINS.map(m =>
              '<path class="map-mountain" d="M' + (m[0] - 7) + ' ' + (m[1] + 4) + ' L' + m[0] + ' ' + (m[1] - 6) + ' L' + (m[0] + 7) + ' ' + (m[1] + 4) + ' Z"/>'
            ).join('') +
            '<path id="mapRoutePath" d="' + routeD + '" fill="none" stroke="none"/>' +
            '<polyline class="map-route" points="' + polyline + '"/>' +
            '<polyline class="map-route-gold" points="' + polyline + '"/>' +
            '<circle class="map-spark" r="5" fill="#E8C86A">' +
              '<animateMotion dur="2.1s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="linear">' +
                '<mpath href="#mapRoutePath"/>' +
              '</animateMotion>' +
            '</circle>' +
            nodesHtml +
          '</svg>' +
        '</div>' +
        '<div class="map-replay-wrap"><button class="btn btn-mini btn-mini-ghost" id="map-replay" type="button">' + UI.icon('replay', 'map-replay-ic') + ' 重播行军动画</button></div>' +
        '<div class="map-legend">' +
          '<span><i class="legend-route"></i>行军路线</span>' +
          '<span><i class="legend-open"></i>待打卡</span>' +
          '<span><i class="legend-checked"></i>已打卡</span>' +
          '<span><i class="legend-passed"></i>已通关</span>' +
          '<span><i class="legend-locked"></i>未解锁</span>' +
        '</div>' +
        '<div class="map-float" id="map-float"></div>' +
        '<div class="map-strip" id="map-strip"></div>' +
        '<div class="map-note">路线示意图（省界河流为示意，非精确边界）</div>' +
      '</div>'

    // 行军动画：初始播放一次，可重播（prefers-reduced-motion 时直接静态）
    const svg = rootEl.querySelector('.map-svg')
    const goldLine = rootEl.querySelector('.map-route-gold')
    const spark = rootEl.querySelector('.map-spark')
    const routePath = rootEl.querySelector('#mapRoutePath')
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function playMarch() {
      if (reduced) return
      const len = routePath.getTotalLength()
      goldLine.style.strokeDasharray = len
      goldLine.style.strokeDashoffset = len
      svg.classList.remove('map-anim')
      void svg.getBoundingClientRect()   // 强制回流，重启动画
      svg.classList.add('map-anim')
      spark.querySelector('animateMotion').beginElement()
    }
    playMarch()
    rootEl.querySelector('#map-replay').addEventListener('click', playMarch)

    // 节点点击 → 详情浮窗（查看详情跳节点页）
    const float = rootEl.querySelector('#map-float')
    function showFloat(i) {
      const p = pts[i]
      const st = p.st
      const badge = UI.badgeHTML(st.state)
      const detailBtn = st.state === 'locked'
        ? '<span class="map-float-locked">' + UI.icon('lock', '') + ' 完成前一节点后解锁</span>'
        : '<button class="btn btn-primary btn-mini" id="map-float-detail">查看详情</button>'
      float.innerHTML =
        '<div class="map-float-card card">' +
          '<div class="map-float-head">' +
            '<div class="map-float-order">' + p.node.order + '</div>' +
            '<div style="flex:1">' +
              '<div class="map-float-name">' + F.escapeHtml(p.node.name) + '</div>' +
              '<div class="map-float-meta">' + F.escapeHtml(p.node.date) + ' · ' + F.escapeHtml(p.node.location.name) + '</div>' +
            '</div>' +
            badge +
          '</div>' +
          '<div class="map-float-sub">' + F.escapeHtml(p.node.summary) + '</div>' +
          '<div class="map-float-actions">' + detailBtn + '</div>' +
        '</div>'
      float.style.display = 'block'
      const btn = float.querySelector('#map-float-detail')
      if (btn) btn.addEventListener('click', () => { location.hash = '#/node/' + p.node.code })
      float.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    rootEl.querySelectorAll('.map-node').forEach(g => {
      g.addEventListener('click', () => showFloat(Number(g.dataset.i)))
    })

    // 底部快切条：高亮对应节点 + 弹浮窗
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
      showFloat(i)
    })
  }
})(typeof self !== 'undefined' ? self : this)
