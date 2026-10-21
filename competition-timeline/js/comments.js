/* ============================================================
   留言区
   存储策略（自动选择）：
     1) 服务端 SQLite —— 有 server/server.js 在运行时，留言存数据库、所有人共享
     2) 浏览器 localStorage —— 没有服务时（直接双击 index.html）降级为本地存储
   两种模式都支持发表、删除、字数提示；渲染一律用 textContent，天然防 XSS
   单一留言池：全站只有一处留言区（总览页），服务端已经没有「篇目（page）」维度，
   读取即全部已通过留言，发表也不再带篇目
   本地降级仍要合并读篇目时代留下的四个存储键——那些离线留言不能因为取消篇目而消失
   ============================================================ */
(function () {
  'use strict';

  var MAX = 200;
  var LS_NAME = 'tl-comments-name';

  // 篇目时代按「前缀:篇目」分过存储键，那些留言不能因为取消篇目而消失，
  // 所以仍然 4 条键合并读；写入只落 index 键，否则把别篇留言搬过来会造成重复与丢失
  var LS_KEYS = ['tl-comments-v1', 'tl-comments-v1:series-2', 'tl-comments-v1:series-3', 'tl-comments-v1:index'];
  var LS_WRITE_KEY = 'tl-comments-v1:index';

  var form = document.getElementById('cmt-form');
  var nameEl = document.getElementById('cmt-name');
  var textEl = document.getElementById('cmt-text');
  var leftEl = document.getElementById('cmt-left');
  var countEl = document.querySelector('.cmt-count');
  var hintEl = document.getElementById('cmt-hint');
  var listEl = document.getElementById('cmt-list');
  var emptyEl = document.getElementById('cmt-empty');
  var submitEl = form ? form.querySelector('.cmt-submit') : null;

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

  function lsReadKey(key) {
    try {
      var raw = localStorage.getItem(key);
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

  function lsWriteKey(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      showHint('保存失败：浏览器存储不可用或已满');
      return false;
    }
  }

  // 把 4 条键并成一份：同一 id 只留一条，再按时间倒序
  // （与服务端 created_at DESC 的展示顺序一致）
  function lsLoad() {
    var seen = {};
    var all = [];
    LS_KEYS.forEach(function (key) {
      lsReadKey(key).forEach(function (m) {
        if (seen[m.id]) return;
        seen[m.id] = true;
        all.push(m);
      });
    });
    all.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return all;
  }

  // 不知道 id 落在哪条键，逐条定位，只重写命中的那条
  function lsRemove(id) {
    var hit = false;
    var ok = true;
    LS_KEYS.forEach(function (key) {
      var list = lsReadKey(key);
      var next = list.filter(function (m) { return m.id !== id; });
      if (next.length === list.length) return;
      hit = true;
      if (!lsWriteKey(key, next)) ok = false;
    });
    return hit && ok;
  }

  function lsUid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- 统一读写 ---------------- */

  function loadAll() {
    if (mode === 'server') {
      return apiFetch(API, { method: 'GET' }, 4000)
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
        body: JSON.stringify({ name: name, text: text })
      }, 6000).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || !d.ok) throw new Error((d && d.message) || '提交失败');
          return d;
        });
      });
    }

    var item = { id: lsUid(), name: name || '匿名', text: text, ts: Date.now() };
    var list = lsReadKey(LS_WRITE_KEY);
    list.unshift(item);
    if (!lsWriteKey(LS_WRITE_KEY, list)) throw new Error('保存失败');
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
    if (!lsRemove(id)) throw new Error('删除失败');
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

  function showHint(msg, ok) {
    if (!hintEl) return;
    hintEl.textContent = msg || '';
    hintEl.classList.toggle('is-ok', !!ok);
  }

  function renderList(items) {
    listEl.textContent = '';
    if (emptyEl) emptyEl.style.display = items.length ? 'none' : '';

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
          return null;
        }
        showHint('留言已发布', true);
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
