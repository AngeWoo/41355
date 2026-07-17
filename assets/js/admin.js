/* 後台維護邏輯：登入 → 分頁 → CRUD */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var TOKEN_KEY = 'shinnyo_admin_token_v2';
  var LEGACY_TOKEN_KEY = 'shinnyo_admin_token';
  var ACCOUNT_KEY = 'shinnyo_admin_account_v1';
  var REMEMBER_KEY = 'shinnyo_admin_remember_v1';
  var PAGE_SIZE = 10;
  var BULK_MAIL_TYPE = 'bulk-mail';
  var MAIL_MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAIL_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
  var MAIL_MAX_HTML_BYTES = 160 * 1024;

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
        { k: 'mobile', label: '手機', type: 'text', req: true },
        { k: 'note', label: '會員訊息（該會員登入前台後顯示）', type: 'textarea' }
      ],
      title: function (r) { return r.name; },
      sub: function (r) { return [r.dharmaName, r.email, r.mobile, r.note].filter(Boolean).join(' · '); }
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
  var savedAccount = localStorage.getItem(ACCOUNT_KEY) || '';
  var rememberLogin = localStorage.getItem(REMEMBER_KEY) !== '0';
  var cache = {};        // type -> records
  var current = COLLECTIONS[0].type;
  var editing = null;    // 正在編輯的紀錄（null = 新增）
  var seedingTools = false;
  var savingSort = {};
  var pageByType = {};
  var editorReturnFocus = null;
  var passwordReturnFocus = null;
  var editorInitialState = '';
  var editorFocusTimer = null;
  var mailAttachments = [];
  var mailInlineImages = [];
  var mailSavedRange = null;
  var mailSelectedRecipientIds = {};

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
    if ($('#adminAccount') && savedAccount) $('#adminAccount').value = savedAccount;
    if ($('#rememberLogin')) $('#rememberLogin').checked = rememberLogin;
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
  function saveLoginPreference(account) {
    localStorage.setItem(REMEMBER_KEY, rememberLogin ? '1' : '0');
    if (rememberLogin && account) {
      savedAccount = account;
      localStorage.setItem(ACCOUNT_KEY, account);
    } else {
      savedAccount = '';
      localStorage.removeItem(ACCOUNT_KEY);
    }
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var account = $('#adminAccount') ? $('#adminAccount').value.trim() : 'admin';
    var pwd = $('#pwd').value;
    rememberLogin = !$('#rememberLogin') || $('#rememberLogin').checked;
    if (API.isReadOnly()) {
      var note = API.mode === 'published'
        ? '目前為唯讀模式（讀取已發布的 Google 試算表）。可瀏覽資料，但需在 Google 試算表內編輯；如要在後台直接增刪改，請部署 GAS 並設定 GAS_URL。'
        : '尚未設定資料來源，僅能預覽介面（無法儲存）。';
      alertBox($('#loginAlert'), note, 'ok');
      token = 'readonly-token';
      saveLoginPreference(account);
      if (rememberLogin) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.removeItem(TOKEN_KEY);
      } else {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(TOKEN_KEY);
      }
      setTimeout(showAdmin, 800); return;
    }
    var btn = $('#loginBtn'); btn.textContent = '登入中…'; btn.disabled = true;
    API.login(pwd, account).then(function (res) {
      btn.textContent = '登入'; btn.disabled = false;
      if (res.ok && res.token) {
        token = res.token;
        $('#pwd').value = '';
        saveLoginPreference(account);
        if (rememberLogin) {
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
    $('#pwd').value = '';
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
    var hidden = window.innerWidth <= 760 && !open;
    tabs.classList.toggle('mobile-open', !!open);
    tabs.toggleAttribute('inert', hidden);
    tabs.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    mobileTabToggle.classList.toggle('is-open', !!open);
    mobileTabToggle.setAttribute('aria-expanded', String(!!open));
  }
  if (mobileTabToggle) {
    setMobileTabMenu(false);
    mobileTabToggle.addEventListener('click', function () {
      setMobileTabMenu(!$('#tabs').classList.contains('mobile-open'));
    });
    document.addEventListener('click', function (e) {
      if (window.innerWidth > 760 || $('#tabs').contains(e.target) || mobileTabToggle.contains(e.target)) return;
      setMobileTabMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('#pwdMask').classList.contains('open')) closePwdModal();
      else if ($('#modalMask').classList.contains('open')) requestCloseEditor();
      else setMobileTabMenu(false);
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
    }).join('') +
      '<button class="tab mail-tab" data-type="' + BULK_MAIL_TYPE + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>' +
      '<span>群組發信</span><span class="badge" id="mail-selected-badge">0</span></button>';
    $('#panels').innerHTML = COLLECTIONS.map(function (c) {
      return '<section class="panel" data-type="' + c.type + '">' +
        '<div class="panel-head"><h2>' + esc(c.label) + '</h2>' +
        '<button class="btn btn-gold btn-sm" data-add="' + c.type + '">＋ 新增</button></div>' +
        (c.type === 'members' ? globalNoteBoxHtml() : '') +
        '<div class="rec-list" id="list-' + c.type + '"><div class="empty">載入中…</div></div>' +
        '<nav class="pagination" id="pagination-' + c.type + '" aria-label="' + esc(c.label) + '分頁"></nav></section>';
    }).join('') + bulkMailPanelHtml();
    $('#tabs').querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { selectTab(t.dataset.type); setMobileTabMenu(false); });
    });
    $('#panels').querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.dataset.add, null); });
    });
    setupGlobalNoteBox();
    setupBulkMailPanel();
  }

  // ---------- 全員登入顯示訊息 ----------
  function globalNoteBoxHtml() {
    return '<div class="global-note-box" id="globalNoteBox">' +
      '<h3>全員登入顯示訊息</h3>' +
      '<p class="hint">所有會員登入前台後都會看到這段文字，並與各會員的「會員訊息」一起顯示；留空＝不顯示。</p>' +
      '<textarea id="globalNoteInput" rows="3" placeholder="輸入要對全體會員顯示的訊息"></textarea>' +
      '<div class="global-note-actions">' +
      '<button type="button" class="btn btn-gold btn-sm" id="globalNoteSave">儲存全員訊息</button>' +
      '<span class="global-note-status" id="globalNoteStatus"></span></div></div>';
  }
  function setGlobalNoteStatus(msg, isErr) {
    var el = $('#globalNoteStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }
  function loadGlobalNote() {
    if (!API.getMemberGlobalNote || API.isReadOnly()) return;
    var input = $('#globalNoteInput');
    if (!input) return;
    setGlobalNoteStatus('讀取中…');
    API.getMemberGlobalNote(token).then(function (res) {
      if (res && res.ok) {
        input.value = String(res.data || '');
        setGlobalNoteStatus('');
      } else {
        setGlobalNoteStatus((res && res.error) || '全員訊息讀取失敗。', true);
      }
    }).catch(function () {
      setGlobalNoteStatus('全員訊息讀取失敗，請檢查連線。', true);
    });
  }
  function setupGlobalNoteBox() {
    var saveBtn = $('#globalNoteSave');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', function () {
      var input = $('#globalNoteInput');
      if (!input) return;
      saveBtn.disabled = true;
      setGlobalNoteStatus('儲存中…');
      API.setMemberGlobalNote(input.value.trim(), token).then(function (res) {
        saveBtn.disabled = false;
        if (res && res.ok) {
          input.value = String(res.data || '');
          setGlobalNoteStatus('已儲存' + (res.data ? '' : '（目前為空，前台不顯示）'));
          toast('全員訊息已儲存');
        } else {
          setGlobalNoteStatus((res && res.error) || '儲存失敗。', true);
          toast((res && res.error) || '全員訊息儲存失敗', true);
        }
      }).catch(function () {
        saveBtn.disabled = false;
        setGlobalNoteStatus('儲存失敗，請檢查連線。', true);
        toast('全員訊息儲存失敗，請檢查連線。', true);
      });
    });
  }
  function selectTab(type) {
    current = type;
    $('#tabs').querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.type === type); });
    $('#panels').querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.dataset.type === type); });
    var currentLabel = $('#mobileTabCurrent'), collection = byType(type);
    if (currentLabel) currentLabel.textContent = collection ? collection.label : (type === BULK_MAIL_TYPE ? '群組發信' : '');
  }

  // ---------- 群組發信 ----------
  function bulkMailPanelHtml() {
    return '<section class="panel bulk-mail-panel" data-type="' + BULK_MAIL_TYPE + '">' +
      '<div class="panel-head"><h2>群組發信</h2><span class="mail-security-note">收件者以密件副本分批寄送</span></div>' +
      '<div class="alert" id="bulkMailAlert" role="alert" aria-live="polite"></div>' +
      '<form id="bulkMailForm">' +
      '<div class="mail-section"><h3>1. 挑選收件者</h3>' +
      '<div class="mail-recipient-tools"><input type="search" id="mailRecipientSearch" placeholder="搜尋姓名、經名、Email 或手機" aria-label="搜尋收件者" />' +
      '<button type="button" class="btn btn-ghost btn-sm" id="mailSelectAll">全選</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="mailClearAll">清除</button></div>' +
      '<div class="mail-selection-summary" id="mailSelectionSummary">已選 0 人</div>' +
      '<div class="mail-recipient-list" id="mailRecipientList"><div class="empty">正在載入會員資料…</div></div></div>' +
      '<div class="mail-section"><h3>2. 郵件內容</h3>' +
      '<div class="field"><label for="mailSubject">郵件主旨 *</label><input type="text" id="mailSubject" maxlength="250" required /></div>' +
      '<div class="field"><label id="mailBodyLabel">HTML 郵件內容 *</label>' +
      '<div class="mail-editor-toolbar" role="toolbar" aria-label="郵件格式工具列">' +
      '<button type="button" data-mail-command="bold" title="粗體"><b>B</b></button>' +
      '<button type="button" data-mail-command="italic" title="斜體"><i>I</i></button>' +
      '<button type="button" data-mail-command="underline" title="底線"><u>U</u></button>' +
      '<button type="button" data-mail-command="insertUnorderedList" title="項目符號">• 清單</button>' +
      '<button type="button" data-mail-command="insertOrderedList" title="編號清單">1. 清單</button>' +
      '<button type="button" id="mailInsertLink">插入連結</button>' +
      '<button type="button" id="mailInsertImage">插入圖片</button>' +
      '<button type="button" id="mailShowSource">HTML 原始碼</button></div>' +
      '<div id="mailHtmlEditor" class="mail-html-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="mailBodyLabel"><p>親愛的會員您好：</p><p><br></p></div>' +
      '<div class="hint">可直接貼上格式化文字或剪貼簿圖片；外部圖片可能被收件端封鎖，建議使用「插入圖片」或直接貼圖。</div>' +
      '<input type="file" id="mailImageInput" accept="image/*" multiple hidden />' +
      '<div class="mail-source-wrap" id="mailSourceWrap" hidden><label for="mailHtmlSource">HTML 原始碼</label>' +
      '<textarea id="mailHtmlSource" spellcheck="false"></textarea><button type="button" class="btn btn-ghost btn-sm" id="mailApplySource">套用 HTML</button></div></div></div>' +
      '<div class="mail-section"><h3>3. 附加檔案</h3>' +
      '<input type="file" id="mailAttachmentInput" multiple />' +
      '<div class="hint">單一檔案上限 5 MB；附件與內嵌圖片合計上限 10 MB。</div>' +
      '<div class="mail-file-list" id="mailAttachmentList"><span class="mail-no-files">尚未選擇附件</span></div></div>' +
      '<div class="mail-send-bar"><span id="mailPayloadSummary">尚未選擇收件者</span>' +
      '<button type="submit" class="btn btn-gold" id="bulkMailSendBtn">確認並寄送</button></div>' +
      '</form></section>';
  }

  function setupBulkMailPanel() {
    var editor = $('#mailHtmlEditor');
    if (!editor) return;
    $('#mailRecipientSearch').addEventListener('input', renderBulkMailRecipients);
    $('#mailSelectAll').addEventListener('click', function () {
      (cache.members || []).forEach(function (m) {
        var email = String(m.email || '').trim();
        if (m.id && email.indexOf('@') !== -1) mailSelectedRecipientIds[String(m.id)] = true;
      });
      renderBulkMailRecipients();
    });
    $('#mailClearAll').addEventListener('click', function () {
      mailSelectedRecipientIds = {};
      renderBulkMailRecipients();
    });
    editor.addEventListener('keyup', saveMailSelection);
    editor.addEventListener('mouseup', saveMailSelection);
    editor.addEventListener('focus', saveMailSelection);
    editor.addEventListener('input', updateMailPayloadSummary);
    editor.addEventListener('paste', handleMailPaste);
    document.querySelectorAll('[data-mail-command]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        restoreMailSelection();
        document.execCommand(btn.getAttribute('data-mail-command'), false, null);
        editor.focus(); saveMailSelection(); updateMailPayloadSummary();
      });
    });
    $('#mailInsertLink').addEventListener('click', function () {
      var url = prompt('請輸入連結網址（https://…）');
      if (!url) return;
      url = String(url).trim();
      if (!/^https?:\/\//i.test(url)) { alertBox($('#bulkMailAlert'), '連結網址必須以 http:// 或 https:// 開頭。', 'err'); return; }
      restoreMailSelection();
      document.execCommand('createLink', false, url);
      editor.focus(); saveMailSelection();
    });
    $('#mailInsertImage').addEventListener('click', function () { saveMailSelection(); $('#mailImageInput').click(); });
    $('#mailImageInput').addEventListener('change', function () {
      addMailImages(Array.prototype.slice.call(this.files || []));
      this.value = '';
    });
    $('#mailShowSource').addEventListener('click', function () {
      var wrap = $('#mailSourceWrap'), show = wrap.hidden;
      wrap.hidden = !show;
      if (show) { $('#mailHtmlSource').value = editor.innerHTML; $('#mailHtmlSource').focus(); }
    });
    $('#mailApplySource').addEventListener('click', function () {
      editor.innerHTML = sanitizeMailHtml($('#mailHtmlSource').value);
      extractDataImagesFromEditor();
      updateMailPayloadSummary();
      toast('HTML 已套用');
    });
    $('#mailAttachmentInput').addEventListener('change', function () {
      addMailAttachments(Array.prototype.slice.call(this.files || []));
      this.value = '';
    });
    $('#bulkMailForm').addEventListener('submit', submitBulkMail);
    renderMailAttachments();
    updateMailPayloadSummary();
  }

  function renderBulkMailRecipients() {
    var listEl = $('#mailRecipientList');
    if (!listEl) return;
    var query = String(($('#mailRecipientSearch') && $('#mailRecipientSearch').value) || '').trim().toLowerCase();
    var members = (cache.members || []).filter(function (m) {
      return !query || [m.name, m.dharmaName, m.email, m.mobile].some(function (value) { return String(value || '').toLowerCase().indexOf(query) !== -1; });
    });
    if (!members.length) {
      listEl.innerHTML = '<div class="empty">' + (cache.members ? '找不到符合條件的人員。' : '會員資料尚未載入。') + '</div>';
      updateMailSelectionSummary();
      return;
    }
    listEl.innerHTML = members.map(function (m) {
      var id = String(m.id || ''), email = String(m.email || '').trim(), disabled = !email || email.indexOf('@') === -1;
      return '<label class="mail-recipient' + (disabled ? ' is-disabled' : '') + '">' +
        '<input type="checkbox" value="' + esc(id) + '"' + (mailSelectedRecipientIds[id] ? ' checked' : '') + (disabled ? ' disabled' : '') + ' />' +
        '<span><b>' + esc(m.name || '未命名') + '</b><small>' + esc([m.dharmaName, email, m.mobile].filter(Boolean).join(' · ')) + '</small></span></label>';
    }).join('');
    listEl.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) mailSelectedRecipientIds[input.value] = true;
        else delete mailSelectedRecipientIds[input.value];
        updateMailSelectionSummary();
      });
    });
    updateMailSelectionSummary();
  }

  function selectedMailRecipientIds() {
    return Object.keys(mailSelectedRecipientIds).filter(function (id) { return mailSelectedRecipientIds[id]; });
  }

  function updateMailSelectionSummary() {
    var selected = selectedMailRecipientIds().length;
    var summary = $('#mailSelectionSummary'), badge = $('#mail-selected-badge');
    if (summary) summary.textContent = '已選 ' + selected + ' 人';
    if (badge) badge.textContent = selected;
    updateMailPayloadSummary();
  }

  function saveMailSelection() {
    var selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount || !$('#mailHtmlEditor').contains(selection.anchorNode)) return;
    mailSavedRange = selection.getRangeAt(0).cloneRange();
  }

  function restoreMailSelection() {
    var editor = $('#mailHtmlEditor'), selection = window.getSelection && window.getSelection();
    editor.focus();
    if (!selection || !mailSavedRange || !editor.contains(mailSavedRange.commonAncestorContainer)) return;
    selection.removeAllRanges(); selection.addRange(mailSavedRange);
  }

  function insertMailHtml(html) {
    restoreMailSelection();
    document.execCommand('insertHTML', false, html);
    saveMailSelection(); updateMailPayloadSummary();
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('無法讀取檔案：' + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  function mailPayloadBytes() {
    return mailAttachments.concat(mailInlineImages).reduce(function (sum, file) { return sum + (Number(file.size) || 0); }, 0);
  }

  function pruneUnusedMailImages() {
    var editor = $('#mailHtmlEditor');
    if (!editor) return;
    var used = {};
    editor.querySelectorAll('[data-inline-cid]').forEach(function (img) { used[img.getAttribute('data-inline-cid')] = true; });
    mailInlineImages = mailInlineImages.filter(function (image) { return used[image.cid]; });
  }

  function safeMailFile(file, imageOnly) {
    pruneUnusedMailImages();
    if (!file || !file.size) return '檔案內容是空的。';
    if (file.size > MAIL_MAX_FILE_BYTES) return '「' + file.name + '」超過單檔 5 MB 限制。';
    if (imageOnly && !/^image\//i.test(file.type || '')) return '「' + file.name + '」不是圖片格式。';
    if (mailPayloadBytes() + file.size > MAIL_MAX_TOTAL_BYTES) return '附件與圖片合計不可超過 10 MB。';
    return '';
  }

  function addMailImages(files) {
    files.reduce(function (chain, file) {
      return chain.then(function () {
        var error = safeMailFile(file, true);
        if (error) { alertBox($('#bulkMailAlert'), error, 'err'); return; }
        return readFileAsDataUrl(file).then(function (dataUrl) {
          var cid = 'mailimg_' + Date.now() + '_' + mailInlineImages.length;
          mailInlineImages.push({ cid: cid, name: file.name || cid, mimeType: file.type || 'image/png', base64: dataUrl.split(',')[1] || '', size: file.size });
          insertMailHtml('<img src="' + esc(dataUrl) + '" data-inline-cid="' + esc(cid) + '" alt="' + esc(file.name || '郵件圖片') + '" style="max-width:100%;height:auto;" />');
        });
      });
    }, Promise.resolve()).catch(function (err) { alertBox($('#bulkMailAlert'), err.message || String(err), 'err'); });
  }

  function handleMailPaste(e) {
    var items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []);
    var images = items.filter(function (item) { return item.kind === 'file' && /^image\//i.test(item.type || ''); }).map(function (item) { return item.getAsFile(); }).filter(Boolean);
    if (!images.length) return;
    e.preventDefault(); saveMailSelection(); addMailImages(images);
  }

  function addMailAttachments(files) {
    files.reduce(function (chain, file) {
      return chain.then(function () {
        var error = safeMailFile(file, false);
        if (error) { alertBox($('#bulkMailAlert'), error, 'err'); return; }
        return readFileAsDataUrl(file).then(function (dataUrl) {
          mailAttachments.push({ name: file.name || 'attachment', mimeType: file.type || 'application/octet-stream', base64: dataUrl.split(',')[1] || '', size: file.size });
          renderMailAttachments(); updateMailPayloadSummary();
        });
      });
    }, Promise.resolve()).catch(function (err) { alertBox($('#bulkMailAlert'), err.message || String(err), 'err'); });
  }

  function renderMailAttachments() {
    var el = $('#mailAttachmentList');
    if (!el) return;
    if (!mailAttachments.length) { el.innerHTML = '<span class="mail-no-files">尚未選擇附件</span>'; return; }
    el.innerHTML = mailAttachments.map(function (file, idx) {
      return '<span class="mail-file-chip">' + esc(file.name) + ' <small>' + formatBytes(file.size) + '</small><button type="button" data-remove-mail-file="' + idx + '" aria-label="移除 ' + esc(file.name) + '">×</button></span>';
    }).join('');
    el.querySelectorAll('[data-remove-mail-file]').forEach(function (btn) {
      btn.addEventListener('click', function () { mailAttachments.splice(Number(btn.getAttribute('data-remove-mail-file')), 1); renderMailAttachments(); updateMailPayloadSummary(); });
    });
  }

  function formatBytes(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function sanitizeMailHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, meta, link, base').forEach(function (el) { el.remove(); });
    doc.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes || []).forEach(function (attr) {
        var name = attr.name.toLowerCase(), value = String(attr.value || '').trim();
        if (name.indexOf('on') === 0 || name === 'srcdoc') el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && /^(javascript|vbscript):/i.test(value)) el.removeAttribute(attr.name);
        else if (name === 'style' && /(expression\s*\(|javascript\s*:|behavior\s*:)/i.test(value)) el.removeAttribute(attr.name);
      });
    });
    return doc.body.innerHTML;
  }

  function extractDataImagesFromEditor() {
    $('#mailHtmlEditor').querySelectorAll('img[src^="data:image/"]').forEach(function (img) {
      if (img.getAttribute('data-inline-cid')) return;
      var dataUrl = img.getAttribute('src') || '', match = dataUrl.match(/^data:(image\/[^;,]+);base64,(.+)$/i);
      if (!match) return;
      var cid = 'mailimg_' + Date.now() + '_' + mailInlineImages.length;
      var size = Math.floor(match[2].length * 3 / 4);
      if (size > MAIL_MAX_FILE_BYTES || mailPayloadBytes() + size > MAIL_MAX_TOTAL_BYTES) { img.remove(); return; }
      mailInlineImages.push({ cid: cid, name: cid + '.png', mimeType: match[1], base64: match[2], size: size });
      img.setAttribute('data-inline-cid', cid);
    });
  }

  function preparedMailContent() {
    extractDataImagesFromEditor();
    var clone = $('#mailHtmlEditor').cloneNode(true), used = {};
    var clean = document.createElement('div');
    clean.innerHTML = sanitizeMailHtml(clone.innerHTML);
    var text = String(clean.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    clean.querySelectorAll('[data-inline-cid]').forEach(function (img) {
      var cid = img.getAttribute('data-inline-cid');
      if (!cid) return;
      used[cid] = true;
      img.removeAttribute('src');
      img.setAttribute('data-mail-cid-src', 'cid:' + cid);
      img.removeAttribute('data-inline-cid');
    });
    var html = clean.innerHTML.replace(/\sdata-mail-cid-src="([^"]+)"/g, ' src="$1"');
    return {
      html: html,
      text: text,
      inlineImages: mailInlineImages.filter(function (image) { return used[image.cid]; })
    };
  }

  function updateMailPayloadSummary() {
    var el = $('#mailPayloadSummary');
    if (!el) return;
    pruneUnusedMailImages();
    el.textContent = '收件者 ' + selectedMailRecipientIds().length + ' 人 · 附件 ' + mailAttachments.length + ' 個 · 檔案合計 ' + formatBytes(mailPayloadBytes());
  }

  function resetBulkMailForm() {
    $('#bulkMailForm').reset();
    $('#mailHtmlEditor').innerHTML = '<p>親愛的會員您好：</p><p><br></p>';
    $('#mailSourceWrap').hidden = true;
    mailAttachments = []; mailInlineImages = []; mailSavedRange = null; mailSelectedRecipientIds = {};
    renderMailAttachments(); renderBulkMailRecipients(); updateMailSelectionSummary();
  }

  function submitBulkMail(e) {
    e.preventDefault();
    alertBox($('#bulkMailAlert'), '', '');
    if (API.isReadOnly()) { alertBox($('#bulkMailAlert'), '目前為唯讀模式，無法寄送郵件。', 'err'); return; }
    var recipientIds = selectedMailRecipientIds();
    var subject = $('#mailSubject').value.trim();
    var content = preparedMailContent();
    if (!recipientIds.length) { alertBox($('#bulkMailAlert'), '請至少選擇一位收件者。', 'err'); return; }
    if (!subject) { alertBox($('#bulkMailAlert'), '請輸入郵件主旨。', 'err'); $('#mailSubject').focus(); return; }
    if (!content.text && !content.inlineImages.length) { alertBox($('#bulkMailAlert'), '請輸入郵件內容。', 'err'); return; }
    if (new Blob([content.html]).size > MAIL_MAX_HTML_BYTES) { alertBox($('#bulkMailAlert'), 'HTML 郵件內容不可超過 160 KB。', 'err'); return; }
    if (mailPayloadBytes() > MAIL_MAX_TOTAL_BYTES) { alertBox($('#bulkMailAlert'), '附件與圖片合計不可超過 10 MB。', 'err'); return; }
    if (!confirm('確定要寄送「' + subject + '」給已選取的 ' + recipientIds.length + ' 人嗎？')) return;
    var btn = $('#bulkMailSendBtn'); btn.disabled = true; btn.textContent = '寄送中…';
    API.sendBulkMail({
      recipientIds: recipientIds,
      subject: subject,
      htmlBody: content.html,
      textBody: content.text || '請使用支援 HTML 的郵件程式閱讀此信。',
      attachments: mailAttachments,
      inlineImages: content.inlineImages
    }, token).then(function (res) {
      btn.disabled = false; btn.textContent = '確認並寄送';
      if (res && res.ok) {
        alertBox($('#bulkMailAlert'), '寄送完成：成功 ' + (res.sent || 0) + ' 人；今日剩餘額度 ' + (res.remainingQuota == null ? '—' : res.remainingQuota) + ' 人。', 'ok');
        toast('群組郵件已寄送'); resetBulkMailForm();
      } else {
        alertBox($('#bulkMailAlert'), (res && res.error) || '寄送失敗。', 'err');
        if (res && isAuthExpiredError(res.error || '')) setTimeout(function () { handleAuthExpired(res.error); }, 1500);
      }
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = '確認並寄送';
      alertBox($('#bulkMailAlert'), '寄送失敗：' + (err && err.message ? err.message : '請檢查連線。'), 'err');
    });
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
      if (type === 'members') { renderBulkMailRecipients(); loadGlobalNote(); }
    }).catch(function () {
      toast(byType(type).label + '讀取失敗，請檢查連線。', true);
    });
  }
  function renderList(type) {
    var c = byType(type), list = cache[type] || [], el = $('#list-' + type);
    $('#badge-' + type).textContent = list.length;
    if (!list.length) {
      pageByType[type] = 1;
      el.innerHTML = '<div class="empty">尚無資料，點右上角「新增」建立第一筆。</div>';
      renderPagination(type, 0);
      return;
    }
    var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    var page = Math.min(Math.max(Number(pageByType[type]) || 1, 1), totalPages);
    var start = (page - 1) * PAGE_SIZE;
    var pageRows = list.slice(start, start + PAGE_SIZE);
    pageByType[type] = page;
    el.setAttribute('data-page-start', String(start));
    el.innerHTML = pageRows.map(function (r, idx) {
      var sortable = !API.isReadOnly() && pageRows.length > 1;
      return '<div class="rec" data-id="' + esc(r.id) + '"' + (sortable ? ' draggable="true"' : '') + '><span class="rec-order" title="排序號">' + esc(start + idx + 1) + '</span><div class="rec-main"><h4>' + esc(c.title(r) || '(無標題)') + '</h4>' +
        '<div class="sub">' + esc(c.sub(r) || '') + '</div></div>' +
        '<div class="rec-actions">' +
        '<button class="icon-btn" data-edit="' + esc(r.id) + '" title="編輯" aria-label="編輯 ' + esc(c.title(r) || '此筆資料') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 5l4 4"/></svg></button>' +
        '<button class="icon-btn" data-copy="' + esc(r.id) + '" title="複製" aria-label="複製 ' + esc(c.title(r) || '此筆資料') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg></button>' +
        '<button class="icon-btn danger" data-del="' + esc(r.id) + '" title="刪除" aria-label="刪除 ' + esc(c.title(r) || '此筆資料') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>' +
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
    renderPagination(type, list.length);
  }

  function renderPagination(type, totalItems) {
    var nav = $('#pagination-' + type);
    if (!nav) return;
    if (!totalItems) { nav.innerHTML = ''; nav.hidden = true; return; }
    var totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    var page = Math.min(Math.max(Number(pageByType[type]) || 1, 1), totalPages);
    var from = (page - 1) * PAGE_SIZE + 1;
    var to = Math.min(page * PAGE_SIZE, totalItems);
    var atFirst = page === 1, atLast = page === totalPages;
    nav.hidden = false;
    nav.innerHTML =
      '<button type="button" class="page-btn page-edge" data-page="first"' + (atFirst ? ' disabled' : '') + '>最前頁</button>' +
      '<button type="button" class="page-btn" data-page="prev" aria-label="上一頁"' + (atFirst ? ' disabled' : '') + '>‹</button>' +
      '<span class="page-status" aria-live="polite"><b>第 ' + page + ' / ' + totalPages + ' 頁</b><small>第 ' + from + '–' + to + ' 筆，共 ' + totalItems + ' 筆</small></span>' +
      '<button type="button" class="page-btn" data-page="next" aria-label="下一頁"' + (atLast ? ' disabled' : '') + '>›</button>' +
      '<button type="button" class="page-btn page-edge" data-page="last"' + (atLast ? ' disabled' : '') + '>最後頁</button>';
    nav.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-page');
        if (action === 'first') pageByType[type] = 1;
        else if (action === 'prev') pageByType[type] = Math.max(1, page - 1);
        else if (action === 'next') pageByType[type] = Math.min(totalPages, page + 1);
        else if (action === 'last') pageByType[type] = totalPages;
        renderList(type);
        var panel = document.querySelector('.panel[data-type="' + type + '"]');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
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
    var start = Number(el.getAttribute('data-page-start')) || 0;
    Array.prototype.forEach.call(el.querySelectorAll('.rec'), function (rec, idx) {
      var badge = rec.querySelector('.rec-order');
      if (badge) badge.textContent = start + idx + 1;
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
    var visibleIds = Array.prototype.map.call(el.querySelectorAll('.rec[data-id]'), function (rec) {
      return rec.getAttribute('data-id');
    }).filter(Boolean);
    if (visibleIds.length < 2) return;
    var ids = (cache[type] || []).map(function (row) { return String(row.id); });
    var page = Math.max(Number(pageByType[type]) || 1, 1);
    var start = (page - 1) * PAGE_SIZE;
    ids.splice.apply(ids, [start, visibleIds.length].concat(visibleIds));
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
    var t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : (f.type === 'url' ? 'url' : 'text'));
    var input = '<input type="' + t + '" id="f_' + f.k + '" value="' + v + '"' +
      (f.type === 'date' ? ' class="date-picker"' : '') +
      (f.type === 'url' ? ' inputmode="url" autocomplete="url"' : '') +
      (f.req ? ' required' : '') + ' />';
    return input;
  }
  function openEditor(type, record) {
    editorReturnFocus = document.activeElement;
    current = type; editing = record;
    var c = byType(type);
    $('#modalTitle').textContent = (record ? '編輯' : '新增') + '：' + c.label;
    alertBox($('#modalAlert'), '', '');
    var compact = ['order', 'pinned', 'date', 'issue', 'ep'];
    $('#formFields').innerHTML = c.fields.map(function (f) {
      return '<div class="field"><label for="f_' + esc(f.k) + '">' + esc(f.label) + (f.req ? ' *' : '') + '</label>' +
        fieldHtml(f, record ? record[f.k] : (f.k === 'category' && type === 'dharma' ? '瑞聲法語' : '')) + '</div>';
    }).join('') + (canNotifyMembers(c)
      ? '<label class="notify-members-toggle"><input type="checkbox" id="notifyMembers" />' +
        '<span><b>發信通知所有會員</b><small>本次儲存後，若有連結網址，寄送新上架通知到會員 Email。</small></span></label>'
      : '');
    $('#modalMask').classList.add('open');
    $('#modalMask').setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('admin-modal-open');
    editorInitialState = formState();
    clearTimeout(editorFocusTimer);
    // 手機自動叫出鍵盤會造成視窗高度劇烈改變；只在滑鼠/桌機環境自動聚焦。
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) {
      editorFocusTimer = setTimeout(function () {
        if (!$('#modalMask').classList.contains('open')) return;
        var first = $('#formFields input, #formFields textarea, #formFields select');
        if (first) first.focus({ preventScroll: true });
      }, 0);
    }
  }
  function formState() {
    return Array.prototype.map.call($('#recordForm').elements, function (el) {
      if (!el.id || el.id === 'saveBtn') return '';
      return el.id + ':' + (el.type === 'checkbox' ? String(el.checked) : el.value);
    }).join('|');
  }
  function editorIsDirty() {
    return $('#modalMask').classList.contains('open') && formState() !== editorInitialState;
  }
  function requestCloseEditor() {
    if (editorIsDirty() && !confirm('尚有未儲存的修改，確定要關閉編輯視窗嗎？')) return;
    closeEditor();
  }
  function closeEditor() {
    clearTimeout(editorFocusTimer);
    $('#modalMask').classList.remove('open');
    $('#modalMask').setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('admin-modal-open');
    editing = null;
    editorInitialState = '';
    if (editorReturnFocus && document.contains(editorReturnFocus)) editorReturnFocus.focus();
    editorReturnFocus = null;
  }
  $('#cancelBtn').addEventListener('click', requestCloseEditor);
  $('#modalClose').addEventListener('click', requestCloseEditor);
  // 遮罩不綁定關閉事件，避免手機滑動或點擊邊緣時誤觸造成「閃退」。

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
    }).catch(function () { toast('刪除失敗，請檢查連線。', true); });
  }

  // ---------- 修改密碼 ----------
  function closePwdModal() {
    $('#pwdMask').classList.remove('open');
    $('#pwdMask').setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('admin-modal-open');
    if (passwordReturnFocus && document.contains(passwordReturnFocus)) passwordReturnFocus.focus();
    passwordReturnFocus = null;
  }
  $('#pwdBtn').addEventListener('click', function () {
    passwordReturnFocus = document.activeElement;
    alertBox($('#pwdAlert'), '', '');
    $('#pwdForm').reset();
    document.querySelectorAll('#pwdForm [data-toggle-password]').forEach(function (btn) {
      setPasswordVisible($('#' + btn.getAttribute('data-toggle-password')), false, btn);
    });
    $('#pwdMask').classList.add('open');
    $('#pwdMask').setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('admin-modal-open');
    setTimeout(function () { $('#oldPwd').focus(); }, 0);
  });
  $('#pwdCancel').addEventListener('click', closePwdModal);
  $('#pwdClose').addEventListener('click', closePwdModal);
  $('#pwdMask').addEventListener('click', function (e) { if (e.target === $('#pwdMask')) closePwdModal(); });
  $('#pwdForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (API.isReadOnly()) { alertBox($('#pwdAlert'), '唯讀模式無法修改密碼。', 'err'); return; }
    if ($('#newPwd').value !== $('#confirmPwd').value) {
      alertBox($('#pwdAlert'), '兩次輸入的新密碼不一致。', 'err');
      $('#confirmPwd').focus();
      return;
    }
    API.changePassword($('#oldPwd').value, $('#newPwd').value, token).then(function (res) {
      if (res.ok && res.token) {
        token = res.token;
        if (rememberLogin) {
          localStorage.setItem(TOKEN_KEY, token);
          sessionStorage.removeItem(TOKEN_KEY);
        } else {
          sessionStorage.setItem(TOKEN_KEY, token);
          localStorage.removeItem(TOKEN_KEY);
        }
        alertBox($('#pwdAlert'), '密碼已更新，登入狀態已同步。', 'ok');
        setTimeout(closePwdModal, 1200);
      }
      else {
        alertBox($('#pwdAlert'), res.error || '更新失敗', 'err');
        if (isAuthExpiredError(res.error || '')) setTimeout(function () { handleAuthExpired(res.error); }, 1200);
      }
    }).catch(function () { alertBox($('#pwdAlert'), '更新失敗，請檢查連線。', 'err'); });
  });

  // ---------- 啟動 ----------
  if (token && !API.isReadOnly()) {
    API.validateToken(token).then(function (res) {
      if (res.ok) showAdmin();
      else handleAuthExpired('登入已過期，請重新登入。');
    }).catch(function () {
      // 純網路／逾時失敗，不代表 token 失效，維持現有登入狀態，不強制跳回登入畫面
      showAdmin();
    });
  } else if (token) {
    showAdmin();
  } else {
    showLogin();
  }
})();
