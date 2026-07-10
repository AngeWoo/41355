/* 後台維護邏輯：登入 → 分頁 → CRUD */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var TOKEN_KEY = 'shinnyo_admin_token_v2';
  var LEGACY_TOKEN_KEY = 'shinnyo_admin_token';

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
      sub: function (r) { return simpleDate(r.date) + (truthy(r.pinned) ? ' · 置頂' : ''); }
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
      sub: function (r) { return [r.guest, simpleDate(r.date)].filter(Boolean).join(' · '); }
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
      sub: function (r) { return [simpleDate(r.date), r.location, r.tag].filter(Boolean).join(' · '); }
    },
    {
      type: 'headquarters', label: '總部會聯絡事項',
      icon: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
      fields: [
        { k: 'date', label: '日期', type: 'date' },
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'category', label: '分類', type: 'text' },
        { k: 'body', label: '內容', type: 'textarea' },
        { k: 'link', label: '連結網址（選填）', type: 'url' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [simpleDate(r.date), r.category].filter(Boolean).join(' · '); }
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
      sub: function (r) { return [r.issue, simpleDate(r.date)].filter(Boolean).join(' · '); }
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
      sub: function (r) { return [r.category, simpleDate(r.date)].filter(Boolean).join(' · '); }
    },
    {
      type: 'tools', label: '互動程式',
      icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8M12 8v8"/>',
      fields: [
        { k: 'title', label: '標題', type: 'text', req: true },
        { k: 'date', label: '日期', type: 'date' },
        { k: 'desc', label: '描述', type: 'textarea' },
        { k: 'link', label: '程式連結', type: 'url', req: true },
        { k: 'icon', label: '圖示文字（如 史、訓）', type: 'text' },
        { k: 'order', label: '排序', type: 'number' }
      ],
      title: function (r) { return r.title; },
      sub: function (r) { return [simpleDate(r.date), r.desc, r.link].filter(Boolean).join(' · '); }
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
    },
    {
      type: 'members', label: '會員',
      icon: '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      fields: [
        { k: 'name', label: '姓名', type: 'text', req: true },
        { k: 'dharmaName', label: '經名', type: 'text', req: true },
        { k: 'email', label: 'Email', type: 'text', req: true },
        { k: 'mobile', label: '手機', type: 'text', req: true }
      ],
      title: function (r) { return r.name; },
      sub: function (r) { return [r.dharmaName, r.email, r.mobile].filter(Boolean).join(' · '); }
    }
  ];

  function truthy(v) { var s = String(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || v === true; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function byType(t) { return COLLECTIONS.filter(function (c) { return c.type === t; })[0]; }
  function simpleDate(v) { return dateValue(v); }
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
  var seedingTools = false;
  var savingSort = {};

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
  function refreshPageSoon(delay) {
    setTimeout(function () { window.location.reload(); }, delay || 450);
  }
  function statsSummary(stats) {
    stats = stats || {};
    return [
      ['PODCAST', stats.podcast],
      ['最新消息', stats.news],
      ['親苑時報', stats.newsletter],
      ['瑞聲法語', stats.dharma],
      ['近期活動', stats.calendar]
    ].map(function (row) {
      return row[0] + ' ' + (Number(row[1]) || 0) + '+';
    }).join('、');
  }
  function latestSummary(latest) {
    latest = latest || {};
    return [
      ['最新消息', latest.news],
      ['PODCAST', latest.podcast],
      ['行事曆', latest.calendar],
      ['聯絡事項', latest.headquarters],
      ['親苑時報', latest.newsletter],
      ['瑞聲法語', latest.dharma],
      ['互動程式', latest.tools]
    ].map(function (row) {
      return row[0] + ' ' + (Number(row[1]) || 0);
    }).join('、');
  }
  function refreshLatest(manual) {
    if (!API.recalculateLatest) {
      if (manual) toast('目前版本不支援計算最新上架。', true);
      return Promise.resolve(false);
    }
    var btn = $('#recalcLatestBtn');
    if (manual && btn) { btn.disabled = true; btn.textContent = '計算中…'; }
    return API.recalculateLatest(token).then(function (res) {
      if (manual && btn) { btn.disabled = false; btn.textContent = '計算最新上架'; }
      if (res && res.ok) {
        if (manual) toast('最新上架已重新計算：' + latestSummary(res.latest));
        return true;
      }
      if (res && isAuthExpiredError(res.error || '')) handleAuthExpired(res.error);
      else if (manual) toast((res && res.error) || '計算最新上架失敗', true);
      return false;
    }).catch(function () {
      if (manual && btn) { btn.disabled = false; btn.textContent = '計算最新上架'; }
      if (manual) toast('計算最新上架失敗，請檢查連線。', true);
      return false;
    });
  }
  function refreshStats(manual) {
    if (!API.recalculateStats) {
      if (manual) toast('目前版本不支援重新計算統計。', true);
      return Promise.resolve(false);
    }
    var btn = $('#recalcStatsBtn');
    if (manual && btn) { btn.disabled = true; btn.textContent = '計算中…'; }
    return API.recalculateStats(token).then(function (res) {
      if (manual && btn) { btn.disabled = false; btn.textContent = '重新計算統計'; }
      if (res && res.ok) {
        if (manual) toast('統計已重新計算：' + statsSummary(res.stats));
        return true;
      }
      if (res && isAuthExpiredError(res.error || '')) handleAuthExpired(res.error);
      else if (manual) toast((res && res.error) || '重新計算失敗', true);
      return false;
    }).catch(function () {
      if (manual && btn) { btn.disabled = false; btn.textContent = '重新計算統計'; }
      if (manual) toast('重新計算失敗，請檢查連線。', true);
      return false;
    });
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
  function clearStoredToken() {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  function showLogin() {
    document.body.classList.remove('admin-auth-pending');
    $('#loginView').style.display = 'grid';
    $('#adminShell').classList.remove('active');
  }
  function showAdmin() {
    document.body.classList.remove('admin-auth-pending');
    $('#loginView').style.display = 'none'; $('#adminShell').classList.add('active');
    $('#modePill').textContent = API.modeLabel();
    if (API.isReadOnly()) document.body.classList.add('readonly-mode');
    buildTabs(); selectTab(current); loadAll();
  }
  function isAuthExpiredError(error) {
    return /未授權|逾時/.test(error || '');
  }
  function handleAuthExpired(message) {
    clearStoredToken();
    closeEditor();
    closePwdModal();
    showLogin();
    alertBox($('#loginAlert'), message || '登入已過期，請重新登入。', 'err');
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var account = $('#adminAccount') ? $('#adminAccount').value.trim() : 'admin';
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
    API.login(pwd, account).then(function (res) {
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
    clearStoredToken();
    showLogin();
  });

  var recalcStatsBtn = $('#recalcStatsBtn');
  if (recalcStatsBtn) {
    recalcStatsBtn.addEventListener('click', function () { refreshStats(true); });
  }
  var recalcLatestBtn = $('#recalcLatestBtn');
  if (recalcLatestBtn) {
    recalcLatestBtn.addEventListener('click', function () { refreshLatest(true); });
  }

  // ---------- 分頁 ----------
  var mobileTabToggle = $('#mobileTabToggle');
  function setMobileTabMenu(open) {
    var tabs = $('#tabs');
    if (!tabs || !mobileTabToggle) return;
    tabs.classList.toggle('mobile-open', !!open);
    mobileTabToggle.classList.toggle('is-open', !!open);
    mobileTabToggle.setAttribute('aria-expanded', String(!!open));
  }
  if (mobileTabToggle) {
    mobileTabToggle.addEventListener('click', function () {
      setMobileTabMenu(!$('#tabs').classList.contains('mobile-open'));
    });
    document.addEventListener('click', function (e) {
      if (window.innerWidth > 760 || $('#tabs').contains(e.target) || mobileTabToggle.contains(e.target)) return;
      setMobileTabMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMobileTabMenu(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) setMobileTabMenu(false);
    });
  }
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
      t.addEventListener('click', function () { selectTab(t.dataset.type); setMobileTabMenu(false); });
    });
    $('#panels').querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.dataset.add, null); });
    });
  }
  function selectTab(type) {
    current = type;
    $('#tabs').querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.type === type); });
    $('#panels').querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.dataset.type === type); });
    var currentLabel = $('#mobileTabCurrent'), collection = byType(type);
    if (currentLabel && collection) currentLabel.textContent = collection.label;
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
  function seedDefaultTools() {
    if (seedingTools || API.isReadOnly()) return Promise.resolve(false);
    var rows = seedFallbackRows('tools');
    if (!rows.length) return Promise.resolve(false);
    seedingTools = true;
    toast('正在補入 5 筆互動程式資料…');
    return Promise.all(rows.map(function (r) {
      var rec = Object.assign({}, r);
      delete rec._seedFallback;
      return API.create('tools', rec, token);
    })).then(function (results) {
      seedingTools = false;
      var failed = results.filter(function (r) { return !r || !r.ok; });
      if (failed.length) {
        toast('互動程式部分資料補入失敗，請稍後重試。', true);
        return false;
      }
      toast('已補入 5 筆互動程式資料');
      return true;
    }).catch(function () {
      seedingTools = false;
      toast('互動程式資料補入失敗，請檢查連線。', true);
      return false;
    });
  }
  function loadType(type) {
    var request = type === 'members' && API.adminMemberList ? API.adminMemberList(token) : API.list(type);
    request.then(function (res) {
      if (!res.ok) {
        if ((type === 'tools' || type === 'talks') && window.SEED_DATA && window.SEED_DATA[type]) {
          cache[type] = seedFallbackRows(type);
          renderList(type);
          toast('已先載入預設資料；若要寫入後台，請儲存一次。', true);
          return;
        }
        toast(res.error || '讀取失敗', true); return;
      }
      cache[type] = res.data || [];
      if (type === 'tools' && !cache[type].length && !API.isReadOnly()) {
        seedDefaultTools().then(function (ok) {
          if (ok) loadType(type);
          else {
            cache[type] = seedFallbackRows(type);
            renderList(type);
          }
        });
        return;
      }
      if ((type === 'tools' || type === 'talks') && !cache[type].length) cache[type] = seedFallbackRows(type);
      renderList(type);
    });
  }
  function renderList(type) {
    var c = byType(type), list = cache[type] || [], el = $('#list-' + type);
    $('#badge-' + type).textContent = list.length;
    if (!list.length) { el.innerHTML = '<div class="empty">尚無資料，點右上角「新增」建立第一筆。</div>'; return; }
    el.innerHTML = list.map(function (r, idx) {
      var sortable = !API.isReadOnly() && list.length > 1;
      return '<div class="rec" data-id="' + esc(r.id) + '"' + (sortable ? ' draggable="true"' : '') + '><span class="rec-order" title="排序號">' + esc(idx + 1) + '</span><div class="rec-main"><h4>' + esc(c.title(r) || '(無標題)') + '</h4>' +
        '<div class="sub">' + esc(c.sub(r) || '') + '</div></div>' +
        '<div class="rec-actions">' +
        '<button class="icon-btn" data-edit="' + esc(r.id) + '" title="編輯"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 5l4 4"/></svg></button>' +
        '<button class="icon-btn" data-copy="' + esc(r.id) + '" title="複製"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg></button>' +
        '<button class="icon-btn danger" data-del="' + esc(r.id) + '" title="刪除"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>' +
        '</div></div>';
    }).join('');
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(type, find(type, b.dataset.edit)); });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { removeRecord(type, b.dataset.del); });
    });
    el.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () { copyRecord(type, b.dataset.copy); });
    });
    setupDragSort(type, el);
  }
  function find(type, id) { return (cache[type] || []).filter(function (r) { return String(r.id) === String(id); })[0]; }

  function copyTitle(value) {
    var s = String(value || '').trim();
    if (!s) return '副本';
    return /副本$/.test(s) ? s : s + ' 副本';
  }

  function copyRecord(type, id) {
    var c = byType(type), src = find(type, id);
    if (!src) { toast('找不到要複製的資料。', true); return; }
    if (API.isReadOnly()) { toast(API.mode === 'published' ? '唯讀模式無法複製' : '展示模式無法複製', true); return; }
    var rec = {};
    c.fields.forEach(function (f) {
      if (src[f.k] !== undefined) rec[f.k] = src[f.k];
    });
    if (rec.title !== undefined) rec.title = copyTitle(rec.title);
    else if (rec.name !== undefined) rec.name = copyTitle(rec.name);
    else if (rec.issue !== undefined) rec.issue = copyTitle(rec.issue);
    else if (rec.ep !== undefined) rec.ep = copyTitle(rec.ep);
    if (rec.order !== undefined) rec.order = (cache[type] || []).length + 1;

    var btn = Array.prototype.filter.call(document.querySelectorAll('[data-copy]'), function (el) {
      return el.getAttribute('data-copy') === String(id);
    })[0];
    if (btn) btn.disabled = true;
    API.create(type, rec, token).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.ok) {
        toast('已複製');
        refreshPageSoon();
      } else {
        toast(res.error || '複製失敗', true);
        if (isAuthExpiredError(res.error || '')) setTimeout(function () { handleAuthExpired(res.error); }, 1200);
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      toast('複製失敗，請檢查連線。', true);
    });
  }

  function updateVisibleOrderNumbers(el) {
    Array.prototype.forEach.call(el.querySelectorAll('.rec'), function (rec, idx) {
      var badge = rec.querySelector('.rec-order');
      if (badge) badge.textContent = idx + 1;
    });
  }

  function dragAfterElement(el, y) {
    var rows = Array.prototype.slice.call(el.querySelectorAll('.rec:not(.dragging)'));
    return rows.reduce(function (closest, child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  function applyCacheOrder(type, ids) {
    var byId = {};
    (cache[type] || []).forEach(function (row) { byId[String(row.id)] = row; });
    cache[type] = ids.map(function (id, idx) {
      var row = byId[String(id)];
      if (row) row.order = idx + 1;
      return row;
    }).filter(Boolean);
  }

  function saveDragOrder(type, el) {
    if (API.isReadOnly() || !API.reorder || savingSort[type]) return;
    var ids = Array.prototype.map.call(el.querySelectorAll('.rec[data-id]'), function (rec) {
      return rec.getAttribute('data-id');
    }).filter(Boolean);
    if (ids.length < 2) return;
    savingSort[type] = true;
    el.classList.add('sorting-saving');
    applyCacheOrder(type, ids);
    API.reorder(type, ids, token).then(function (res) {
      savingSort[type] = false;
      el.classList.remove('sorting-saving');
      if (res && res.ok) {
        toast('排序已更新');
        return;
      }
      if (res && isAuthExpiredError(res.error || '')) handleAuthExpired(res.error);
      else {
        toast((res && res.error) || '排序儲存失敗，已重新載入。', true);
        loadType(type);
      }
    }).catch(function () {
      savingSort[type] = false;
      el.classList.remove('sorting-saving');
      toast('排序儲存失敗，已重新載入。', true);
      loadType(type);
    });
  }

  function setupDragSort(type, el) {
    if (API.isReadOnly()) return;
    var dragging = null;
    el.querySelectorAll('.rec[draggable="true"]').forEach(function (rec) {
      rec.addEventListener('dragstart', function (e) {
        if (e.target.closest && e.target.closest('button, a, input, textarea, select')) {
          e.preventDefault();
          return;
        }
        dragging = rec;
        rec.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', rec.getAttribute('data-id') || '');
        }
      });
      rec.addEventListener('dragend', function () {
        if (dragging) dragging.classList.remove('dragging');
        dragging = null;
        el.classList.remove('drag-active');
        updateVisibleOrderNumbers(el);
      });
    });
    el.ondragover = function (e) {
      if (!dragging) return;
      e.preventDefault();
      el.classList.add('drag-active');
      var after = dragAfterElement(el, e.clientY);
      if (after == null) el.appendChild(dragging);
      else el.insertBefore(dragging, after);
      updateVisibleOrderNumbers(el);
    };
    el.ondrop = function (e) {
      if (!dragging) return;
      e.preventDefault();
      updateVisibleOrderNumbers(el);
      saveDragOrder(type, el);
    };
  }

  // ---------- 編輯彈窗 ----------
  function canNotifyMembers(c) {
    return c.type !== 'members' && c.fields.some(function (f) { return f.k === 'link'; });
  }
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
    }).join('') + (canNotifyMembers(c)
      ? '<label class="notify-members-toggle"><input type="checkbox" id="notifyMembers" />' +
        '<span><b>發信通知所有會員</b><small>本次儲存後，若有連結網址，寄送新上架通知到會員 Email。</small></span></label>'
      : '');
    $('#modalMask').classList.add('open');
    document.documentElement.classList.add('admin-modal-open');
  }
  function closeEditor() {
    $('#modalMask').classList.remove('open');
    document.documentElement.classList.remove('admin-modal-open');
    editing = null;
  }
  $('#cancelBtn').addEventListener('click', closeEditor);
  $('#modalClose').addEventListener('click', closeEditor);
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
    var notifyMembers = !!($('#notifyMembers') && $('#notifyMembers').checked);
    if (API.isReadOnly()) { toast(API.mode === 'published' ? '唯讀模式：請在 Google 試算表編輯' : '展示模式無法儲存', true); return; }
    var btn = $('#saveBtn'); btn.disabled = true; btn.textContent = '儲存中…';
    var op = editing && !seedFallback ? API.update(current, rec, token, { notifyMembers: notifyMembers }) : API.create(current, rec, token, { notifyMembers: notifyMembers });
    op.then(function (res) {
      btn.disabled = false; btn.textContent = '儲存';
      if (res.ok) {
        var wasEditing = !!(editing && !seedFallback);
        closeEditor();
        var notify = res.memberNotify;
        if (notifyMembers && notify) {
          if (notify.ok) toast((wasEditing ? '已更新，' : '已新增，') + '已通知 ' + (notify.sent || 0) + ' 位會員');
          else toast((wasEditing ? '已更新，但會員通知失敗：' : '已新增，但會員通知失敗：') + (notify.error || '未知錯誤'), true);
          if (console.table && notify.results) console.table(notify.results);
        } else {
          toast(wasEditing ? '已更新' : '已新增');
        }
        if (wasEditing) loadType(current);
        else refreshPageSoon();
      } else {
        alertBox($('#modalAlert'), res.error || '儲存失敗', 'err');
        if (isAuthExpiredError(res.error || '')) setTimeout(function () { handleAuthExpired(res.error); }, 1500);
      }
    }).catch(function () { btn.disabled = false; btn.textContent = '儲存'; alertBox($('#modalAlert'), '連線失敗', 'err'); });
  });

  function removeRecord(type, id) {
    var c = byType(type), r = find(type, id);
    if (!confirm('確定刪除「' + (c.title(r) || '此筆') + '」？此動作無法復原。')) return;
    if (API.isReadOnly()) { toast(API.mode === 'published' ? '唯讀模式：請在 Google 試算表刪除' : '展示模式無法刪除', true); return; }
    API.remove(type, id, token).then(function (res) {
      if (res.ok) { toast('已刪除'); refreshPageSoon(); }
      else {
        toast(res.error || '刪除失敗', true);
        if (isAuthExpiredError(res.error || '')) setTimeout(function () { handleAuthExpired(res.error); }, 1200);
      }
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
  $('#pwdClose').addEventListener('click', closePwdModal);
  $('#pwdMask').addEventListener('click', function (e) { if (e.target === $('#pwdMask')) return; });
  $('#pwdForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (API.isReadOnly()) { alertBox($('#pwdAlert'), '唯讀模式無法修改密碼。', 'err'); return; }
    API.changePassword($('#oldPwd').value, $('#newPwd').value, token).then(function (res) {
      if (res.ok) { alertBox($('#pwdAlert'), '密碼已更新。', 'ok'); setTimeout(closePwdModal, 1200); }
      else {
        alertBox($('#pwdAlert'), res.error || '更新失敗', 'err');
        if (isAuthExpiredError(res.error || '')) setTimeout(function () { handleAuthExpired(res.error); }, 1200);
      }
    });
  });

  // ---------- 啟動 ----------
  if (token && !API.isReadOnly()) {
    API.validateToken(token).then(function (res) {
      if (res.ok) showAdmin();
      else handleAuthExpired('登入已過期，請重新登入。');
    }).catch(function () {
      handleAuthExpired('無法驗證登入狀態，請重新登入。');
    });
  } else if (token) {
    showAdmin();
  } else {
    showLogin();
  }
})();

