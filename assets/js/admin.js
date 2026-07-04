/* 後台維護邏輯：登入 → 分頁 → CRUD */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var TOKEN_KEY = 'shinnyo_admin_token';

  // 各內容類型的欄位定義（須與 GAS 的 SCHEMA 對應）
  var COLLECTIONS = [
    {
      type: 'news', label: '最新消息',
      icon: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h6"/>',
      fields: [
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'date', label: '日期', type: 'date', req: true },
        { k: 'body', label: '內容', type: 'textarea' },
        { k: 'link', label: '連結網址（選填）', type: 'url' },
        { k: 'pinned', label: '置頂', type: 'bool' },
        { k: 'order', label: '排序（數字越小越前）', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return r.date + (truthy(r.pinned) ? ' · 置頂' : ''); }
    },
    {
      type: 'podcast', label: 'Podcast',
      icon: '<path d="M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M5 11a7 7 0 0 0 14 0"/>',
      fields: [
        { k: 'ep', label: '集數（如 EP.13）', type: 'text' },
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'guest', label: '來賓', type: 'text' },
        { k: 'date', label: '日期', type: 'date' },
        { k: 'desc', label: '內容簡介', type: 'textarea' },
        { k: 'link', label: '收聽連結', type: 'url' },
        { k: 'cover', label: '封面縮圖網址（選填）', type: 'url' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return (r.ep ? r.ep + '｜' : '') + r.title; },
      sub: function (r) { return [r.guest, r.date].filter(Boolean).join(' · '); }
    },
    {
      type: 'calendar', label: '行事曆',
      icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
      fields: [
        { k: 'date', label: '日期', type: 'date', req: true },
        { k: 'title', label: '活動名稱', type: 'text', req: true },
        { k: 'location', label: '地點', type: 'text' },
        { k: 'tag', label: '分類（如 法會／共修／月曆）', type: 'text' },
        { k: 'desc', label: '說明', type: 'textarea' },
        { k: 'link', label: '連結網址（PDF／文件）', type: 'url' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [r.date, r.location, r.tag].filter(Boolean).join(' · '); }
    },
    {
      type: 'newsletter', label: '親苑時報',
      icon: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
      fields: [
        { k: 'issue', label: '期別（如 2026-06）', type: 'text', req: true },
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'date', label: '發行日期', type: 'date' },
        { k: 'link', label: 'PDF／閱讀連結', type: 'url' },
        { k: 'cover', label: '封面縮圖網址（選填）', type: 'url' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [r.issue, r.date].filter(Boolean).join(' · '); }
    },
    {
      type: 'dharma', label: '瑞聲法語',
      icon: '<path d="M12 3c4 4 4 8 0 12-4-4-4-8 0-12z"/><path d="M5 21c3-4 11-4 14 0"/>',
      fields: [
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'category', label: '分類（瑞聲法語／法母十七訓）', type: 'text' },
        { k: 'date', label: '日期', type: 'date' },
        { k: 'content', label: '法語內容', type: 'textarea', req: true },
        { k: 'link', label: '全文連結（選填）', type: 'url' },
        { k: 'cover', label: '封面縮圖網址（選填）', type: 'url' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [r.category, r.date].filter(Boolean).join(' · '); }
    },
    {
      type: 'tools', label: '互動程式',
      icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8M12 8v8"/>',
      fields: [
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'desc', label: '描述', type: 'textarea' },
        { k: 'link', label: '程式連結', type: 'url', req: true },
        { k: 'icon', label: '圖示文字（如 史、訓）', type: 'text' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [r.desc, r.link].filter(Boolean).join(' · '); }
    },
    {
      type: 'talks', label: '真如開講',
      icon: '<path d="M4 6h16v9H8l-4 4z"/><path d="M8 10h8M8 13h5"/>',
      fields: [
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'icon', label: '圖示', type: 'text' },
        { k: 'desc', label: '說明', type: 'textarea' },
        { k: 'link', label: '網址', type: 'url', req: true },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [r.icon, r.desc, r.link].filter(Boolean).join(' · '); }
    }
  ];

  function truthy(v) { var s = String(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || v === true; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function byType(t) { return COLLECTIONS.filter(function (c) { return c.type === t; })[0]; }
  function dateValue(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!m) return '';
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }

  var token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  var cache = {};        // type -> records
  var current = COLLECTIONS[0].type;
  var editing = null;    // 正在編輯的紀錄（null = 新增）

  // ---------- 提示 ----------
  var toastEl = $('#toast'), toastT;
  function toast(msg, isErr) {
    toastEl.textContent = msg; toastEl.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.className = 'toast'; }, 2600);
  }
  function alertBox(el, msg, type) {
    el.textContent = msg; el.className = 'alert ' + (type || 'err');
    if (!msg) el.className = 'alert';
  }
  function setPasswordVisible(input, visible, btn) {
    if (!input) return;
    input.type = visible ? 'text' : 'password';
    if (btn) btn.textContent = visible ? '隱藏' : '顯示';
  }
  document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = $('#' + btn.getAttribute('data-toggle-password'));
      setPasswordVisible(input, input && input.type === 'password', btn);
    });
  });

  // ---------- 登入 ----------
  function showLogin() { $('#loginView').style.display = 'grid'; $('#adminShell').classList.remove('active'); }
  function showAdmin() {
    $('#loginView').style.display = 'none'; $('#adminShell').classList.add('active');
    $('#modePill').textContent = API.modeLabel();
    if (API.isReadOnly()) document.body.classList.add('readonly-mode');
    buildTabs(); selectTab(current); loadAll();
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pwd = $('#pwd').value;
    if (API.isReadOnly()) {
      var note = API.mode === 'published'
        ? '目前為唯讀模式（讀取已發布的 Google 試算表）。可瀏覽資料，但需在 Google 試算表內編輯；如要在後台直接增刪改，請部署 GAS 並設定 GAS_URL。'
        : '尚未設定資料來源，僅能預覽介面（無法儲存）。';
      alertBox($('#loginAlert'), note, 'ok');
      token = 'readonly-token';
      if ($('#rememberLogin') && $('#rememberLogin').checked) localStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.setItem(TOKEN_KEY, token);
      setTimeout(showAdmin, 800); return;
    }
    var btn = $('#loginBtn'); btn.textContent = '登入中…'; btn.disabled = true;
    API.login(pwd).then(function (res) {
      btn.textContent = '登入'; btn.disabled = false;
      if (res.ok && res.token) {
        token = res.token;
        if ($('#rememberLogin') && $('#rememberLogin').checked) {
          localStorage.setItem(TOKEN_KEY, token);
          sessionStorage.removeItem(TOKEN_KEY);
        } else {
          sessionStorage.setItem(TOKEN_KEY, token);
          localStorage.removeItem(TOKEN_KEY);
        }
        alertBox($('#loginAlert'), '', '');
        showAdmin();
      } else {
        alertBox($('#loginAlert'), res.error || '登入失敗。', 'err');
      }
    }).catch(function () { btn.textContent = '登入'; btn.disabled = false; alertBox($('#loginAlert'), '連線失敗，請檢查 GAS 網址。', 'err'); });
  });

  $('#logoutBtn').addEventListener('click', function () {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  });

  // ---------- 分頁 ----------
  function buildTabs() {
    $('#tabs').innerHTML = COLLECTIONS.map(function (c) {
      return '<button class="tab" data-type="' + c.type + '">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">' + c.icon + '</svg>' +
        '<span>' + esc(c.label) + '</span><span class="badge" id="badge-' + c.type + '">0</span></button>';
    }).join('');
    $('#panels').innerHTML = COLLECTIONS.map(function (c) {
      return '<section class="panel" data-type="' + c.type + '">' +
        '<div class="panel-head"><h2>' + esc(c.label) + '</h2>' +
        '<button class="btn btn-gold btn-sm" data-add="' + c.type + '">＋ 新增</button></div>' +
        '<div class="rec-list" id="list-' + c.type + '"><div class="empty">載入中…</div></div></section>';
    }).join('');
    $('#tabs').querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { selectTab(t.dataset.type); });
    });
    $('#panels').querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.dataset.add, null); });
    });
  }
  function selectTab(type) {
    current = type;
    $('#tabs').querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.type === type); });
    $('#panels').querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.dataset.type === type); });
  }

  // ---------- 載入與渲染 ----------
  function loadAll() { COLLECTIONS.forEach(function (c) { loadType(c.type); }); }
  function seedFallbackRows(type) {
    return ((window.SEED_DATA && window.SEED_DATA[type]) || []).map(function (r) {
      var copy = Object.assign({}, r);
      copy._seedFallback = true;
      return copy;
    });
  }
  function loadType(type) {
    API.list(type).then(function (res) {
      if (!res.ok) {
        if ((type === 'tools' || type === 'talks') && window.SEED_DATA && window.SEED_DATA[type]) {
          cache[type] = seedFallbackRows(type);
          renderList(type);
          toast('互動程式已先載入預設資料；若要編輯，請同步部署 GAS。', true);
          return;
        }
        toast(res.error || '讀取失敗', true); return;
      }
      cache[type] = res.data || [];
      if (type === 'talks' && !cache[type].length) cache[type] = seedFallbackRows(type);
      renderList(type);
    });
  }
  function renderList(type) {
    var c = byType(type), list = cache[type] || [], el = $('#list-' + type);
    $('#badge-' + type).textContent = list.length;
    if (!list.length) { el.innerHTML = '<div class="empty">尚無資料，點右上角「新增」建立第一筆。</div>'; return; }
    el.innerHTML = list.map(function (r) {
      return '<div class="rec"><div class="rec-main"><h4>' + esc(c.title(r) || '(無標題)') + '</h4>' +
        '<div class="sub">' + esc(c.sub(r) || '') + '</div></div>' +
        '<div class="rec-actions">' +
        '<button class="icon-btn" data-edit="' + esc(r.id) + '" title="編輯"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 5l4 4"/></svg></button>' +
        '<button class="icon-btn danger" data-del="' + esc(r.id) + '" title="刪除"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>' +
        '</div></div>';
    }).join('');
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(type, find(type, b.dataset.edit)); });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { removeRecord(type, b.dataset.del); });
    });
  }
  function find(type, id) { return (cache[type] || []).filter(function (r) { return String(r.id) === String(id); })[0]; }

  // ---------- 編輯彈窗 ----------
  function fieldHtml(f, val) {
    var v = esc(f.type === 'date' ? dateValue(val) : (val == null ? '' : val));
    if (f.type === 'textarea') return '<textarea id="f_' + f.k + '"' + (f.req ? ' required' : '') + '>' + v + '</textarea>';
    if (f.type === 'bool') return '<select id="f_' + f.k + '"><option value="">否</option><option value="TRUE"' + (truthy(val) ? ' selected' : '') + '>是</option></select>';
    var t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
    var input = '<input type="' + t + '" id="f_' + f.k + '" value="' + v + '"' +
      (f.type === 'date' ? ' class="date-picker"' : '') +
      (f.type === 'url' ? ' inputmode="url" autocomplete="url"' : '') +
      (f.req ? ' required' : '') + ' />';
    return input;
  }
  function openEditor(type, record) {
    current = type; editing = record;
    var c = byType(type);
    $('#modalTitle').textContent = (record ? '編輯' : '新增') + '：' + c.label;
    alertBox($('#modalAlert'), '', '');
    var compact = ['order', 'pinned', 'date', 'issue', 'ep'];
    $('#formFields').innerHTML = c.fields.map(function (f) {
      return '<div class="field"><label>' + esc(f.label) + (f.req ? ' *' : '') + '</label>' +
        fieldHtml(f, record ? record[f.k] : (f.k === 'category' && type === 'dharma' ? '瑞聲法語' : '')) + '</div>';
    }).join('');
    $('#modalMask').classList.add('open');
    document.documentElement.classList.add('admin-modal-open');
  }
  function closeEditor() {
    $('#modalMask').classList.remove('open');
    document.documentElement.classList.remove('admin-modal-open');
    editing = null;
  }
  $('#cancelBtn').addEventListener('click', closeEditor);
  $('#modalMask').addEventListener('click', function (e) { if (e.target === $('#modalMask')) return; });

  $('#recordForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = byType(current), rec = {};
    var seedFallback = editing && editing._seedFallback;
    if (editing && !seedFallback) rec.id = editing.id;
    c.fields.forEach(function (f) {
      var el = $('#f_' + f.k);
      if (el) rec[f.k] = f.type === 'url' ? el.value.trim() : el.value;
    });
    if (API.isReadOnly()) { toast(API.mode === 'published' ? '唯讀模式：請在 Google 試算表編輯' : '展示模式無法儲存', true); return; }
    var btn = $('#saveBtn'); btn.disabled = true; btn.textContent = '儲存中…';
    var op = editing && !seedFallback ? API.update(current, rec, token) : API.create(current, rec, token);
    op.then(function (res) {
      btn.disabled = false; btn.textContent = '儲存';
      if (res.ok) {
        closeEditor(); toast(editing ? '已更新' : '已新增'); loadType(current);
      } else {
        alertBox($('#modalAlert'), res.error || '儲存失敗', 'err');
        if (/未授權|逾時/.test(res.error || '')) setTimeout(function () { $('#logoutBtn').click(); }, 1500);
      }
    }).catch(function () { btn.disabled = false; btn.textContent = '儲存'; alertBox($('#modalAlert'), '連線失敗', 'err'); });
  });

  function removeRecord(type, id) {
    var c = byType(type), r = find(type, id);
    if (!confirm('確定刪除「' + (c.title(r) || '此筆') + '」？此動作無法復原。')) return;
    if (API.isReadOnly()) { toast(API.mode === 'published' ? '唯讀模式：請在 Google 試算表刪除' : '展示模式無法刪除', true); return; }
    API.remove(type, id, token).then(function (res) {
      if (res.ok) { toast('已刪除'); loadType(type); }
      else { toast(res.error || '刪除失敗', true); }
    });
  }

  // ---------- 修改密碼 ----------
  function closePwdModal() {
    $('#pwdMask').classList.remove('open');
    document.documentElement.classList.remove('admin-modal-open');
  }
  $('#pwdBtn').addEventListener('click', function () {
    alertBox($('#pwdAlert'), '', '');
    $('#pwdForm').reset();
    document.querySelectorAll('#pwdForm [data-toggle-password]').forEach(function (btn) {
      setPasswordVisible($('#' + btn.getAttribute('data-toggle-password')), false, btn);
    });
    $('#pwdMask').classList.add('open');
    document.documentElement.classList.add('admin-modal-open');
  });
  $('#pwdCancel').addEventListener('click', closePwdModal);
  $('#pwdMask').addEventListener('click', function (e) { if (e.target === $('#pwdMask')) return; });
  $('#pwdForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (API.isReadOnly()) { alertBox($('#pwdAlert'), '唯讀模式無法修改密碼。', 'err'); return; }
    API.changePassword($('#oldPwd').value, $('#newPwd').value, token).then(function (res) {
      if (res.ok) { alertBox($('#pwdAlert'), '密碼已更新。', 'ok'); setTimeout(closePwdModal, 1200); }
      else alertBox($('#pwdAlert'), res.error || '更新失敗', 'err');
    });
  });

  // ---------- 啟動 ----------
  if (token) { showAdmin(); } else { showLogin(); }
})();



