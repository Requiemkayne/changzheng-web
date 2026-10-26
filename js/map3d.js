/**
 * 3D 长征沙盘（手机优先 · 简版）
 *
 * 设计取舍：只保留"地形起伏 + 行军路线 + 十一个节点"，其余地图要素一律去掉
 * （无经纬网、无城市名、无河流、无比例尺、无海拔色带），配色回到站点宣纸红金。
 * 天气只作用于地形与环境光，路线/节点不吃雾，保证任何天气下都能看清和点击。
 *
 * 用法：
 *   const view = CZ_MAP3D.mount(el, { nodes, states, onPick })
 *   view.setWeather('rain'); view.destroy()
 *
 * 依赖：window.THREE 需先加载（由 map.js 按需注入 script）
 */
;(function (root) {
  const DEM_PATH = 'assets/map3d/heightmap.png'
  const DEM = {
    lngMin: 73.0, lngMax: 136.0, latMin: 3.0, latMax: 54.5,
    elevMin: -500, elevMax: 6000     // 保留海底负值，海与平原才分得开
  }

  const K = 3.4                      // 每经度世界单位（比桌面版更紧凑）
  const R2D = 180 / Math.PI
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
  const invMerc = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * R2D
  const Y_MIN = mercY(DEM.latMin), Y_MAX = mercY(DEM.latMax)
  const LAT_C = invMerc((Y_MIN + Y_MAX) / 2)
  const LNG_C = (DEM.lngMin + DEM.lngMax) / 2
  const SIZE_X = (DEM.lngMax - DEM.lngMin) * K
  const SIZE_Z = (Y_MAX - Y_MIN) * R2D * K
  const ELEV_SCALE = 7.0 / 4500   // 世界单位 / 米（垂直夸张克制）

  const STYLE = {
    quizPassed: { fill: '#C6A343', label: '#FFF4DC' },
    checkedIn: { fill: '#C8102E', label: '#FFF4DC' },
    open: { fill: '#FFF6E2', label: '#821626' },
    locked: { fill: '#C9C0AC', label: '#F7F2E7' }
  }

  let lastWeather = 'clear'   // 跨挂载记忆：重新进入地图页时延续上次天气

  /* ---------------- 高程图：全局只加载一次 ---------------- */
  let demPromise = null
  function loadDem() {
    if (demPromise) return demPromise
    demPromise = new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const cv = document.createElement('canvas')
        cv.width = img.width; cv.height = img.height
        const ctx = cv.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, cv.width, cv.height).data
        const arr = new Float32Array(cv.width * cv.height)
        for (let i = 0; i < arr.length; i++) arr[i] = data[i * 4] / 255
        resolve({ arr, w: cv.width, h: cv.height })
      }
      img.onerror = () => resolve(null)
      img.src = DEM_PATH
    })
    return demPromise
  }

  function mount(container, opts) {
    opts = opts || {}
    const nodes = opts.nodes || []
    const states = opts.states || {}
    const onPick = opts.onPick || function () {}
    const onWeatherChange = typeof opts.onWeather === 'function' ? opts.onWeather : null
    const onLost = typeof opts.onLost === 'function' ? opts.onLost : null
    const onError = typeof opts.onError === 'function' ? opts.onError : null

    // 坐标兼容：mock/样例用 lng/lat，接口返回用 location.longitude/latitude
    const lngOf = n => (n.lng != null ? n.lng : (n.location ? n.location.longitude : 0))
    const latOf = n => (n.lat != null ? n.lat : (n.location ? n.location.latitude : 0))

    /* ---------- 句柄登记：定时器 / rAF 统一登记，销毁或上下文丢失时一次清干净 ---------- */
    const timers = []
    function later(fn, ms) {
      const id = setTimeout(() => {
        const i = timers.indexOf(id)
        if (i >= 0) timers.splice(i, 1)
        fn()
      }, ms)
      timers.push(id)
      return id
    }
    function clearTimers() {
      for (let i = 0; i < timers.length; i++) clearTimeout(timers[i])
      timers.length = 0
    }
    function stopRaf() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    }

    // WebGL 不可用时同步抛出带 code 的错误；失败路径上不碰容器，
    // 否则会留下半初始化的 canvas，还会被上层误报成"网络问题"
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      if (!renderer.getContext()) throw new Error('WebGL 上下文为空')
    } catch (cause) {
      const err = new Error('WebGL 不可用：' + ((cause && cause.message) || '无法创建 WebGL 上下文'))
      err.code = 'WEBGL_UNAVAILABLE'
      err.cause = cause
      if (onError) { try { onError(err) } catch (e) {} }
      throw err
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputEncoding = THREE.sRGBEncoding
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'pan-y'

    // 无障碍语义：canvas 里的节点靠射线拾取，键盘无法完成，所以整块沙盘只作
    // 一张图叙述（role=img）+ 说明可用手势；不给 canvas 加 tabindex，免得出现
    // 「能聚焦却什么都做不了」的空焦点。加载失败/上下文中断改走 announceFallback。
    container.setAttribute('role', 'img')
    container.setAttribute('aria-label', '三维长征路线沙盘：地形起伏与红军行军路线示意，可用手势左右滑动转向、双指上下俯仰、双击复位视角')

    // 兜底文案要让读屏播报：先摘掉 role=img（它的子树对读屏是隐藏的），
    // 插入空的状态节点、正文等下一拍再写——live region 必须先存在才播报得出来
    function announceFallback(msg) {
      container.removeAttribute('role')
      container.removeAttribute('aria-label')
      container.innerHTML = ''
      const box = document.createElement('div')
      box.className = 'map3d-fallback'
      box.setAttribute('role', 'status')
      box.setAttribute('aria-live', 'polite')
      container.appendChild(box)
      later(() => { box.textContent = msg }, 0)
    }

    // 手势提示：进场显示，几秒后自动淡出（pointer-events: none，不拦截手势）
    const hintEl = document.createElement('div')
    hintEl.className = 'map3d-hint'
    hintEl.textContent = '左右滑动转向 · 双指上下俯仰 · 双击复位'
    container.appendChild(hintEl)
    later(() => {
      hintEl.classList.add('off')
      later(() => { if (hintEl.parentNode) hintEl.parentNode.removeChild(hintEl) }, 900)
    }, 5200)

    // 观感层：暖光 + 暗角 + 金色内框（纯装饰，不吃事件）
    const veil = document.createElement('div')
    veil.className = 'map3d-veil'
    container.appendChild(veil)
    const plate = document.createElement('div')
    plate.className = 'map3d-plate'
    container.appendChild(plate)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600)
    scene.fog = new THREE.Fog(0xF7F0DF, 92, 210)

    const hemi = new THREE.HemisphereLight(0xFFFBF0, 0x3A2E20, 0.34)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xFFF3DC, 1.05)
    sun.position.set(-56, 38, 52)
    scene.add(sun)
    // 冷色补光：与暖色主光对打，山体转折处更透气
    const fill = new THREE.DirectionalLight(0xBFD4E8, 0.30)
    fill.position.set(64, 26, -48)
    scene.add(fill)

    let dem = null
    let rafId = 0
    let disposed = false
    let lost = false
    let destroying = false
    const HOME = { yaw: 0.14, pitch: 0.86, zoom: 1 }

