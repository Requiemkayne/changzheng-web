/**
 * 节点详情 —— 7 种 blocks 渲染 + 打卡 + 答题入口
 * 打卡前置：requireReadBeforeCheckin 时需「勾选已读」或「滚动到底」才亮按钮
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const F = root.CZ_FORMAT
  const api = root.CZ_API
  const progressUtil = root.CZ_PROGRESS
  const UI = root.CZ_UI

  // 返回：优先浏览器后退；直接打开的入口页（history 里没有站内上一页，或来自站外）退回首页，别把用户卡在原地
  function goBack() {
    const ref = document.referrer || ''
    const fromOtherSite = ref !== '' && ref.indexOf(location.origin) !== 0
    if (history.length > 1 && !fromOtherSite) history.back()
    else location.hash = '#/'
  }

  VIEWS.node = {
    mount(rootEl, params) {
      const code = params.code
      rootEl.innerHTML = '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>加载中…</div></div>'

      Promise.all([api.getConfig(), api.getNodes(), api.getProgress()])
        .then(([config, nodes, progress]) => {
          const node = nodes.find(n => n.code === code)
          if (!node) {
            rootEl.innerHTML = '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>节点不存在</div></div>'
            return
          }
          const st = progressUtil.computeStates(nodes, progress, config).byCode[code]
          render(rootEl, node, st, config)
        })
        .catch(err => {
          console.error('详情页加载失败', err)
          rootEl.innerHTML =
            '<div class="page-center">' + UI.icon('lantern', 'page-center-icon') + '<div>加载失败，请返回重试</div>' +
            '<div style="font-size:12px;margin-top:6px">' + F.escapeHtml(err.message) + '</div></div>'
        })
    }
  }

  /* ---------- blocks 渲染器（7 种 type，与小程序版同构） ---------- */

  // 时间点的展开内容：三段式 + 可选故事
  function timelineDetail(d) {
    if (!d) return ''
    let h = '<div class="tl-body">'
    if (d.situation) {
      h += '<div class="tl-sec"><span class="tl-sec-k">战前态势</span><p>' + F.escapeHtml(d.situation) + '</p></div>'
    }
    if (d.key) {
      h += '<div class="tl-sec"><span class="tl-sec-k">关键细节</span><p>' + F.escapeHtml(d.key) + '</p></div>'
    }
    if (d.impact) {
      h += '<div class="tl-sec"><span class="tl-sec-k">结果与影响</span><p>' + F.escapeHtml(d.impact) + '</p></div>'
    }
    if (d.story && d.story.title) {
      h += '<div class="tl-story"><span class="tl-story-k">故事</span>' +
        '<h4 class="tl-story-t">' + F.escapeHtml(d.story.title) + '</h4>' +
        '<p>' + F.escapeHtml(d.story.text) + '</p>' +
        (d.story.source
          ? '<p class="tl-story-src">出处：' + F.escapeHtml(d.story.source) + '</p>'
          : '') +
        '</div>'
    }
    return h + '</div>'
  }

  function renderBlocks(blocks) {
    let html = ''
    let dataHeaderDone = false
    ;(blocks || []).forEach(b => {
      switch (b.type) {
        case 'heading':
          html += '<div class="block block-heading">' + F.escapeHtml(b.text) + '</div>'
          break
        case 'paragraph':
          html += '<div class="block block-paragraph">' + F.escapeHtml(b.text) + '</div>'
          break
        case 'image': {
          const src = F.escapeHtml(b.src || '')
          html += '<div class="block block-image" data-src="' + src + '">' +
            (src
              ? '<img src="' + src + '" alt="' + F.escapeHtml(b.caption || '') + '">'
              : '<div class="img-ph">插画素材待交付</div>') +
            (b.caption ? '<div class="block-caption">' + F.escapeHtml(b.caption) + '</div>' : '') +
            '</div>'
          break
        }
        case 'quote':
          html += '<div class="block block-quote">「' + F.escapeHtml(b.text) + '」</div>'
          break
        case 'video': {
          // 影像资料（历史背景上方）：poster 用节点封面，避免加载前黑屏
          // portrait: 手机竖拍素材，收窄居中显示
          const vsrc = F.escapeHtml(b.src || '')
          const poster = F.escapeHtml(b.poster || '')
          if (!vsrc) break
          html += '<div class="block block-video">' +
            '<video controls playsinline preload="metadata"' +
            (b.portrait ? ' class="portrait"' : '') +
            (poster ? ' poster="' + poster + '"' : '') +
            ' aria-label="' + F.escapeHtml(b.caption || '历史影像资料') + '">' +
            '<source src="' + vsrc + '" type="video/mp4">' +
            '您的浏览器不支持视频播放。' +
            '</video>' +
            (b.caption ? '<div class="block-caption">' + F.escapeHtml(b.caption) + '</div>' : '') +
            '</div>'
          break
        }
        case 'timeline': {
          // 章节标题：让时间线自成一段，不跟正文混在一起
          html += '<div class="nsec-h"><span class="nsec-dot"></span>事件时间线</div>'
          let items = ''
          ;(b.items || []).forEach(it => {
            const has = !!(it.detail && (it.detail.situation || it.detail.key || it.detail.impact || it.detail.story))
            if (has) {
              // 有展开内容：做成可收放的手风琴
              items += '<details class="block-tl-item block-tl-fold">' +
                '<summary class="block-tl-head">' +
                  '<span class="block-tl-date">' + F.escapeHtml(it.date) + '</span>' +
                  '<span class="block-tl-text">' + F.escapeHtml(it.text) + '</span>' +
                  '<span class="block-tl-cue" aria-hidden="true"></span>' +
                '</summary>' +
                timelineDetail(it.detail) +
                '</details>'
            } else {
              items += '<div class="block-tl-item">' +
                '<div class="block-tl-date">' + F.escapeHtml(it.date) + '</div>' +
                '<div class="block-tl-text">' + F.escapeHtml(it.text) + '</div>' +
                '</div>'
            }
          })
          html += '<div class="block block-timeline">' + items + '</div>'
          break
        }
        case 'dataCard':
          if (!dataHeaderDone) {
            dataHeaderDone = true
            html += '<div class="nsec-h"><span class="nsec-dot"></span>关键数据</div>'
          }
          html += '<div class="block block-dataGrid">' +
            '<div class="block-dataCard">' +
              '<div class="block-dataCard-label">' + F.escapeHtml(b.label) + '</div>' +
              '<div class="block-dataCard-value">' + F.escapeHtml(b.value) + '</div>' +
            '</div></div>'
          break
        // 未知类型忽略（向后兼容：文案组新增类型不崩页面）
      }
    })
    return html
  }

  function render(rootEl, node, st, config) {
    const cover = node.images && node.images.cover ? node.images.cover : ''
    const requireRead = config.requireReadBeforeCheckin
    const hasImg = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(cover)

    let html =
      '<div class="page">' +
      '<button type="button" class="back-link">‹ 返回</button>' +
      '<div class="cover' + (hasImg ? ' has-img' : '') + '">' +
        (hasImg ? '<img src="' + F.escapeHtml(cover) + '" alt="">' : '') +
        '<div class="cover-name">' + F.escapeHtml(node.name) + '</div>' +
        '<div class="cover-sub">' + F.escapeHtml(node.subtitle) + '</div>' +
        '<div class="cover-hairline"></div>' +
        '<div class="cover-meta">' + F.escapeHtml(node.stage) + ' · ' + F.escapeHtml(node.date) + ' · ' + F.escapeHtml(node.location.name) + '</div>' +
      '</div>' +
      weatherHTML(node) +
      renderBlocks(node.detail.blocks) +
      '<div class="checkin-area">' + checkinHTML(node, st, requireRead) + '</div>' +
      '</div>'

    rootEl.innerHTML = html
    bind(rootEl, node, st, config)
  }

  // 天气条：每个节点都有（数据在 js/mock/weather.js），无特效的节点也照常展示
  function weatherHTML(node) {
    const wx = (root.CZ_MOCK_WEATHER || {})[node.code]
    if (!wx) return ''
    return '<div class="node-wx">' +
      '<div class="node-wx-row">' +
        '<span class="node-wx-label">天气</span>' +
        '<span class="node-wx-name">' + F.escapeHtml(wx.label) + '</span>' +
      '</div>' +
      '<div class="node-wx-desc">' + F.escapeHtml(wx.desc) + '</div>' +
      '</div>'
  }

  function checkinHTML(node, st, requireRead) {
    if (st.state === 'locked') {
      return '<div class="checkin-hint">' + UI.icon('lock') + ' 顺序模式：需先完成上一节点的打卡才能到达本节点</div>'
    }
    if (st.state === 'checkedIn' || st.state === 'quizPassed') {
      const passed = st.state === 'quizPassed'
      // 签名动作：盖章落印（到达=红章，通关=金章）
      return '<div class="checkin-done">' +
        '<div class="stamp' + (passed ? ' stamp-gold' : '') + ' stamp-in"><span>' + (passed ? '通 关' : '到 达') + '</span></div>' +
        '<div class="checkin-done-text">' + (passed ? '本节点已通关' : '已到达打卡') + '</div>' +
        '<div class="checkin-done-sub">' + (passed ? '历史最佳 ' + st.quizBest + ' 分' : '完成答题即可通关本节点') + '</div>' +
        '<div class="quiz-actions">' +
          '<button class="btn btn-primary" id="go-quiz">' + (passed ? '再次挑战' : '挑战答题') + '</button>' +
        '</div>' +
        '</div>'
    }
    // state === open
    let html = ''
    if (requireRead) {
      html +=
        '<div class="checkin-hint">阅读完本页历史知识后，勾选「已读完」或滑动到页面底部即可打卡</div>' +
        '<label class="read-row"><input type="checkbox" id="read-check"> 我已认真阅读完本节点内容</label>'
    }
    html +=
      '<button class="btn btn-primary" id="btn-checkin" disabled>' + UI.icon('flag') + ' 到达打卡</button>'
    return html
  }

  function bind(rootEl, node, st, config) {
    const requireRead = config.requireReadBeforeCheckin

    const backBtn = rootEl.querySelector('.back-link')
    if (backBtn) backBtn.addEventListener('click', goBack)

    // 插图点击放大（fileID 素材交付后同逻辑换新标签页预览）
    rootEl.querySelectorAll('.block-image[data-src]').forEach(el => {
      el.addEventListener('click', () => {
        const src = el.dataset.src
        if (src) window.open(src, '_blank')
      })
    })

    const quizBtn = rootEl.querySelector('#go-quiz')
    if (quizBtn) {
      quizBtn.addEventListener('click', () => {
        location.hash = '#/quiz/node/' + node.code
      })
    }

    const checkinBtn = rootEl.querySelector('#btn-checkin')
    if (checkinBtn) {
      const readCheck = rootEl.querySelector('#read-check')
      let readByScroll = false
      const update = () => {
        checkinBtn.disabled = requireRead && !(readCheck.checked || readByScroll)
      }
      if (readCheck) {
        readCheck.addEventListener('change', update)
      }
      let onScroll = null
      if (requireRead) {
        onScroll = () => {
          const bottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 60
          if (bottom && !readByScroll) {
            readByScroll = true
            update()
          }
        }
        window.addEventListener('scroll', onScroll)
      }
      update()

      checkinBtn.addEventListener('click', () => {
        checkinBtn.disabled = true
        checkinBtn.innerHTML = '打卡中…'
        api.checkin(node.code).then(r => {
          if (!r.ok) {
            UI.toast('打卡失败，请重试')
            checkinBtn.disabled = false
            return
          }
          if (r.alreadyChecked) {
            UI.toast('已打过卡')
          } else {
            UI.toast('打卡成功')
          }
          // 重新渲染为已打卡态（盖章动画随 stamp-in 触发）
          const st2 = progressUtil.computeStates([node], r.progress, config).byCode[node.code]
          render(rootEl, node, st2, config)
          if (onScroll) window.removeEventListener('scroll', onScroll)
        }).catch(() => {
          UI.toast('打卡失败，请重试')
          checkinBtn.disabled = false
          checkinBtn.innerHTML = UI.icon('flag') + ' 到达打卡'
        })
      })

      return () => { if (onScroll) window.removeEventListener('scroll', onScroll) }
    }
  }
})(typeof self !== 'undefined' ? self : this)
