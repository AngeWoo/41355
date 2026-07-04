/* Frontend interactions, data rendering, pagination, search, and modal controls. */
(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function forceTopOnFreshLoad() {
    if (location.hash) {
      try {
        history.replaceState(null, document.title, location.pathname + location.search);
      } catch (e) {}
    }
    window.scrollTo(0, 0);
    requestAnimationFrame(function () { window.scrollTo(0, 0); });
  }
  forceTopOnFreshLoad();
  window.addEventListener('pageshow', forceTopOnFreshLoad);
  window.addEventListener('load', forceTopOnFreshLoad);
  window.addEventListener('beforeunload', function () { window.scrollTo(0, 0); });

  var CFG = window.SITE_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };

  document.getElementById('year').textContent = '2026';
  var off = document.getElementById('officialLink');
  if (off && CFG.OFFICIAL_LINK) off.href = CFG.OFFICIAL_LINK;

  // Internal section.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function truthy(v) { var s = String(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || v === true; }
  function linkAttr(url) { return url ? ' href="' + esc(url) + '" target="_blank" rel="noopener"' : ' href="javascript:void(0)"'; }
  function fallbackLink(type, it) {
    if (it && it.link) return it.link;
    var rows = (window.SEED_DATA && window.SEED_DATA[type]) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (it && r.link && (
        (it.id && r.id === it.id) ||
        (it.date && r.date === it.date && it.title && r.title === it.title)
      )) return r.link;
    }
    return '';
  }
  function driveThumb(url) {
    var s = String(url || '');
    var m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/) || s.match(/[?&]id=([^&]+)/);
    return m ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=w700' : '';
  }
  function newsletterCover(it) {
    var issueStr = fmtDate(it.issue || it.date);
    var seedCover = '';
    var rows = (window.SEED_DATA && window.SEED_DATA.newsletter) || [];
    for (var i = 0; i < rows.length; i++) {
      if (it && rows[i].cover && (
        (it.id && rows[i].id === it.id) ||
        (it.issue && rows[i].issue === it.issue)
      )) {
        seedCover = rows[i].cover;
        break;
      }
    }
    var src = it.cover || seedCover || driveThumb(it.link);
    var fallback = '<div class="ph"><b>' + esc(issueStr.slice(0, 7)) + '</b><span>親苑時報</span></div>';
    if (!src) return fallback;
    return "<img src=\"" + esc(src) + "\" alt=\"" + esc(it.title) + "\" loading=\"lazy\" referrerpolicy=\"no-referrer\" onerror=\"this.closest('.cover').classList.add('no-thumb');this.remove();\" />" + fallback;
  }
  function newsletterCover(it) {
    var issueStr = fmtDate(it.issue || it.date);
    var seed = seedCover('newsletter', it);
    var src = it.cover || seed || driveThumb(it.link);
    var parts = issueStr.slice(0, 7).split('-');
    var fallback = '<div class="ph news-ph">' +
      '<span class="news-ph-strip"></span>' +
      '<span class="news-ph-title">親苑<br/>時報</span>' +
      '<span class="news-ph-mark">SHINNYO</span>' +
      '<b>' + esc(parts[0] || '') + '</b>' +
      '<em>' + esc(parts[1] || '') + '</em>' +
      '</div>';
    if (!src) return fallback;
    return "<img src=\"" + esc(src) + "\" alt=\"" + esc(it.title) + "\" loading=\"lazy\" referrerpolicy=\"no-referrer\" onerror=\"this.closest('.cover').classList.add('no-thumb');this.remove();\" />" + fallback;
  }
  function seedCover(type, it) {
    var rows = (window.SEED_DATA && window.SEED_DATA[type]) || [];
    for (var i = 0; i < rows.length; i++) {
      if (it && rows[i].cover && (
        (it.id && rows[i].id === it.id) ||
        (it.issue && rows[i].issue === it.issue) ||
        (it.title && rows[i].title === it.title)
      )) return rows[i].cover;
    }
    return '';
  }
  function coverMarkup(type, it, label) {
    var src = it.cover || seedCover(type, it) || driveThumb(it.link);
    var fallback = '<div class="ph"><b>' + esc(label || '') + '</b><span>' + esc(it.title || '') + '</span></div>';
    if (!src) return fallback;
    return "<img src=\"" + esc(src) + "\" alt=\"" + esc(it.title) + "\" loading=\"lazy\" referrerpolicy=\"no-referrer\" onerror=\"this.closest('.cover').classList.add('no-thumb');this.remove();\" />" + fallback;
  }
  function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

  function fmtDate(v) {
    if (v == null) return '';
    var s = String(v).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      var dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        try { return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); } catch (e) { return s.slice(0, 10); }
      }
      return s.slice(0, 10);
    }
    var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    var ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
    if (ym) return ym[1] + '-' + pad(ym[2]);
    return s;
  }

  // ---- ?桀撐?∠?皜脫???----
  function newsItem(it) {
    var more = it.link ? '<a' + linkAttr(it.link) + ' class="more-link">閱讀更多 →</a>' : '';
    return '<div class="card reveal stack">' +
      '<div class="item-date">' + esc(fmtDate(it.date)) + '</div>' +
      '<h4>' + esc(it.title) + '</h4>' +
      (it.body ? '<p class="muted small">' + esc(it.body) + '</p>' : '') + more + '</div>';
  }
  function podcastItem(it) {
    var meta = (it.guest ? '來賓：' + esc(it.guest) + (it.date ? ' · ' : '') : '') + esc(fmtDate(it.date));
    return '<a class="card pod cafe-card reveal"' + linkAttr(it.link) + '>' +
      '<span class="ep">' + esc(it.ep || 'EP') + '</span>' +
      '<h4>' + esc(it.title) + '</h4>' +
      '<div class="meta">' + meta + '</div>' +
      '<p class="muted small">' + esc(it.desc) + '</p>' +
      '<span class="play"><span class="pbtn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>開啟收聽</span></a>';
  }
  function calItem(it) {
    var open = it.link ? '<a class="card reveal stack" style="text-decoration:none"' + linkAttr(it.link) + '>' : '<div class="card reveal stack">';
    var close = it.link ? '</a>' : '</div>';
    var meta = '<div class="item-date">' + esc(fmtDate(it.date)) + (it.tag ? ' <span class="tag">' + esc(it.tag) + '</span>' : '') + '</div>';
    return open + meta + '<h4>' + esc(it.title) + '</h4>' +
      (it.location ? '<div class="where"><span>?? ' + esc(it.location) + '</span></div>' : '') +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      (it.link ? '<span class="more-link">查看連結 →</span>' : '') + close;
  }
  function calItem(it) {
    var url = fallbackLink('calendar', it);
    var open = url ? '<a class="card reveal stack" style="text-decoration:none"' + linkAttr(url) + '>' : '<div class="card reveal stack">';
    var close = url ? '</a>' : '</div>';
    var meta = '<div class="item-date">' + esc(fmtDate(it.date)) + (it.tag ? ' <span class="tag">' + esc(it.tag) + '</span>' : '') + '</div>';
    return open + meta + '<h4>' + esc(it.title) + '</h4>' +
      (it.location ? '<div class="where"><span>' + esc(it.location) + '</span></div>' : '') +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      (url ? '<span class="more-link">查看連結 →</span>' : '') + close;
  }
  function newsletterItem(it) {
    var issueStr = fmtDate(it.issue || it.date);
    var cover = it.cover
      ? '<img src="' + esc(it.cover) + '" alt="' + esc(it.title) + '" />'
      : '<div class="ph"><b>' + esc(issueStr.slice(0, 7)) + '</b><span>親苑時報</span></div>';
    return '<a class="card paper reveal"' + linkAttr(it.link) + '>' +
      '<div class="cover">' + cover + '</div>' +
      '<h4>' + esc(it.title) + '</h4>' +
      '<div class="issue">' + esc(issueStr) + '</div></a>';
  }
  function newsletterItem(it) {
    var issueStr = fmtDate(it.issue || it.date);
    return '<a class="card paper reveal"' + linkAttr(it.link) + '>' +
      '<div class="cover">' + newsletterCover(it) + '</div>' +
      '<h4>' + esc(it.title) + '</h4>' +
      '<div class="issue">' + esc(issueStr) + '</div></a>';
  }
  function dharmaItem(it) {
    var dstr = esc(fmtDate(it.date));
    var content = String(it.content || '').trim();
    if (!content) content = '';
    var full = it.link ? '<a' + linkAttr(it.link) + ' class="more-link dharma-read">閱讀全文 →</a>' : '';
    return '<div class="card dharma-item reveal">' +
      '<div class="dharma-cover cover">' + coverMarkup('dharma', it, it.category || '瑞聲法語') + '</div>' +
      '<span class="cat">' + esc(it.category || '瑞聲法語') + '</span>' +
      '<h4>' + esc(it.title) + '</h4>' +
      (content ? '<p>' + esc(content) + '</p>' : '') +
      full +
      (dstr ? '<div class="date">' + dstr + '</div>' : '') + '</div>';
  }
  function toolItem(it) {
    return '<a class="card tool-card reveal"' + linkAttr(it.link) + '>' +
      '<span class="tool-mark">' + esc(it.icon || '工具') + '</span>' +
      '<h4>' + esc(it.title) + '</h4>' +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      '<span class="more-link">開啟程式 →</span></a>';
  }

  // Internal section.
  var GAP = 22;
  var allData = {};
  var SECTIONS = [
    { type: 'news', gridId: 'newsGrid', minW: 330, item: newsItem, empty: '目前沒有最新消息' },
    { type: 'podcast', gridId: 'podcastGrid', minW: 300, item: podcastItem, empty: '目前沒有 Podcast' },
    { type: 'calendar', gridId: 'calendarGrid', minW: 320, item: calItem, empty: '目前沒有行事曆' },
    { type: 'newsletter', gridId: 'newsletterGrid', minW: 210, item: newsletterItem, empty: '目前沒有親苑時報' },
    { type: 'dharma', gridId: 'dharmaGrid', minW: 300, item: dharmaItem, empty: '目前沒有瑞聲法語' },
    { type: 'tools', gridId: 'toolsGrid', minW: 260, maxCols: 5, item: toolItem, empty: '目前沒有互動程式' }
  ];
  var store = {};
  var searchReady = false;
  var statTimers = {};
  var apiReady = false;
  var talkPage = 0;
  var talksReady = false;
  var talksLoading = false;

  function textOf(it, fields) {
    return fields.map(function (f) { return it && it[f] ? String(it[f]) : ''; }).join(' ');
  }

  function searchRows(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    var defs = [
      { type: 'news', label: '最新消息', href: '#home', fields: ['title', 'body', 'date'] },
      { type: 'calendar', label: '行事曆', href: '#calendar', fields: ['title', 'desc', 'location', 'tag', 'date'] },
      { type: 'newsletter', label: '親苑時報', href: '#newsletter', fields: ['title', 'issue', 'date'] },
      { type: 'dharma', label: '瑞聲法語', href: '#dharma', fields: ['title', 'content', 'category', 'date'] },
      { type: 'tools', label: '互動程式', href: '#tools', fields: ['title', 'desc'] },
      { type: 'podcast', label: 'Podcast', href: '#podcast', fields: ['title', 'desc', 'guest', 'ep', 'date'] }
    ];
    var rows = [];
    defs.forEach(function (def) {
      (allData[def.type] || []).forEach(function (it) {
        var hay = textOf(it, def.fields).toLowerCase();
        if (hay.indexOf(q) === -1) return;
        rows.push({
          label: def.label,
          href: it.link || def.href,
          title: it.title || it.ep || def.label,
          body: it.body || it.desc || it.content || it.location || fmtDate(it.date || it.issue) || '',
          external: !!it.link
        });
      });
    });
    return rows.slice(0, 12);
  }

  function renderSearch(q) {
    var pop = document.getElementById('searchPopover');
    var out = document.getElementById('searchResults');
    if (!pop || !out) return;
    var rows = searchRows(q);
    pop.hidden = false;
    if (!rows.length) {
      out.innerHTML = '<div class="search-empty">找不到「' + esc(q) + '」相關內容</div>';
      return;
    }
    out.innerHTML = rows.map(function (r) {
      return '<a class="search-result" href="' + esc(r.href) + '"' + (r.external ? ' target="_blank" rel="noopener"' : '') + '>' +
        '<span class="type">' + esc(r.label) + '</span>' +
        '<b>' + esc(r.title) + '</b>' +
        (r.body ? '<p>' + esc(String(r.body).slice(0, 96)) + '</p>' : '') +
        '</a>';
    }).join('');
  }

  function setupSearch() {
    var form = document.getElementById('siteSearch');
    var input = document.getElementById('siteSearchInput');
    var pop = document.getElementById('searchPopover');
    var close = document.getElementById('searchClose');
    if (!form || !input || !pop) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      renderSearch(input.value);
    });
    input.addEventListener('input', function () {
      if (input.value.trim().length >= 2) renderSearch(input.value);
      else pop.hidden = true;
    });
    if (close) close.addEventListener('click', function () { pop.hidden = true; input.focus(); });
    pop.addEventListener('click', function (e) {
      if (e.target === pop) pop.hidden = true;
      if (e.target.closest && e.target.closest('.search-result')) pop.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') pop.hidden = true;
    });
  }

  function setupSearchOnce() {
    if (searchReady) return;
    searchReady = true;
    setupSearch();
  }

  function colsFor(grid, minW) {
    var w = grid.clientWidth || (grid.parentElement && grid.parentElement.clientWidth) || 1000;
    return Math.max(1, Math.floor((w + GAP) / (minW + GAP)));
  }

  function setupSection(cfg, items) {
    var grid = document.getElementById(cfg.gridId);
    if (!grid) return;
    var pager = document.createElement('div');
    pager.className = 'pager';
    grid.parentNode.insertBefore(pager, grid.nextSibling);
    store[cfg.type] = { items: items || [], page: 0, cfg: cfg, grid: grid, pager: pager };
    var lastPagerPointer = 0;
    function handlePagerGo(e) {
      var b = e.target.closest('button[data-go]');
      var s = store[cfg.type];
      if (!b || !s || b.disabled) return;
      if (e.type === 'click' && Date.now() - lastPagerPointer < 450) return;
      if (e.type === 'pointerup') lastPagerPointer = Date.now();
      e.preventDefault();
      var cols = colsFor(s.grid, s.cfg.minW);
      if (s.cfg.maxCols) cols = Math.min(cols, s.cfg.maxCols);
      var pages = Math.max(1, Math.ceil((s.items || []).length / cols));
      var next = Math.max(0, Math.min(pages - 1, Number(b.getAttribute('data-go'))));
      if (next === s.page) return;
      var dir = next > s.page ? 'next' : 'prev';
      s.page = next;
      draw(cfg.type, dir);
    }
    pager.addEventListener('pointerup', handlePagerGo);
    pager.addEventListener('click', handlePagerGo);
    setupGridSwipe(cfg.type, grid);
    draw(cfg.type);
  }

  function setupGridSwipe(type, grid) {
    var startX = 0, startY = 0, startTime = 0;
    grid.classList.add('swipe-grid');
    grid.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });
    grid.addEventListener('touchend', function (e) {
      var s = store[type];
      if (!s || !s.items.length || !e.changedTouches || e.changedTouches.length !== 1) return;
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Date.now() - startTime > 800 || Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      var cols = colsFor(s.grid, s.cfg.minW);
      if (s.cfg.maxCols) cols = Math.min(cols, s.cfg.maxCols);
      var pages = Math.max(1, Math.ceil(s.items.length / cols));
      var next = s.page + (dx < 0 ? 1 : -1);
      next = Math.max(0, Math.min(pages - 1, next));
      if (next === s.page) return;
      var dir = next > s.page ? 'next' : 'prev';
      s.page = next;
      draw(type, dir);
    }, { passive: true });
  }

  function draw(type, direction) {
    var s = store[type]; if (!s) return;
    var grid = s.grid, items = s.items;
    if (!items.length) {
      grid.style.gridTemplateColumns = '';
      grid.innerHTML = '<div class="skeleton">' + s.cfg.empty + '</div>';
      s.pager.innerHTML = '';
      return;
    }
    var cols = colsFor(grid, s.cfg.minW);
    if (s.cfg.maxCols) cols = Math.min(cols, s.cfg.maxCols);
    var pages = Math.max(1, Math.ceil(items.length / cols));
    if (s.page > pages - 1) s.page = pages - 1;
    if (s.page < 0) s.page = 0;
    grid.classList.toggle('can-swipe', pages > 1);
    grid.classList.toggle('can-swipe-prev', pages > 1 && s.page > 0);
    grid.classList.toggle('can-swipe-next', pages > 1 && s.page < pages - 1);
    var start = s.page * cols;
    var pageItems = items.slice(start, start + cols);
  // Internal section.
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    var blanks = '';
    for (var i = pageItems.length; i < cols; i++) blanks += '<div class="grid-spacer" aria-hidden="true"></div>';
    grid.innerHTML = pageItems.map(s.cfg.item).join('') + blanks;
    grid.classList.remove('slide-next', 'slide-prev');
    if (direction === 'next' || direction === 'prev') {
      grid.classList.add(direction === 'next' ? 'slide-next' : 'slide-prev');
      window.setTimeout(function () { grid.classList.remove('slide-next', 'slide-prev'); }, 360);
    }
    drawPager(type, pages);
    revealIn(grid);
  }

  function pbtn(label, go, disabled, cls) {
    return '<button class="pg-btn ' + (cls || '') + '" data-go="' + go + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }
  function drawPager(type, pages) {
    var s = store[type];
    if (pages <= 1) { s.pager.innerHTML = ''; return; }
    var p = s.page, html = '';
    html += pbtn('最前頁', 0, p === 0);
    html += pbtn('上一頁', p - 1, p === 0);
    html += '<span class="pager-info">' + (p + 1) + ' / ' + pages + '</span>';
    html += pbtn('下一頁', p + 1, p === pages - 1);
    html += pbtn('最後頁', pages - 1, p === pages - 1);
    s.pager.innerHTML = html;

    Array.prototype.forEach.call(s.pager.querySelectorAll('button[data-go]'), function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        var next = Math.max(0, Math.min(pages - 1, +b.getAttribute('data-go')));
        var dir = next > s.page ? 'next' : 'prev';
        s.page = next;
        draw(type, dir);
      });
    });
  }

  function revealIn(grid) {
    var els = grid.querySelectorAll('.reveal');
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(els, function (e) { e.classList.add('in'); });
    });
  }

  // Internal section.
  var rzT;
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { Object.keys(store).forEach(function (t) { draw(t); }); }, 160);
  });

  // Internal section.
  function normalizeData(d) {
    d = d || {};
    if (!d.tools || !d.tools.length) d.tools = (window.SEED_DATA && window.SEED_DATA.tools) || [];
    if (!d.talks || !d.talks.length) d.talks = (window.SEED_DATA && window.SEED_DATA.talks) || [];
    return d;
  }

  function renderData(d, animateStats) {
    d = normalizeData(d);
    allData = d;
    SECTIONS.forEach(function (cfg) {
      var items = d[cfg.type] || [];
      if (store[cfg.type]) {
        store[cfg.type].items = items;
        store[cfg.type].page = 0;
        draw(cfg.type);
      } else {
        setupSection(cfg, items);
      }
    });
    setupSearchOnce();
    updateStats(d, animateStats);
    observeReveal();
    var talkPopover = document.getElementById('talkPopover');
    if (talkPopover && !talkPopover.hidden) renderTalkListAudio();
  }

  function boot() {
    var renderedSeed = false;
    if (API.seedAll) {
      renderData(API.seedAll(), true);
      renderedSeed = true;
    }
    refreshTalks();

    API.all().then(function (res) {
      if (!res.ok) { console.error(res.error); return; }
      apiReady = true;
      talksReady = true;
      renderData(res.data, !renderedSeed);
      var bannerMsg = res.mode === 'published' ? '<b>資料來源：Google 試算表</b>'
        : res.mode === 'demo' ? '<b>展示模式</b>：目前顯示內建資料'
        : '<b>本機資料模式</b>';
      showModeBanner(bannerMsg);
    }).catch(function (e) { console.error(e); });
  }

  function setStat(id, n) {
    var el = document.getElementById(id); if (!el) return;
    if (statTimers[id]) clearInterval(statTimers[id]);
    var target = Number(n) || 0, cur = 0, step = Math.max(1, Math.ceil(target / 24));
    statTimers[id] = setInterval(function () {
      cur += step; if (cur >= target) { cur = target; clearInterval(statTimers[id]); statTimers[id] = null; }
      el.textContent = cur + (target > 0 ? '+' : '');
    }, 28);
  }

  function setStatNow(id, n) {
    var el = document.getElementById(id); if (!el) return;
    if (statTimers[id]) { clearInterval(statTimers[id]); statTimers[id] = null; }
    var target = Number(n) || 0;
    el.textContent = target + (target > 0 ? '+' : '');
  }

  function updateStats(d, animate) {
    var fn = animate ? setStat : setStatNow;
    fn('statPodcast', (d.podcast || []).length);
    fn('statNews', (d.news || []).length);
    fn('statDharma', (d.dharma || []).length);
    fn('statCal', (d.calendar || []).length);
  }

  function renderTalkList() {
    var out = document.getElementById('talkList');
    if (!out) return;
    var rows = ((allData && allData.talks) || (window.SEED_DATA && window.SEED_DATA.talks) || []).slice().sort(function (a, b) {
      return (Number(a.order || 0) - Number(b.order || 0)) || String(a.title || '').localeCompare(String(b.title || ''));
    });
    if (!rows.length) {
      out.innerHTML = '<div class="search-empty">目前沒有真如開講資料</div>';
      return;
    }
    out.innerHTML = rows.map(function (it) {
      var src = talkAudioSrc(it.link);
      return '<article class="talk-item">' +
        '<span class="talk-icon">' + esc(it.icon || '講') + '</span>' +
        '<div><h3>' + esc(it.title || '真如開講') + '</h3>' +
        (it.desc ? '<p>' + esc(it.desc) + '</p>' : '') +
        '</div>' +
        (src ? '<audio class="talk-audio" controls preload="none" src="' + esc(src) + '">您的瀏覽器不支援音訊播放。</audio>' : '') +
        '</article>';
    }).join('');
  }

  function openTalkPopover() {
    var pop = document.getElementById('talkPopover');
    var close = document.getElementById('talkClose');
    if (!pop) return;
    renderTalkListAudio();
    if (!talksReady) refreshTalks();
    pop.hidden = false;
    document.documentElement.classList.add('talk-open');
    if (close) close.focus();
  }

  function bindTalkButton() {
    var btn = document.getElementById('talkFloatBtn');
    if (!btn || btn.dataset.ready === '1') return;
    btn.dataset.ready = '1';
    btn.addEventListener('click', openTalkPopover);
  }

  function talkAudioSrc(url) {
    var s = String(url || '').trim();
    if (/^\.\.\/assets\//.test(s)) s = s.replace(/^\.\.\//, '');
    var driveId = (s.match(/drive\.google\.com\/file\/d\/([^/]+)/) || s.match(/[?&]id=([^&]+)/) || [])[1];
    return driveId ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(driveId) : s;
  }

  function talkMegaEmbed(url) {
    var s = String(url || '').trim();
    var m = s.match(/mega\.nz\/file\/([^#?]+)#([^/?#]+)/);
    return m ? 'https://mega.nz/embed/' + encodeURIComponent(m[1]) + '#' + encodeURIComponent(m[2]) : '';
  }

  function refreshTalks() {
    if (talksLoading || !API.list) return;
    talksLoading = true;
    API.list('talks').then(function (res) {
      talksLoading = false;
      if (!res || !res.ok) return;
      allData = allData || {};
      allData.talks = res.data || [];
      talksReady = true;
      var pop = document.getElementById('talkPopover');
      if (pop && !pop.hidden) renderTalkListAudio();
    }).catch(function () {
      talksLoading = false;
    });
  }

  function renderTalkListAudio() {
    var out = document.getElementById('talkList');
    var pager = document.getElementById('talkPager');
    if (!out) return;
    var rows = ((allData && allData.talks) || (window.SEED_DATA && window.SEED_DATA.talks) || []).slice().sort(function (a, b) {
      return (Number(a.order || 0) - Number(b.order || 0)) || String(a.title || '').localeCompare(String(b.title || ''));
    });
    if (!rows.length) {
      out.innerHTML = '<div class="search-empty">目前沒有真如開講資料</div>';
      out.classList.remove('can-swipe', 'can-swipe-prev', 'can-swipe-next');
      if (pager) pager.innerHTML = '';
      return;
    }
    out.classList.toggle('can-swipe', rows.length > 1);
    out.classList.toggle('can-swipe-prev', rows.length > 1 && talkPage > 0);
    out.classList.toggle('can-swipe-next', rows.length > 1 && talkPage < rows.length - 1);
    if (talkPage > rows.length - 1) talkPage = rows.length - 1;
    if (talkPage < 0) talkPage = 0;
    var it = rows[talkPage];
    out.innerHTML = (function () {
      var src = talkAudioSrc(it.link);
      return '<article class="talk-item">' +
        '<span class="talk-icon">' + esc(it.icon || '講') + '</span>' +
        '<div><h3>' + esc(it.title || '真如開講') + '</h3>' +
        (it.desc ? '<p>' + esc(it.desc) + '</p>' : '') +
        '</div>' +
        (src ? '<audio class="talk-audio" controls preload="none" src="' + esc(src) + '">您的瀏覽器不支援音訊播放。</audio>' : '') +
        '</article>';
    })();
    if (pager) {
      if (rows.length <= 1) {
        pager.innerHTML = '';
      } else {
        pager.innerHTML =
          '<button type="button" class="talk-page-btn" data-talk-page="' + (talkPage - 1) + '"' + (talkPage === 0 ? ' disabled' : '') + '>上一頁</button>' +
          '<span class="talk-page-info">' + (talkPage + 1) + ' / ' + rows.length + '</span>' +
          '<button type="button" class="talk-page-btn" data-talk-page="' + (talkPage + 1) + '"' + (talkPage === rows.length - 1 ? ' disabled' : '') + '>下一頁</button>';
      }
    }
  }

  function setTalkPage(next) {
    var rows = ((allData && allData.talks) || (window.SEED_DATA && window.SEED_DATA.talks) || []);
    var max = Math.max(0, rows.length - 1);
    next = Math.max(0, Math.min(max, Number(next) || 0));
    if (next === talkPage) return;
    var dir = next > talkPage ? 'next' : 'prev';
    talkPage = next;
    renderTalkListAudio();
    var out = document.getElementById('talkList');
    if (out) {
      out.classList.remove('slide-next', 'slide-prev');
      out.classList.add(dir === 'next' ? 'slide-next' : 'slide-prev');
      window.setTimeout(function () { out.classList.remove('slide-next', 'slide-prev'); }, 360);
    }
  }

  function closeTalkPopover() {
    var pop = document.getElementById('talkPopover');
    if (pop) pop.hidden = true;
    document.documentElement.classList.remove('talk-open');
  }

  function showModeBanner() {
    bindTalkButton();
    return;
    var existingTalkButton = document.getElementById('talkFloatBtn');
    if (existingTalkButton) {
      if (existingTalkButton.dataset.ready !== '1') {
        existingTalkButton.dataset.ready = '1';
        existingTalkButton.addEventListener('click', openTalkPopover);
      }
      return;
    }
    if (document.getElementById('talkFloatBtn')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'demo-banner';
    b.id = 'talkFloatBtn';
    b.innerHTML = '<b>真如開講</b>';
    b.addEventListener('click', openTalkPopover);
    document.body.appendChild(b);
  }

  var talkClose = document.getElementById('talkClose');
  var talkPopover = document.getElementById('talkPopover');
  var talkPager = document.getElementById('talkPager');
  var talkList = document.getElementById('talkList');
  bindTalkButton();
  if (talkClose) talkClose.addEventListener('click', closeTalkPopover);
  if (talkPopover) {
    talkPopover.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute('data-talk-close')) return;
    });
  }
  if (talkPager) {
    talkPager.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-talk-page]');
      if (!btn || btn.disabled) return;
      setTalkPage(btn.getAttribute('data-talk-page'));
    });
  }
  if (talkList) {
    var talkStartX = 0, talkStartY = 0, talkStartTime = 0;
    talkList.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      talkStartX = e.touches[0].clientX;
      talkStartY = e.touches[0].clientY;
      talkStartTime = Date.now();
    }, { passive: true });
    talkList.addEventListener('touchend', function (e) {
      if (!e.changedTouches || e.changedTouches.length !== 1) return;
      var dx = e.changedTouches[0].clientX - talkStartX;
      var dy = e.changedTouches[0].clientY - talkStartY;
      if (Date.now() - talkStartTime > 800 || Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      setTalkPage(talkPage + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  // Internal section.
  var nav = document.getElementById('nav');
  function updateNavActive() {
    nav.classList.toggle('scrolled', window.scrollY > 30);
    var secs = document.querySelectorAll('main section.block, header.hero');
    var cur = '';
    var pos = window.scrollY + 130;
    secs.forEach(function (s) { if (pos >= s.offsetTop) cur = s.id; });
    if (!cur || cur === 'top') cur = 'home';
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      var isActive = a.getAttribute('href') === '#' + cur;
      a.classList.toggle('active', isActive);
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', updateNavActive, { passive: true });
  window.addEventListener('load', updateNavActive);
  updateNavActive();

  var ham = document.getElementById('hamburger'), navLinks = document.getElementById('navLinks');
  ham.setAttribute('aria-expanded', 'false');
  ham.addEventListener('click', function () {
    updateNavActive();
    var isOpen = navLinks.classList.toggle('open');
    ham.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  navLinks.addEventListener('click', function (e) {
    if (e.target.tagName !== 'A') return;
    navLinks.classList.remove('open');
    ham.setAttribute('aria-expanded', 'false');
  });

  var jumpTop = document.getElementById('jumpTop');
  var jumpBottom = document.getElementById('jumpBottom');
  if (jumpTop) {
    jumpTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  if (jumpBottom) {
    jumpBottom.addEventListener('click', function () {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  }

  var liveOpen = document.getElementById('liveVideoOpen');
  var liveModal = document.getElementById('liveVideoModal');
  var liveClose = document.getElementById('liveVideoClose');
  function openLiveVideo() {
    if (!liveModal) return;
    liveModal.hidden = false;
    document.documentElement.classList.add('modal-open');
    if (liveClose) liveClose.focus();
  }
  function closeLiveVideo() {
    if (!liveModal) return;
    liveModal.hidden = true;
    document.documentElement.classList.remove('modal-open');
    if (liveOpen) liveOpen.focus();
  }
  if (liveOpen) liveOpen.addEventListener('click', openLiveVideo);
  if (liveClose) liveClose.addEventListener('click', closeLiveVideo);
  if (liveModal) {
    liveModal.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute('data-live-close')) closeLiveVideo();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && liveModal && !liveModal.hidden) closeLiveVideo();
  });

  function setLiveText(text) {
    var title = document.getElementById('liveVideoTitle');
    var tabText = document.getElementById('liveVideoTabText');
    if (!text) return;
    if (title) title.textContent = text;
    if (tabText) {
      var normalized = String(text).replace(/\s+/g, ' ').trim();
      var parts = normalized.match(/^(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})\s+(.+)$/);
      tabText.innerHTML = parts ? esc(parts[1]) + '<br/>' + esc(parts[2]) : esc(normalized);
    }
  }

  function setLiveUrl(url, officialPage) {
    var videoLink = document.getElementById('liveVideoLink');
    var lineShare = document.getElementById('liveLineShare');
    var officialLink = document.getElementById('liveOfficialPageLink');
    if (url && videoLink) videoLink.href = url;
    if (url && lineShare) lineShare.href = 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(url);
    if (officialPage && officialLink) officialLink.href = officialPage;
  }

  function refreshOfficialLive() {
    if (!API.officialLive) return;
    API.officialLive().then(function (res) {
      if (!res || !res.ok || !res.data) return;
      setLiveText(res.data.title);
      setLiveUrl(res.data.url, res.data.officialPage);
    }).catch(function (e) { console.warn('official live sync failed', e); });
  }

  function observeReveal() {
    var els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }

  observeReveal();
  boot();
  refreshOfficialLive();
})();
