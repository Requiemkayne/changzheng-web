/**
 * 地图页 —— Leaflet + OSM 瓦片（小程序 map 组件的网页等价物）
 * Leaflet 按需动态加载（不阻塞首页）：8 秒超时或加载失败自动降级为路线列表
 * 四态 marker（divIcon 圆点）+ 红色 polyline 按节点顺序连线 + 底部节点快切条
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const progressUtil = root.CZ_PROGRESS
  const UI = root.CZ_UI

  VIEWS.map = {
    mount(rootEl) {
      rootEl.innerHTML = '<div class="page-center"><div class="page-center-icon">🗺️</div><div>加载中…</div></div>'

      Promise.all([api.getConfig(), api.getNodes(), api.getProgress()])
        .then(([config, nodes, progress]) => {
          const states = progressUtil.computeStates(nodes, progress, config)
          ensureLeaflet().then(L => {
            if (L) renderMap(rootEl, nodes, states, L)
            else renderFallback(rootEl, nodes, states)
          })
        })
        .catch(err => {
          console.error('地图页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center"><div class="page-center-icon">🗺️</div><div>加载失败，请刷新重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
    }
  }

  /* ---------- Leaflet 按需加载（带超时，失败返回 null） ---------- */

  let leafletPromise = null

  function ensureLeaflet() {
    if (root.L) return Promise.resolve(root.L)
    if (leafletPromise) return leafletPromise
    leafletPromise = new Promise(resolve => {
      const done = L => resolve(L || null)
      // CSS 不阻塞逻辑，先注入
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
      // JS 加载成功 → 返回 L；失败/超时 → null（降级路线列表）
      const s = document.createElement('script')
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      s.onload = () => done(root.L)
      s.onerror = () => done(null)
      setTimeout(() => done(root.L), 8000)
      document.head.appendChild(s)
    }).then(L => {
      if (!L) leafletPromise = null // 失败可重试
      return L
    })
    return leafletPromise
  }

  /* ---------- Leaflet 模式 ---------- */

  function renderMap(rootEl, nodes, states, L) {
    rootEl.innerHTML =
      '<div class="page">' +
      '<div id="map-container"></div>' +
      '<div class="map-legend">' +
        '<span><i class="legend-open"></i>待打卡</span>' +
        '<span><i class="legend-checked"></i>已打卡</span>' +
        '<span><i class="legend-passed"></i>已通关</span>' +
        '<span><i class="legend-locked"></i>未解锁</span>' +
      '</div>' +
      '<div class="map-strip" id="map-strip"></div>' +
      '</div>'

    const map = L.map('map-container', { zoomControl: true, attributionControl: true })

    // 底图：OSM（国内加载慢属正常；素材/网络就绪后可换国内瓦片源）
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    // 四态 marker（divIcon）
    const coords = []
    nodes.forEach(node => {
      const st = states.byCode[node.code]
      const latlng = [node.location.latitude, node.location.longitude]
      coords.push(latlng)
      const icon = L.divIcon({
        className: '',
        html: '<div class="mkr mkr-' + st.state + '">' + node.order + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
      const marker = L.marker(latlng, { icon }).addTo(map)
      marker.bindTooltip(node.name, { direction: 'top', offset: [0, -14] })
      marker.on('click', () => { location.hash = '#/node/' + node.code })
    })

    // 红色路线
    L.polyline(coords, { color: '#C8102E', weight: 3, opacity: 0.8 }).addTo(map)

    // 视野适配全部节点
    map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] })

    // 底部节点快切条
    const strip = rootEl.querySelector('#map-strip')
    strip.innerHTML = nodes.map((n, i) =>
      '<div class="map-chip" data-i="' + i + '">' + n.order + ' ' + F.escapeHtml(n.name) + '</div>'
    ).join('')
    strip.addEventListener('click', e => {
      const chip = e.target.closest('.map-chip')
      if (!chip) return
      const i = Number(chip.dataset.i)
      map.setView(coords[i], 8, { animate: true })
      strip.querySelectorAll('.map-chip').forEach(c => c.classList.toggle('chip-active', c === chip))
    })

    return () => { map.remove() }
  }

  /* ---------- 降级：路线列表 ---------- */

  function renderFallback(rootEl, nodes, states) {
    let html =
      '<div class="page">' +
      '<div class="map-fallback">' +
        '<div class="empty-icon">🗺️</div>' +
        '<div>地图组件加载失败（需联网加载 Leaflet），已降级为路线列表</div>' +
      '</div>'
    nodes.forEach(node => {
      html += '<div class="tl">' + UI.nodeRowHTML(node, states.byCode[node.code], { isLast: node.order === nodes.length }) + '</div>'
    })
    html += '</div>'
    rootEl.innerHTML = html
    rootEl.querySelectorAll('[data-code]').forEach(row => {
      row.addEventListener('click', () => { location.hash = '#/node/' + row.dataset.code })
    })
  }
})(typeof self !== 'undefined' ? self : this)