// 水平旋转范围：只允许正面偏左右的小角度。
// 目的：长征路线在图幅中偏西，允许大幅旋转时镜头会扫到东部沿海与台湾，
// 把不该强调的区域带进画面。±0.40 rad ≈ ±23°。
const YAW_LIMIT = 0.40
function clampYaw(v) {
  let a = v
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, a))
}
    let yaw = HOME.yaw, pitch = HOME.pitch, zoom = HOME.zoom
    let dragging = false, moved = 0, lastX = 0, lastY = 0
    let yawVel = 0, lastTapAt = 0, twoPrev = null
    const pickables = []
    const stars = []

    /* ---------- 采样 ---------- */
    function hAt(u, v) {
      if (!dem) return 0
      const { arr, w, h } = dem
      const x = Math.min(w - 1.001, Math.max(0, u * (w - 1)))
      const y = Math.min(h - 1.001, Math.max(0, v * (h - 1)))
      const x0 = Math.floor(x), y0 = Math.floor(y)
      const fx = x - x0, fy = y - y0
      const i0 = y0 * w + x0, i1 = i0 + 1, i2 = i0 + w, i3 = i2 + 1
      const a = arr[i0] * (1 - fx) + arr[i1] * fx
      const b = arr[i2] * (1 - fx) + arr[i3] * fx
      return a * (1 - fy) + b * fy
    }
    const uvX = x => x / SIZE_X + 0.5
    const uvZ = z => z / SIZE_Z + 0.5
    const elevAt = (u, v) => hAt(u, v) * (DEM.elevMax - DEM.elevMin) + DEM.elevMin
    const groundY = (x, z) => Math.max(0.04, Math.max(0, elevAt(uvX(x), uvZ(z))) * ELEV_SCALE)
    const worldX = lng => (lng - LNG_C) * K
    const worldZ = lat => -(mercY(lat) - mercY(LAT_C)) * R2D * K

    /* ---------- 地形：按海拔上地貌色（草地→林地→岩山→雪线） ---------- */
    // 色带：低海拔草绿 → 丘陵黄绿 → 山地褐 → 高山灰岩 → 雪白
    // 地貌色带：按「真实海拔（米）」分级，13 级过渡
    const BIOME = [
      [0, '#7C9260'],      // 低地草地
      [250, '#8A9F69'],
      [600, '#9AAC73'],
      [1000, '#A9B67C'],   // 丘陵黄绿
      [1500, '#B4AC7E'],   // 干草原 / 黄土
      [2000, '#AC9870'],
      [2500, '#9C8764'],   // 山地褐
      [3000, '#8E7C63'],
      [3500, '#8A8076'],   // 高山裸岩
      [4000, '#A9A093'],   // 碎石坡
      [4400, '#DCD6C9'],   // 雪线
      [5000, '#F2EEE4'],   // 积雪
      [5800, '#FFFFFF']    // 峰顶
    ].map(([m, hex]) => [m, new THREE.Color(hex)])

    function biomeColor(meters) {
      for (let i = 1; i < BIOME.length; i++) {
        if (meters <= BIOME[i][0]) {
          const [m0, c0] = BIOME[i - 1], [m1, c1] = BIOME[i]
          const k = m1 === m0 ? 0 : (meters - m0) / (m1 - m0)
          return new THREE.Color().copy(c0).lerp(c1, Math.max(0, Math.min(1, k)))
        }
      }
      return BIOME[BIOME.length - 1][1].clone()
    }

    // 干湿变化：低频噪声在中低海拔混入土黄，让大范围不至于一片均匀绿
    const DRY = new THREE.Color('#C0A87C')
    function tintByClimate(col, meters, x, z) {
      if (meters > 3200) return col
      const n = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.7)
      const strength = Math.min(1, Math.max(0, (1 - Math.abs(meters - 1100) / 2100))) * 0.32
      return col.lerp(DRY, n * strength)
    }

    function buildTerrain() {
      const seg = 380
      const PAD = 0.16                       // 四周留白纸边
      const smooth = x => x * x * (3 - 2 * x)

      // ① 底板：整幅纸面（含留白），压在地形下面
      const padGeo = new THREE.PlaneGeometry(SIZE_X * (1 + PAD * 2), SIZE_Z * (1 + PAD * 2))
      padGeo.rotateX(-Math.PI / 2)
      const pad = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({
        color: new THREE.Color('#EFE3C9').convertSRGBToLinear()
      }))
      pad.position.y = -0.08
      scene.add(pad)

      // ② 地形：范围精确等于 DEM 矩形，边界就是一条干净直线（不再有锯齿毛边）
      const geo = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, seg, seg)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      const colors = new Float32Array(pos.count * 3)
      const tmp = new THREE.Color()
      const EDGE = 0.0001                     // 不压平：边缘保留真实高度，由侧壁补厚度
      const SEA_BED = new THREE.Color('#5F7C99')   // 海床（沉到水面以下）
      const BEACH = new THREE.Color('#D9C79B')     // 海岸沙滩过渡
      const SEA_FLOOR = -1.0                      // 海床压到水面以下的深度（世界单位）
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i)
        const u = uvX(x), v = uvZ(z)
        const elev = elevAt(u, v)                // 米（负数＝海平面以下）
        const d = Math.min(u, 1 - u, v, 1 - v)
        const lift = smooth(Math.min(1, Math.max(0, d / EDGE)))
        pos.setY(i, elev * ELEV_SCALE * lift)
        // 轻微噪声打散色带，避免等高线式硬边
        const jitter = (Math.sin(x * 0.7) + Math.cos(z * 0.9)) * 60
        // 0 m 以下才是海。原来用 3 m，把华北平原、江苏平原、辽河平原
        // （海拔 0–3 m）整片压到水面以下，陆地看起来缺失。
        if (elev < 0) {
          tmp.copy(SEA_BED)                    // 海床沉到水面以下
          pos.setY(i, SEA_FLOOR)
        } else {
          // 100 m 以下视作同一档低地：DEM 8 位量化（约 25 m/级）在平原上
        // 会产生台阶，逐级取色就显成条纹；压平后平原是整片低地色。
        const elevForColor = elev < 100 ? 40 : elev
        tmp.copy(tintByClimate(biomeColor(elevForColor + jitter), elevForColor, x, z))
          // 近岸浅滩染沙色，强化陆地与水的分界
          if (elev < 8) tmp.lerp(BEACH, (1 - elev / 8) * 0.5)
          // 坡度 + 曲率明暗：陡坡压暗；山脊提亮、沟谷加深，立体感更明确
          const st = 0.0032
          const hL = elevAt(u - st, v), hR = elevAt(u + st, v)
          const hD = elevAt(u, v - st), hU = elevAt(u, v + st)
          const grad = Math.hypot(hR - hL, hU - hD)
          const lap = (hL + hR + hD + hU) * 0.25 - elev
          let shade = 1 - Math.min(0.2, grad * 0.0016)
          shade += Math.max(-0.13, Math.min(0.13, -lap * 0.02))
          tmp.multiplyScalar(Math.max(0.55, shade))
        }
        tmp.convertSRGBToLinear()
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geo.computeVertexNormals()
      scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        vertexColors: true, flatShading: false      // 平滑着色，避免 DEM 碎成砂砾
      })))

      // 水面：独立一层，略高于海床、略低于陆地 —— 海岸因此有清晰高差
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE_X, SIZE_Z),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#A2BCD4').convertSRGBToLinear(),
          transparent: true, opacity: 0.86
        })
      )
      water.rotation.x = -Math.PI / 2
      // 水面必须明显低于平原地面（海拔 0–10 m ≈ 0–0.016 世界单位），
      // 否则半透明水面会把华北/江苏平原整片盖成「海」。
      water.position.y = -0.5
      scene.add(water)

      // 海岸线已移除：
      // 这段是按 1400×1383 的地形网格逐格比对海陆画出来的，本质是像素级锯齿，
      // 在高程图上还原不出真实岸线，反而会在黄海/东海海面绕出一堆碎线，
      // 看起来像「省界画到海上」。省界数据（332 段闭合多边形）本身含沿海段，
      // 岸线轮廓由省界提供，不再需要这条额外的海岸线。

      // 省界：蓝色管状线（真正有粗细），贴着地形走，不压主路线
      const provData = root.CZ_MAP_PROVINCES
      if (provData && provData.length) {
        // 虚线纹理：蓝 / 透明交替，贴在管面上形成虚线；管半径不变，只改虚实与透明度
        const provTex = (() => {
          const W = 32
          const H = 4
          const cv = document.createElement('canvas')
          cv.width = W
          cv.height = H
          const c = cv.getContext('2d')
          c.fillStyle = '#1E4A78'
          c.fillRect(0, 0, 24, H)  // 32px 周期里 24 实 8 空，空隙比原来 19/13 短
          const tex = new THREE.CanvasTexture(cv)
          tex.wrapS = THREE.RepeatWrapping
          tex.wrapT = THREE.ClampToEdgeWrapping
          tex.encoding = THREE.sRGBEncoding
          tex.repeat.set(24, 1)
          return tex
        })()
        const provMat = new THREE.MeshBasicMaterial({
          map: provTex,
          transparent: true,
          opacity: 0.7,
          alphaTest: 0.36,
          depthWrite: false,
          fog: false
        })
        // 省界与国界分开画。
        //
        // 判定方法：把每段省界的「相邻两点」当成一条边，统计它被几个省拥有 ——
        //   2 次 → 两省共享 → 省界；
        //   1 次 → 只有本省拥有 → 外沿（陆上国界 或 海岸线）。
        // 外沿再按「是否临海」二分：临海=海岸线（不画），不临海=陆上国界（画金色凸线）。
        //
        // 高程阈值：groundY = 高程(m) × 7 / 4500，SEA = 0.005 约等于 3 m，
        // 只排掉真正的海与滩涂（早先误用 0.1 = 砍掉 64 m 以下平原，平原省份会整段消失）。
        const SEA = 0.005
        const PROBE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
        const PROBE_STEP = 0.16
        const nearSea = (x, z) => {
          // 两档步长：近处判岸线；远处（约 15 km）把岛屿内部也纳入，
          // 否则台湾、海南、舟山这些岛的中部探不到海，会被当成内陆国界画成蓝线。
          const STEPS = [PROBE_STEP, 0.55]
          for (let si = 0; si < STEPS.length; si++) {
            for (let d = 0; d < PROBE.length; d++) {
              if (groundY(x + PROBE[d][0] * STEPS[si], z + PROBE[d][1] * STEPS[si]) < SEA) return true
            }
          }
          return false
        }
        
        // 边频次统计（无向边，端点排序后作为 key）
        const edgeKey = (a, b) => {
          const ka = a[0] + ',' + a[1]
          const kb = b[0] + ',' + b[1]
          return ka < kb ? ka + '#' + kb : kb + '#' + ka
        }
        const edgeCount = new Map()
        provData.forEach(p => p.segs.forEach(seg => {
          for (let i = 0; i < seg.length - 1; i++) {
            const k = edgeKey(seg[i], seg[i + 1])
            edgeCount.set(k, (edgeCount.get(k) || 0) + 1)
          }
        }))
        
        // 边界配色统一为蓝（省界 / 国界 / 沿海段都用它），
        // 海岸线额外套一圈白色粗虚线做「整体外框」，蓝色细线压在白线之上。
        // 虚线贴图：32px 周期里 27 实 5 空（约 84% 实线）。
        // 之前 24/8 空隙偏大，叠加细管后沿岸看起来断断续续（反馈「沿海残缺」）。
        const makeDashTex = (color) => {
          const W = 32
          const H = 4
          const cv = document.createElement('canvas')
          cv.width = W
          cv.height = H
          const c = cv.getContext('2d')
          c.fillStyle = color
          c.fillRect(0, 0, 27, H)
          const tex = new THREE.CanvasTexture(cv)
          tex.wrapS = THREE.RepeatWrapping
          tex.wrapT = THREE.ClampToEdgeWrapping
          tex.encoding = THREE.sRGBEncoding
          tex.repeat.set(10, 1)
          return tex
        }
        
        // 海岸线描边：深蓝灰，给白线垫一层对比
        const coastEdgeMat = new THREE.MeshBasicMaterial({
          map: makeDashTex('#5A7796'),
          transparent: true,
          opacity: 0.75,
          alphaTest: 0.22,
          depthWrite: false,
          fog: false
        })

        // 海岸线外框：白色粗虚线
        const coastMat = new THREE.MeshBasicMaterial({
          map: makeDashTex('#FFFDF5'),
          transparent: true,
          opacity: 0.96,
          alphaTest: 0.22,
          depthWrite: false,
          fog: false
        })
        
        const seen = new Set()
        
        // 落一段折线成 Tube
        //   role 'prov'  → 省界 / 陆上国界：蓝色细线（只在陆地内部出现）
        //   role 'coast' → 海岸线：只画白色虚线，绝不叠蓝线（海上要干净）
        const putRun = (pts, role) => {
          if (pts.length < 2) return
          // 张力 0.35：0.02 近似折线，省界点（数据本身简化过 0.04°）的每个拐角
      // 都会显出毛边；抬高张力让拐角圆润，又不会像 1.0 那样过冲。
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35)
          if (role === 'coast') {
            // 双层：外层深蓝灰做描边、内层白色做本体。
            // 单层白线在米白迷雾上没有对比（江苏、上海正好在浓雾里，
            // 白线会被「洗没」，看起来就是陆地缺口）。
            const edge = new THREE.Mesh(
              new THREE.TubeGeometry(curve, Math.min(Math.max(pts.length * 4, 24), 420), 0.42, 5, false),
              coastEdgeMat
            )
            edge.renderOrder = 10
            scene.add(edge)

            const coast = new THREE.Mesh(
              new THREE.TubeGeometry(curve, Math.min(Math.max(pts.length * 4, 24), 420), 0.26, 6, false),
              coastMat
            )
            coast.renderOrder = 11
            scene.add(coast)
            return
          }
          const thin = new THREE.Mesh(
            new THREE.TubeGeometry(curve, Math.min(Math.max(pts.length * 4, 24), 420), 0.19, 6, false),
            provMat
          )
          thin.renderOrder = 2
          scene.add(thin)
        }
        
        // 按边类型把折线切成「连续同类段」，再逐段落笔
        // forceCoast = true：岛屿省（台湾、海南等）整圈都是海岸线，只画白线
        const emitSeg = (seg, forceCoast) => {
          let curType = null
          let curPts = []
          const flush = () => {
            // type 2 = 海岸线（白框 + 蓝线）；其余 = 蓝色边界
            // 海岸段与陆上段交替出现，每段常只有两三个点，门槛放宽到 2
            if (curPts.length >= 2) putRun(curPts, curType === 2 ? 'coast' : 'prov')
            curPts = []
          }
          const push = (pt, type) => {
            const x = worldX(pt[0])
            const z = worldZ(pt[1])
            const y = groundY(x, z)
            // 只把「真正沉在海里」的点排除。
            // 不能用邻域找陆地来判：珠三角/长三角这些沿海平原整体就低于 3 m，
            // 邻域内一个「高地」都没有，海岸线会被整段误删（白框画不出来的原因）。
            // 省界数据本身沿真实岸线走，落点就是岸上，不需要额外地形佐证。
            if (y < -0.002) {
              flush()
              curType = null
              return
            }
            if (type !== curType) {
              flush()
              curType = type
            }
            curPts.push(new THREE.Vector3(x, y + 0.12, z))
          }
          for (let i = 0; i < seg.length - 1; i++) {
            const cnt = edgeCount.get(edgeKey(seg[i], seg[i + 1])) || 1
            // 用边中点判类型：海岸线是锯齿状的（海/陆交替），用起点判会把段切碎
            const midLng = (seg[i][0] + seg[i + 1][0]) / 2
            const midLat = (seg[i][1] + seg[i + 1][1]) / 2
            const mx = worldX(midLng)
            const mz = worldZ(midLat)
            // 2 = 海岸线（白）；1 = 内陆外沿国界（蓝）；0 = 两省共享省界（蓝）
            // 岛屿省的内部边也一律算海岸线 —— 否则台湾/海南中部会被判成国界画蓝线，
            // 海面（视觉上包括岛屿）就会出现蓝线。
            // 外沿（cnt=1）二分：临海 → 海岸线（白）；内陆 → 国界（蓝）
            // 判定用小步长 NEAR = 0.5（≈0.15°）：
            // 之前用大发 FAR = 3.0，江苏这类「全境离海都不到 0.9°」的省份
            // 会被整体判成内陆国界，海岸段一条白线都不画（江苏陆地看起来缺口）。
            // 台湾/海南/港澳已在上面按白名单跳过描线，不再需要大发判定兜底。
            const NEAR = 0.5
            let coastal = false
            for (let d = 0; d < PROBE.length; d++) {
              if (groundY(mx + PROBE[d][0] * NEAR, mz + PROBE[d][1] * NEAR) < SEA) { coastal = true; break }
            }
            const type = cnt >= 2 ? 0 : (coastal ? 2 : 1)
            if (curPts.length === 0) push(seg[i], type)
            push(seg[i + 1], type)
          }
          flush()
        }
        
        provData.forEach(p => {
          // 九段线（100000_JD）是海域标识，不参与陆地描边
          if (p.name === '100000_JD') return

          // 岛屿省判定
          // ① 省名白名单：这些完全是岛，整圈按海岸线上白线
          // ② 几何判定：整省没有任何一条边与别的省共享（纯孤立多边形）
          // 注意台湾省数据里有少量边与福建重复（14/52），只靠 ② 判不出来，
          // 否则岛内会被当成国界画蓝线。
          const ISLAND_NAMES = { '台湾省': 1, '海南省': 1, '香港特别行政区': 1, '澳门特别行政区': 1 }
          let island = !!ISLAND_NAMES[p.name]
          if (!island) {
            island = true
            p.segs.forEach(seg => {
              for (let i = 0; i < seg.length - 1 && island; i++) {
                if ((edgeCount.get(edgeKey(seg[i], seg[i + 1])) || 1) >= 2) island = false
              }
            })
          }

          // 岛屿省整体落在迷雾区，轮廓不描（白线会把形状重新暴露出来）
          if (ISLAND_NAMES[p.name]) return

          p.segs.forEach(seg => {
            // 同一条边（正反两种走向）只画一次，避免相邻省重复描同一条省界
            const fwd = seg.map(pt => pt[0] + ',' + pt[1]).join('|')
            const rev = seg.slice().reverse().map(pt => pt[0] + ',' + pt[1]).join('|')
            if (seen.has(fwd) || seen.has(rev)) return
            seen.add(fwd)
            emitSeg(seg, island)
          })
        })

        // 省名白字：贴地一点的 Sprite，depthTest 关掉保证始终可见
        provData.forEach(p => {
          if (!p.c) return
          const lx = worldX(p.c[0])
          const lz = worldZ(p.c[1])
          // 省名不再按地形高度过滤：
          // 高程图 1400px 覆盖 63°（约 5 km/像素），上海、江苏、天津这些
          // 沿海平原的城市中心经常正好落在水域像素上（读数为 0），
          // 任何高程阈值都会把它们整片删掉（用户反馈「安徽、江苏、上海没名字」）。
          // 省界中心点一定在陆地上，直接标；只把九段线排除在外。
          if (p.name === '100000_JD') return
          const ly = Math.max(0.12, groundY(lx, lz))
          const sp = provinceLabelSprite(p.name)
          if (!sp) return
          sp.position.set(lx, ly + 1.4, lz)
          scene.add(sp)
        })

        // 城市：直辖市 / 省会首府 / 长征重点城市，字号比省名小、偏暖，不抢省名
        const cityData = root.CZ_MAP_CITIES
        if (cityData && cityData.length) {
          cityData.forEach(ct => {
            if (!ct.c) return
            const cx = worldX(ct.c[0])
            const cz = worldZ(ct.c[1])
            // 与省名同理：沿海城市中心可能落在水域像素，不做高程过滤
            const cy = Math.max(0.12, groundY(cx, cz))
            const sp = cityLabelSprite(ct.name)
            if (!sp) return
            sp.position.set(cx, cy + (ct.lv === 'key' ? 1.95 : 2.25), cz)
            scene.add(sp)
          })
        }
      }

      // ---------- 区域迷雾：长征主线以外按距离渐白 ----------
      // 目的：沙盘只交代长征经过的地带，其余省份（含台湾、海南、东北、
      // 新疆西藏等）一律被雾遮住，视线与缩放也被限制在主线附近。
      // 实现：一张径向渐变贴图铺在地形之上 —— 中心（路线包围盒）完全透明，
      // 越往外越接近纸色，最外圈几乎不透。
      const MIST_CORE = (() => {
        // 长征节点包围盒，再各向外扩 2°，让主路线周边留一点可读余量
        let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999
        nodes.forEach(n => {
          const lng = lngOf(n), lat = latOf(n)
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        })
        return { lng0: minLng - 2.0, lng1: maxLng + 2.0, lat0: minLat - 2.0, lat1: maxLat + 2.0 }
      })()

      const mistTex = (() => {
        const W = 512
        const cv = document.createElement('canvas')
        cv.width = W
        cv.height = W
        const c = cv.getContext('2d')

        const px = lng => (lng - DEM.lngMin) / (DEM.lngMax - DEM.lngMin) * W
        const py = lat => (DEM.latMax - lat) / (DEM.latMax - DEM.latMin) * W

        const cx = px((MIST_CORE.lng0 + MIST_CORE.lng1) / 2)
        const cy = py((MIST_CORE.lat0 + MIST_CORE.lat1) / 2)
        // 透明半径覆盖主线，之后快速过渡到不透明
        const r0 = Math.max(px(MIST_CORE.lng1) - px(MIST_CORE.lng0), py(MIST_CORE.lat0) - py(MIST_CORE.lat1)) * 0.52
        const r1 = r0 * 2.5

        c.clearRect(0, 0, W, W)
        const g = c.createRadialGradient(cx, cy, r0 * 0.55, cx, cy, r1)
        g.addColorStop(0, 'rgba(247, 240, 223, 0)')
        g.addColorStop(0.42, 'rgba(247, 240, 223, 0.10)')
        g.addColorStop(0.68, 'rgba(247, 240, 223, 0.80)')
        g.addColorStop(0.86, 'rgba(247, 240, 223, 0.95)')
        g.addColorStop(1, 'rgba(247, 240, 223, 0.99)')
        c.fillStyle = g
        c.fillRect(0, 0, W, W)

        const tex = new THREE.CanvasTexture(cv)
        tex.encoding = THREE.sRGBEncoding
        return tex
      })()

      const mist = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE_X, SIZE_Z),
        new THREE.MeshBasicMaterial({
          map: mistTex,
          transparent: true,
          depthWrite: false,
          depthTest: false,      // 始终压在场景最上层：雾不该被山挡住
          fog: false
        })
      )
      mist.rotation.x = -Math.PI / 2
      mist.position.y = 13
      mist.renderOrder = 9
      mist.raycast = () => {}    // 不参与拾取，别挡住节点点击
      scene.add(mist)

      // 远景"雾色围裙"：比图幅大得多，任何越界处都落进雾里，而不是露出空白
      const apron = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE_X * 4, SIZE_Z * 4),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#F2ECDC').convertSRGBToLinear() })
      )
      apron.rotation.x = -Math.PI / 2
      apron.position.y = SEA_FLOOR - 0.25
      scene.add(apron)

      buildSkirt()
    }

    // 侧壁：沿地形四边向下补一圈"厚度"，让沙盘像实体模型
    function buildSkirt() {
      const N = 180
      const halfX = SIZE_X / 2, halfZ = SIZE_Z / 2
      const edges = [
        t => [-halfX + t * SIZE_X, -halfZ],   // 北
        t => [-halfX + t * SIZE_X, halfZ],    // 南
        t => [-halfX, -halfZ + t * SIZE_Z],   // 西
        t => [halfX, -halfZ + t * SIZE_Z]     // 东
      ]
      const verts = []
      edges.forEach(pt => {
        for (let i = 0; i < N; i++) {
          const a = pt(i / N), b = pt((i + 1) / N)
          const ha = Math.max(0.03, groundY(a[0], a[1]))
          const hb = Math.max(0.03, groundY(b[0], b[1]))
          verts.push(a[0], ha, a[1], b[0], hb, b[1], b[0], 0, b[1])
          verts.push(a[0], ha, a[1], b[0], 0, b[1], a[0], 0, a[1])
        }
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        color: new THREE.Color('#C9B393').convertSRGBToLinear(),
        side: THREE.DoubleSide
      })))
    }

    /* ---------- 节点名称标签 ---------- */
    function nodeNameSprite(text) {
      const t = String(text || '')
      if (!t) return null
      const FS = 40
      const PAD = 8
      const cv = document.createElement('canvas')
      let c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      const tw = Math.ceil(c.measureText(t).width)
      cv.width = tw + PAD * 2
      cv.height = FS + PAD * 2
      c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineWidth = 8
      c.strokeStyle = 'rgba(52, 8, 14, 0.85)'
      c.strokeText(t, cv.width / 2, cv.height / 2)
      c.fillStyle = '#FFF6E2'
      c.fillText(t, cv.width / 2, cv.height / 2)
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false
      }))
      const hUnit = 2.4
      sp.scale.set(hUnit * cv.width / cv.height, hUnit, 1)
      sp.renderOrder = 8
      return sp
    }

    /* ---------- 城市标签（比省名小、偏暖，只标省会与重点城市） ---------- */
