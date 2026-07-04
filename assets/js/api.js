/**
 * API 客戶端：三種資料來源模式
 *  1. gas       —— 設定了 GAS_URL：完整讀寫（前台讀、後台增刪改）。
 *  2. published —— 設定了 PUBLISHED_SHEET：直接讀「已發布」的 Google 試算表 CSV（唯讀）。
 *  3. demo      —— 兩者皆無：使用 seed-data.js 內建資料（唯讀，僅供預覽）。
 *
 * 寫入（login/create/update/delete）只有 gas 模式支援。
 */
(function () {
  var CFG = window.SITE_CONFIG || {};
  var GAS = (CFG.GAS_URL || '').trim();
  var PUB = CFG.PUBLISHED_SHEET && CFG.PUBLISHED_SHEET.base ? CFG.PUBLISHED_SHEET : null;

  var MODE = GAS ? 'gas' : (PUB ? 'published' : 'demo');

  var TYPES = ['news', 'podcast', 'calendar', 'newsletter', 'dharma', 'tools', 'talks'];
  var DEMO_DATA = window.SEED_DATA || { news: [], podcast: [], calendar: [], newsletter: [], dharma: [], tools: [], talks: [] };

  function freshUrl(url) {
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + 'fresh=1&_ts=' + encodeURIComponent(Date.now());
  }

  function fetchFresh(url, options) {
    options = options || {};
    options.cache = 'no-store';
    return fetch(freshUrl(url), options);
  }

  // ---------- 共用：排序（與 GAS 後端一致）----------
  function sortRecords(arr) {
    return (arr || []).slice().sort(function (a, b) {
      var ao = Number(a.order || 0), bo = Number(b.order || 0);
      if (ao !== bo) return ao - bo;
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
  }

  function seedAll() {
    var out = {};
    TYPES.forEach(function (t) { out[t] = sortRecords(DEMO_DATA[t]); });
    return out;
  }

  // ---------- 已發布試算表：CSV 解析 ----------
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去 BOM
    var rows = [], cur = [], field = '', i = 0, inQ = false;
    while (i < text.length) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { cur.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
  }

  function csvToRecords(text) {
    var rows = parseCSV(text);
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return String(h).trim(); });
    return rows.slice(1).map(function (r) {
      var o = {}; headers.forEach(function (h, idx) { o[h] = r[idx] != null ? r[idx] : ''; });
      return o;
    }).filter(function (o) { return String(o.id || '').length > 0; });
  }

  function fetchPublished(type) {
    var gid = PUB.gid[type];
    if (gid == null) return Promise.resolve([]);
    var url = PUB.base + '?output=csv&gid=' + encodeURIComponent(gid) + '&single=true';
    return fetchFresh(url, { method: 'GET' })
      .then(function (r) { return r.text(); })
      .then(function (t) { return sortRecords(csvToRecords(t)); });
  }

  // ---------- 讀取 ----------
  function listType(type) {
    if (MODE === 'gas') {
      return fetchFresh(GAS + '?action=list&type=' + encodeURIComponent(type))
        .then(function (r) { return r.json(); });
    }
    if (MODE === 'published') {
      return fetchPublished(type).then(function (d) { return { ok: true, data: d, mode: 'published' }; });
    }
    return Promise.resolve({ ok: true, data: sortRecords(DEMO_DATA[type]), mode: 'demo' });
  }

  function listAll() {
    if (MODE === 'gas') {
      return fetchFresh(GAS + '?action=all').then(function (r) { return r.json(); });
    }
    if (MODE === 'published') {
      return Promise.all(TYPES.map(fetchPublished)).then(function (arr) {
        var out = {}; TYPES.forEach(function (t, i) { out[t] = arr[i]; });
        return { ok: true, data: out, mode: 'published' };
      }).catch(function (e) { return { ok: false, error: String(e) }; });
    }
    return Promise.resolve({ ok: true, data: seedAll(), mode: 'demo' });
  }

  function officialLive() {
    if (MODE === 'gas') {
      return fetchFresh(GAS + '?action=officialLive').then(function (r) { return r.json(); });
    }
    return Promise.resolve({ ok: false, error: 'officialLive requires GAS mode' });
  }

  // ---------- 寫入（僅 gas 模式）----------
  function post(body) {
    if (MODE !== 'gas') {
      var msg = MODE === 'published'
        ? '目前為「唯讀模式」（讀取自已發布的 Google 試算表）。如需在後台直接編輯，請改用 GAS 網頁應用程式部署並設定 GAS_URL。'
        : '尚未設定資料來源，後台無法寫入。';
      return Promise.resolve({ ok: false, error: msg });
    }
    return fetch(GAS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  window.API = {
    mode: MODE,
    canWrite: function () { return MODE === 'gas'; },
    isReadOnly: function () { return MODE !== 'gas'; },
    isDemo: function () { return MODE === 'demo'; },
    modeLabel: function () {
      return MODE === 'gas' ? '已連線（可讀寫）'
        : MODE === 'published' ? '唯讀模式（讀取已發布試算表）'
        : '展示模式（內建資料）';
    },
    list: listType,
    all: listAll,
    seedAll: seedAll,
    officialLive: officialLive,
    login: function (password) { return post({ action: 'login', password: password }); },
    create: function (type, record, token) { return post({ action: 'create', type: type, record: record, token: token }); },
    update: function (type, record, token) { return post({ action: 'update', type: type, record: record, token: token }); },
    remove: function (type, id, token) { return post({ action: 'delete', type: type, id: id, token: token }); },
    changePassword: function (oldP, newP, token) { return post({ action: 'changePassword', oldPassword: oldP, newPassword: newP, token: token }); }
  };
})();
