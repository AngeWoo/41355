/**
 * API 客戶端：
 *  1. gas  —— 會員與管理員經權杖讀取，管理員可增刪改。
 *  2. demo —— 未設定 GAS_URL，不載入會員限定內容。
 *
 * 寫入（login/create/update/delete）只有 gas 模式支援。
 */
(function () {
  var CFG = window.SITE_CONFIG || {};
  var GAS = (CFG.GAS_URL || '').trim();
  var PUB = null;

  var MODE = GAS ? 'gas' : 'demo';
  var REQUEST_TIMEOUT_MS = 30000;
  // GAS 的 /exec 會先 302 轉到 script.googleusercontent.com，冷啟動時第一次往返動輒數十秒
  // （實測連最輕的 ping 都要 11 秒，最慢一次超過 60 秒）。讀取類請求若沿用 30 秒上限，
  // 冷啟動那次必定逾時，開站就是一片空白。所以讀取給長一點的上限並自動重試一次。
  var READ_TIMEOUT_MS = 75000;
  var READ_RETRY_DELAY_MS = 800;

  var TYPES = ['news', 'podcast', 'calendar', 'japanCalendar', 'headquarters', 'newsletter', 'dharma', 'iya', 'tools', 'talks'];
  var DEMO_DATA = window.SEED_DATA || { news: [], podcast: [], calendar: [], japanCalendar: [], headquarters: [], newsletter: [], dharma: [], iya: [], tools: [], talks: [], members: [] };

  function requestUrl(url, fresh) {
    if (!fresh) return url;
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + 'fresh=1&_ts=' + encodeURIComponent(Date.now());
  }

  // ---------- 頂欄載入進度條 ----------
  // 前台掛在 .nav 下緣、後台掛在 .topbar 下緣。放在 api.js 是因為兩個頁面都會載入它，
  // 且所有網路請求都經過下面的 fetchWithTimeout，進度條因此能自動反映每一頁的載入狀態。
  var Progress = (function () {
    var bar = null, fill = null, pending = 0, value = 0, trickleTimer = null, hideTimer = null, finishTimer = null;
    var FINISH_GRACE_MS = 200;

    function isVisible(el) {
      // 不能用 offsetParent 判斷：position:fixed 的 .nav 永遠回傳 null。
      return !!el && el.getClientRects().length > 0;
    }

    function pickHost() {
      // 只掛在頂欄下緣。後台尚未登入時 .topbar 藏在 display:none 的 .admin-shell 裡，
      // 這時不顯示進度條——早期版本改掛 body 當浮動條，結果登入前後位置不同，
      // 看起來像是「出現兩條、跑兩次」。
      var nav = document.querySelector('.nav');
      if (isVisible(nav)) return nav;
      var topbar = document.querySelector('.topbar');
      if (isVisible(topbar)) return topbar;
      return null;
    }

    function ensureBar() {
      var host = pickHost();
      if (!host) return null;
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'load-progress';
        bar.setAttribute('aria-hidden', 'true');
        fill = document.createElement('span');
        fill.className = 'load-progress-fill';
        bar.appendChild(fill);
      }
      if (bar.parentNode !== host) host.appendChild(bar);
      return bar;
    }

    function paint() {
      if (fill) fill.style.width = value.toFixed(1) + '%';
    }

    function resetInstantly() {
      if (!fill) return;
      fill.style.transition = 'none';
      value = 0;
      paint();
      void fill.offsetWidth;   // 強制重排，讓上面的 width 立刻生效而不產生倒退動畫
      fill.style.transition = '';
    }

    function begin() {
      pending++;
      if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }  // 收尾緩衝期內又有新請求，併入同一條進度
      var el = ensureBar();
      if (!el) return;                    // 沒有可掛載的頂欄（例如後台登入畫面）
      // 用 trickleTimer 而非 pending 判斷「已經在跑」：這樣即使先前的請求是在頂欄
      // 還不可見時開始的，等頂欄出現後仍能正常接上進度。
      if (trickleTimer) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      resetInstantly();
      el.classList.add('is-active');
      value = 8;
      paint();
      trickleTimer = setInterval(function () {
        // 逼近 92% 就趨緩並停住，真正完成時才走完最後一段
        if (value >= 92) return;
        value += Math.max(0.5, (92 - value) * 0.08);
        paint();
      }, 200);
    }

    function finish() {
      if (trickleTimer) { clearInterval(trickleTimer); trickleTimer = null; }
      var el = ensureBar();
      if (!el) return;
      value = 100;
      paint();
      hideTimer = setTimeout(function () {
        el.classList.remove('is-active');
        hideTimer = null;
      }, 260);
    }

    function end() {
      pending = Math.max(0, pending - 1);
      if (pending > 0) return;
      // 後續請求常接在前一個請求的 .then() 裡（例如後台讀完會員後才去讀全員訊息、
      // 或 tools 為空時補寫預設值後重讀）。若 pending 一歸零就立刻收尾，
      // 進度條會先跑完再馬上重跑一次。留一小段緩衝把這些併成同一條進度。
      if (finishTimer) clearTimeout(finishTimer);
      finishTimer = setTimeout(function () {
        finishTimer = null;
        if (pending > 0) return;
        finish();
      }, FINISH_GRACE_MS);
    }

    // 文件本身的載入也算一段進度
    if (document.readyState !== 'complete') {
      begin();
      window.addEventListener('load', function () { end(); }, { once: true });
    }

    return { begin: begin, end: end };
  })();

  function fetchWithTimeout(url, options, timeoutMs) {
    options = Object.assign({}, options || {});
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, timeoutMs || REQUEST_TIMEOUT_MS);
    }
    Progress.begin();
    return fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + '：' + response.statusText);
      return response;
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('連線逾時，請稍後再試。');
      throw error;
    }).finally(function () {
      if (timer) clearTimeout(timer);
      Progress.end();
    });
  }

  function responseJson(response) {
    return response.json().catch(function () { throw new Error('伺服器回應格式錯誤。'); });
  }

  function fetchFresh(url, options) {
    options = options || {};
    options.cache = 'no-store';
    return fetchWithTimeout(requestUrl(url, true), options);
  }

  function fetchCached(url, options) {
    options = options || {};
    options.cache = 'no-cache';
    return fetchWithTimeout(requestUrl(url, false), options);
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
        .then(responseJson);
    }
    if (MODE === 'published') {
      return fetchPublished(type, fresh).then(function (d) { return { ok: true, data: d, mode: 'published' }; });
    }
    return Promise.resolve({ ok: true, data: sortRecords(DEMO_DATA[type]), mode: 'demo' });
  }

  function listAll(fresh) {
    if (MODE === 'gas') {
      var fetcher = fresh ? fetchFresh : fetchCached;
      return fetcher(GAS + '?action=all').then(responseJson);
    }
    if (MODE === 'published') {
      return Promise.all(TYPES.map(function (type) { return fetchPublished(type, fresh); })).then(function (arr) {
        var out = {}; TYPES.forEach(function (t, i) { out[t] = arr[i]; });
        return { ok: true, data: out, mode: 'published' };
      }).catch(function (e) { return { ok: false, error: String(e) }; });
    }
    return Promise.resolve({ ok: true, data: seedAll(), mode: 'demo' });
  }

  function officialLive() {
    if (MODE === 'gas') {
      return fetchCached(GAS + '?action=officialLive').then(responseJson);
    }
    return Promise.resolve({ ok: false, error: 'officialLive requires GAS mode' });
  }

  function resolveCover(url, token) {
    if (MODE === 'gas' && url && token) {
      return post({ action: 'resolveCover', url: url, token: token });
    }
    return Promise.resolve({ ok: false, error: '封面解析需登入後使用。' });
  }

  // ---------- 寫入（僅 gas 模式）----------
  function post(body, timeoutMs) {
    if (MODE !== 'gas') {
      var msg = MODE === 'published'
        ? '目前為「唯讀模式」（讀取自已發布的 Google 試算表）。如需在後台直接編輯，請改用 GAS 網頁應用程式部署並設定 GAS_URL。'
        : '尚未設定資料來源，後台無法寫入。';
      return Promise.resolve({ ok: false, error: msg });
    }
    return fetchWithTimeout(GAS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }, timeoutMs).then(responseJson).then(function (res) {
      if (res && res.ok) clearFrontDataCache(body && body.action);
      return res;
    });
  }

  // 只有「純讀取、重跑不會產生副作用」的動作可以用這個：逾時或連線失敗時自動重試一次。
  // GAS 冷啟動第一次特別慢，第二次通常幾秒內就回來，重試的命中率很高。
  function isRetriableError(err) {
    var msg = String((err && err.message) || err || '');
    return /逾時|Failed to fetch|NetworkError|network|HTTP 5\d\d/i.test(msg);
  }
  function postRead(body) {
    return post(body, READ_TIMEOUT_MS).catch(function (err) {
      if (!isRetriableError(err)) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, READ_RETRY_DELAY_MS); })
        .then(function () { return post(body, READ_TIMEOUT_MS); });
    });
  }

  function localStatsFromData(data) {
    data = data || seedAll();
    return {
      podcast: (data.podcast || []).length,
      news: (data.news || []).length,
      newsletter: (data.newsletter || []).length,
      dharma: (data.dharma || []).length,
      iya: (data.iya || []).length,
      calendar: (data.calendar || []).length,
      japanCalendar: (data.japanCalendar || []).length
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
    uploadNewsImage: function (file, token) { return post({ action: 'uploadNewsImage', file: file, token: token }); },
    newsImage: function (fileId, token) { return post({ action: 'newsImage', fileId: fileId, token: token }); },
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
    memberRequestRegisterCode: function (record) { return post({ action: 'memberRequestRegisterCode', record: record }); },
    memberRegister: function (record, code) { return post({ action: 'memberRegister', record: record, code: code }); },
    memberLogin: function (mobile) {
      var ua = '';
      try { ua = navigator.userAgent || ''; } catch (e) {}
      return post({ action: 'memberLogin', mobile: mobile, userAgent: ua });
    },
    validateMemberToken: function (token) { return post({ action: 'validateMemberToken', token: token }); },
    memberContent: function (token) { return postRead({ action: 'memberContent', token: token }); },
    memberDirectory: function (token) { return post({ action: 'memberDirectory', token: token }); },
    memberProfile: function (token) { return post({ action: 'memberProfile', token: token }); },
    memberUpdateProfile: function (record, token) { return post({ action: 'memberUpdateProfile', record: record, token: token }); },
    memberContactAdmin: function (message, token) { return post({ action: 'memberContactAdmin', message: message, token: token }); },
    adminMemberList: function (token) { return post({ action: 'adminMemberList', token: token }); },
    adminList: function (type, token) { return postRead({ action: 'adminList', type: type, token: token }); },
    adminAll: function (token) { return postRead({ action: 'adminAll', token: token }); },
    getMemberGlobalNote: function (token) { return post({ action: 'getMemberGlobalNote', token: token }); },
    setMemberGlobalNote: function (note, token) { return post({ action: 'setMemberGlobalNote', note: note, token: token }); },
    sendBulkMail: function (message, token) {
      message = message || {};
      return post({
        action: 'sendBulkMail',
        token: token,
        recipientIds: message.recipientIds || [],
        subject: message.subject || '',
        htmlBody: message.htmlBody || '',
        textBody: message.textBody || '',
        attachments: message.attachments || [],
        inlineImages: message.inlineImages || []
      });
    }
  };
})();