function cityLabelSprite(text) {
  const short = String(text || '').replace(/市$/, '')
  if (!short) return null
  const FS = 30
  const PAD = 8
  const cv = document.createElement('canvas')
  let c = cv.getContext('2d')
  c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
  const tw = Math.ceil(c.measureText(short).width)
  cv.width = tw + PAD * 2
  cv.height = FS + PAD * 2
  c = cv.getContext('2d')
  c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineWidth = 6
  c.strokeStyle = 'rgba(38,28,18,0.72)'
  c.strokeText(short, cv.width / 2, cv.height / 2)
  c.fillStyle = '#FFE9B8'
  c.fillText(short, cv.width / 2, cv.height / 2)
  const tex = new THREE.CanvasTexture(cv)
  tex.encoding = THREE.sRGBEncoding
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false
  }))
  const hUnit = 1.5
  sp.scale.set(hUnit * cv.width / cv.height, hUnit, 1)
  sp.renderOrder = 13   // 同省名：压在区域迷雾之上
  return sp
}

/* ---------- 省名标签（白色文字 + 深色描边） ---------- */
    function provinceLabelSprite(text) {
      const short = String(text || '')
        .replace(/(壮族|回族|维吾尔|特别)?自治区$/, '')
        .replace(/(特别行政区|省|市)$/, '')
      if (!short) return null
      const FS = 46
      const PAD = 10
      const cv = document.createElement('canvas')
      let c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      const tw = Math.ceil(c.measureText(short).width)
      cv.width = tw + PAD * 2
      cv.height = FS + PAD * 2
      c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      // 描边加重：雾区底色是米白，白字几乎融进去，必须靠深描边撑出对比
      c.lineWidth = 13
      c.strokeStyle = 'rgba(28,20,12,0.94)'
      c.fillStyle = '#FFFFFF'
      c.fillText(short, cv.width / 2, cv.height / 2)
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false
      }))
      const hUnit = 2.6
      sp.scale.set(hUnit * cv.width / cv.height, hUnit, 1)
      sp.renderOrder = 12   // 高于区域迷雾（9）：雾只模糊地形，省名仍可读
      return sp
    }

    /* ---------- 路线 ---------- */
    // 虚线贴图：沿管长方向 62% 实线 + 38% 空隙，形成加粗虚线
    function dashTexture(color) {
      const W = 64
      const H = 8
      const cv = document.createElement('canvas')
      cv.width = W
      cv.height = H
      const c = cv.getContext('2d')
      c.fillStyle = color || '#D95555'
      c.fillRect(0, 0, 48, H)
      const tex = new THREE.CanvasTexture(cv)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.encoding = THREE.sRGBEncoding
      return tex
    }

    // 沿曲线摆放方向箭头（锥体朝向切线方向）
    function addRouteArrows(curve, colorHex, count, yOffsetHint) {
      if (!curve) return
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex).convertSRGBToLinear(), fog: false
      })
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 1 : (i + 0.55) / count
        const p = curve.getPointAt(Math.min(0.999, t))
        const tan = curve.getTangentAt(Math.min(0.999, t)).normalize()
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.25, 8), mat)
        cone.position.copy(p)
        if (yOffsetHint) cone.position.y += 0.05
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
        scene.add(cone)
      }
    }

    function buildRoute() {
      const pts = nodes.map(n => new THREE.Vector3(worldX(lngOf(n)), 0, worldZ(latOf(n))))
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35)
      // 固定飞行高度：不再贴着地形起伏走，路线是一条平顺的虚线链
      const ROUTE_Y = 10.6
      const sampled = curve.getPoints(360).map(p => new THREE.Vector3(p.x, ROUTE_Y, p.z))
      const rc = new THREE.CatmullRomCurve3(sampled)

      const tex = dashTexture()
      tex.repeat.set(Math.max(14, Math.round(curve.getLength() / 2.0)), 1)

      // 半透明底衬：让虚线在深色地形上也有体积感
      scene.add(new THREE.Mesh(
        new THREE.TubeGeometry(rc, 420, 0.5, 8, false),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#C8102E').convertSRGBToLinear(),
          transparent: true, opacity: 0.12, depthWrite: false, fog: false
        })
      ))

      // 主体：加粗虚线（管半径 0.34，纹理控制虚实），颜色比定位针浅一档
      scene.add(new THREE.Mesh(
        new THREE.TubeGeometry(rc, 420, 0.44, 8, false),
        new THREE.MeshBasicMaterial({
          map: tex, color: 0xFFFFFF, transparent: true, opacity: 0.82,
          alphaTest: 0.45, depthWrite: false, fog: false
        })
      ))
      // 沿途方向箭头（主路线 6 个）
      addRouteArrows(rc, '#D95555', 6, true)
    }

    /* ---------- 友军路线 / 国军封锁 / 根据地（数据来自 js/map-factions.js） ---------- */
    function buildFactions() {
      const FACTION = root.CZ_MAP_FACTIONS
      if (!FACTION) return

      // 友军三条路线：略低于主线的固定高度，颜色与 2D 一致
      ;(FACTION.allies || []).forEach(a => {
        const pts = a.pts.map(p => new THREE.Vector3(worldX(p[0]), 9.8, worldZ(p[1])))
        if (pts.length < 2) return
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35)
        const tex = dashTexture(a.color)
        tex.repeat.set(Math.max(12, Math.round(curve.getLength() / 2.2)), 1)
        scene.add(new THREE.Mesh(
          new THREE.TubeGeometry(curve, 200, 0.24, 6, false),
          new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.62,
            alphaTest: 0.42, depthWrite: false, fog: false
          })
        ))
        addRouteArrows(curve, a.color, 3, true)
      })

      // 国军封锁：竖直半透明光墙，沿每条封锁线立起来
      const wallMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#2F5C8A').convertSRGBToLinear(),
        transparent: true, opacity: 0.46, side: THREE.DoubleSide,
        depthWrite: false, fog: false
      })
      ;(FACTION.enemyLines || []).forEach(l => {
        for (let i = 0; i < l.pts.length - 1; i++) {
          const p1 = l.pts[i]
          const p2 = l.pts[i + 1]
          const ax = worldX(p1[0])
          const az = worldZ(p1[1])
          const bx = worldX(p2[0])
          const bz = worldZ(p2[1])
          const ay = groundY(ax, az) + 0.04
          const by = groundY(bx, bz) + 0.04
          if (ay < 0.05 || by < 0.05) continue
          const H = 2.8
          const pos = new Float32Array([
            ax, ay, az, bx, by, bz, bx, by + H, bz,
            ax, ay, az, bx, by + H, bz, ax, ay + H, az
          ])
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
          geo.computeVertexNormals()
          scene.add(new THREE.Mesh(geo, wallMat))
        }
      })

      // 根据地：贴地的红色三角扇（顶点采样地形高度，跟着地形起伏）
      const baseMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#C8102E').convertSRGBToLinear(),
        transparent: true, opacity: 0.2, side: THREE.DoubleSide,
        depthWrite: false, fog: false
      })
      // 海域高度钳制：根据地是示意多边形，会伸到海岸线外。
      // 直接贴地形高度会把红色扇形摊在东海/台湾海峡上（截图里福建东侧那片红），
      // 所以海上顶点压到海平面，且整块三角形都在海上就跳过不画。
      const SEA_Y = 0.03
      // 注意：海上的点不能再 +0.16，否则永远高于 SEA_Y，下面「跳过海上扇形」的判断
      // 就永远不成立 —— 这正是红色扇形摊到福建以东海面上的原因。
      const clampY = (x, z) => {
        const g = groundY(x, z)
        return g < 0.06 ? SEA_Y : g + 0.16
      }
      ;(FACTION.bases || []).forEach(b => {
        const ring = b.ring
        if (!ring || ring.length < 3) return
        let cx = 0
        let cz = 0
        ring.forEach(p => { cx += worldX(p[0]); cz += worldZ(p[1]) })
        cx /= ring.length
        cz /= ring.length
        const cy = clampY(cx, cz)
        const pos = []
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]
          const q = ring[(i + 1) % ring.length]
          const px = worldX(p[0])
          const pz = worldZ(p[1])
          const qx = worldX(q[0])
          const qz = worldZ(q[1])
          const py = clampY(px, pz)
          const qy = clampY(qx, qz)
          // 任一顶点落在海上就跳过这一块扇形：
          // 根据地是示意多边形，压到海岸线外的那部分是「画出海面的红块」的根源，
          // 只钳高度不够 —— 三角形仍会摊在海面上，必须整块不画。
          if (py <= SEA_Y || qy <= SEA_Y) continue
          pos.push(cx, cy, cz)
          pos.push(px, py, pz)
          pos.push(qx, qy, qz)
        }
        if (!pos.length) return
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.computeVertexNormals()
        scene.add(new THREE.Mesh(geo, baseMat))

        // 根据地：插一面红旗 + 名称
        const fy = groundY(cx, cz)
        if (fy >= 0.05) buildFlag(cx, fy, cz, b.name)
      })

      // 国军封锁区：有标注位置的加文字
      ;(FACTION.enemyLines || []).forEach(l => {
        if (!l.at) return
        // 前三道在瑞金附近太密，3D 只标四条关键防线（2D 里全部有）
        if (/第[一二三]道/.test(l.label)) return
        const lx = worldX(l.at[0])
        const lz = worldZ(l.at[1])
        const ly = groundY(lx, lz)
        if (ly < 0.002) return
        const sp = factionLabel(l.label, '#E8F0FA', 'rgba(18, 38, 62, 0.85)')
        if (!sp) return
        sp.position.set(lx, ly + 2.4, lz)
        scene.add(sp)
      })
    }

    /* ---------- 根据地红旗 ---------- */
    function buildFlag(x, groundYv, z, name) {
      const POLE_H = 4.6
      const poleMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#6E5A3E').convertSRGBToLinear(), fog: false
      })
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, POLE_H, 6), poleMat)
      pole.position.set(x, groundYv + POLE_H / 2, z)
      scene.add(pole)

      // 旗面：一个小平面，红底
      const flagGeo = new THREE.PlaneGeometry(1.7, 1.05)
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({
        color: new THREE.Color('#C8102E').convertSRGBToLinear(),
        side: THREE.DoubleSide, fog: false
      }))
      flag.position.set(x + 1.3, groundYv + POLE_H - 0.8, z)
      flag.rotation.y = -0.35
      scene.add(flag)

      // 旗面小金边
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.55),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#E8C86A').convertSRGBToLinear(),
          transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false
        })
      )
      edge.position.set(x + 1.3, groundYv + POLE_H - 0.8, z - 0.01)
      edge.rotation.y = -0.35
      edge.scale.set(1.06, 1.1, 1)
      scene.add(edge)

      // 旗杆下的名称（红底白字更醒目）
      const sp = factionLabel(name, '#FFF3DC', 'rgba(120, 12, 26, 0.9)')
      if (sp) {
        sp.position.set(x, groundYv + POLE_H + 2.6, z)
        scene.add(sp)
      }
    }

    /* ---------- 通用小字标签（可指定文字色与描边色） ---------- */
    function factionLabel(text, fill, stroke) {
      const t = String(text || '')
      if (!t) return null
      const FS = 40
      const PAD = 9
      const cv = document.createElement('canvas')
      let c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      const tw = Math.ceil(c.measureText(t).width)
      cv.width = tw + PAD * 2
      cv.height = FS + PAD * 2
      c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineWidth = 8
      c.strokeStyle = stroke || 'rgba(40, 30, 20, 0.85)'
      c.strokeText(t, cv.width / 2, cv.height / 2)
      c.fillStyle = fill || '#FFFFFF'
      c.fillText(t, cv.width / 2, cv.height / 2)
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false
      }))
      const hUnit = 1.7
      sp.scale.set(hUnit * cv.width / cv.height, hUnit, 1)
      sp.renderOrder = 7
      return sp
    }

    /* ---------- 数字圆点（Sprite，省几何） ---------- */
    function hexToRgba(hex, a) {
      const n = parseInt(hex.slice(1), 16)
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
    }

    // 柔光晕（加法混合），给节点/星标做发光底座
    function glowSprite(rgba, opacity) {
      const S = 128
      const cv = document.createElement('canvas')
      cv.width = cv.height = S
      const c = cv.getContext('2d')
      const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      g.addColorStop(0, rgba)
      g.addColorStop(0.45, rgba.replace(/[\d.]+\)$/, '0.35)'))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = g
      c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.fill()
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      return new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false
      }))
    }

    function discSprite(text, fill, color) {
      const S = 192
      const cv = document.createElement('canvas')
      cv.width = cv.height = S
      const ctx = cv.getContext('2d')
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2)
      ctx.fillStyle = fill; ctx.fill()
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,252,244,.92)'; ctx.stroke()
      ctx.fillStyle = color
      ctx.font = '900 86px "Noto Serif SC", serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(text, S / 2, S / 2 + 3)
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      tex.anisotropy = 4
      return new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.88,
        depthWrite: false, depthTest: false, fog: false
      }))
    }

    // 序号牌：左侧编号圆 + 右侧站名，远景隐藏、放大后替代小圆盘
    function plateSprite(order, name, fill, color) {
      const FS = 42
      const PAD = 14
      const R = 30
      const cv = document.createElement('canvas')
      let c = cv.getContext('2d')
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      const nameW = Math.ceil(c.measureText(name).width)
      const W = PAD * 2 + R * 2 + 14 + nameW
      const H = R * 2 + PAD * 2
      cv.width = W
      cv.height = H
      c = cv.getContext('2d')
      const rr = H / 2
      c.beginPath()
      c.moveTo(rr, 0)
      c.lineTo(W - rr, 0)
      c.arcTo(W, 0, W, rr, rr)
      c.lineTo(W, H - rr)
      c.arcTo(W, H, W - rr, H, rr)
      c.lineTo(rr, H)
      c.arcTo(0, H, 0, H - rr, rr)
      c.lineTo(0, rr)
      c.arcTo(0, 0, rr, 0, rr)
      c.closePath()
      c.fillStyle = fill
      c.fill()
      c.lineWidth = 5
      c.strokeStyle = 'rgba(255,252,244,0.9)'
      c.stroke()
      // 左侧编号圆
      c.beginPath()
      c.arc(PAD + R, H / 2, R, 0, Math.PI * 2)
      c.fillStyle = 'rgba(255,252,244,0.92)'
      c.fill()
      c.fillStyle = fill
      c.font = '900 ' + Math.round(FS * 1.0) + 'px "Noto Serif SC", serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(order, PAD + R, H / 2 + 2)
      // 右侧站名
      c.fillStyle = color
      c.font = '700 ' + FS + 'px "Noto Serif SC", serif'
      c.textAlign = 'left'
      c.fillText(name, PAD + R * 2 + 14, H / 2 + 2)

      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      tex.anisotropy = 4
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.94,
        depthWrite: false, depthTest: false, fog: false
      }))
      // 世界单位高度 2.2，宽度按比例
      sp.scale.set(2.2 * W / H, 2.2, 1)
      sp.renderOrder = 11
      return sp
    }

    const nodePlates = []   // { disc, plate }，按缩放级别切换

    function buildNodes() {
      nodes.forEach((n, i) => {
        const st = STYLE[(states[n.code] || {}).state] || STYLE.open
        const x = worldX(lngOf(n)), z = worldZ(latOf(n))
        const y = Math.max(groundY(x, z), 0)

        // 定位针：细锥尖端朝下插进地形，头部放序号盘（像沙盘上插的标记）
        const pinH = 5.2
        const pin = new THREE.Mesh(
          new THREE.ConeGeometry(0.55, pinH, 12),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color('#B3253A').convertSRGBToLinear(), fog: false
          })
        )
        pin.rotation.x = Math.PI          // 锥尖朝下
        pin.position.set(x, y + pinH / 2, z)
        scene.add(pin)

        const disc = discSprite(String(n.order), st.fill, st.label)
        disc.scale.set(3.8, 3.8, 1)
        disc.position.set(x, y + pinH + 0.9, z)
        disc.renderOrder = 10
        scene.add(disc)

        // 序号牌：远景隐藏；放大后替代圆盘
        const plate = plateSprite(String(n.order), n.name, st.fill, st.label)
        plate.position.copy(disc.position)
        plate.position.y += 0.15
        plate.visible = false
        scene.add(plate)
        nodePlates.push({ disc, plate })

        // 头部光晕：标记顶端微微发光
        const halo = glowSprite(hexToRgba(st.fill, '0.85'), 0.30)
        halo.scale.set(6.4, 6.4, 1)
        halo.position.copy(disc.position)
        halo.position.y -= 0.15
        scene.add(halo)

        // 落点光晕：贴地一圈，交代"针扎在这里"
        const foot = glowSprite('rgba(232,200,106,0.9)', 0.45)
        foot.scale.set(3.6, 3.6, 1)
        foot.position.set(x, y + 0.12, z)
        scene.add(foot)

        // 不可见拾取球（手机上更好点）
        const hit = new THREE.Mesh(
          new THREE.SphereGeometry(2.6, 8, 8),
          new THREE.MeshBasicMaterial({ visible: false })
        )
        hit.position.set(x, y + pinH + 0.9, z)
        hit.userData = { node: n, index: i }
        scene.add(hit)
        pickables.push(hit)
      })

      // 起终点星标
      ;[nodes[0], nodes[nodes.length - 1]].forEach(n => {
        if (!n) return
        const x = worldX(lngOf(n)), z = worldZ(latOf(n))
        const star = makeStar(x, Math.max(groundY(x, z), 0) + 6.2, z)
        stars.push(star)
      })
    }

    function makeStar(x, y, z) {
      const shape = new THREE.Shape()
      const R = 1.25, r = 0.54
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + i * Math.PI / 5
        const rad = i % 2 === 0 ? R : r
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad
        i === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)
      }
      shape.closePath()
      const m = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#D4A017').convertSRGBToLinear(),
          side: THREE.DoubleSide, fog: false
        })
      )
      m.position.set(x, y, z)
      scene.add(m)
      // 星标外圈柔光，像刻在纸上的烫金
      const halo = glowSprite('rgba(232,200,106,0.9)', 0.34)
      halo.scale.set(7.5, 7.5, 1)
      halo.position.set(x, y, z)
      scene.add(halo)
      return m
    }

    /* ---------- 天气：只影响地形与环境光 ---------- */
    let rain = null, snow = null
    const RAIN_N = 900, SNOW_N = 640
    const target = { fogNear: 120, fogFar: 260, sun: 0.95, hemi: 0.40, rain: 0, snow: 0 }
    // 各档拉开差距：天光、雾距、亮度都不同，手机小屏也能一眼分辨
    const MODES = {
      clear: { fogNear: 130, fogFar: 280, sun: 1.10, hemi: 0.42, rain: 0, snow: 0, sky: '#F8F1E1' },
      cloud: { fogNear: 95, fogFar: 205, sun: 0.50, hemi: 0.50, rain: 0, snow: 0, sky: '#D6D3C7' },
      rain: { fogNear: 78, fogFar: 170, sun: 0.30, hemi: 0.44, rain: 0.55, snow: 0, sky: '#A9B7C2' },
      snow: { fogNear: 82, fogFar: 180, sun: 0.88, hemi: 0.58, rain: 0, snow: 1.0, sky: '#F4F8FA' },
      fog: { fogNear: 42, fogFar: 118, sun: 0.40, hemi: 0.52, rain: 0, snow: 0, sky: '#DBD5C4' }
    }

    // 自动天气：无人干预，按权重随机切换；晴天占比最高，避免长时间压住画面
    // 尊重系统「减少动态效果」：这类用户不自动切换天气；同一条判定还用于松手惯性、
    // 星点微光、雨雪粒子位移。渲染循环本身不停——那是出画面的，停了 3D 会黑屏
    const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const AUTO = opts.autoWeather !== false && !REDUCED
    const W_MIN = (opts.weatherInterval && opts.weatherInterval[0]) || 40000
    const W_MAX = (opts.weatherInterval && opts.weatherInterval[1]) || 70000
    function pickNextWeather() {
      const r = Math.random()
      if (r < 0.40) return 'clear'
      if (r < 0.60) return 'cloud'
      if (r < 0.78) return 'rain'
      if (r < 0.92) return 'snow'
      return 'fog'
    }

    function scheduleWeather() {
      const wait = W_MIN + Math.random() * (W_MAX - W_MIN)
      later(() => {
        if (disposed || lost) return
        if (!document.hidden && !autoLocked) {  // 节点天气接管时不自动覆盖
          lastWeather = pickNextWeather()
          setWeather(lastWeather)
        }
        scheduleWeather()
      }, wait)
    }

    function buildWeather() {
      const rp = new Float32Array(RAIN_N * 6)
      for (let i = 0; i < RAIN_N; i++) {
        const x = (Math.random() - 0.5) * SIZE_X, z = (Math.random() - 0.5) * SIZE_Z
        const y = Math.random() * 34
        rp[i * 6] = x; rp[i * 6 + 1] = y; rp[i * 6 + 2] = z
        rp[i * 6 + 3] = x + 0.12; rp[i * 6 + 4] = y + 1.5; rp[i * 6 + 5] = z
      }
      const rg = new THREE.BufferGeometry()
      rg.setAttribute('position', new THREE.BufferAttribute(rp, 3))
      rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
        color: 0xAEC6D4, transparent: true, opacity: 0
      }))
      rain.visible = false
      scene.add(rain)

      const sp = new Float32Array(SNOW_N * 3)
      for (let i = 0; i < SNOW_N; i++) {
        sp[i * 3] = (Math.random() - 0.5) * SIZE_X
        sp[i * 3 + 1] = Math.random() * 34
        sp[i * 3 + 2] = (Math.random() - 0.5) * SIZE_Z
      }
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
      snow = new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0xFFFFFF, size: 0.75, transparent: true, opacity: 0
      }))
      snow.visible = false
      scene.add(snow)
    }

    let autoLocked = false
    function setWeather(mode, opts) {
      // opts.lock = true → 由节点天气接管，后台随机轮换暂停；lock:false 解除
      if (opts && opts.lock === true) autoLocked = true
      if (opts && opts.lock === false) autoLocked = false
      const cfg = MODES[mode] || MODES.clear
      target.fogNear = cfg.fogNear; target.fogFar = cfg.fogFar
      target.sun = cfg.sun; target.hemi = cfg.hemi
      target.rain = cfg.rain; target.snow = cfg.snow
      scene.fog.color.set(cfg.sky)
      container.dataset.weather = mode
      // 通知外部（地图页的天气标签需要同步）
      if (onWeatherChange) onWeatherChange(mode)
    }

    function stepWeather(dt, t) {
      const k = Math.min(1, dt * 2.4)
      scene.fog.near += (target.fogNear - scene.fog.near) * k
      scene.fog.far += (target.fogFar - scene.fog.far) * k
      sun.intensity += (target.sun - sun.intensity) * k
      hemi.intensity += (target.hemi - hemi.intensity) * k

      if (rain) {
        rain.material.opacity += (target.rain - rain.material.opacity) * k
        rain.visible = rain.material.opacity > 0.01
        if (rain.visible && !REDUCED) {   // 减少动态效果：雨丝冻结，只留天气色与雾
          const p = rain.geometry.attributes.position.array
          for (let i = 0; i < RAIN_N; i++) {
            const o = i * 6, drop = 40 * dt
            p[o + 1] -= drop; p[o + 4] -= drop
            if (p[o + 1] < groundY(p[o], p[o + 2]) + 0.4) {
              const y = 30 + Math.random() * 6
              p[o] = (Math.random() - 0.5) * SIZE_X
              p[o + 2] = (Math.random() - 0.5) * SIZE_Z
              p[o + 1] = y; p[o + 3] = p[o] + 0.12; p[o + 4] = y + 1.5; p[o + 5] = p[o + 2]
            }
          }
          rain.geometry.attributes.position.needsUpdate = true
        }
      }
      if (snow) {
        snow.material.opacity += (target.snow - snow.material.opacity) * k
        snow.visible = snow.material.opacity > 0.01
        if (snow.visible && !REDUCED) {   // 减少动态效果：雪片冻结
          const p = snow.geometry.attributes.position.array
          for (let i = 0; i < SNOW_N; i++) {
            const o = i * 3
            p[o + 1] -= 3.4 * dt
            p[o] += Math.sin(t * 1.2 + i) * 0.7 * dt
            if (p[o + 1] < groundY(p[o], p[o + 2]) + 0.3) {
              p[o + 1] = 30 + Math.random() * 6
              p[o] = (Math.random() - 0.5) * SIZE_X
              p[o + 2] = (Math.random() - 0.5) * SIZE_Z
            }
          }
          snow.geometry.attributes.position.needsUpdate = true
        }
      }
    }

    /* ---------- 相机与尺寸 ---------- */
    function resize() {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      camera.fov = w / h < 0.8 ? 46 : 40
      camera.updateProjectionMatrix()
      updateCamera()
    }

    function baseDist() {
      const aspect = (container.clientWidth || 1) / (container.clientHeight || 1)
      const hFov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * aspect)
      const need = 34
      return Math.min(240, Math.max(78, need / Math.tan(hFov / 2)))
    }

    // 按当前俯角算出"地平线不会越过图幅边缘"的最大距离，超出就自动收回。
    // 这样放宽了缩放范围也不会露出空白。
    function fitZoom() {
      const halfDepth = SIZE_Z / 2 - 4
      const theta = Math.max(0.06, pitch - camera.fov * Math.PI / 360)
      const denom = Math.sin(pitch) / Math.tan(theta) - Math.cos(pitch)
      if (denom <= 0.0001) return
      const maxD = halfDepth / denom
      const maxZoom = maxD / baseDist()
      if (zoom > maxZoom) zoom = Math.max(0.45, maxZoom)
    }

    // 镜头对准「路线包围盒中心」而不是图幅中心——地形比路线大得多，
    // 这样既能把长征路线摆正，四周也仍然铺满地形
    const FOCUS = (function () {
      let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999
      nodes.forEach(n => {
        const lng = lngOf(n), lat = latOf(n)
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      })
      if (!nodes.length) return { x: 0, z: 0 }
      return { x: worldX((minLng + maxLng) / 2), z: worldZ((minLat + maxLat) / 2) }
    })()

    function updateCamera() {
      fitZoom()
      const d = baseDist() * zoom
      camera.position.set(
        FOCUS.x + Math.sin(yaw) * Math.cos(pitch) * d,
        Math.sin(pitch) * d,
        FOCUS.z + Math.cos(yaw) * Math.cos(pitch) * d
      )
      camera.lookAt(FOCUS.x, 0.6, FOCUS.z)

      // 缩放联动：zoom 越小＝相机越近（放大）。放大到 0.95 以下切序号牌（带站名）
      const near = zoom <= 0.95
      for (let i = 0; i < nodePlates.length; i++) {
        nodePlates[i].disc.visible = !near
        nodePlates[i].plate.visible = near
      }
    }

    /* ---------- 交互 ---------- */
    const dom = renderer.domElement

    // 上下文丢失：必须 preventDefault，否则浏览器不会通知恢复；
    // 同时停帧、摘定时器、置可用标记为 false，并通知外部
    function handleContextLost(e) {
      if (e && e.preventDefault) e.preventDefault()
      if (lost || destroying) return
      lost = true
      stopRaf()
      clearTimers()
      if (onLost) { try { onLost() } catch (err) {} }
    }
    dom.addEventListener('webglcontextlost', handleContextLost, false)

    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    function pick(x, y) {
      const r = dom.getBoundingClientRect()
      ndc.x = ((x - r.left) / r.width) * 2 - 1
      ndc.y = -((y - r.top) / r.height) * 2 + 1
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(pickables, false)[0]
      if (hit) onPick(hit.object.userData.node, hit.object.userData.index)
      return !!hit
    }

    dom.addEventListener('pointerdown', e => {
      if (e.isPrimary === false) return
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; yawVel = 0
      try { dom.setPointerCapture(e.pointerId) } catch (err) {}
    })

    dom.addEventListener('pointermove', e => {
      if (!dragging) return
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      moved += Math.abs(dx) + Math.abs(dy)
      lastX = e.clientX; lastY = e.clientY

      // 死区：轻触/微动不转动视角，避免误触把画面带歪
      if (moved < 8) return

      // 水平：只允许小幅左右转动（±23°），不再 360° 自由旋转。
      // 长征路线在图幅偏西，一旦允许大幅旋转，镜头会扫到东部沿海与台湾。
      const k = e.pointerType === 'touch' ? 0.0058 : 0.0038
      yaw = clampYaw(yaw - dx * k)
      // 惯性很轻：只在明确甩动时给一点点余量，随即停下；减少动态效果下直接不甩
      yawVel = !REDUCED && Math.abs(dx) > 5 ? -dx * k * 0.68 : 0
      // 鼠标还可以用纵向拖拽调俯仰；触摸的纵向留给页面滚动
      if (e.pointerType !== 'touch') {
        pitch = Math.max(0.72, Math.min(1.38, pitch + dy * 0.0026))
      }
      updateCamera()
    })

    dom.addEventListener('pointerup', e => {
      const wasDragging = dragging
      dragging = false
      if (!wasDragging) return
      if (moved < 8) {
        // 轻点：双击复位视角，单击拾取节点
        const now = Date.now()
        if (now - lastTapAt < 320) {
          lastTapAt = 0; yawVel = 0
          yaw = HOME.yaw; pitch = HOME.pitch; zoom = HOME.zoom
          updateCamera()
        } else {
          lastTapAt = now
          pick(e.clientX, e.clientY)
        }
      }
    })

    dom.addEventListener('pointercancel', () => { dragging = false; yawVel = 0 })

    dom.addEventListener('wheel', e => {
      e.preventDefault()
      yawVel = 0
      zoom = Math.max(0.7, Math.min(1.18, zoom * (1 + e.deltaY * 0.0008)))
      updateCamera()
    }, { passive: false })

    // 双指：捏合缩放 + 上下拖动调俯仰（不影响页面滚动）
    dom.addEventListener('touchmove', e => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const a = e.touches[0], b = e.touches[1]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const midY = (a.clientY + b.clientY) / 2
      if (twoPrev) {
        if (twoPrev.dist > 10 && dist > 10) {
          zoom = Math.max(0.7, Math.min(1.18, zoom * (twoPrev.dist / dist)))
        }
        pitch = Math.max(0.72, Math.min(1.38, pitch - (midY - twoPrev.midY) * 0.0038))
        updateCamera()
      }
      twoPrev = { dist, midY }
    }, { passive: false })
    dom.addEventListener('touchend', () => { twoPrev = null })

    /* ---------- 启动 ---------- */
    loadDem().then(d => {
      if (disposed || lost) return
      dem = d
      if (!dem) {
        announceFallback('地形数据加载失败')
        return
      }
      try {
        buildTerrain()
        buildRoute()
    buildFactions()
        buildNodes()
        buildWeather()
        resize()
        setWeather(lastWeather)              // 延续上次天气
        if (AUTO) scheduleWeather()          // 后台自动随机切换
      } catch (err) {
        console.error('[map3d] 构建失败', err)
        announceFallback('3D 沙盘构建失败：' + (err && err.message ? err.message : '未知错误'))
        return
      }

      const clock = new THREE.Clock()
      function loop() {
        if (disposed || lost) return
        rafId = requestAnimationFrame(loop)
        const dt = Math.min(0.05, clock.getDelta())
        const t = clock.elapsedTime

        // 松手余量：只保留很短的一点自转，很快停住，避免甩过头
        if (!dragging && Math.abs(yawVel) > 0.0006) {
          yaw = clampYaw(yaw + yawVel)
          yawVel *= 0.85
          updateCamera()
        } else if (!dragging && yawVel) {
          yawVel = 0
        }

        // 星点微光是常驻装饰动画：减少动态效果下只保留朝向，不再抖
        stars.forEach((s, i) => {
          s.lookAt(camera.position)
          if (!REDUCED) s.rotation.z += Math.sin(t + i) * 0.0006
        })
        stepWeather(dt, t)
        renderer.render(scene, camera)
      }
      loop()
    })

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resize())
      : null
    if (ro) ro.observe(container)
    addEventListener('resize', resize)

    return {
      setWeather,
      resize,
      destroy() {
        if (destroying) return
        destroying = true
        disposed = true
        stopRaf()
        clearTimers()
        removeEventListener('resize', resize)
        if (ro) ro.disconnect()
        dom.removeEventListener('webglcontextlost', handleContextLost, false)
        scene.traverse(o => {
          if (!o.isMesh && !o.isSprite && !o.isLineSegments && !o.isPoints) return
          if (o.geometry) o.geometry.dispose()
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach(m => {
            if (!m) return
            if (m.map) m.map.dispose()
            m.dispose()
          })
        })
        // 只 dispose() 不会结束上下文：连续进出 3D 会一路吃掉浏览器配额，
        // 所以必须先 forceContextLoss() 真正释放（实测 isContextLost() 由此变 true）
        try { renderer.forceContextLoss() } catch (err) {}
        renderer.dispose()
        container.innerHTML = ''
        container.removeAttribute('role')
        container.removeAttribute('aria-label')
      }
    }
  }

  root.CZ_MAP3D = { mount }
})(typeof self !== 'undefined' ? self : this)
