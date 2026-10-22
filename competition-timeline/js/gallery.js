/* ============================================================
   赛场图集 · 点击放大查看
   - 点击 / 回车 / 空格 → 灯箱放大查看，从卡片位置 FLIP 展开
   - 点空白处（遮罩）或 Esc 关闭，焦点回到原卡片
   - 灯箱无关闭按钮：底部只留一行提示文字
   - 尊重 prefers-reduced-motion：不做位移动画，直接显示
   ============================================================ */
(function () {
  'use strict';

  var stage = document.querySelector('.gal-stage');
  if (!stage) return;

  var cards = Array.prototype.slice.call(stage.querySelectorAll('.gal-card'));
  if (!cards.length) return;

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var modal = null;
  var scrim = null;
  var imgEl = null;
  var currentCard = null;
  var opened = false;
  var frontZ = 40;   // 图集内卡片的层级基准，最近查看的递增到最前（灯箱 120 仍在最上层）

  /* ---------------- 构建灯箱（首次点击时才建） ---------------- */

  function build() {
    modal = document.createElement('div');
    modal.className = 'gal-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '照片查看');
    modal.setAttribute('aria-describedby', 'gal-modal-hint');
    modal.tabIndex = -1;

    scrim = document.createElement('div');
    scrim.className = 'gal-modal-scrim';

    var fig = document.createElement('figure');
    fig.className = 'gal-modal-figure';

    imgEl = document.createElement('img');
    imgEl.className = 'gal-modal-img';
    imgEl.alt = '';
    fig.appendChild(imgEl);

    // 唯一的文字：提示如何关闭（字体按设计系统：正文黑体栈 / 12px / 字距 0.08em）
    var hint = document.createElement('p');
    hint.className = 'gal-modal-hint';
    hint.id = 'gal-modal-hint';
    hint.textContent = '点击空白处关闭';

    modal.appendChild(scrim);
    modal.appendChild(fig);
    modal.appendChild(hint);
    document.body.appendChild(modal);

    // 点遮罩（图片以外的空白）关闭
    scrim.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target === scrim) close();
    });
  }

  /* ---------------- 动画 ---------------- */

  // 读元素当前的实际旋转角（度），让收起时能落在卡片自身的倾斜姿态上
  function rotationOf(el) {
    var t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    var m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    var v = m[1].split(',').map(parseFloat);
    return Math.atan2(v[1], v[0]) * 180 / Math.PI;
  }

  // 以「中心对齐 + 同角度」计算落地变换。
  // 注意：卡片带旋转，getBoundingClientRect 给的是外接矩形（比实际宽），
  // 尺寸必须取 offsetWidth（布局尺寸，不受 transform 影响），
  // 角度要读卡片容器（.gal-card）的矩阵，图片本身没有 transform。
  function landingTransform(cardImg) {
    var card = cardImg.closest('.gal-card') || cardImg.parentElement;
    var rot = rotationOf(card);

    var rect = cardImg.getBoundingClientRect();
    var mrect = imgEl.getBoundingClientRect();
    if (!rect.width || !mrect.width) return null;

    // 旋转围绕元素中心，所以矩形中心即视觉中心，可直接用于对位
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var mcx = mrect.left + mrect.width / 2;
    var mcy = mrect.top + mrect.height / 2;

    var scale = cardImg.offsetWidth / imgEl.offsetWidth;
    var dx = cx - mcx;
    var dy = cy - mcy;

    return 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ') rotate(' + rot + 'deg)';
  }

  function expandFrom(cardImg) {
    imgEl.style.transformOrigin = '50% 50%';

    if (reduce) {
      imgEl.style.transition = 'none';
      imgEl.style.transform = 'none';
      scrim.style.transition = 'none';
      scrim.style.opacity = '1';
      return;
    }

    scrim.style.transition = 'none';
    scrim.style.opacity = '0';

    var startTf = landingTransform(cardImg);
    if (!startTf) {
      // 尺寸还没算出来：至少让遮罩出现，避免留下看不见的死界面
      requestAnimationFrame(function () {
        scrim.style.transition = 'opacity .32s ease';
        scrim.style.opacity = '1';
      });
      return;
    }

    imgEl.style.transition = 'none';
    imgEl.style.transform = startTf;

    requestAnimationFrame(function () {
      scrim.style.transition = 'opacity .32s ease';
      scrim.style.opacity = '1';
    });

    void imgEl.offsetWidth; // 强制回流，确保起始帧生效

    requestAnimationFrame(function () {
      // 展开：先快后慢，像照片从相册里被抽起来
      imgEl.style.transition = 'transform .44s cubic-bezier(.40,.14,.30,1)';
      imgEl.style.transform = 'translate(0,0) scale(1) rotate(0deg)';
    });
  }

  function collapseTo(cardImg) {
    var finish = function () {
      modal.classList.remove('is-open');
      modal.classList.remove('is-closing');
      document.documentElement.classList.remove('gal-lock');
      imgEl.style.transition = 'none';
      imgEl.style.transform = 'none';
      imgEl.removeAttribute('src');
      opened = false;
      if (currentCard) {
        if (typeof currentCard.focus === 'function') currentCard.focus();
        // 落位这一帧直接交还层次：此时大图与卡片完全重合，切换不产生位移
        currentCard.classList.remove('is-front');
        currentCard.style.zIndex = '';
      }
      currentCard = null;
    };

    if (reduce || !cardImg) { finish(); return; }

    // 以未变换状态量基准，再算出落点
    imgEl.style.transition = 'none';
    imgEl.style.transform = 'none';
    imgEl.style.transformOrigin = '50% 50%';

    var endTf = landingTransform(cardImg);
    if (!endTf) { finish(); return; }

    // 收拢阶段淡掉「相框」与投影，落回卡片时只剩画面本身，不会留下硬边
    modal.classList.add('is-closing');

    void imgEl.offsetWidth;

    requestAnimationFrame(function () {
      // 收回：纯位移，无淡入淡出、无回弹；曲线单调减速，末段贴住卡片
      imgEl.style.transition = 'transform .38s cubic-bezier(.32,.06,.26,1)';
      imgEl.style.transform = endTf;
      scrim.style.transition = 'opacity .34s ease';
      scrim.style.opacity = '0';
      window.setTimeout(finish, 385);
    });
  }

  /* ---------------- 收回层次 ---------------- */

  function clearTuck(card) {
    if (!card || !card._tuckTimers) return;
    card._tuckTimers.forEach(window.clearTimeout);
    card._tuckTimers = null;
    card._tucking = false;
    card.style.transform = '';
    card.style.transition = '';
  }

  /* ---------------- 开关 ---------------- */

  function open(card) {
    if (opened) return;
    var cardImg = card.querySelector('img');
    if (!cardImg) return;

    if (!modal) build();

    clearTuck(card);

    // 抬起被查看的卡片：收缩落位时它必须完整露出，
    // 否则它被中间主图压住的那一角会在灯箱消失的瞬间「换回」别人的画面。
    // 用递增层级，最近查看的一张永远压在最前，不会出现并列。
    card.style.zIndex = String(++frontZ);
    card.classList.add('is-front');

    currentCard = card;
    opened = true;

    imgEl.src = cardImg.currentSrc || cardImg.src;
    imgEl.alt = cardImg.alt || '';

    modal.classList.add('is-open');
    document.documentElement.classList.add('gal-lock');
    modal.focus({ preventScroll: true });

    var start = function () { expandFrom(cardImg); };
    if (imgEl.complete && imgEl.naturalWidth) start();
    else imgEl.addEventListener('load', start, { once: true });
  }

  function close() {
    if (!opened) return;
    var cardImg = currentCard ? currentCard.querySelector('img') : null;
    collapseTo(cardImg);
  }

  /* ---------------- 事件 ---------------- */

  cards.forEach(function (card) {
    card.addEventListener('click', function () { open(card); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        open(card);
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (!opened) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      close();
    }
  });

  window.addEventListener('resize', function () {
    if (!opened) return;
    imgEl.style.transition = 'none';
    imgEl.style.transform = 'none';
  });
})();
