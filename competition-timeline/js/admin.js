/* ============================================================
   管理后台逻辑
   登录 → 留言审核（通过/拒绝/删除/批量/清空）→ 管理员账号管理
   ============================================================ */
(function () {
  'use strict';

  var state = {
    user: null,
    status: 'pending',
    page: 'all',          // all | series-1 | series-2
    items: [],
    selected: new Set(),
    counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
  };

  var $ = function (id) { return document.getElementById(id); };

  // 安全绑定：元素不存在时静默跳过。
  // 早先直接写 $('btn-logout').addEventListener(...)，一旦 HTML 少一个按钮，
  // 整份脚本就会在这一行崩掉，后面所有绑定（含新增管理员）都不再执行。
  function on(id, evt, fn) {
    var el = $(id);
    if (el) el.addEventListener(evt, fn);
  }

  var viewLogin = $('view-login');
  var viewPanel = $('view-panel');
  var topbarActions = $('topbar-actions');
  var loginForm = $('login-form');
  var loginHint = $('login-hint');
  var panelHint = $('panel-hint');
  var userHint = $('user-hint');
  var listEl = $('mod-list');
  var emptyEl = $('mod-empty');

  /* ---------------- 工具 ---------------- */

  function api(path, opts) {
    var o = Object.assign({ headers: {}, credentials: 'same-origin' }, opts || {});
    if (o.body && typeof o.body !== 'string') {
      o.body = JSON.stringify(o.body);
      o.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) {
          var err = new Error(d.message || d.error || '请求失败');
          err.status = r.status;
          err.code = d.error;
          throw err;
        }
        return d;
      });
    });
  }

  function hint(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-ok', !!ok);
  }

  function fmt(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var STATUS_TEXT = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
  var PAGE_TEXT = { 'series-1': '系列一', 'series-2': '系列二', 'series-3': '系列三' };

  /* ---------------- 视图切换 ---------------- */

  function showLogin() {
    viewLogin.hidden = false;
    viewPanel.hidden = true;
    topbarActions.hidden = true;
    state.user = null;
  }

  function showPanel() {
    viewLogin.hidden = true;
    viewPanel.hidden = false;
    topbarActions.hidden = false;
    if ($('whoami')) $('whoami').textContent = state.user ? state.user.username : '—';

    // 按当前主机名推导主站地址，换 IP / 换机器都不用改代码
    var host = location.hostname || '127.0.0.1';
    var demoLink = $('goto-demo');
    var siteLink = $('goto-site');
    if (demoLink) demoLink.href = 'http://' + host + ':8088/?demo=1';
    if (siteLink) siteLink.href = 'http://' + host + ':8088/';
  }

  /* ---------------- 列表 ---------------- */

  function renderCounts() {
    var c = state.counts;
    $('n-pending').textContent = c.pending;
    $('n-approved').textContent = c.approved;
    $('n-rejected').textContent = c.rejected;
    $('n-all').textContent = c.all;

    var badge = $('pending-badge');
    if (badge) {
      badge.hidden = c.pending === 0;
      $('pending-num').textContent = c.pending;
    }
  }

  function renderList() {
    listEl.textContent = '';
    emptyEl.hidden = state.items.length > 0;

    state.items.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'mod-item is-' + m.status + (m.pinned ? ' is-pinned' : '');

      var top = document.createElement('div');
      top.className = 'mod-top';

      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'mod-chk';
      chk.checked = state.selected.has(m.id);
      chk.setAttribute('aria-label', '选择这条留言');
      chk.addEventListener('change', function () {
        if (chk.checked) state.selected.add(m.id);
        else state.selected.delete(m.id);
        updateSelection();
      });

      var name = document.createElement('span');
      name.className = 'mod-name';
      name.textContent = m.name || '匿名';

      var time = document.createElement('span');
      time.className = 'mod-time';
      time.textContent = fmt(m.ts);

      var ip = document.createElement('span');
      ip.className = 'mod-ip';
      ip.textContent = m.ip || '';

      var tag = document.createElement('span');
      tag.className = 'mod-tag ' + m.status;
      tag.textContent = STATUS_TEXT[m.status] || m.status;

      // 所属篇目（老数据迁移后为 series-1）
      var pageTag = document.createElement('span');
      pageTag.className = 'mod-page';
      pageTag.textContent = PAGE_TEXT[m.page] || m.page || '系列一';
      pageTag.title = '所属篇目：' + pageTag.textContent;

      top.appendChild(chk);
      top.appendChild(name);
      top.appendChild(time);
      top.appendChild(ip);
      top.appendChild(pageTag);
      top.appendChild(tag);

      // 已置顶标记（管理员列表里用小印，与前台大印呼应）
      if (m.pinned) {
        var pinTag = document.createElement('span');
        pinTag.className = 'mod-pin-seal';
        pinTag.textContent = '优秀';
        pinTag.title = '已置顶为优秀留言';
        top.appendChild(pinTag);
      }

      var text = document.createElement('p');
      text.className = 'mod-text';
      text.textContent = m.text;

      var acts = document.createElement('div');
      acts.className = 'mod-actions';

      if (m.status !== 'approved') {
        var bOk = document.createElement('button');
        bOk.type = 'button';
        bOk.className = 'btn-sm btn-ok';
        bOk.textContent = '通过';
        bOk.addEventListener('click', function () { audit([m.id], 'approve'); });
        acts.appendChild(bOk);
      }
      if (m.status !== 'rejected') {
        var bNo = document.createElement('button');
        bNo.type = 'button';
        bNo.className = 'btn-sm btn-warn';
        bNo.textContent = '拒绝';
        bNo.addEventListener('click', function () { audit([m.id], 'reject'); });
        acts.appendChild(bNo);
      }
      // 置顶（仅已通过的留言可置顶）
      if (m.status === 'approved') {
        var bPin = document.createElement('button');
        bPin.type = 'button';
        bPin.className = 'btn-sm pin-toggle ' + (m.pinned ? 'btn-pinned' : 'btn-ghost');
        bPin.textContent = m.pinned ? '取消置顶' : '置顶';
        bPin.title = m.pinned ? '取消优秀标记' : '置顶为优秀留言';
        bPin.addEventListener('click', function () { togglePin(m.id, !m.pinned); });
        acts.appendChild(bPin);
      }

      var bDel = document.createElement('button');
      bDel.type = 'button';
      bDel.className = 'btn-sm btn-danger';
      bDel.textContent = '删除';
      bDel.addEventListener('click', function () { removeOne(m.id); });
      acts.appendChild(bDel);

      li.appendChild(top);
      li.appendChild(text);
      li.appendChild(acts);
      listEl.appendChild(li);
    });

    updateSelection();
  }

  function updateSelection() {
    $('sel-count').textContent = '已选 ' + state.selected.size + ' 条';
    var all = state.items.length > 0 && state.selected.size === state.items.length;
    $('chk-all').checked = all;
  }

  function load() {
    var qs = '/api/admin/comments?status=' + encodeURIComponent(state.status) +
      '&page=' + encodeURIComponent(state.page);
    return api(qs)
      .then(function (d) {
        state.items = d.items || [];
        state.counts = d.counts || state.counts;
        // 清理已不存在的选中项
        var ids = new Set(state.items.map(function (m) { return m.id; }));
        state.selected.forEach(function (id) { if (!ids.has(id)) state.selected.delete(id); });
        renderCounts();
        renderList();
      })
      .catch(function (e) {
        if (e.status === 401) { showLogin(); }
        else hint(panelHint, e.message);
      });
  }

  /* ---------------- 操作 ---------------- */

  function audit(ids, action) {
    if (!ids.length) return hint(panelHint, '请先勾选留言');
    hint(panelHint, '处理中…');
    api('/api/admin/audit', { method: 'POST', body: { ids: ids, action: action } })
      .then(function (d) {
        hint(panelHint, (action === 'approve' ? '已通过 ' : '已拒绝 ') + d.affected + ' 条', true);
        state.selected.clear();
        return load();
      })
      .catch(function (e) { hint(panelHint, e.message); });
  }

  function togglePin(id, pinned) {
    api('/api/admin/pin', { method: 'POST', body: { ids: [id], pinned: pinned } })
      .then(function (d) {
        if (!d.affected) {
          hint(panelHint, '只有「已通过」的留言才能置顶', false);
          return;
        }
        hint(panelHint, pinned ? '已置顶为优秀留言' : '已取消置顶', true);
        return load();
      })
      .catch(function (e) { hint(panelHint, e.message); });
  }

  function pinSelected(pinned) {
    if (!state.selected.size) return hint(panelHint, '请先勾选留言');
    api('/api/admin/pin', { method: 'POST', body: { ids: Array.from(state.selected), pinned: pinned } })
      .then(function (d) {
        hint(panelHint,
          (pinned ? '已置顶 ' : '已取消置顶 ') + d.affected + ' 条' +
          (pinned && d.affected < state.selected.size ? '（仅有已通过的留言可置顶）' : ''),
          d.affected > 0);
        state.selected.clear();
        return load();
      })
      .catch(function (e) { hint(panelHint, e.message); });
  }

  function removeOne(id) {
    if (!window.confirm('删除后不可恢复，确定删除这条留言？')) return;
    api('/api/admin/comments/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () {
        hint(panelHint, '已删除', true);
        state.selected.delete(id);
        return load();
      })
      .catch(function (e) { hint(panelHint, e.message); });
  }

  function removeSelected() {
    if (!state.selected.size) return hint(panelHint, '请先勾选留言');
    if (!window.confirm('确定删除选中的 ' + state.selected.size + ' 条留言？')) return;
    var ids = Array.from(state.selected);
    var done = 0;
    var fail = 0;
    var seq = Promise.resolve();
    ids.forEach(function (id) {
      seq = seq.then(function () {
        return api('/api/admin/comments/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () { done++; })
          .catch(function () { fail++; });
      });
    });
    seq.then(function () {
      hint(panelHint, '已删除 ' + done + ' 条' + (fail ? '，失败 ' + fail + ' 条' : ''), !fail);
      state.selected.clear();
      return load();
    });
  }

  function clearScope(scope) {
    var label = scope === 'all' ? '全部留言' : (scope === 'rejected' ? '已拒绝的留言' : scope);
    if (!window.confirm('确定清空' + label + '？此操作不可撤销。')) return;
    api('/api/admin/clear', { method: 'POST', body: { scope: scope } })
      .then(function (d) {
        hint(panelHint, '已清空 ' + d.affected + ' 条', true);
        state.selected.clear();
        return load();
      })
      .catch(function (e) { hint(panelHint, e.message); });
  }

  /* ---------------- 账号 ---------------- */

  function loadUsers() {
    return api('/api/admin/users').then(function (d) {
      var ul = $('user-list');
      ul.textContent = '';
      (d.items || []).forEach(function (u) {
        var li = document.createElement('li');

        var name = document.createElement('span');
        name.className = 'u-name';
        name.textContent = u.username;

        var role = document.createElement('span');
        role.className = 'u-role';
        role.textContent = u.role === 'owner' ? '主管理员' : '管理员';

        li.appendChild(name);
        li.appendChild(role);

        if (state.user && u.id === state.user.id) {
          var me = document.createElement('span');
          me.className = 'u-me';
          me.textContent = '（当前登录）';
          li.appendChild(me);
        }

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-sm btn-danger u-del';
        del.textContent = '删除';
        del.disabled = (state.user && u.id === state.user.id) || (d.items || []).length <= 1;
        del.addEventListener('click', function () { deleteUser(u.id, u.username); });
        li.appendChild(del);

        ul.appendChild(li);
      });
    });
  }

  function deleteUser(id, name) {
    if (!window.confirm('确定删除管理员「' + name + '」？')) return;
    api('/api/admin/users/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { hint(userHint, '已删除管理员 ' + name, true); return loadUsers(); })
      .catch(function (e) { hint(userHint, e.message); });
  }

  /* ---------------- 事件绑定 ---------------- */

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var username = $('login-user').value.trim();
    var password = $('login-pass').value;
    if (!username || !password) return hint(loginHint, '请输入用户名和密码');

    var btn = loginForm.querySelector('button');
    btn.disabled = true;
    api('/api/admin/login', { method: 'POST', body: { username: username, password: password } })
      .then(function (d) {
        state.user = d.user;
        $('login-pass').value = '';
        hint(loginHint, '');
        showPanel();
        return load().then(loadUsers);
      })
      .catch(function (err) { hint(loginHint, err.message); })
      .then(function () { btn.disabled = false; });
  });

  on('btn-logout', 'click', function () {
    api('/api/admin/logout', { method: 'POST' }).finally(function () { showLogin(); });
  });

  // 状态标签栏（只认 .tabs-status 下的 .tab，避免和篇目栏互相干扰）
  Array.prototype.forEach.call(document.querySelectorAll('.tabs-status .tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tabs-status .tab'), function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      state.status = tab.dataset.status;
      state.selected.clear();
      load();
    });
  });

  // 篇目标签栏
  Array.prototype.forEach.call(document.querySelectorAll('.tabs-page .tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tabs-page .tab'), function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      state.page = tab.dataset.page;
      state.selected.clear();
      load();
    });
  });

  on('chk-all', 'change', function (e) {
    if (e.target.checked) state.items.forEach(function (m) { state.selected.add(m.id); });
    else state.selected.clear();
    renderList();
  });

  on('btn-approve', 'click', function () { audit(Array.from(state.selected), 'approve'); });
  on('btn-reject', 'click', function () { audit(Array.from(state.selected), 'reject'); });
  on('btn-pin', 'click', function () { pinSelected(true); });
  on('btn-unpin', 'click', function () { pinSelected(false); });
  on('btn-del-sel', 'click', removeSelected);

  Array.prototype.forEach.call(document.querySelectorAll('[data-clear]'), function (b) {
    b.addEventListener('click', function () { clearScope(b.dataset.clear); });
  });

  on('btn-add-user', 'click', function () {
    var u = $('new-user').value.trim();
    var p = $('new-pass').value;
    if (!u || !p) return hint(userHint, '请输入用户名和密码');
    api('/api/admin/users', { method: 'POST', body: { username: u, password: p } })
      .then(function (d) {
        hint(userHint, '已添加管理员 ' + d.user.username, true);
        $('new-user').value = '';
        $('new-pass').value = '';
        return loadUsers();
      })
      .catch(function (e) { hint(userHint, e.message); });
  });

  on('btn-change-pw', 'click', function () {
    var o = $('pw-old').value;
    var n = $('pw-new').value;
    if (!o || !n) return hint(userHint, '请填写当前密码和新密码');
    api('/api/admin/password', { method: 'POST', body: { oldPassword: o, newPassword: n } })
      .then(function () {
        hint(userHint, '密码已修改，下次登录请使用新密码', true);
        $('pw-old').value = '';
        $('pw-new').value = '';
      })
      .catch(function (e) { hint(userHint, e.message); });
  });

  /* ---------------- 启动 ---------------- */

  api('/api/admin/me')
    .then(function (d) {
      state.user = d.user;
      showPanel();
      return load().then(loadUsers);
    })
    .catch(function () { showLogin(); });
})();
