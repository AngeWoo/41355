/* 前台渲染邏輯：簡潔日期 + 每區一列卡片 + 分頁 + 依寬度自動排列 */
(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) {
    window.addEventListener('pageshow', function () {
      setTimeout(function () { window.scrollTo(0, 0); }, 0);
    });
  }

  var CFG = window.SITE_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };

  document.getElementById('year').textContent = '2026';
  var off = document.getElementById('officialLink');
  if (off && CFG.OFFICIAL_LINK) off.href = CFG.OFFICIAL_LINK;

  // ---- 工具 ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function truthy(v) { var s = String(v).toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === '是' || v === true; }
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

  // 簡潔日期：一律只顯示日期（YYYY-MM-DD）。ISO 時間以台北時區換算，避免位移。
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
    return s; // 例如 Podcast 的 3/28 原樣保留
  }

  // ---- 單張卡片渲染器 ----
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
      '<span class="play"><span class="pbtn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>立即收聽</span></a>';
  }
  function calItem(it) {
    var open = it.link ? '<a class="card reveal stack" style="text-decoration:none"' + linkAttr(it.link) + '>' : '<div class="card reveal stack">';
    var close = it.link ? '</a>' : '</div>';
    var meta = '<div class="item-date">' + esc(fmtDate(it.date)) + (it.tag ? '　<span class="tag">' + esc(it.tag) + '</span>' : '') + '</div>';
    return open + meta + '<h4>' + esc(it.title) + '</h4>' +
      (it.location ? '<div class="where"><span>📍 ' + esc(it.location) + '</span></div>' : '') +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      (it.link ? '<span class="more-link">查看／下載 →</span>' : '') + close;
  }
  function calItem(it) {
    var url = fallbackLink('calendar', it);
    var open = url ? '<a class="card reveal stack" style="text-decoration:none"' + linkAttr(url) + '>' : '<div class="card reveal stack">';
    var close = url ? '</a>' : '</div>';
    var meta = '<div class="item-date">' + esc(fmtDate(it.date)) + (it.tag ? ' <span class="tag">' + esc(it.tag) + '</span>' : '') + '</div>';
    return open + meta + '<h4>' + esc(it.title) + '</h4>' +
      (it.location ? '<div class="where"><span>' + esc(it.location) + '</span></div>' : '') +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      (url ? '<span class="more-link">瀏覽行事曆 →</span>' : '') + close;
  }
  function newsletterItem(it) {
    var issueStr = fmtDate(it.issue || it.date); // 試算表可能把期別轉成日期，統一格式化
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
    if (content === '（點選下方連結閱讀本則瑞聲法語全文）') content = '';
    var full = it.link ? '<a' + linkAttr(it.link) + ' class="more-link dharma-read">全文閱讀 →</a>' : '';
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
      '<span class="tool-mark">' + esc(it.icon || '互') + '</span>' +
      '<h4>' + esc(it.title) + '</h4>' +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      '<span class="more-link">開啟程式 →</span></a>';
  }

  // ---- 分頁（每頁＝一列；欄數依容器寬度自動計算）----
  var GAP = 22;
  var allData = {};
  var SECTIONS = [
    { type: 'news', gridId: 'newsGrid', minW: 330, item: newsItem, empty: '目前尚無消息。' },
    { type: 'podcast', gridId: 'podcastGrid', minW: 300, item: podcastItem, empty: '目前尚無集數。' },
    { type: 'calendar', gridId: 'calendarGrid', minW: 320, item: calItem, empty: '近期尚無活動。' },
    { type: 'newsletter', gridId: 'newsletterGrid', minW: 210, item: newsletterItem, empty: '目前尚無時報。' },
    { type: 'dharma', gridId: 'dharmaGrid', minW: 300, item: dharmaItem, empty: '目前尚無法語。' },
    { type: 'tools', gridId: 'toolsGrid', minW: 260, maxCols: 5, item: toolItem, empty: '目前尚無互動程式。' }
  ];
  var store = {};
  var searchReady = false;
  var statTimers = {};

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
      out.innerHTML = '<div class="search-empty">找不到符合「' + esc(q) + '」的內容。</div>';
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
    draw(cfg.type);
  }

  function draw(type, doScroll) {
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
    var start = s.page * cols;
    var pageItems = items.slice(start, start + cols);
    // 欄數＝本頁卡片數，使整列永遠撐滿寬度（含最後一頁）
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    var blanks = '';
    for (var i = pageItems.length; i < cols; i++) blanks += '<div class="grid-spacer" aria-hidden="true"></div>';
    grid.innerHTML = pageItems.map(s.cfg.item).join('') + blanks;
    drawPager(type, pages);
    revealIn(grid);
    if (doScroll) {
      var sec = grid.closest('section.block');
      if (sec) window.scrollTo({ top: sec.offsetTop - 70, behavior: 'smooth' });
    }
  }

  function pbtn(label, go, disabled, cls) {
    return '<button class="pg-btn ' + (cls || '') + '" data-go="' + go + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }
  function drawPager(type, pages) {
    var s = store[type];
    if (pages <= 1) { s.pager.innerHTML = ''; return; }
    var p = s.page, html = '';
    html += pbtn('‹‹', 0, p === 0);
    html += pbtn('‹ 上一頁', p - 1, p === 0);
    html += '<span class="pager-info">第 ' + (p + 1) + ' / ' + pages + ' 頁</span>';
    html += pbtn('下一頁 ›', p + 1, p === pages - 1);
    html += pbtn('››', pages - 1, p === pages - 1);
    s.pager.innerHTML = html;
    Array.prototype.forEach.call(s.pager.querySelectorAll('button[data-go]'), function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        s.page = Math.max(0, Math.min(pages - 1, +b.getAttribute('data-go')));
        draw(type, true);
      });
    });
  }

  function revealIn(grid) {
    var els = grid.querySelectorAll('.reveal');
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(els, function (e) { e.classList.add('in'); });
    });
  }

  // 視窗縮放 → 重新計算各區欄數
  var rzT;
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { Object.keys(store).forEach(function (t) { draw(t); }); }, 160);
  });

  // ---- 載入資料 ----
  function normalizeData(d) {
    d = d || {};
    if (!d.tools || !d.tools.length) d.tools = (window.SEED_DATA && window.SEED_DATA.tools) || [];
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
  }

  function boot() {
    var renderedSeed = false;
    if (API.seedAll) {
      renderData(API.seedAll(), true);
      renderedSeed = true;
    }

    API.all().then(function (res) {
      if (!res.ok) { console.error(res.error); return; }
      renderData(res.data, !renderedSeed);
      if (res.mode === 'published') showModeBanner('🪷 即時讀取自 <b>Google 試算表</b>');
      else if (res.mode === 'demo' && !renderedSeed) showModeBanner('🪷 <b>展示模式</b>：尚未連接資料來源，目前顯示內建資料');
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

  function showModeBanner(html) {
    var b = document.createElement('div');
    b.className = 'demo-banner'; b.innerHTML = html;
    document.body.appendChild(b);
  }

  // ---- 導覽列、捲動、active ----
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function () {
    nav.classList.toggle('scrolled', window.scrollY > 30);
    var secs = document.querySelectorAll('main section.block, header.hero');
    var cur = '';
    secs.forEach(function (s) { if (window.scrollY >= s.offsetTop - 120) cur = s.id; });
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + cur);
    });
  }, { passive: true });

  var ham = document.getElementById('hamburger'), navLinks = document.getElementById('navLinks');
  ham.addEventListener('click', function () { navLinks.classList.toggle('open'); });
  navLinks.addEventListener('click', function (e) { if (e.target.tagName === 'A') navLinks.classList.remove('open'); });

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
