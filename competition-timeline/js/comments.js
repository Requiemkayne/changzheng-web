/* ============================================================
   留言区
   存储策略（自动选择）：
     1) 服务端 SQLite —— 有 server/server.js 在运行时，留言存数据库、所有人共享
     2) 浏览器 localStorage —— 没有服务时（直接双击 index.html）降级为本地存储
   两种模式都支持发表、删除、字数提示；渲染一律用 textContent，天然防 XSS
   按篇隔离：篇目取自页面 <html data-page="...">，服务端用 ?page= 过滤，
   本地降级用「前缀:篇目」的存储键；series-1 沿用旧键，历史留言不丢
   ============================================================ */
(function () {
  'use strict';

  var MAX = 200;
  var LS_NAME = 'tl-comments-name';

  // 归属篇目：由页面在 <html data-page="...">（或 <body data-page>）声明，
  // 读不到就回退 series-1（与服务端缺省一致），不在这里硬编码某一篇
  var PAGE = (function () {
    var v = document.documentElement ? document.documentElement.getAttribute('data-page') : '';
    if (!v && document.body) v = document.body.getAttribute('data-page') || '';
    return v || 'series-1';
  })();

  // 本地存储按篇隔离；series-1 沿用旧键 tl-comments-v1，旧留言照常读得到
  var LS_KEY = PAGE === 'series-1' ? 'tl-comments-v1' : 'tl-comments-v1:' + PAGE;

  var form = document.getElementById('cmt-form');
  var nameEl = document.getElementById('cmt-name');
  var textEl = document.getElementById('cmt-text');
  var leftEl = document.getElementById('cmt-left');
  var countEl = document.querySelector('.cmt-count');
  var hintEl = document.getElementById('cmt-hint');
  var listEl = document.getElementById('cmt-list');
  var emptyEl = document.getElementById('cmt-empty');
  var submitEl = form ? form.querySelector('.cmt-submit') : null;
  var openEl = document.getElementById('cmt-open');
  var composeEl = document.getElementById('cmt-compose');
  var closeEl = document.getElementById('cmt-close');
  var totalEl = document.getElementById('cmt-total');

  if (!form || !textEl || !listEl) return;

  /* ---------------- 存储后端 ---------------- */

  var API = (location.protocol === 'file:')
    ? 'http://127.0.0.1:8899/api/comments'
    : '/api/comments';

  var mode = 'local';   // 'server' | 'local'
  var OWN_KEY = 'tl-comments-own';   // 本机留言的归属令牌 { id: token }

  /* ---------------- 归属令牌（只存本机，用于删自己的留言） ---------------- */

  function ownLoad() {
    try {
      var raw = localStorage.getItem(OWN_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function ownSave(map) {
    try { localStorage.setItem(OWN_KEY, JSON.stringify(map)); } catch (e) { /* 忽略 */ }
  }

  function ownRemember(id, token) {
    if (!id || !token) return;
    var map = ownLoad();
    map[id] = token;
    ownSave(map);
  }

  function ownForget(id) {
    var map = ownLoad();
    if (Object.prototype.hasOwnProperty.call(map, id)) {
      delete map[id];
      ownSave(map);
    }
  }

  function ownToken(id) {
    var map = ownLoad();
    return map[id] || null;
  }

  function apiFetch(url, opts, timeout) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var o = Object.assign({}, opts || {});
    if (ctrl) {
      o.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, timeout || 4000);
    }
    return fetch(url, o).then(function (r) { return r; })['finally'](function () {
      if (timer) clearTimeout(timer);
    });
  }

  /* ---------------- 本地存储实现 ---------------- */

  function lsLoad() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (m) {
        return m && typeof m.id === 'string' && typeof m.text === 'string';
      });
    } catch (e) {
      return [];
    }
  }

  function lsSave(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      showHint('保存失败：浏览器存储不可用或已满');
      return false;
    }
  }

  function lsUid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- 统一读写 ---------------- */

  function loadAll() {
    if (mode === 'server') {
      return apiFetch(API + '?page=' + encodeURIComponent(PAGE), { method: 'GET' }, 4000)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.ok) throw new Error('BAD');
          return data.items || [];
        });
    }
    return Promise.resolve(lsLoad());
  }

  function createOne(name, text) {
    if (mode === 'server') {
      return apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, text: text, page: PAGE })
      }, 6000).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || !d.ok) throw new Error((d && d.message) || '提交失败');
          return d;
        });
      });
    }

    var item = { id: lsUid(), name: name || '匿名', text: text, ts: Date.now() };
    var list = lsLoad();
    list.unshift(item);
    if (!lsSave(list)) throw new Error('保存失败');
    return Promise.resolve({ ok: true, item: item, pending: false });
  }

  function deleteOne(id) {
    if (mode === 'server') {
      var token = ownToken(id);
      if (!token) throw new Error('只能删除自己发表的留言');
      return apiFetch(API + '/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      }, 6000).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || !d.ok) throw new Error((d && d.message) || '删除失败');
          ownForget(id);
          return d;
        });
      });
    }
    var list = lsLoad().filter(function (m) { return m.id !== id; });
    if (!lsSave(list)) throw new Error('删除失败');
    return Promise.resolve();
  }

  /* ---------------- 渲染 ---------------- */

  function fmtTime(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    var hm = p(d.getHours()) + ':' + p(d.getMinutes());
    if (sameDay) return '今天 ' + hm;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + hm;
  }

  /* ---------------- 写留言浮层 ---------------- */

  function openCompose() {
    if (!composeEl) return;
    composeEl.hidden = false;
    if (openEl) openEl.hidden = true;
    // 浮层是绝对定位，不会撑高父容器，这里用 class 明确给面板留出高度
    var panel = composeEl.closest ? composeEl.closest('.cmt-panel') : null;
    if (panel) panel.classList.add('is-composing');
    // 等浮层显示后再聚焦，否则 iOS 会把页面顶上去
    setTimeout(function () { if (textEl) textEl.focus(); }, 60);
  }

  function closeCompose() {
    if (!composeEl || composeEl.hidden) return;
    composeEl.hidden = true;
    if (openEl) openEl.hidden = false;
    var panel = composeEl.closest ? composeEl.closest('.cmt-panel') : null;
    if (panel) panel.classList.remove('is-composing');
  }

  function showHint(msg, ok) {
    if (!hintEl) return;
    hintEl.textContent = msg || '';
    hintEl.classList.toggle('is-ok', !!ok);
  }

  function renderList(items) {
    listEl.textContent = '';
    if (emptyEl) emptyEl.style.display = items.length ? 'none' : '';
    if (totalEl) totalEl.textContent = items.length ? '共 ' + items.length + ' 条' : '暂无';

    items.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'cmt-item' + (m.pinned ? ' is-pinned' : '');
      li.dataset.id = m.id;

      // 优秀留言：加盖金印（样式对齐 DESIGN.md 的 .stamp / .stamp-gold）
      if (m.pinned) {
        var seal = document.createElement('span');
        seal.className = 'cmt-stamp';
        seal.setAttribute('role', 'img');
        seal.setAttribute('aria-label', '优秀留言');
        seal.textContent = '优秀';
        li.appendChild(seal);
      }

      var head = document.createElement('div');
      head.className = 'cmt-head';

      var name = document.createElement('span');
      name.className = 'cmt-name';
      name.textContent = m.name || '匿名';
      name.title = name.textContent;

      var time = document.createElement('time');
      time.className = 'cmt-time';
      try { time.dateTime = new Date(m.ts).toISOString(); } catch (e) { /* 忽略 */ }
      time.textContent = fmtTime(m.ts);

      head.appendChild(name);
      head.appendChild(time);

      // 仅本人的留言显示删除：本地模式下全部是本机数据；
      // 服务器模式下凭本机保存的归属令牌判定
      var isMine = (mode === 'local') ? true : !!ownToken(m.id);
      if (isMine) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'cmt-del';
        del.textContent = '删除';
        del.setAttribute('aria-label', '删除我发表的这条留言');
        del.addEventListener('click', function () { removeComment(m.id, del); });
        head.appendChild(del);
      }

      var body = document.createElement('p');
      body.className = 'cmt-text';
      body.textContent = m.text;

      li.appendChild(head);
      li.appendChild(body);
      listEl.appendChild(li);
    });
  }

  function refresh() {
    return loadAll()
      .then(renderList)
      .catch(function () {
        if (mode === 'server') {
          mode = 'local';
          return loadAll().then(renderList);
        }
      });
  }

  /* ---------------- 行为 ---------------- */

  function removeComment(id, btn) {
    if (!window.confirm('确定删除这条留言？')) return;
    if (btn) btn.disabled = true;
    deleteOne(id)
      .then(function () {
        showHint('留言已删除', true);
        return refresh();
      })
      .catch(function (e) {
        if (btn) btn.disabled = false;
        showHint(e.message || '删除失败');
      });
  }

  function updateCount() {
    var left = MAX - textEl.value.length;
    if (leftEl) leftEl.textContent = left < 0 ? 0 : left;
    if (countEl) countEl.classList.toggle('is-warn', left <= 20);
    if (submitEl) submitEl.disabled = left < 0;
  }


  /* ---------------- 事件 ---------------- */

  if (openEl) openEl.addEventListener('click', openCompose);
  if (closeEl) closeEl.addEventListener('click', closeCompose);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeCompose();
  });

  textEl.addEventListener('input', function () {
    updateCount();
    if (textEl.getAttribute('aria-invalid') === 'true') {
      textEl.removeAttribute('aria-invalid');
      showHint('');
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var text = (textEl.value || '').trim();
    var name = (nameEl && nameEl.value ? nameEl.value : '').trim();

    if (!text) {
      textEl.setAttribute('aria-invalid', 'true');
      showHint('留言内容不能为空');
      textEl.focus();
      return;
    }
    if (text.length > MAX) {
      textEl.setAttribute('aria-invalid', 'true');
      showHint('留言最多 ' + MAX + ' 字');
      textEl.focus();
      return;
    }

    if (submitEl) submitEl.disabled = true;

    createOne(name.slice(0, 16), text)
      .then(function (res) {
        if (nameEl) {
          try { localStorage.setItem(LS_NAME, name); } catch (err) { /* 忽略 */ }
        }
        // 记住归属令牌，之后才能删掉自己这条
        if (res && res.ownerToken && res.item && res.item.id) {
          ownRemember(res.item.id, res.ownerToken);
        }
        textEl.value = '';
        textEl.removeAttribute('aria-invalid');
        updateCount();

        if (res && res.pending) {
          // 审核制：不立即出现在列表里
          showHint('留言已提交，等待管理员审核', true);
          closeCompose();
          return null;
        }
        showHint('留言已发布', true);
        closeCompose();
        return refresh();
      })
      .then(function () { textEl.focus(); })
      .catch(function (err) {
        showHint(err.message || '发布失败，请稍后再试');
      })
      .then(function () {
        if (submitEl) submitEl.disabled = false;
      });
  });

  /* ---------------- 初始化 ---------------- */

  if (nameEl) {
    try {
      var saved = localStorage.getItem(LS_NAME);
      if (saved) nameEl.value = saved;
    } catch (e) { /* 忽略 */ }
  }

  updateCount();

  // 探测服务端（/api/health），据此决定存储模式
  var health = API.replace(/\/comments$/, '/health');
  apiFetch(health, { method: 'GET' }, 2500)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { mode = (d && d.ok) ? 'server' : 'local'; })
    .catch(function () { mode = 'local'; })
    .then(function () {
      return refresh();
    });
})();
