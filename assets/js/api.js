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

  var TYPES = ['news', 'podcast', 'calendar', 'headquarters', 'newsletter', 'dharma', 'tools', 'talks'];
  var DEMO_DATA = window.SEED_DATA || { news: [], podcast: [], calendar: [], headquarters: [], newsletter: [], dharma: [], tools: [], talks: [], members: [] };

  function requestUrl(url, fresh) {
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + (fresh ? 'fresh=1&' : '') + '_ts=' + encodeURIComponent(Date.now());
  }

  function fetchFresh(url, options) {
    options = options || {};
    options.cache = 'no-store';
    return fetch(requestUrl(url, true), options);
  }

  function fetchCached(url, options) {
    options = options || {};
    options.cache = 'no-store';
    return fetch(requestUrl(url, false), options);
  }

  function clearFrontDataCache(action) {
    if (['create', 'update', 'delete', 'reorder', 'recalculateStats', 'recalculateLatest'].indexOf(action) === -1) return;
    try { localStorage.removeItem('shinnyo_front_data_cache_v1'); } catch (e) {}
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

  function fetchPublished(type, fresh) {
    var gid = PUB.gid[type];
    if (gid == null) return Promise.resolve([]);
    var url = PUB.base + '?output=csv&gid=' + encodeURIComponent(gid) + '&single=true';
    var fetcher = fresh ? fetchFresh : fetchCached;
    return fetcher(url, { method: 'GET' })
      .then(function (r) { return r.text(); })
      .then(function (t) { return sortRecords(csvToRecords(t)); });
  }

  // ---------- 讀取 ----------
  function listType(type, fresh) {
    if (MODE === 'gas') {
      var fetcher = fresh ? fetchFresh : fetchCached;
      return fetcher(GAS + '?action=list&type=' + encodeURIComponent(type))
        .then(function (r) { return r.json(); });
    }
    if (MODE === 'published') {
      return fetchPublished(type, fresh).then(function (d) { return { ok: true, data: d, mode: 'published' }; });
    }
    return Promise.resolve({ ok: true, data: sortRecords(DEMO_DATA[type]), mode: 'demo' });
  }

  function listAll(fresh) {
    if (MODE === 'gas') {
      var fetcher = fresh ? fetchFresh : fetchCached;
      return fetcher(GAS + '?action=all').then(function (r) { return r.json(); });
    }
    if (MODE === 'published') {
      return Promise.all(TYPES.map(function (type) { return fetchPublished(type, fresh); })).then(function (arr) {
        var out = {}; TYPES.forEach(function (t, i) { out[t] = arr[i]; });
        return { ok: true, data: out, mode: 'published' };
      }).catch(function (e) { return { ok: false, error: String(e) }; });
    }
    return Promise.resolve({ ok: true, data: seedAll(), mode: 'demo' });
  }

  function officialLive(fresh) {
    if (MODE === 'gas') {
      var fetcher = fresh ? fetchFresh : fetchCached;
      return fetcher(GAS + '?action=officialLive').then(function (r) { return r.json(); });
    }
    return Promise.resolve({ ok: false, error: 'officialLive requires GAS mode' });
  }

  function resolveCover(url) {
    if (MODE === 'gas' && url) {
      return fetchCached(GAS + '?action=resolveCover&url=' + encodeURIComponent(url))
        .then(function (r) { return r.json(); });
    }
    return Promise.resolve({ ok: false, error: 'resolveCover requires GAS mode' });
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
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.ok) clearFrontDataCache(body && body.action);
      return res;
    });
  }

  function localStatsFromData(data) {
    data = data || seedAll();
    return {
      podcast: (data.podcast || []).length,
      news: (data.news || []).length,
      newsletter: (data.newsletter || []).length,
      dharma: (data.dharma || []).length,
      calendar: (data.calendar || []).length
    };
  }

  function recalculateStats(token) {
    if (MODE === 'gas') {
      return post({ action: 'recalculateStats', token: token });
    }
    return listAll(true).then(function (res) {
      return res && res.ok
        ? { ok: true, stats: localStatsFromData(res.data), data: res.data, mode: res.mode }
        : res;
    });
  }

  function recalculateLatest(token) {
    if (MODE === 'gas') {
      return post({ action: 'recalculateLatest', token: token });
    }
    return Promise.resolve({ ok: true, latest: {} });
  }

  window.API = {
    mode: MODE,
    canWrite: function () { return MODE === 'gas'; },
    isReadOnly: function () { return MODE !== 'gas'; },
    isDemo: function () { return MODE === 'demo'; },
    modeLabel: function () {
      return MODE === 'gas' ? '已連線'
        : MODE === 'published' ? '唯讀模式（讀取已發布試算表）'
        : '展示模式（內建資料）';
    },
    list: listType,
    all: listAll,
    seedAll: seedAll,
    officialLive: officialLive,
    resolveCover: resolveCover,
    login: function (password, account) { return post({ action: 'login', account: account, password: password }); },
    validateToken: function (token) { return post({ action: 'validateToken', token: token }); },
    recalculateStats: recalculateStats,
    recalculateLatest: recalculateLatest,
    create: function (type, record, token, options) {
      options = options || {};
      return post({ action: 'create', type: type, record: record, token: token, notifyMembers: !!options.notifyMembers });
    },
    update: function (type, record, token, options) {
      options = options || {};
      return post({ action: 'update', type: type, record: record, token: token, notifyMembers: !!options.notifyMembers });
    },
    remove: function (type, id, token) { return post({ action: 'delete', type: type, id: id, token: token }); },
    reorder: function (type, ids, token) { return post({ action: 'reorder', type: type, ids: ids, token: token }); },
    changePassword: function (oldP, newP, token) { return post({ action: 'changePassword', oldPassword: oldP, newPassword: newP, token: token }); }
    ,
    memberRegister: function (record) { return post({ action: 'memberRegister', record: record }); },
    memberLogin: function (mobile, legacyMobile) {
      return post({ action: 'memberLogin', mobile: legacyMobile || mobile });
    },
    validateMemberToken: function (token) { return post({ action: 'validateMemberToken', token: token }); },
    memberDirectory: function (token) { return post({ action: 'memberDirectory', token: token }); },
    adminMemberList: function (token) { return post({ action: 'adminMemberList', token: token }); }
  };
})();
