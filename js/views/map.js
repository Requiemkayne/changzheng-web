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
      let destroy3d = null

      Promise.all([api.getConfig(), api.getNodes(), api.getProgress()])
        .then(([config, nodes, progress]) => {
          const states = progressUtil.computeStates(nodes, progress, config)
          destroy3d = renderMap(rootEl, nodes, states)
        })
        .catch(err => {
          console.error('地图页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center">' + UI.icon('map', 'page-center-icon') + '<div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })

      // 离开地图页时释放 WebGL 资源
      return () => { if (destroy3d) { destroy3d(); destroy3d = null } }
    }
  }

  /* ---------- 3D 沙盘：按需加载 three.js（不拖慢常态首屏） ---------- */

  let threePromise = null
  function loadThree() {
    if (window.THREE) return Promise.resolve()
    if (threePromise) return threePromise
    threePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'js/vendor/three.min.js'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('three.js 加载失败'))
      document.head.appendChild(s)
    }).catch(err => {
      // 失败不缓存：否则 threePromise 永远是同一个 rejected promise，重试会永久卡死
      threePromise = null
      throw err
    })
    return threePromise
  }

  /* ---------- 投影与配色 ---------- */

  const W = 360, H = 520            // viewBox 尺寸
  const PAD_X = 42, PAD_Y = 56      // 边距（给标签留空间）
  // 实际范围：lng 102.23~116.03，lat 25.53~35.68（含留白放大）
  const LNG_MIN = 98.6, LNG_MAX = 118.8
  const LAT_MIN = 23.8, LAT_MAX = 37.8

  function px(n) {
    return PAD_X + (n.location.longitude - LNG_MIN) / (LNG_MAX - LNG_MIN) * (W - 2 * PAD_X)
  }
  function py(n) {
    return PAD_Y + (LAT_MAX - n.location.latitude) / (LAT_MAX - LAT_MIN) * (H - 2 * PAD_Y)
  }

  /* ---------- 投影后重叠消解 ----------
   * 等距投影是"照实画"：两站经纬度贴得近，圆盘就糊在一起
   * （强渡大渡河 / 飞夺泸定桥中心仅 23.2 单位，r=15 的圆盘已互相压住序号）。
   * 解法只挪"绘制坐标"，不动节点顺序 / 数量 / 文案 / 数据：
   * 把间距不足的两站沿连线方向对称推开，路线再用调整后的点重画，线不断裂。
   */

  const MIN_GAP = 36       // 相邻圆盘中心最小间距（face r=15 → 直径 30，余 6 单位缝）
  const MAX_SHIFT = 10     // 单点累计位移上限：宁可靠得近一点，也不让路线走形

  function relaxPoints(list) {
    const n = list.length
    const ox = list.map(() => 0)
    const oy = list.map(() => 0)
    for (let round = 0; round < 24; round++) {
      let moved = false
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const xi = list[i].x + ox[i], yi = list[i].y + oy[i]
          const xj = list[j].x + ox[j], yj = list[j].y + oy[j]
          let dx = xj - xi, dy = yj - yi
          let d = Math.sqrt(dx * dx + dy * dy)
          if (d >= MIN_GAP) continue
          if (d < 0.001) { dx = 0; dy = -1; d = 1 }   // 完全重合：给个竖直方向，避免除零
          const push = (MIN_GAP - d) / 2              // 两侧各让一半，重心不漂
          const ux = dx / d, uy = dy / d
          ox[i] -= ux * push; oy[i] -= uy * push
          ox[j] += ux * push; oy[j] += uy * push
          moved = true
        }
      }
      // 位移封顶：超限等比缩回（方向不变，仍朝"分开"的一侧）
      for (let i = 0; i < n; i++) {
        const len = Math.sqrt(ox[i] * ox[i] + oy[i] * oy[i])
        if (len > MAX_SHIFT) { const k = MAX_SHIFT / len; ox[i] *= k; oy[i] *= k }
      }
      if (!moved) break
    }
    return list.map((p, i) => ({
      x: Math.round((p.x + ox[i]) * 100) / 100,
      y: Math.round((p.y + oy[i]) * 100) / 100
    }))
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

  // 省界：优先用 js/map-provinces.js 的真实边界（裁剪 + 简化），缺失时退回手绘示意线
  const PROV_DATA = root.CZ_MAP_PROVINCES
  const PROVINCE_LINES = PROV_DATA && PROV_DATA.length
    ? PROV_DATA.map(p => ({
      name: p.name,
      d: p.segs.map(seg => 'M' + seg.map(pt => geo(pt[0], pt[1]).join(',')).join('L')).join('')
    }))
    : []
  const PROVINCE_FALLBACK = PROV_DATA && PROV_DATA.length ? [] : [
    [[114.0, 25.6], [113.8, 26.8], [114.2, 28.4]],
    [[109.6, 26.2], [109.2, 27.2], [108.9, 28.4]],
    [[104.8, 25.8], [104.4, 26.8], [103.8, 27.8]],
    [[102.8, 27.8], [103.2, 28.3], [103.9, 28.6]],
    [[103.0, 33.4], [105.0, 33.7], [107.0, 33.9]]
  ].map(geoPath)

  /* ---------- 海陆：海岸线（大致轮廓，用于区分陆海，不作测绘依据） ---------- */
  // 只取图幅东南角那一段海岸（闽南—粤东），用来区分海陆
  const COAST = [
    [116.4, 23.8], [116.9, 23.9], [117.3, 24.1], [117.8, 24.35], [118.3, 24.55], [118.8, 24.7]
  ]
  // 海域多边形：海岸线 → 右下角闭合
  const SEA_PATH = (() => {
    const pts = COAST.map(p => geo(p[0], p[1]))
    const rightBottom = geo(LNG_MAX, LAT_MIN)
    return 'M' + pts.map(p => p.join(',')).join('L') +
      'L' + rightBottom.join(',') + 'L' + geo(COAST[0][0], LAT_MIN).join(',') + 'Z'
  })()
  const COAST_LINE = 'M' + COAST.map(p => geo(p[0], p[1]).join(',')).join('L')

  /* ---------- 根据地（红色淡块 + 斜线，仅示意范围） ---------- */
  const BASES = [
    { name: '中央苏区根据地', labelDx: -30, labelDy: 16, ring: [[115.0, 24.9], [116.3, 25.2], [116.4, 26.6], [115.4, 27.0], [114.9, 26.0]] },
    { name: '川陕苏区根据地', ring: [[105.6, 31.5], [107.6, 32.2], [108.3, 33.0], [106.6, 32.6], [105.4, 32.2]] },
    { name: '湘鄂川黔根据地', ring: [[109.2, 28.7], [110.5, 29.3], [110.2, 30.3], [109.0, 29.8]] },
    { name: '陕甘宁根据地', ring: [[107.7, 35.5], [109.6, 36.2], [109.4, 37.2], [107.6, 36.5]] }
  ].map(b => {
    const pts = b.ring.map(p => geo(p[0], p[1]))
    let cx = 0
    let cy = 0
    pts.forEach(p => { cx += p[0]; cy += p[1] })
    cx /= pts.length
    cy /= pts.length
    return {
      name: b.name,
      d: 'M' + pts.map(p => p.join(',')).join('L') + 'Z',
      lx: cx + (b.labelDx || 0),
      ly: cy + (b.labelDy || 0)
    }
  })

  /* ---------- 友军各部路线（红军其他主力） ---------- */
  // 红二方面军：桑植 → 黔东 → 滇东 → 石鼓渡江 → 甘孜 → 北上会宁
  const ROUTE_2ND = geoPath([
    [110.2, 29.4], [109.6, 28.6], [108.6, 27.6], [107.4, 26.9], [106.2, 26.4],
    [104.8, 26.0], [103.6, 26.2], [102.5, 27.0], [101.4, 27.6], [100.2, 28.6],
    [99.9, 31.6], [101.2, 32.4], [102.4, 33.4], [103.6, 34.4], [104.6, 35.3], [105.1, 35.68]
  ])
  // 红四方面军：川陕根据地 → 强渡嘉陵江 → 懋功 → 毛儿盖 → 草地 → 会宁
  const ROUTE_4TH = geoPath([
    [107.5, 32.4], [106.6, 32.0], [105.8, 31.8], [104.8, 31.8], [103.9, 31.7],
    [102.7, 31.0], [102.9, 32.9], [102.5, 33.8], [102.0, 34.5], [103.4, 35.2], [105.1, 35.68]
  ])
  // 红二十五军：罗山 → 桐柏山 → 伏牛山 → 陕南 → 陕北永坪
  const ROUTE_25TH = geoPath([
    [114.5, 32.2], [113.6, 32.3], [112.6, 32.7], [111.6, 33.3], [110.6, 33.8],
    [109.6, 34.2], [108.9, 34.5], [109.2, 35.2], [109.9, 36.0]
  ])

  /* ---------- 国军封锁线与封锁区（蓝色系，压在友军与主线之下） ---------- */
  // 四道封锁线（1934.10–11）+ 乌江 / 金沙江 / 大渡河 江防
  const ENEMY_LINES = [
    { d: geoPath([[115.6, 25.0], [115.1, 25.5], [114.6, 26.0]]), label: '第一道', at: null },
    { d: geoPath([[113.9, 25.2], [113.4, 25.5], [112.9, 25.8]]), label: '第二道', at: null },
    { d: geoPath([[113.1, 25.3], [112.8, 25.9], [112.5, 26.4]]), label: '第三道', at: null },
    { d: geoPath([[111.3, 25.4], [110.9, 25.8], [110.5, 26.3]]), label: '第四道·湘江', at: [110.2, 26.5] },
    { d: geoPath([[107.6, 26.8], [107.1, 27.2], [106.6, 27.6]]), label: '乌江', at: [106.3, 27.7] },
    { d: geoPath([[102.2, 26.4], [101.9, 27.2], [101.6, 28.0]]), label: '金沙江', at: [101.2, 28.1] },
    { d: geoPath([[102.2, 29.0], [102.4, 29.6], [102.6, 30.2]]), label: '大渡河', at: [102.9, 30.0] }
  ]

  // 国军重兵合围区（很淡的色块，只暗示包围态势）
  const ENEMY_ZONES = [
    // 湘江以东合围区
    geoPath([[113.6, 25.2], [115.9, 25.3], [115.9, 27.4], [113.4, 27.2], [113.6, 25.2]]),
    // 川黔边合围区
    geoPath([[105.4, 27.6], [107.8, 27.6], [107.8, 29.4], [105.2, 29.2], [105.4, 27.6]])
  ]

  // 追堵方向（箭头起点 → 终点，只画两三处最能说明态势的）
  const ENEMY_ARROWS = [
    { from: [113.8, 24.9], to: [112.2, 26.2] },   // 薛岳纵队沿湘江追击
    { from: [103.2, 30.4], to: [102.4, 29.5] },   // 川军沿大渡河北岸堵截
    { from: [107.9, 27.0], to: [106.8, 27.4] }    // 黔军扼守乌江
  ]

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

  /** 省名：取各省所有点的均值定位，超出图框就不标；字号小、颜色淡，不压路线 */
  function provinceLabels() {
    if (!PROV_DATA) return ''
    let html = ''
    PROV_DATA.forEach(p => {
      let sx = 0
      let sy = 0
      let n = 0
      p.segs.forEach(seg => seg.forEach(pt => {
        const xy = geo(pt[0], pt[1])
        sx += xy[0]
        sy += xy[1]
        n++
      }))
      if (!n) return
      const cx = sx / n
      const cy = sy / n
      if (cx < 26 || cx > W - 26 || cy < 30 || cy > H - 26) return
      html += '<text class="map-prov-name" x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '">' + F.escapeHtml(p.name) + '</text>'
    })
    return html
  }

  /* ---------- 渲染 ---------- */

  function renderMap(rootEl, nodes, states) {
    // 先按投影落点，再做一次重叠消解，得到最终绘制坐标（route / 标签 / 天气小景全部用这一份）
    const spots = relaxPoints(nodes.map(n => ({ x: px(n), y: py(n) })))
    const pts = nodes.map((n, i) => ({
      node: n,
      i,
      x: spots[i].x,
      y: spots[i].y,
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

    // 天气示意：只对「雨 / 雪」节点画侧边小景（乌云 + 雨丝 / 雪花），半透明、互不遮挡
    const WX = root.CZ_MOCK_WEATHER || {}
    const VIG_W = 46           // 小景宽度（已放大，标签可压在图上）
    const VIG_H = 34
    const placed = []          // 已放置的小景，用来避免互相覆盖

    function pickSide(cx, cy) {
      const conflict = side => placed.some(v => v.side === side && Math.abs(v.y - cy) < VIG_H + 14)
      if (!conflict('right') && cx + VIG_W + 10 < W) return 'right'
      if (!conflict('left') && cx - VIG_W - 10 > 0) return 'left'
      return (cx + VIG_W + 10 < W) ? 'right' : 'left'
    }

    function wxVignette(mode, cx, cy, side) {
      const dir = side === 'left' ? -1 : 1
      const x = cx + dir * (VIG_W / 2 + 13)
      const y = cy - 5
      placed.push({ side, y: cy })

      const isRain = mode === 'rain'
      const cloudFill = isRain ? '#6E6B64' : '#B3C7D6'
      // 放大 1.35 倍、整体更淡：作为背景氛围，文字压在它上面
      let g = '<g class="map-wxv map-wxv-' + mode + '" transform="translate(' + x + ',' + y + ') scale(1.35)" opacity="' +
        (isRain ? '0.4' : '0.46') + '" aria-hidden="true">'
      // 乌云：三个叠在一起的椭圆
      g += '<g class="wxv-cloud" fill="' + cloudFill + '">' +
        '<ellipse cx="-7" cy="1.5" rx="8.6" ry="5.4"/>' +
        '<ellipse cx="1.5" cy="-3" rx="8.2" ry="6.6"/>' +
        '<ellipse cx="10" cy="1.5" rx="7" ry="5"/>' +
        '</g>'
      if (isRain) {
        // 雨丝
        g += '<g class="wxv-rain" stroke="#4E7CA8" stroke-width="1.4" stroke-linecap="round">' +
          '<line x1="-8" y1="7.5" x2="-9.6" y2="15"/>' +
          '<line x1="-2.5" y1="8.5" x2="-4.1" y2="16"/>' +
          '<line x1="3.5" y1="7.5" x2="1.9" y2="15"/>' +
          '<line x1="9.5" y1="8.5" x2="7.9" y2="16"/>' +
          '</g>'
      } else {
        // 雪花
        g += '<g class="wxv-snow" fill="#9FC4E0">' +
          '<circle cx="-8" cy="9" r="2.1"/><circle cx="-3.5" cy="14" r="1.8"/>' +
          '<circle cx="1.5" cy="8.5" r="2"/><circle cx="6.5" cy="13.5" r="2.1"/>' +
          '<circle cx="11" cy="9.5" r="1.7"/><circle cx="-6" cy="16" r="1.5"/>' +
          '</g>'
      }
      g += '</g>'
      return g
    }

    // ---------- 先给每个节点算好：天气小景落在哪侧、标签放在哪 ----------
    // 标签一律放节点侧边（左右），并按包围盒避让，保证互不重叠
    const vigs = {}
    pts.forEach(p => {
      const nwx = WX[p.node.code]
      const m = nwx && (nwx.mode === 'rain' || nwx.mode === 'snow') ? nwx.mode : null
      if (m) vigs[p.node.code] = { mode: m, side: pickSide(p.x, p.y) }
    })

    const LABEL_FS = 11
    const labelBoxes = []
    const labels = {}
    const hit = r => labelBoxes.some(b => !(r.x2 < b.x1 || r.x1 > b.x2 || r.y2 < b.y1 || r.y1 > b.y2))

    pts.forEach(p => {
      const text = String(p.node.name || '')
      const w = text.length * LABEL_FS + 2
      const h = 13
      const vg = vigs[p.node.code]
      const DY = [4, -8, 16, -20, 28, -32]   // 纵向依次尝试，避开上下相邻的标签
      const OFFS = [21, 32, 44]              // 横向由近到远：近处放不下就往远处挪
      let placedBox = null

      // 天气小景只作背景：标签不再为它让位，优先右侧贴节点
      const sides = ['right', 'left']
      for (const dy of DY) {
        if (placedBox) break
        for (const sd of sides) {
          if (placedBox) break
          for (const off of OFFS) {
            const anchor = sd === 'right' ? 'start' : 'end'
            const x = sd === 'right' ? p.x + off : p.x - off
            const y = p.y + dy
            const box = {
              x1: anchor === 'start' ? x : x - w,
              y1: y - h + 3,
              x2: anchor === 'start' ? x + w : x,
              y2: y + 2
            }
            if (box.x1 < 8 || box.x2 > W - 8) continue           // 不出图框（放宽，避免把标签推到别的节点旁）
            if (hit(box)) continue                               // 不和已放标签重叠
            labels[p.node.code] = { x, y, anchor }
            labelBoxes.push(box)
            placedBox = box
            break
          }
        }
      }
      if (!placedBox) {
        // 兜底：右侧稍远处，仍按 anchor 摆放
        const x = p.x + 21
        labels[p.node.code] = { x, y: p.y + 4, anchor: 'start' }
        labelBoxes.push({ x1: x, y1: p.y - 10, x2: x + w, y2: p.y + 6 })
      }
    })

    let nodesHtml = ''
    pts.forEach(p => {
      const s = NODE_STYLE[p.st.state] || NODE_STYLE.open
      const vg = vigs[p.node.code]
      const lb = labels[p.node.code]
      nodesHtml +=
        '<g class="map-node" data-code="' + p.node.code + '" data-i="' + p.i + '"' +
          ' tabindex="0" role="button"' +
          ' aria-label="第' + p.node.order + '站 ' + F.escapeHtml(p.node.name) + '，打开节点详情"' +
          ' style="animation-delay:' + (1.35 + p.i * 0.15) + 's">' +
          // 触控热区：r=23 → 直径 46 单位，viewBox 360 渲到 352px 后实测 ≥44px（移动端最小点按尺寸）；放在最前面，不遮挡 .map-num 文本
          '<circle class="map-node-hit" cx="' + p.x + '" cy="' + p.y + '" r="23" fill="transparent"/>' +
          (p.i === 0 ? star(p.x, p.y - 34, 'map-star-start') : '') +
          (p.i === nodes.length - 1 ? star(p.x, p.y - 34, 'map-star-end') : '') +
          (vg ? wxVignette(vg.mode, p.x, p.y, vg.side) : '') +
          // 伪 3D：地面投影 + 柱脚 + 顶面圆盘 + 高光
          '<ellipse class="map-node-shadow" cx="' + p.x + '" cy="' + (p.y + 7.5) + '" rx="16" ry="7"/>' +
          '<rect class="map-node-post" x="' + (p.x - 1.7) + '" y="' + p.y + '" width="3.4" height="7.5" rx="1.7"/>' +
          '<circle class="map-node-face" cx="' + p.x + '" cy="' + p.y + '" r="15" fill="' + s.fill + '" stroke="' + s.stroke + '" stroke-width="2.5"/>' +
          '<circle class="map-node-rim" cx="' + p.x + '" cy="' + p.y + '" r="15"/>' +
          '<ellipse class="map-node-sheen" cx="' + p.x + '" cy="' + (p.y - 5.5) + '" rx="10.5" ry="5.5"/>' +
          '<text class="map-num" x="' + p.x + '" y="' + (p.y + 4.5) + '" fill="' + s.text + '">' + p.node.order + '</text>' +
          '<text class="map-label" x="' + lb.x + '" y="' + lb.y + '" style="text-anchor:' + lb.anchor + '">' + F.escapeHtml(p.node.name) + '</text>' +
        '</g>'
    })

    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="map-title">' +
          '<div class="map-title-cn">长征路线图</div>' +
          '<div class="map-title-sub">瑞金出发 · 会宁会师 · 两万五千里</div>' +
        '</div>' +
        '<div class="map-stage">' +
          '<div class="map3d-wx" id="map3d-wx" hidden><i></i><span></span></div>' +
          '<div class="map-mode" id="map-mode">' +
            '<button class="map-mode-btn on" type="button" data-mode="2d">路线图</button>' +
            '<button class="map-mode-btn" type="button" data-mode="3d">3D 沙盘</button>' +
            '<button class="map-mode-btn" type="button" data-fx="1" id="map-fx-btn" aria-pressed="true">天气特效</button>' +
          '</div>' +
          '<div class="map-frame">' +
          '<svg class="map-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
            '<defs>' +
              '<pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">' +
                '<path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(201,162,39,0.10)" stroke-width="1"/>' +
              '</pattern>' +
              // 伪 3D：路线投影的柔化 + 顶面高光渐变
              '<filter id="mapSoft" x="-20%" y="-20%" width="140%" height="140%">' +
                '<feGaussianBlur stdDeviation="1.3"/>' +
              '</filter>' +
              '<marker id="arrowEnemy" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">' +
                '<path d="M0 0 L10 5 L0 10 Z" fill="rgba(47,74,107,0.85)"/>' +
              '</marker>' +
              '<marker id="arrowAlly2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">' +
                '<path d="M0 0 L10 5 L0 10 Z" fill="#D4622A"/>' +
              '</marker>' +
              '<marker id="arrowAlly4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">' +
                '<path d="M0 0 L10 5 L0 10 Z" fill="#8E3A6B"/>' +
              '</marker>' +
              '<marker id="arrowAlly25" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">' +
                '<path d="M0 0 L10 5 L0 10 Z" fill="#A0522D"/>' +
              '</marker>' +
              '<linearGradient id="mapGloss" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>' +
                '<stop offset="0.42" stop-color="#FFFFFF" stop-opacity="0"/>' +
                '<stop offset="1" stop-color="#6E0918" stop-opacity="0.07"/>' +
              '</linearGradient>' +
            '</defs>' +
            // 陆地底色 + 海域（先陆后海，再叠网格）
            '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="#F8F2E2"/>' +
            '<path class="map-sea" d="' + SEA_PATH + '"/>' +
            '<path class="map-coast" d="' + COAST_LINE + '"/>' +
            '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="url(#grid)"/>' +
            '<rect class="map-frame-outer" x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" rx="8"/>' +
            '<rect class="map-frame-inner" x="13" y="13" width="' + (W - 26) + '" height="' + (H - 26) + '" rx="5"/>' +
            // 简化地理底图（省界 / 河流 / 山脉，示意性）
            PROVINCE_LINES.map(p => '<path class="map-province" d="' + p.d + '"/>').join('') +
            // 根据地（很淡的红色斜线块 + 名称）
            '<defs><pattern id="baseHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
              '<line x1="0" y1="0" x2="0" y2="5" stroke="rgba(200,16,46,0.16)" stroke-width="1.1"/>' +
            '</pattern></defs>' +
            BASES.map(b => '<path class="map-base" d="' + b.d + '"/>').join('') +
            BASES.map(b => '<text class="map-base-name" x="' + b.lx.toFixed(1) + '" y="' + b.ly.toFixed(1) + '">' +
              F.escapeHtml(b.name) + '</text>').join('') +
            // 国军合围区（最淡的一层，只交代态势）
            ENEMY_ZONES.map(d => '<path class="map-enemy-zone" d="' + d + '"/>').join('') +
            PROVINCE_FALLBACK.map(d => '<path class="map-province" d="' + d + '"/>').join('') +
            (PROV_DATA && PROV_DATA.length ? provinceLabels() : '') +
            RIVERS.map(d => '<path class="map-river" d="' + d + '"/>').join('') +
            MOUNTAINS.map(m =>
              '<path class="map-mountain" d="M' + (m[0] - 7) + ' ' + (m[1] + 4) + ' L' + m[0] + ' ' + (m[1] - 6) + ' L' + (m[0] + 7) + ' ' + (m[1] + 4) + ' Z"/>'
            ).join('') +
            // 友军各部路线（暖色细线，压在主路线之下）
            '<path class="map-route-ally ally-2" d="' + ROUTE_2ND + '" marker-end="url(#arrowAlly2)"/>' +
            '<path class="map-route-ally ally-4" d="' + ROUTE_4TH + '" marker-end="url(#arrowAlly4)"/>' +
            '<path class="map-route-ally ally-25" d="' + ROUTE_25TH + '" marker-end="url(#arrowAlly25)"/>' +
            // 国军封锁线与追堵方向
            ENEMY_LINES.map(l => '<path class="map-enemy-line" d="' + l.d + '"/>').join('') +
            ENEMY_LINES.filter(l => l.at).map(l => {
              const p = geo(l.at[0], l.at[1])
              return '<text class="map-enemy-name" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' +
                F.escapeHtml(l.label) + '</text>'
            }).join('') +
            ENEMY_ARROWS.map(a => {
              const p1 = geo(a.from[0], a.from[1])
              const p2 = geo(a.to[0], a.to[1])
              return '<line class="map-enemy-arrow" x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] + '" marker-end="url(#arrowEnemy)"/>'
            }).join('') +
            '<path id="mapRoutePath" d="' + routeD + '" fill="none" stroke="none"/>' +
            // 伪 3D：路线下方两层半透明投影，制造"浮起"错觉
            '<polyline class="map-route-depth3" points="' + polyline + '" transform="translate(4.2,11)" filter="url(#mapSoft)"/>' +
            '<polyline class="map-route-depth2" points="' + polyline + '" transform="translate(2.8,7.4)" filter="url(#mapSoft)"/>' +
            '<polyline class="map-route-depth" points="' + polyline + '" transform="translate(1.5,4)" filter="url(#mapSoft)"/>' +
            '<polyline class="map-route" points="' + polyline + '"/>' +
            '<polyline class="map-route-gold" points="' + polyline + '"/>' +
            '<circle class="map-spark" r="5" fill="#E8C86A">' +
              '<animateMotion dur="2.1s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="linear">' +
                '<mpath href="#mapRoutePath"/>' +
              '</animateMotion>' +
            '</circle>' +
            nodesHtml +
            // 顶面高光：整幅图微微"上釉"
            '<rect x="13" y="13" width="' + (W - 26) + '" height="' + (H - 26) + '" rx="5" fill="url(#mapGloss)" pointer-events="none"/>' +
          '</svg>' +
        '</div>' +
        '<div class="map3d-wrap" id="map3d-wrap" hidden></div>' +
        // 图例：浮在地图右上角、竖排
        '<div class="map-legend">' +
          '<span><i class="legend-route"></i>红一方面军</span>' +
          '<span><i class="legend-ally legend-ally-2"></i>红二方面军</span>' +
          '<span><i class="legend-ally legend-ally-4"></i>红四方面军</span>' +
          '<span><i class="legend-ally legend-ally-25"></i>红二十五军</span>' +
          '<span><i class="legend-enemy"></i>国军封锁</span>' +
          '<span><i class="legend-open"></i>待打卡</span>' +
          '<span><i class="legend-checked"></i>已打卡</span>' +
          '<span><i class="legend-passed"></i>已通关</span>' +
          '<span><i class="legend-locked"></i>未解锁</span>' +
        '</div>' +
        '</div>' +   // <div class="map-stage"> 结束
        '<div class="map-replay-wrap"><button class="btn btn-mini btn-mini-ghost" id="map-replay" type="button">' + UI.icon('replay', 'map-replay-ic') + ' 重播行军动画</button></div>' +
        '<div class="map-float" id="map-float"></div>' +
        '<div class="map-strip" id="map-strip"></div>' +
        '<div class="map-note">省界为简化边界，仅表方位；路线与节点为示意</div>' +
      '</div>'

    // 行军动画：初始播放一次，可重播（prefers-reduced-motion 时直接静态）
    const svg = rootEl.querySelector('.map-svg')
    const goldLine = rootEl.querySelector('.map-route-gold')
    const spark = rootEl.querySelector('.map-spark')
    const routePath = rootEl.querySelector('#mapRoutePath')
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function playMarch() {
      if (reduced) return
      // 重播前先撤掉 settle2D 写下的内联覆盖，否则节点不再有动画
      rootEl.querySelectorAll('.map-node').forEach(g => {
        g.style.animationName = ''; g.style.opacity = ''; g.style.transform = ''
      })
      goldLine.style.animationName = ''
      goldLine.style.strokeDasharray = ''
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
    float.style.display = 'none'

    // 节点天气统一来自 js/mock/weather.js（11 个节点全有描述，部分带视觉特效）；
    // WX 在渲染节点图标时已声明，这里直接复用

    function applyNodeWeather(node) {
      const wx = WX[node.code] || null
      const effect = wx && wx.mode ? wx.mode : null
      if (root.CZ_WEATHER) {
        if (effect) root.CZ_WEATHER.apply(effect)
        else root.CZ_WEATHER.clear()
      }
      if (view3d) {
        if (effect) view3d.setWeather(effect, { lock: true })
        else view3d.setWeather('clear')
      }
      return wx
    }

    function showFloat(i) {
      const p = pts[i]
      const st = p.st
      const wx = applyNodeWeather(p.node)
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
          (wx
            ? '<div class="map-float-wx">天气 · ' + F.escapeHtml(wx.label) + '<span>' + F.escapeHtml(wx.desc) + '</span></div>'
            : '') +
          '<div class="map-float-sub">' + F.escapeHtml(p.node.summary) + '</div>' +
          '<div class="map-float-actions">' + detailBtn + '</div>' +
        '</div>'
      float.style.display = 'block'
      const btn = float.querySelector('#map-float-detail')
      if (btn) btn.addEventListener('click', () => { location.hash = '#/node/' + p.node.code })
      revealFloat()
    }

    // 按需最小滚动：只补「浮窗底边被底部 tabBar 盖住」的那点重叠量（+12 留缝），不重叠就一点不滚
    function revealFloat() {
      const fr = float.getBoundingClientRect()
      const tbEl = document.getElementById('tabbar')
      const barTop = tbEl ? tbEl.getBoundingClientRect().top : window.innerHeight
      const overlap = fr.bottom - barTop
      if (overlap > 0) window.scrollBy({ top: Math.ceil(overlap) + 12, behavior: 'smooth' })
    }

    // 天气小景发光：点击节点时该节点的天气图标边缘亮一下（作为点击反馈）
    function glowWx(nodeG) {
      const grp = nodeG.querySelector('.map-wxv')
      if (!grp) return
      grp.classList.remove('is-glow')
      void grp.getBoundingClientRect()
      grp.classList.add('is-glow')
      window.setTimeout(() => grp.classList.remove('is-glow'), 1300)
    }

    rootEl.querySelectorAll('.map-node').forEach(g => {
      g.addEventListener('click', () => {
        glowWx(g)
        showFloat(Number(g.dataset.i))
      })
      // 键盘：Enter / Space 等价于点击（Space 阻止默认的页面滚动）
      g.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
        e.preventDefault()
        showFloat(Number(g.dataset.i))
      })
    })

    // 底部快切条：高亮对应节点 + 弹浮窗
    const strip = rootEl.querySelector('#map-strip')
    strip.innerHTML = nodes.map((n, i) =>
      '<button type="button" class="map-chip" data-i="' + i + '">' + n.order + ' ' + F.escapeHtml(n.name) + '</button>'
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

    /* ---------- 2D 路线图 / 3D 沙盘 切换 ---------- */
    const page = rootEl.querySelector('.page')
    const modeBar = rootEl.querySelector('#map-mode')
    const frame = rootEl.querySelector('.map-frame')
    const wrap3d = rootEl.querySelector('#map3d-wrap')
    const wxBadge = rootEl.querySelector('#map3d-wx')
    let view3d = null
    let mode = '2d'

    // 天气特效开关：复用 .map-mode-btn（零 CSS 改动），文本即状态
    const fxBtn = rootEl.querySelector('#map-fx-btn')

    function renderFxBtn() {
      if (!fxBtn || !root.CZ_WEATHER) return
      const on = root.CZ_WEATHER.isEnabled()
      fxBtn.textContent = on ? '天气特效' : '天气特效·关'
      fxBtn.classList.toggle('on', on)
      fxBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
    renderFxBtn()

    // 天气标签：小圆点 + 中文名，让手机用户一眼分清当前天气
    const WX_LABEL = { clear: '晴', cloud: '阴', rain: '雨', snow: '雪', fog: '雾' }
    function setWxBadge(m) {
      if (!wxBadge) return
      wxBadge.dataset.w = m
      const span = wxBadge.querySelector('span')
      if (span) span.textContent = (WX_LABEL[m] || '晴') + '天'
    }

    // 3D → 2D：用内联样式消掉 .map-anim 的重播（display:none 回来后 CSS 动画会整段重播，出现 1~2s 空白窗）
    function settle2D() {
      // 用 animationName 而非 animation 简写：简写会把内联 animation-delay 一并重置为 0s，
      // 之后 playMarch 重播就没有错峰了；只关掉名字即可杀掉重播，delay 原样保留
      rootEl.querySelectorAll('.map-node').forEach(g => {
        g.style.animationName = 'none'
        g.style.opacity = '1'
        g.style.transform = 'none'
      })
      if (goldLine) {
        goldLine.style.animationName = 'none'
        goldLine.style.strokeDasharray = 'none'
        goldLine.style.strokeDashoffset = '0'
      }
    }

    // 3D 掉线/不可用时的统一回退：清空容器、无悲鸣地切回 2D、只用人话说一句
    // 用 flag 防重入：onLost 里 destroy() 可能再次触发回调，绝不能形成递归
    let fallingBack = false
    function fallbackTo2D(msg) {
      if (fallingBack) return
      fallingBack = true
      try {
        if (wrap3d) wrap3d.innerHTML = ''
        applyMode('2d')
        if (UI && typeof UI.toast === 'function') UI.toast(msg)
      } finally {
        fallingBack = false
      }
    }

    // 3D 状态文案要让读屏播报：map3d 构建成功时会给容器挂 role="img"（子树对读屏隐藏），
    // 所以写状态前先把容器的图片语义摘掉，状态节点本身带 role=status / aria-live。
    function set3dStatus(msg) {
      wrap3d.removeAttribute('role')
      wrap3d.removeAttribute('aria-label')
      wrap3d.innerHTML = '<div class="map3d-loading" role="status" aria-live="polite">' + msg + '</div>'
    }

    function applyMode(next) {
      mode = next
      const is3d = next === '3d'
      page.classList.toggle('mode-3d', is3d)
      frame.hidden = is3d
      float.style.display = 'none'
      wrap3d.hidden = !is3d
      if (wxBadge) wxBadge.hidden = !is3d
      if (!is3d) settle2D()
      modeBar.querySelectorAll('.map-mode-btn[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === next))

      if (is3d && !view3d) {
        set3dStatus('正在加载 3D 沙盘…')
        loadThree().then(() => {
          if (mode !== '3d') return
          wrap3d.innerHTML = ''
          const statesByCode = {}
          nodes.forEach(n => { statesByCode[n.code] = states.byCode[n.code] })
          view3d = root.CZ_MAP3D.mount(wrap3d, {
            nodes,
            states: statesByCode,
            onWeather: setWxBadge,          // 天气切换时同步左上角标签
            // 运行时 WebGL 上下文丢失：map3d 内部已 preventDefault、停 rAF、清定时器，
            // 这里只负责说人话并退回 2D（destroy 由 applyMode 内部完成）
            onLost() {
              try {
                if (mode === '3d') fallbackTo2D('3D 显示已中断，已切回路线图')
              } catch (e) { console.error('3D 回退失败', e) }
            },
            onPick(node, index) {
              strip.querySelectorAll('.map-chip').forEach(c => c.classList.toggle('chip-active', Number(c.dataset.i) === index))
              showFloat(index)
            }
          })
        }).catch(err => {
          // 归因分支：设备不支持 WebGL 与"加载失败"是两码事，前者不能提网络
          if (err && err.code === 'WEBGL_UNAVAILABLE') {
            if (mode === '3d') fallbackTo2D('当前设备不支持 3D 显示，已为你切回路线图')
            else set3dStatus('当前设备不支持 3D 显示')
            return
          }
          console.error('3D 沙盘加载失败', err)
          set3dStatus('3D 沙盘加载失败，请检查网络后重试')
        })
      }
      if (!is3d && view3d) {
        view3d.destroy()
        view3d = null
      }
    }

    modeBar.addEventListener('click', e => {
      const btn = e.target.closest('.map-mode-btn')
      if (!btn) return
      if (btn.dataset.fx) {
        // 天气特效开关：关掉立刻撤洗色/粒子/图层，开回来按当前节点天气恢复
        if (root.CZ_WEATHER) {
          root.CZ_WEATHER.setEnabled(!root.CZ_WEATHER.isEnabled())
          renderFxBtn()
        }
        return
      }
      if (btn.dataset.mode !== mode) applyMode(btn.dataset.mode)
    })

    // 离开页面时释放 WebGL
    return function () {
      if (view3d) { view3d.destroy(); view3d = null }
      if (root.CZ_WEATHER) root.CZ_WEATHER.clear()   // 离开地图页时收掉整页天气
    }
  }
})(typeof self !== 'undefined' ? self : this)
