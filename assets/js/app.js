/* Frontend interactions, data rendering, pagination, search, and modal controls. */
(function () {
  var CFG = window.SITE_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var MEMBER_STORAGE_KEY = 'shinnyo_member_v2';
  // 重新整理後回到頁面最上方的處理已移到 assets/js/scroll-top.js（在 <head> 就先執行）。
  function storedMemberSession() {
    try {
      var current = JSON.parse(localStorage.getItem(MEMBER_STORAGE_KEY) || 'null');
      if (current) return current;
      // 將升版前的會員登入資料遷移到目前鍵名，保留既有 token。
      var legacy = JSON.parse(localStorage.getItem('shinnyo_member') || 'null');
      if (legacy && legacy.token) {
        localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(legacy));
        localStorage.removeItem('shinnyo_member');
        return legacy;
      }
      return null;
    } catch (e) { return null; }
  }

  document.getElementById('year').textContent = String(new Date().getFullYear());
  var off = document.getElementById('officialLink');
  if (off && CFG.OFFICIAL_LINK) off.href = safeLinkUrl(CFG.OFFICIAL_LINK) || '#';

  // Internal section.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeLinkUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    try {
      var parsed = new URL(raw, location.href);
      return /^(https?:|mailto:|tel:)$/.test(parsed.protocol) ? raw : '';
    } catch (e) {
      return '';
    }
  }
  function linkAttr(url) {
    var safe = safeLinkUrl(url);
    return safe ? ' href="' + esc(safe) + '"' : ' aria-disabled="true"';
  }
  function parseRecordDate(value) {
    var s = String(value || '').trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    m = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
    if (m) return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
    var d = new Date(s);
    return !isNaN(d.getTime()) ? d : null;
  }
  function recordDateValues(it, fields) {
    fields = fields || ['date', 'issue'];
    return fields.map(function (field) { return it && it[field]; });
  }
  function isRecentRecord(it, fields) {
    var dates = recordDateValues(it, fields)
      .map(parseRecordDate)
      .filter(Boolean);
    if (!dates.length) return false;
    var now = new Date();
    return dates.some(function (d) {
      var age = now.getTime() - d.getTime();
      return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
    });
  }
  function hasRecordDate(it, fields) {
    return recordDateValues(it, fields)
      .map(parseRecordDate)
      .some(Boolean);
  }
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
  var SECTION_HASH = {
    news: '#home',
    podcast: '#podcast',
    calendar: '#calendar',
    japanCalendar: '#calendar',
    headquarters: '#headquarters',
    newsletter: '#newsletter',
    dharma: '#dharma',
    iya: '#dharma',
    tools: '#tools',
    talks: '#top'
  };
  var TYPE_LABEL = {
    news: '最新消息',
    podcast: 'Podcast',
    calendar: '台灣行事曆',
    japanCalendar: '日本行事曆',
    headquarters: '總部會聯絡事項',
    newsletter: '親苑時報',
    dharma: '瑞聲法語',
    iya: '青年iYA報',
    tools: '互動程式',
    talks: '真如音檔'
  };
  // 試算表沿用舊版的 ../assets/... 寫法，實際檔案在站台目錄下的 assets/，
  // 直接丟給 new URL() 會往上多跳一層而抓不到檔案。
  function normalizeAssetPath(url) {
    var s = String(url || '').trim();
    return /^\.\.\/assets\//.test(s) ? s.replace(/^\.\.\//, '') : s;
  }
  function absoluteUrl(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    try { return new URL(s, location.href).href; } catch (e) { return s; }
  }
  function currentSiteUrl(type) {
    var hash = SECTION_HASH[type] || location.hash || '';
    return location.origin + location.pathname + location.search + hash;
  }
  function cleanUrlForCompare(url) {
    return String(url || '').trim().replace(/[),.，。；;!?！？]+$/, '');
  }
  // 同站的音檔／圖檔／PDF 本身就是要分享的內容，不能被代換成頁面網址，
  // 否則像真如音檔這種檔案放在站內的項目，轉傳出去只會連到首頁。
  function isSiteFileUrl(url) {
    var clean = cleanUrlForCompare(url);
    if (!clean) return false;
    try {
      var path = new URL(clean, location.href).pathname;
      return /\/assets\//.test(path) ||
        /\.(mp3|m4a|aac|wav|ogg|opus|mp4|m4v|mov|webm|pdf|jpe?g|png|gif|webp|svg)$/i.test(path);
    } catch (e) {
      return false;
    }
  }
  function isSiteShareUrl(url) {
    var clean = cleanUrlForCompare(url);
    if (!clean) return false;
    if (isSiteFileUrl(clean)) return false;
    try {
      var parsed = new URL(clean, location.href);
      var host = parsed.hostname.toLowerCase();
      var current = String(location.hostname || '').toLowerCase();
      return host === current ||
        /\.ngrok-free\.app$/.test(host) ||
        host === 'localhost' ||
        host === '127.0.0.1';
    } catch (e) {
      return false;
    }
  }
  function replaceSiteShareUrls(value, replacementUrl) {
    var replacement = replacementUrl || currentSiteUrl('');
    return String(value || '')
      .replace(/https?:\/\/[^\s<>"']+/g, function (match) {
        return isSiteShareUrl(match) ? replacement : match;
      })
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function cardShareUrl(type, it) {
    var url = normalizeAssetPath(fallbackLink(type, it));
    url = url ? absoluteUrl(url) : '';
    return isSiteShareUrl(url) ? currentSiteUrl(type) : (url || currentSiteUrl(type));
  }
  function compactShareText(value, maxLen) {
    var s = replaceSiteShareUrls(value).replace(/\s+/g, ' ').trim();
    if (!s || !maxLen || s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
  }
  function cardShareText(type, it, url) {
    it = it || {};
    var title = compactShareText(it.title || it.ep || it.issue || TYPE_LABEL[type] || '分享內容', 80);
    var date = fmtDate(it.date || it.issue || '');
    var body = compactShareText(it.body || it.desc || it.content || it.location || it.guest || it.category || '', 110);
    var lines = [title];
    if (date) lines.push(date);
    if (body && body !== title) lines.push(body);
    if (url && lines.join('\n').indexOf(url) === -1) lines.push(url);
    return replaceSiteShareUrls(lines.filter(Boolean).join('\n'), currentSiteUrl(type));
  }
  function lineShareUrl(text) {
    return 'https://line.me/R/msg/text/?' + encodeURIComponent(text);
  }
  function lineShareButton(type, it, url) {
    url = url || cardShareUrl(type, it);
    var text = cardShareText(type, it, url);
    return '<span class="line-card-share" role="button" tabindex="0" data-share-type="' + esc(type) + '" data-line-share="' + esc(lineShareUrl(text)) + '" aria-label="LINE 分享：' + esc(it && (it.title || it.ep) || TYPE_LABEL[type] || '內容') + '">LINE</span>';
  }
  function sanitizeLineShareHref(href, replacementUrl) {
    var value = String(href || '');
    var marker = '/R/msg/text/?';
    var idx = value.indexOf(marker);
    if (idx === -1) return value;
    var raw = value.slice(idx + marker.length);
    try { raw = decodeURIComponent(raw); } catch (e) {}
    return lineShareUrl(replaceSiteShareUrls(raw, replacementUrl || currentSiteUrl('')));
  }
  function openLineShare(el) {
    var type = el && el.getAttribute('data-share-type');
    var href = el && el.getAttribute('data-line-share');
    if (!href) return;
    href = sanitizeLineShareHref(href, currentSiteUrl(type || ''));
    el.setAttribute('data-line-share', href);
    window.open(href, '_blank', 'noopener');
  }
  document.addEventListener('click', function (e) {
    var share = e.target.closest && e.target.closest('.line-card-share');
    if (!share) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openLineShare(share);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var share = e.target.closest && e.target.closest('.line-card-share');
    if (!share) return;
    e.preventDefault();
    e.stopPropagation();
    openLineShare(share);
  }, true);
  function hydrateStaticCardShares() {
    document.querySelectorAll('#featureGrid .card.feature:not([data-line-ready])').forEach(function (card) {
      card.setAttribute('data-line-ready', '1');
      var title = card.querySelector('h3');
      var body = card.querySelector('p');
      var url = absoluteUrl(card.getAttribute('href') || location.href);
      var text = [
        title ? title.textContent : '真如苑資料網站',
        body ? body.textContent : '',
        url
      ].map(function (line) { return String(line || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean).join('\n');
      card.insertAdjacentHTML('afterbegin',
        '<span class="line-card-share" role="button" tabindex="0" data-line-share="' + esc(lineShareUrl(text)) + '" aria-label="LINE 分享：' + esc(title ? title.textContent : '卡片') + '">LINE</span>'
      );
    });
  }
  function newBadge(it) {
    return it && it._latest ? '<span class="latest-badge">最新上架</span>' : '';
  }
  function driveThumb(url) {
    var s = String(url || '');
    var m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/) || s.match(/[?&]id=([^&]+)/);
    return m ? 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(m[1]) + '=w480' : '';
  }
  function uniqueUrls(urls) {
    var seen = {};
    return (urls || []).filter(function (url) {
      url = String(url || '').trim();
      if (!url || seen[url]) return false;
      seen[url] = true;
      return true;
    }).map(function (url) {
      var driveId = (url.match(/drive\.google\.com\/thumbnail\?id=([^&]+)/) || [])[1];
      if (driveId) {
        try { driveId = decodeURIComponent(driveId); } catch (e) {}
        return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(driveId) + '=w480';
      }
      if (/^https:\/\/lh3\.googleusercontent\.com\//.test(url)) return url.replace(/=[ws]\d+$/, '=w480');
      return url;
    }).filter(function (url, index, all) { return all.indexOf(url) === index; });
  }
  function issueKey(it) {
    if (!it) return '';
    var issue = fmtDate(it.issue || it.date).slice(0, 7);
    if (issue) return issue;
    var m = String(it.title || '').match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
    return m ? m[1] + '-' + pad(m[2]) : '';
  }
  var KNOWN_NEWSLETTER_COVERS = {
    '2026-07': 'https://lh3.googleusercontent.com/d/152-UzlgrDZC0VqUT3OHrILskwzemWeJQ=w480',
    'https://meee.ing/18d09c': 'https://lh3.googleusercontent.com/d/152-UzlgrDZC0VqUT3OHrILskwzemWeJQ=w480'
  };
  function knownNewsletterCover(it) {
    if (!it) return '';
    return KNOWN_NEWSLETTER_COVERS[issueKey(it)] || KNOWN_NEWSLETTER_COVERS[String(it.link || '').trim()] || '';
  }
  function coverImgMarkup(urls, title) {
    urls = uniqueUrls(urls);
    if (!urls.length) return '';
    var rest = urls.slice(1);
    return '<img src="' + esc(urls[0]) + '" alt="' + esc(title || '') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cover-image data-cover-srcs="' + esc(JSON.stringify(rest)) + '" />';
  }
  window.__tryNextCover = function (img) {
    if (!img) return;
    var cover = img.closest && img.closest('.cover');
    var urls = [];
    try { urls = JSON.parse(img.getAttribute('data-cover-srcs') || '[]'); } catch (e) { urls = []; }
    urls = uniqueUrls(urls);
    if (urls.length) {
      img.setAttribute('data-cover-srcs', JSON.stringify(urls.slice(1)));
      img.src = urls[0];
      return;
    }
    if (cover) cover.classList.add('no-thumb');
    img.remove();
    // 候選網址都失敗了，這時才值得花一次後端解析把真正的封面找回來。
    if (cover) resolveCoverFor(cover);
  };
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img && img.matches && img.matches('img[data-cover-image]')) window.__tryNextCover(img);
  }, true);
  function newsletterCover(it) {
    var issueStr = fmtDate(it.issue || it.date);
    var seed = seedCover('newsletter', it);
    var known = knownNewsletterCover(it);
    var urls = [it.cover, known, seed, driveThumb(it.cover), driveThumb(known), driveThumb(seed), driveThumb(it.link)];
    var parts = issueStr.slice(0, 7).split('-');
    var fallback = '<div class="ph news-ph">' +
      '<span class="news-ph-strip"></span>' +
      '<span class="news-ph-title">親苑<br/>時報</span>' +
      '<span class="news-ph-mark">SHINNYO</span>' +
      '<b>' + esc(parts[0] || '') + '</b>' +
      '<em>' + esc(parts[1] || '') + '</em>' +
      '</div>';
    var marker = it.link ? '<span class="cover-resolve" data-cover-link="' + esc(it.link) + '" data-cover-title="' + esc(it.title || '') + '"></span>' : '';
    return coverImgMarkup(urls, it.title) + fallback + marker;
  }
  function seedCover(type, it) {
    var rows = (window.SEED_DATA && window.SEED_DATA[type]) || [];
    var key = issueKey(it);
    for (var i = 0; i < rows.length; i++) {
      if (it && rows[i].cover && (
        (it.id && rows[i].id === it.id) ||
        (it.issue && rows[i].issue === it.issue) ||
        (it.title && rows[i].title === it.title) ||
        (key && issueKey(rows[i]) === key)
      )) return rows[i].cover;
    }
    return '';
  }
  function coverMarkup(type, it, label) {
    var urls = [it.cover, seedCover(type, it), driveThumb(it.cover), driveThumb(it.link)];
    var fallback = '<div class="ph"><b>' + esc(label || '') + '</b><span>' + esc(it.title || '') + '</span></div>';
    var marker = it.link ? '<span class="cover-resolve" data-cover-link="' + esc(it.link) + '" data-cover-title="' + esc(it.title || '') + '"></span>' : '';
    return coverImgMarkup(urls, it.title) + fallback + marker;
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
    var url = cardShareUrl('news', it);
    var image = it.imageFileId
      ? '<div class="news-card-image" data-news-image-id="' + esc(it.imageFileId) + '"><img alt="' + esc(it.imageAlt || it.title || '最新消息圖片') + '" loading="lazy" decoding="async" hidden /><span>圖片載入中…</span></div>'
      : '';
    return '<div class="card reveal stack">' + newBadge(it) + lineShareButton('news', it, url) +
      image +
      '<div class="item-date">' + esc(fmtDate(it.date)) + '</div>' +
      '<h3>' + esc(it.title) + '</h3>' +
      (it.body ? '<p class="muted small">' + esc(it.body) + '</p>' : '') + more + '</div>';
  }
  function podcastItem(it) {
    var meta = (it.guest ? '來賓：' + esc(it.guest) + (it.date ? ' · ' : '') : '') + esc(fmtDate(it.date));
    var url = cardShareUrl('podcast', it);
    return '<a class="card pod cafe-card reveal"' + linkAttr(it.link) + '>' + newBadge(it) + lineShareButton('podcast', it, url) +
      '<span class="ep">' + esc(it.ep || 'EP') + '</span>' +
      '<h3>' + esc(it.title) + '</h3>' +
      '<div class="meta">' + meta + '</div>' +
      '<p class="muted small">' + esc(it.desc) + '</p>' +
      '<span class="play"><span class="pbtn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>開啟收聽</span></a>';
  }
  function calendarItem(type, it) {
    var url = fallbackLink(type, it);
    var open = url ? '<a class="card reveal stack" style="text-decoration:none"' + linkAttr(url) + '>' : '<div class="card reveal stack">';
    var close = url ? '</a>' : '</div>';
    var meta = '<div class="item-date">' + esc(fmtDate(it.date)) + (it.tag ? ' <span class="tag">' + esc(it.tag) + '</span>' : '') + '</div>';
    var shareUrl = cardShareUrl(type, it);
    return open + newBadge(it) + lineShareButton(type, it, shareUrl) + meta + '<h3>' + esc(it.title) + '</h3>' +
      (it.location ? '<div class="where"><span>' + esc(it.location) + '</span></div>' : '') +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      (url ? '<span class="more-link">查看連結 →</span>' : '') + close;
  }
  function calItem(it) { return calendarItem('calendar', it); }
  function japanCalItem(it) { return calendarItem('japanCalendar', it); }
  function headquartersItem(it) {
    var url = fallbackLink('headquarters', it);
    var open = url ? '<a class="card reveal stack" style="text-decoration:none"' + linkAttr(url) + '>' : '<div class="card reveal stack">';
    var close = url ? '</a>' : '</div>';
    var meta = '<div class="item-date">' + esc(fmtDate(it.date)) + (it.category ? ' <span class="tag">' + esc(it.category) + '</span>' : '') + '</div>';
    var shareUrl = cardShareUrl('headquarters', it);
    return open + newBadge(it) + lineShareButton('headquarters', it, shareUrl) + meta + '<h3>' + esc(it.title) + '</h3>' +
      (it.body ? '<p class="muted small">' + esc(it.body) + '</p>' : '') +
      (url ? '<span class="more-link">查看連結 →</span>' : '') + close;
  }
  function newsletterItem(it) {
    var issueStr = fmtDate(it.issue || it.date);
    var url = cardShareUrl('newsletter', it);
    return '<a class="card paper reveal"' + linkAttr(it.link) + '>' + newBadge(it) + lineShareButton('newsletter', it, url) +
      '<div class="cover">' + newsletterCover(it) + '</div>' +
      '<h3>' + esc(it.title) + '</h3>' +
      '<div class="issue">' + esc(issueStr) + '</div></a>';
  }
  function dharmaItem(it) {
    var dstr = esc(fmtDate(it.date));
    var content = String(it.content || '').trim()
      .replace(/（?點選下方連結閱讀本則瑞聲法語全文）?/g, '')
      .trim();
    if (!content) content = '';
    var full = it.link ? '<a' + linkAttr(it.link) + ' class="more-link dharma-read">閱讀全文 →</a>' : '';
    var url = cardShareUrl('dharma', it);
    return '<div class="card dharma-item reveal">' + newBadge(it) + lineShareButton('dharma', it, url) +
      '<div class="dharma-cover cover">' + coverMarkup('dharma', it, it.category || '瑞聲法語') + '</div>' +
      '<span class="cat">' + esc(it.category || '瑞聲法語') + '</span>' +
      '<h3>' + esc(it.title) + '</h3>' +
      (content ? '<p>' + esc(content) + '</p>' : '') +
      full +
      (dstr ? '<div class="date">' + dstr + '</div>' : '') + '</div>';
  }
  function iyaItem(it) {
    var issueStr = fmtDate(it.issue || it.date);
    var url = cardShareUrl('iya', it);
    var open = it.link ? '<a class="card paper iya-item reveal"' + linkAttr(it.link) + '>' : '<div class="card paper iya-item reveal">';
    var close = it.link ? '</a>' : '</div>';
    return open + newBadge(it) + lineShareButton('iya', it, url) +
      '<div class="cover">' + coverMarkup('iya', it, it.issue || '青年iYA報') + '</div>' +
      '<h3>' + esc(it.title) + '</h3>' +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      (issueStr ? '<div class="issue">' + esc(issueStr) + '</div>' : '') + close;
  }
  function toolItem(it) {
    var date = fmtDate(it.date);
    var url = cardShareUrl('tools', it);
    return '<a class="card tool-card reveal"' + linkAttr(it.link) + '>' + lineShareButton('tools', it, url) +
      '<span class="tool-mark">' + esc(it.icon || '工具') + '</span>' + newBadge(it) +
      (date ? '<div class="item-date">' + esc(date) + '</div>' : '') +
      '<h3>' + esc(it.title) + '</h3>' +
      (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      '<span class="more-link">開啟程式 →</span></a>';
  }

  // Internal section.
  var GAP = 22;
  var allData = {};
  // setupMemberAuth() 內部才有登入狀態，透過這個掛勾給其他區塊查詢／叫出登入視窗
  var memberGate = null;
  var SECTIONS = [
    { type: 'news', gridId: 'newsGrid', minW: 330, item: newsItem, empty: '目前沒有最新消息', latestFields: ['date'] },
    { type: 'podcast', gridId: 'podcastGrid', minW: 300, item: podcastItem, empty: '目前沒有 Podcast', latestFields: ['date'] },
    { type: 'calendar', gridId: 'calendarGrid', minW: 320, item: calItem, empty: '目前沒有台灣行事曆', latestFields: ['date'] },
    { type: 'japanCalendar', gridId: 'japanCalendarGrid', minW: 320, item: japanCalItem, empty: '目前沒有日本行事曆', latestFields: ['date'] },
    { type: 'headquarters', gridId: 'headquartersGrid', minW: 320, item: headquartersItem, empty: '目前沒有總部會聯絡事項', latestFields: ['date'] },
    { type: 'newsletter', gridId: 'newsletterGrid', minW: 210, item: newsletterItem, empty: '目前沒有親苑時報', latestFields: ['date', 'issue'] },
    { type: 'dharma', gridId: 'dharmaGrid', minW: 300, item: dharmaItem, empty: '目前沒有瑞聲法語', latestFields: ['date'] },
    { type: 'iya', gridId: 'iyaGrid', minW: 120, maxCols: 8, item: iyaItem, empty: '目前沒有青年iYA報', latestFields: ['date', 'issue'] },
    { type: 'tools', gridId: 'toolsGrid', minW: 260, maxCols: 5, item: toolItem, empty: '目前沒有互動程式', latestFields: ['date'] }
  ];
  var store = {};
  var searchReady = false;
  var calendarTabsReady = false;
  var dharmaTabsReady = false;
  var statTimers = {};
  var talkPage = 0;
  var talksReady = false;
  var talksLoading = false;
  var DATA_CACHE_KEY = 'shinnyo_front_data_cache_v1';
  // 本機快取只用來「先把畫面顯示出來」，每次開站仍會向後端重新取一次並覆蓋（stale-while-revalidate）。
  // 舊值 15 分鐘會讓稍後回訪的會員又對著空白畫面等 GAS 回應，這裡放寬到 24 小時。
  var DATA_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function textOf(it, fields) {
    return fields.map(function (f) { return it && it[f] ? String(it[f]) : ''; }).join(' ');
  }

  // 全形英數轉半形、全形空白轉半形，讓「１２」也能對到「12」
  function normalizeSearchText(s) {
    return String(s || '')
      .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/　/g, ' ')
      .toLowerCase();
  }

  function searchRows(q) {
    // 拆成多個關鍵字，全部命中才算符合（順序不拘）：
    // 「瑞聲法語 12」「瑞聲法語12」都能找到「瑞聲法語第12號」。
    // 中文與數字交界處也視為分隔，避免中間夾了「第」「號」就找不到。
    var terms = normalizeSearchText(q)
      .replace(/([一-鿿])(\d)/g, '$1 $2')
      .replace(/(\d)([一-鿿])/g, '$1 $2')
      .trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var defs = [
      { type: 'news', label: '最新消息', href: '#home', fields: ['title', 'body', 'date'] },
      { type: 'calendar', label: '台灣行事曆', href: '#calendar', calendarType: 'calendar', fields: ['title', 'desc', 'location', 'tag', 'date'] },
      { type: 'japanCalendar', label: '日本行事曆', href: '#calendar', calendarType: 'japanCalendar', fields: ['title', 'desc', 'location', 'tag', 'date'] },
      { type: 'headquarters', label: '總部會聯絡事項', href: '#headquarters', fields: ['title', 'body', 'category', 'date'] },
      { type: 'newsletter', label: '親苑時報', href: '#newsletter', fields: ['title', 'issue', 'date'] },
      { type: 'dharma', label: '瑞聲法語', href: '#dharma', dharmaType: 'dharma', fields: ['title', 'content', 'category', 'date'] },
      { type: 'iya', label: '青年iYA報', href: '#dharma', dharmaType: 'iya', fields: ['title', 'desc', 'issue', 'date'] },
      { type: 'tools', label: '互動程式', href: '#tools', fields: ['title', 'desc', 'date'] },
      { type: 'podcast', label: 'Podcast', href: '#podcast', fields: ['title', 'desc', 'guest', 'ep', 'date'] }
    ];
    var rows = [];
    defs.forEach(function (def) {
      (allData[def.type] || []).forEach(function (it) {
        var hay = normalizeSearchText(textOf(it, def.fields));
        var hit = terms.every(function (t) { return hay.indexOf(t) !== -1; });
        if (!hit) return;
        rows.push({
          label: def.label,
          href: it.link || def.href,
          calendarType: it.link ? '' : (def.calendarType || ''),
          dharmaType: it.link ? '' : (def.dharmaType || ''),
          title: it.title || it.ep || def.label,
          body: it.body || it.desc || it.content || it.location || fmtDate(it.date || it.issue) || ''
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
      return '<a class="search-result"' + linkAttr(r.href) + (r.calendarType ? ' data-calendar-type="' + esc(r.calendarType) + '"' : '') + (r.dharmaType ? ' data-dharma-type="' + esc(r.dharmaType) + '"' : '') + '>' +
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
    function closeSearch() {
      pop.hidden = true;
      input.focus();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      renderSearch(input.value);
    });
    // 只在按下搜尋鈕（或 Enter 送出）時才查詢；清空欄位則收起結果
    input.addEventListener('input', function () {
      if (!input.value.trim()) pop.hidden = true;
    });
    if (close) close.addEventListener('click', closeSearch);
    pop.addEventListener('click', function (e) {
      if (e.target === pop) closeSearch();
      var result = e.target.closest && e.target.closest('.search-result');
      if (result) {
        var calendarType = result.getAttribute('data-calendar-type');
        if (calendarType) activateCalendarTab(calendarType, false);
        var dharmaType = result.getAttribute('data-dharma-type');
        if (dharmaType) activateDharmaTab(dharmaType, false);
        pop.hidden = true;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pop.hidden) closeSearch();
    });
  }

  function setupSearchOnce() {
    if (searchReady) return;
    searchReady = true;
    setupSearch();
  }

  function activateCalendarTab(type, focusTab) {
    type = type === 'japanCalendar' ? 'japanCalendar' : 'calendar';
    document.querySelectorAll('[data-calendar-tab]').forEach(function (tab) {
      var active = tab.getAttribute('data-calendar-tab') === type;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('active', active);
      if (active && focusTab) tab.focus();
    });
    document.querySelectorAll('[data-calendar-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-calendar-panel') !== type;
    });
    if (store[type]) window.requestAnimationFrame(function () { draw(type); });
  }

  function setupCalendarTabsOnce() {
    if (calendarTabsReady) return;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-calendar-tab]'));
    if (!tabs.length) return;
    calendarTabsReady = true;
    tabs.forEach(function (tab) {
      function selectTab(e) {
        e.stopPropagation();
        activateCalendarTab(tab.getAttribute('data-calendar-tab'), false);
      }
      tab.addEventListener('pointerup', selectTab);
      tab.addEventListener('click', selectTab);
      tab.addEventListener('keydown', function (e) {
        var currentIndex = tabs.indexOf(tab);
        var nextIndex = currentIndex;
        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = tabs.length - 1;
        else return;
        e.preventDefault();
        activateCalendarTab(tabs[nextIndex].getAttribute('data-calendar-tab'), true);
      });
    });
    var selected = tabs.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })[0];
    activateCalendarTab(selected ? selected.getAttribute('data-calendar-tab') : 'calendar', false);
  }

  function activateDharmaTab(type, focusTab) {
    type = type === 'iya' ? 'iya' : 'dharma';
    document.querySelectorAll('[data-dharma-tab]').forEach(function (tab) {
      var active = tab.getAttribute('data-dharma-tab') === type;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('active', active);
      if (active && focusTab) tab.focus();
    });
    document.querySelectorAll('[data-dharma-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-dharma-panel') !== type;
    });
    if (store[type]) window.requestAnimationFrame(function () { draw(type); });
  }

  function setupDharmaTabsOnce() {
    if (dharmaTabsReady) return;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-dharma-tab]'));
    if (!tabs.length) return;
    dharmaTabsReady = true;
    tabs.forEach(function (tab) {
      function selectTab(e) {
        e.stopPropagation();
        activateDharmaTab(tab.getAttribute('data-dharma-tab'), false);
      }
      tab.addEventListener('pointerup', selectTab);
      tab.addEventListener('click', selectTab);
      tab.addEventListener('keydown', function (e) {
        var currentIndex = tabs.indexOf(tab);
        var nextIndex = currentIndex;
        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = tabs.length - 1;
        else return;
        e.preventDefault();
        activateDharmaTab(tabs[nextIndex].getAttribute('data-dharma-tab'), true);
      });
    });
    var selected = tabs.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })[0];
    activateDharmaTab(selected ? selected.getAttribute('data-dharma-tab') : 'dharma', false);
  }

  // 頁籤互動不依賴資料 API；即使資料尚在載入或暫時失敗，仍可自由切換。
  setupCalendarTabsOnce();
  setupDharmaTabsOnce();

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

  var coverResolveCache = {};
  var newsImageCache = {};
  function setCoverImage(cover, urls, title) {
    urls = uniqueUrls(urls);
    if (!cover || !urls.length) return;
    var img = cover.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { window.__tryNextCover && window.__tryNextCover(img); };
      var fallback = cover.querySelector('.ph');
      cover.insertBefore(img, fallback || cover.firstChild);
    }
    var current = img.currentSrc || img.getAttribute('src') || '';
    var rest = [];
    try { rest = JSON.parse(img.getAttribute('data-cover-srcs') || '[]'); } catch (e) { rest = []; }
    var chain = uniqueUrls([current].concat(urls, rest)).filter(function (url) { return url; });
    if (!chain.length) return;
    img.alt = title || img.alt || '';
    img.setAttribute('data-cover-srcs', JSON.stringify(chain.slice(1)));
    if (!current || cover.classList.contains('no-thumb')) img.src = chain[0];
    cover.classList.remove('no-thumb');
  }

  // 後端 resolveCover 有速率限制（每個會員 10 分鐘 30 次），親苑時報＋瑞聲法語動輒上百筆，
  // 若每張卡片都打一次會瞬間耗盡額度，之後的封面就全部靜默失敗——這正是「封面時有時無」的成因。
  // 因此只在候選封面網址全部載入失敗時，才針對那張卡片去後端解析。
  function resolveCoverFor(cover) {
    if (!cover || !window.API || !API.resolveCover) return;
    var marker = cover.querySelector('.cover-resolve[data-cover-link]');
    if (!marker || marker.getAttribute('data-cover-done')) return;
    var member = storedMemberSession();
    if (!member || !member.token) return;
    var link = marker.getAttribute('data-cover-link') || '';
    if (!link) return;
    marker.setAttribute('data-cover-done', '1');
    if (!coverResolveCache[link]) {
      coverResolveCache[link] = API.resolveCover(link, member.token).catch(function () { return null; });
    }
    coverResolveCache[link].then(function (res) {
      var data = res && res.data ? res.data : {};
      var coverUrl = data.cover || data.coverUrl || '';
      if (!coverUrl) {
        // 解析失敗（含撞到速率限制）不留下永久失敗紀錄，下次重新渲染仍可再試一次。
        delete coverResolveCache[link];
        marker.removeAttribute('data-cover-done');
        return;
      }
      setCoverImage(cover, [coverUrl, driveThumb(data.finalUrl)], marker.getAttribute('data-cover-title') || '');
    });
  }

  function resolveRemoteCovers(root) {
    if (!window.API || !API.resolveCover) return;
    // 只主動處理「連一個候選封面網址都沒有」的卡片；有候選圖的等它實際載入失敗，
    // 再由 __tryNextCover 觸發解析。
    root.querySelectorAll('.cover-resolve[data-cover-link]:not([data-cover-done])').forEach(function (marker) {
      var cover = marker.closest('.cover');
      if (!cover || cover.querySelector('img[data-cover-image]')) return;
      resolveCoverFor(cover);
    });
  }

  function hydrateNewsImages(root) {
    if (!window.API || !API.newsImage) return;
    var member = storedMemberSession();
    if (!member || !member.token) return;
    root.querySelectorAll('.news-card-image[data-news-image-id]:not([data-news-image-done])').forEach(function (marker) {
      marker.setAttribute('data-news-image-done', '1');
      var fileId = marker.getAttribute('data-news-image-id') || '';
      if (!fileId) return;
      if (!newsImageCache[fileId]) {
        newsImageCache[fileId] = API.newsImage(fileId, member.token).catch(function () { return null; });
      }
      newsImageCache[fileId].then(function (res) {
        var img = marker.querySelector('img');
        var status = marker.querySelector('span');
        if (!img || !res || !res.ok || !res.data || !res.data.dataUrl) {
          marker.classList.add('is-error');
          if (status) status.textContent = '圖片暫時無法載入';
          // 暫時性失敗不留下永久紀錄，下次重新渲染仍可再試。
          delete newsImageCache[fileId];
          marker.removeAttribute('data-news-image-done');
          return;
        }
        img.src = res.data.dataUrl;
        img.hidden = false;
        marker.classList.add('is-loaded');
        if (status) status.remove();
      });
    });
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
    var hasAnyDate = items.some(function (it) { return hasRecordDate(it, s.cfg.latestFields); });
    var latestId = items[0] && (items[0].id || [items[0].title, items[0].date, items[0].issue, items[0].ep].join('|'));
    pageItems = pageItems.map(function (it) {
      var copy = Object.assign({}, it);
      var key = copy.id || [copy.title, copy.date, copy.issue, copy.ep].join('|');
      copy._latest = hasAnyDate
        ? isRecentRecord(copy, s.cfg.latestFields)
        : !!(latestId && key === latestId);
      return copy;
    });
  // Internal section.
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    var blanks = '';
    for (var i = pageItems.length; i < cols; i++) blanks += '<div class="grid-spacer" aria-hidden="true"></div>';
    grid.innerHTML = pageItems.map(s.cfg.item).join('') + blanks;
    resolveRemoteCovers(grid);
    if (type === 'news') hydrateNewsImages(grid);
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
  function stripPrivateCollections(d) {
    d = d || {};
    if (Object.prototype.hasOwnProperty.call(d, 'members')) delete d.members;
    return d;
  }

  function normalizeData(d) {
    d = stripPrivateCollections(d);
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
    setupCalendarTabsOnce();
    setupDharmaTabsOnce();
    setupSearchOnce();
    updateStats(d, animateStats);
    observeReveal();
    var talkPopover = document.getElementById('talkPopover');
    if (talkPopover && !talkPopover.hidden) renderTalkListAudio();
  }

  function emptyContentData() {
    var out = {};
    SECTIONS.forEach(function (cfg) { out[cfg.type] = []; });
    out.talks = [];
    return out;
  }

  function clearProtectedContent() {
    talksReady = false;
    coverResolveCache = {};
    newsImageCache = {};
    try { localStorage.removeItem(DATA_CACHE_KEY); } catch (e) {}
    renderData(emptyContentData(), false);
  }

  function loadCachedProtectedContent(token) {
    try {
      var cached = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null');
      if (!cached || cached.token !== token || !cached.data || Date.now() - Number(cached.savedAt || 0) > DATA_CACHE_MAX_AGE_MS) {
        if (cached) localStorage.removeItem(DATA_CACHE_KEY);
        return false;
      }
      talksReady = true;
      renderData(stripPrivateCollections(cached.data), false);
      showModeBanner('<b>會員內容已從本機快取載入</b> · 正在同步最新資料');
      return true;
    } catch (e) {
      try { localStorage.removeItem(DATA_CACHE_KEY); } catch (ignore) {}
      return false;
    }
  }

  function cacheProtectedContent(token, data) {
    try {
      localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ token: token, data: data, savedAt: Date.now() }));
    } catch (e) {
      // 快取空間不足時不影響正常的資料載入。
    }
  }

  // handlers.onMember：memberContent 本身就會驗證 token 並一併回傳會員資料，
  // 開站時可藉此省去一次 validateMemberToken 往返。handlers.onFail 用來區分「token 過期」與「暫時性失敗」。
  function loadProtectedContent(token, handlers) {
    handlers = handlers || {};
    if (!token || !API.memberContent) return Promise.resolve(false);
    return API.memberContent(token).then(function (res) {
      if (!res || !res.ok || !res.data) {
        if (handlers.onFail) handlers.onFail(res || null);
        return false;
      }
      if (handlers.onMember) handlers.onMember(res.member || null);
      talksReady = true;
      cacheProtectedContent(token, res.data);
      renderData(stripPrivateCollections(res.data), true);
      showModeBanner('<b>會員內容已安全載入</b>');
      return true;
    });
  }

  function boot() {
    var member = storedMemberSession();
    if (member && member.token && loadCachedProtectedContent(member.token)) return;
    clearProtectedContent();
    showModeBanner('<b>會員限定</b>：登入後載入內容');
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

  function shouldReduceMotion() {
    if (!window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(max-width: 860px)').matches;
  }

  function updateStats(d, animate) {
    var fn = animate && !shouldReduceMotion() ? setStat : setStatNow;
    fn('statPodcast', (d.podcast || []).length);
    fn('statNews', (d.news || []).length);
    fn('statNewsletter', (d.newsletter || []).length);
    fn('statDharma', (d.dharma || []).length + (d.iya || []).length);
    fn('statCal', (d.calendar || []).length + (d.japanCalendar || []).length);
  }

  function renderTalkList() {
    var out = document.getElementById('talkList');
    if (!out) return;
    var rows = ((allData && allData.talks) || (window.SEED_DATA && window.SEED_DATA.talks) || []).slice().sort(function (a, b) {
      return (Number(a.order || 0) - Number(b.order || 0)) || String(a.title || '').localeCompare(String(b.title || ''));
    });
    if (!rows.length) {
      out.innerHTML = '<div class="search-empty">目前沒有真如音檔資料</div>';
      return;
    }
    out.innerHTML = rows.map(function (it) {
      var src = talkAudioSrc(it.link);
      var url = cardShareUrl('talks', it);
      return '<article class="talk-item">' +
        '<span class="talk-icon">' + esc(it.icon || '音') + '</span>' +
        '<div><h3>' + esc(it.title || '真如音檔') + '</h3>' +
        (it.desc ? '<p>' + esc(it.desc) + '</p>' : '') +
        '</div>' +
        lineShareButton('talks', it, url) +
        (src ? '<audio class="talk-audio" controls preload="none" src="' + esc(src) + '">您的瀏覽器不支援音訊播放。</audio>' : '') +
        '</article>';
    }).join('');
  }

  function openTalkPopover() {
    var pop = document.getElementById('talkPopover');
    var close = document.getElementById('talkClose');
    if (!pop) return;
    if (pop.hidden) talkReturnFocus = document.activeElement;
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
    var s = normalizeAssetPath(url);
    var driveId = (s.match(/drive\.google\.com\/file\/d\/([^/]+)/) || s.match(/[?&]id=([^&]+)/) || [])[1];
    return driveId ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(driveId) : s;
  }

  function talkMegaEmbed(url) {
    var s = String(url || '').trim();
    var m = s.match(/mega\.nz\/file\/([^#?]+)#([^/?#]+)/);
    return m ? 'https://mega.nz/embed/' + encodeURIComponent(m[1]) + '#' + encodeURIComponent(m[2]) : '';
  }

  function refreshTalks() {
    if (talksLoading || talksReady) return;
    var member = storedMemberSession();
    if (!member || !member.token) return;
    talksLoading = true;
    loadProtectedContent(member.token).then(function () {
      talksLoading = false;
      var pop = document.getElementById('talkPopover');
      if (pop && !pop.hidden) renderTalkListAudio();
    }).catch(function () { talksLoading = false; });
  }

  var talkFilterText = '';

  function talkRows() {
    return ((allData && allData.talks) || (window.SEED_DATA && window.SEED_DATA.talks) || []).slice().sort(function (a, b) {
      return (Number(a.order || 0) - Number(b.order || 0)) || String(a.title || '').localeCompare(String(b.title || ''));
    });
  }

  // 音檔清單：可直接點選任一則，不必一頁一頁翻
  function renderTalkPicker(rows) {
    var picker = document.getElementById('talkPicker');
    var list = document.getElementById('talkPickerList');
    var count = document.getElementById('talkPickerCount');
    if (!picker || !list) return;
    rows = rows || talkRows();
    picker.hidden = rows.length < 2;
    if (picker.hidden) { list.innerHTML = ''; return; }
    var q = talkFilterText.trim().toLowerCase();
    var shown = 0;
    var html = rows.map(function (it, i) {
      var title = String(it.title || '真如音檔');
      var desc = String(it.desc || '');
      if (q && (title + ' ' + desc).toLowerCase().indexOf(q) === -1) return '';
      shown++;
      var active = i === talkPage;
      return '<li role="presentation">' +
        '<button type="button" class="talk-pick' + (active ? ' is-active' : '') + '"' +
        ' role="option" aria-selected="' + (active ? 'true' : 'false') + '" data-talk-index="' + i + '">' +
        '<span class="talk-pick-no">' + ('0' + (i + 1)).slice(-2) + '</span>' +
        '<span class="talk-pick-body"><b>' + esc(title) + '</b>' +
        (desc ? '<small>' + esc(desc) + '</small>' : '') + '</span>' +
        '<span class="talk-pick-state">' + (active ? '播放中' : '') + '</span>' +
        '</button></li>';
    }).join('');
    list.innerHTML = html || '<li class="talk-pick-empty">找不到符合的音檔</li>';
    if (count) count.textContent = q ? (shown + ' / ' + rows.length) : (rows.length + ' 則');
    var active = list.querySelector('.talk-pick.is-active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function renderTalkListAudio() {
    var out = document.getElementById('talkList');
    var pager = document.getElementById('talkPager');
    if (!out) return;
    var rows = talkRows();
    if (!rows.length) {
      out.innerHTML = '<div class="search-empty">目前沒有真如音檔資料</div>';
      out.classList.remove('can-swipe', 'can-swipe-prev', 'can-swipe-next');
      if (pager) pager.innerHTML = '';
      renderTalkPicker(rows);
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
      var url = cardShareUrl('talks', it);
      return '<article class="talk-item">' +
        '<span class="talk-icon">' + esc(it.icon || '音') + '</span>' +
        '<div><h3>' + esc(it.title || '真如音檔') + '</h3>' +
        (it.desc ? '<p>' + esc(it.desc) + '</p>' : '') +
        '</div>' +
        lineShareButton('talks', it, url) +
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
    renderTalkPicker(rows);
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
    if (talkReturnFocus && document.contains(talkReturnFocus)) talkReturnFocus.focus();
    talkReturnFocus = null;
  }

  function showModeBanner() {
    bindTalkButton();
  }

  var talkClose = document.getElementById('talkClose');
  var talkPopover = document.getElementById('talkPopover');
  var talkPager = document.getElementById('talkPager');
  var talkList = document.getElementById('talkList');
  var talkReturnFocus = null;
  bindTalkButton();
  if (talkClose) talkClose.addEventListener('click', closeTalkPopover);
  if (talkPopover) {
    talkPopover.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute('data-talk-close')) closeTalkPopover();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && talkPopover && !talkPopover.hidden) closeTalkPopover();
  });
  if (talkPager) {
    talkPager.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-talk-page]');
      if (!btn || btn.disabled) return;
      setTalkPage(btn.getAttribute('data-talk-page'));
    });
  }
  var talkPickerList = document.getElementById('talkPickerList');
  if (talkPickerList) {
    talkPickerList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-talk-index]');
      if (!btn) return;
      setTalkPage(btn.getAttribute('data-talk-index'));
    });
  }
  var talkFilterInput = document.getElementById('talkFilter');
  if (talkFilterInput) {
    talkFilterInput.addEventListener('input', function () {
      talkFilterText = talkFilterInput.value || '';
      renderTalkPicker();
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
  var brandHome = document.querySelector('.nav .brand');
  if (brandHome) {
    brandHome.addEventListener('click', function (e) {
      var target = new URL('index.html', window.location.href);
      if (window.location.origin === target.origin &&
          window.location.pathname.replace(/\/$/, '/index.html') === target.pathname &&
          window.location.search === target.search) {
        e.preventDefault();
        history.replaceState(null, '', target.href);
        window.location.reload();
      }
    });
  }
  var navSections = Array.prototype.slice.call(document.querySelectorAll('main section.block, header.hero, #news'));
  var navAnchors = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));
  var navUpdatePending = false;
  var activeNavSection = 'news';
  function applyNavActive(cur) {
    if (!cur || cur === 'top' || cur === 'home') cur = 'news';
    activeNavSection = cur;
    navAnchors.forEach(function (a) {
      var isActive = a.getAttribute('href') === '#' + cur;
      a.classList.toggle('active', isActive);
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  function updateNavActive() {
    var scrollPosition = window.scrollY;
    nav.classList.toggle('scrolled', scrollPosition > 30);
    applyNavActive(activeNavSection);
  }
  function scheduleNavUpdate() {
    if (navUpdatePending) return;
    navUpdatePending = true;
    requestAnimationFrame(function () {
      navUpdatePending = false;
      updateNavActive();
    });
  }
  window.addEventListener('scroll', scheduleNavUpdate, { passive: true });
  window.addEventListener('resize', scheduleNavUpdate, { passive: true });
  window.addEventListener('load', updateNavActive);
  if ('IntersectionObserver' in window) {
    var navObserver = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (entry) { return entry.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (visible.length) applyNavActive(visible[0].target.id);
    }, { rootMargin: '-120px 0px -65% 0px', threshold: 0 });
    navSections.forEach(function (section) { navObserver.observe(section); });
  }
  updateNavActive();

  var ham = document.getElementById('hamburger'), navLinks = document.getElementById('navLinks');
  function syncNavMenuAccessibility(open) {
    var hidden = window.matchMedia && window.matchMedia('(max-width: 860px)').matches && !open;
    navLinks.toggleAttribute('inert', hidden);
    navLinks.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    ham.setAttribute('aria-label', open ? '關閉導覽選單' : '開啟導覽選單');
  }
  function closeNavMenu() {
    navLinks.classList.remove('open');
    ham.setAttribute('aria-expanded', 'false');
    syncNavMenuAccessibility(false);
  }
  ham.setAttribute('aria-expanded', 'false');
  syncNavMenuAccessibility(false);
  ham.addEventListener('click', function () {
    updateNavActive();
    var isOpen = navLinks.classList.toggle('open');
    ham.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    syncNavMenuAccessibility(isOpen);
  });
  navLinks.addEventListener('click', function (e) {
    if (!e.target.closest('a, button')) return;
    closeNavMenu();
  });
  document.addEventListener('click', function (e) {
    if (!navLinks.classList.contains('open')) return;
    if (e.target.closest('#hamburger') || e.target.closest('#navLinks')) return;
    closeNavMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNavMenu();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) {
      navLinks.classList.remove('open');
      ham.setAttribute('aria-expanded', 'false');
    }
    syncNavMenuAccessibility(navLinks.classList.contains('open'));
  }, { passive: true });

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
  var liveRefreshTimer = null;
  var initialLiveTitle = document.getElementById('liveVideoTitle');
  var initialLiveLink = document.getElementById('liveVideoLink');
  var currentLiveTitle = initialLiveTitle ? initialLiveTitle.textContent : '';
  var currentLiveUrl = initialLiveLink ? (initialLiveLink.getAttribute('href') || initialLiveLink.href) : '';

  function buildLiveLineShareUrl(url, title) {
    var lines = [];
    var cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
    var cleanUrl = String(url || '').trim();
    if (cleanTitle) lines.push(cleanTitle);
    if (cleanUrl) lines.push(cleanUrl);
    return 'https://line.me/R/msg/text/?' + encodeURIComponent(lines.join('\n'));
  }

  function updateLiveLineShare() {
    var lineShare = document.getElementById('liveLineShare');
    if (!lineShare || !currentLiveUrl) return;
    lineShare.href = buildLiveLineShareUrl(currentLiveUrl, currentLiveTitle);
  }

  function openLiveVideo() {
    if (!liveModal) return;
    // 線上法會為會員限定
    if (memberGate && !memberGate.isLoggedIn()) {
      if (!memberGate.isChecking()) {
        memberGate.prompt('register', '線上法會為會員限定，請先註冊或登入會員。');
      }
      return;
    }
    refreshOfficialLive(true);
    liveModal.hidden = false;
    document.documentElement.classList.add('modal-open');
    if (!liveRefreshTimer) {
      liveRefreshTimer = window.setInterval(function () { refreshOfficialLive(true); }, 60000);
    }
    if (liveClose) liveClose.focus();
  }
  function closeLiveVideo() {
    if (!liveModal) return;
    liveModal.hidden = true;
    document.documentElement.classList.remove('modal-open');
    if (liveRefreshTimer) {
      window.clearInterval(liveRefreshTimer);
      liveRefreshTimer = null;
    }
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
    var openBtn = document.getElementById('liveVideoOpen');
    if (!text) return;
    currentLiveTitle = String(text).replace(/\s+/g, ' ').trim();
    if (title) title.textContent = text;
    // 導覽列按鈕只放「線上法會」四個字，場次資訊改放提示文字
    if (openBtn) {
      openBtn.title = '線上法會：' + currentLiveTitle;
      openBtn.setAttribute('aria-label', '線上法會：' + currentLiveTitle);
    }
    updateLiveLineShare();
  }

  function setLiveUrl(url, officialPage) {
    var videoLink = document.getElementById('liveVideoLink');
    var officialLink = document.getElementById('liveOfficialPageLink');
    var safeVideoUrl = safeLinkUrl(url);
    var safeOfficialUrl = safeLinkUrl(officialPage);
    if (safeVideoUrl) {
      currentLiveUrl = safeVideoUrl;
      if (videoLink) videoLink.href = safeVideoUrl;
      updateLiveLineShare();
    }
    if (safeOfficialUrl && officialLink) officialLink.href = safeOfficialUrl;
  }

  function refreshOfficialLive(fresh) {
    if (!API.officialLive) return;
    API.officialLive(!!fresh).then(function (res) {
      if (!res || !res.ok || !res.data) return;
      setLiveText(res.data.title);
      setLiveUrl(res.data.url, res.data.officialPage);
    }).catch(function (e) { console.warn('official live sync failed', e); });
  }
  window.refreshOfficialLive = refreshOfficialLive;

  function observeReveal() {
    var els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }

  function setupMemberAuth() {
    var MEMBER_KEY = MEMBER_STORAGE_KEY;
    var LEGACY_MEMBER_KEY = 'shinnyo_member';
    var memberAuthReady = false;
    var memberAuthChecking = false;
    var memberOpen = document.getElementById('memberOpen');
    var memberPopover = document.getElementById('memberPopover');
    var memberClose = document.getElementById('memberClose');
    var memberCurrent = document.getElementById('memberCurrent');
    var memberCurrentName = document.getElementById('memberCurrentName');
    var memberNote = document.getElementById('memberNote');
    var memberNoteModal = document.getElementById('memberNoteModal');
    var memberNoteModalText = document.getElementById('memberNoteModalText');
    var memberNoteModalClose = document.getElementById('memberNoteModalClose');
    var memberNoteModalOk = document.getElementById('memberNoteModalOk');
    var noteModalDismissed = '';
    var memberLogout = document.getElementById('memberLogout');
    var memberStatus = document.getElementById('memberStatus');
    var memberDirectory = document.getElementById('memberDirectory');
    var memberDirectoryTitle = document.getElementById('memberDirectoryTitle');
    var memberDirectoryCount = document.getElementById('memberDirectoryCount');
    var memberDirectoryList = document.getElementById('memberDirectoryList');
    var memberTabs = document.querySelector('.member-tabs:not(.member-settings-tabs)');
    var memberLoginForm = document.getElementById('memberLoginForm');
    var memberRegisterForm = document.getElementById('memberRegisterForm');
    var memberLoginMobile = document.getElementById('memberLoginMobile');
    var memberRegisterCode = document.getElementById('memberRegisterCode');
    var memberRegisterCodeRequest = document.getElementById('memberRegisterCodeRequest');
    var memberSettingsOpen = document.getElementById('memberSettingsOpen');
    var memberSettingsTabs = document.getElementById('memberSettingsTabs');
    var memberProfileForm = document.getElementById('memberProfileForm');
    var memberContactForm = document.getElementById('memberContactForm');
    var memberProfileLoaded = false;
    var memberReturnFocus = null;
    var pendingMemberTarget = '';
    var protectedHashes = {
      '#home': true,
      '#podcast': true,
      '#calendar': true,
      '#headquarters': true,
      '#newsletter': true,
      '#dharma': true,
      '#tools': true
    };
    function currentMember() {
      return storedMemberSession();
    }
    function isMemberLoggedIn() {
      var m = currentMember();
      return !!(memberAuthReady && m && m.token && m.name);
    }
    memberGate = {
      isLoggedIn: isMemberLoggedIn,
      isChecking: function () { return memberAuthChecking; },
      prompt: function (tab, msg) { openMemberPopover(tab, msg); }
    };
    function syncMemberLockBars(isLocked) {
      document.querySelectorAll('main section.block').forEach(function (section) {
        var bar = section.querySelector(':scope > .member-lock-bar');
        if (!bar) {
          bar = document.createElement('button');
          bar.type = 'button';
          bar.className = 'member-lock-bar';
          bar.setAttribute('data-member-register', '');
          bar.setAttribute('aria-label', '開啟會員註冊畫面');
          bar.textContent = '會員限定｜點此註冊後觀看';
          bar.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            pendingMemberTarget = section.id ? '#' + section.id : '';
            openMemberPopover('register', '請先註冊會員，完成後即可觀看所有內容。');
          });
          section.appendChild(bar);
        }
        bar.hidden = !isLocked;
      });
    }
    function syncMemberGate() {
      var root = document.documentElement;
      var isLocked = !memberAuthChecking && !isMemberLoggedIn();
      root.classList.toggle('member-auth-pending', memberAuthChecking);
      root.classList.toggle('member-locked', isLocked);
      root.setAttribute('aria-busy', memberAuthChecking ? 'true' : 'false');
      syncMemberLockBars(isLocked);
    }
    function saveMember(member, token) {
      var session = member && token ? {
        id: member.id || '',
        name: member.name || '',
        dharmaName: member.dharmaName || '',
        note: String(member.note || ''),
        globalNote: String(member.globalNote || ''),
        token: token
      } : null;
      if (session) localStorage.setItem(MEMBER_KEY, JSON.stringify(session));
      else localStorage.removeItem(MEMBER_KEY);
      localStorage.removeItem(LEGACY_MEMBER_KEY);
      memberAuthChecking = false;
      memberAuthReady = !!session;
      memberProfileLoaded = false;
      syncMemberUi();
    }
    function clearMember() {
      localStorage.removeItem(MEMBER_KEY);
      localStorage.removeItem(LEGACY_MEMBER_KEY);
      memberAuthChecking = false;
      memberAuthReady = true;
      clearMemberDirectory();
      clearProtectedContent();
      syncMemberUi();
      setMemberStatus('已登出，請重新登入。', '');
      if (memberLoginMobile) memberLoginMobile.focus();
    }
    function updateMemberButton() {
      if (!memberOpen) return;
      var m = currentMember();
      var loggedIn = isMemberLoggedIn();
      memberOpen.textContent = loggedIn ? '會員：' + m.name : '會員登入';
      memberOpen.classList.toggle('is-logged-in', loggedIn);
      memberOpen.setAttribute('aria-pressed', loggedIn ? 'true' : 'false');
      if (memberSettingsOpen) memberSettingsOpen.hidden = !loggedIn;
      // 線上法會為會員限定，未登入時標示為鎖定
      var liveBtn = document.getElementById('liveVideoOpen');
      if (liveBtn) liveBtn.classList.toggle('is-locked', !loggedIn);
      if (ham) {
        ham.classList.toggle('member-logged-in', loggedIn);
        ham.setAttribute('data-member-state', loggedIn ? '會員登入' : '會員未登入');
      }
    }
    function updateMemberCurrent() {
      if (!memberCurrent || !memberCurrentName) return;
      var m = currentMember();
      var loggedIn = isMemberLoggedIn();
      memberCurrent.hidden = !loggedIn;
      memberCurrentName.textContent = loggedIn ? '目前登入：' + m.name : '';
    }
    function currentMemberNotes() {
      var m = currentMember();
      var loggedIn = isMemberLoggedIn();
      var globalNote = loggedIn ? String((m && m.globalNote) || '').trim() : '';
      var personalNote = loggedIn ? String((m && m.note) || '').trim() : '';
      return {
        member: m,
        globalNote: globalNote,
        personalNote: personalNote,
        combined: [globalNote, personalNote].filter(Boolean).join('\n\n')
      };
    }
    function memberNoteSeenValue(notes) {
      return String((notes.member && notes.member.id) || '') + '|' + notes.globalNote + '|' + notes.personalNote;
    }
    function renderNoteBlocks(container, notes) {
      if (!container) return;
      container.innerHTML = '';
      [
        { label: '全體訊息 : ', text: notes.globalNote },
        { label: '個人訊息 : ', text: notes.personalNote }
      ].forEach(function (part) {
        if (!part.text) return;
        var tag = document.createElement('small');
        tag.className = 'member-note-label';
        tag.textContent = part.label;
        container.appendChild(tag);
        var block = document.createElement('div');
        block.className = 'member-note-text';
        block.textContent = part.text;
        container.appendChild(block);
      });
    }
    function openMemberNoteModal(notes) {
      if (!memberNoteModal) return;
      renderNoteBlocks(memberNoteModalText, notes);
      memberNoteModal.hidden = false;
      if (memberNoteModalOk) setTimeout(function () { memberNoteModalOk.focus(); }, 80);
    }
    function closeMemberNoteModal() {
      if (!memberNoteModal || memberNoteModal.hidden) return;
      memberNoteModal.hidden = true;
      var notes = currentMemberNotes();
      if (notes.combined) noteModalDismissed = memberNoteSeenValue(notes);
    }
    function updateMemberNote() {
      var notes = currentMemberNotes();
      var has = !!notes.combined;
      if (memberNote) {
        memberNote.hidden = !has;
        renderNoteBlocks(memberNote, notes);
      }
      if (memberNoteModal) {
        if (!has) {
          memberNoteModal.hidden = true;
        } else if (noteModalDismissed !== memberNoteSeenValue(notes)) {
          openMemberNoteModal(notes);
        }
      }
    }
    function clearMemberDirectory() {
      if (memberDirectory) memberDirectory.hidden = true;
      if (memberDirectoryList) memberDirectoryList.innerHTML = '';
      if (memberDirectoryCount) memberDirectoryCount.textContent = '';
    }
    function renderMemberDirectory(res) {
      if (!memberDirectory || !memberDirectoryList) return;
      var rows = Array.isArray(res && res.data) ? res.data : [];
      var all = res && res.scope === 'all';
      memberDirectory.hidden = false;
      if (memberDirectoryTitle) memberDirectoryTitle.textContent = all ? '全部會員' : '我的會員資料';
      if (memberDirectoryCount) memberDirectoryCount.textContent = all ? rows.length + ' 位' : '';
      memberDirectoryList.innerHTML = rows.length
        ? rows.map(function (row) {
          return '<article class="member-directory-card"><b>' + esc(row.name || '未命名會員') + '</b>' +
            (row.dharmaName ? '<span>' + esc(row.dharmaName) + '</span>' : '') + '</article>';
        }).join('')
        : '<div class="member-directory-empty">目前沒有可顯示的會員資料。</div>';
    }
    function loadMemberDirectory() {
      var member = currentMember();
      if (!isMemberLoggedIn() || !member || !member.token || !API.memberDirectory) { clearMemberDirectory(); return; }
      var activeToken = member.token;
      if (memberDirectory) memberDirectory.hidden = false;
      if (memberDirectoryTitle) memberDirectoryTitle.textContent = '會員資料';
      if (memberDirectoryCount) memberDirectoryCount.textContent = '讀取中…';
      if (memberDirectoryList) memberDirectoryList.innerHTML = '<div class="member-directory-empty">讀取會員資料中…</div>';
      API.memberDirectory(activeToken).then(function (res) {
        var active = currentMember();
        if (!active || active.token !== activeToken) return;
        if (res && res.ok) renderMemberDirectory(res);
        else {
          if (res && /登入已過期|未授權/.test(res.error || '')) clearMember();
          if (memberDirectoryCount) memberDirectoryCount.textContent = '';
          if (memberDirectoryList) memberDirectoryList.innerHTML = '<div class="member-directory-empty">' + esc((res && res.error) || '會員資料讀取失敗。') + '</div>';
        }
      }).catch(function () {
        if (memberDirectoryCount) memberDirectoryCount.textContent = '';
        if (memberDirectoryList) memberDirectoryList.innerHTML = '<div class="member-directory-empty">會員資料讀取失敗，請稍後再試。</div>';
      });
    }
    function selectMemberTab(tab) {
      document.querySelectorAll('[data-member-tab]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-member-tab') === tab);
      });
      if (memberLoginForm) memberLoginForm.classList.toggle('active', tab === 'login');
      if (memberRegisterForm) memberRegisterForm.classList.toggle('active', tab === 'register');
    }
    function fillMemberProfile(p) {
      p = p || {};
      var map = { profileName: 'name', profileDharmaName: 'dharmaName', profileEmail: 'email', profileMobile: 'mobile' };
      Object.keys(map).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = String(p[map[id]] || '');
      });
    }
    function loadMemberProfile() {
      var member = currentMember();
      if (!memberProfileForm || !isMemberLoggedIn() || !member || !API.memberProfile) return;
      if (memberProfileLoaded) return;
      var activeToken = member.token;
      setMemberStatus('讀取個人資料中…', '');
      API.memberProfile(activeToken).then(function (res) {
        var active = currentMember();
        if (!active || active.token !== activeToken) return;
        if (res && res.ok && res.data) {
          fillMemberProfile(res.data);
          memberProfileLoaded = true;
          setMemberStatus('您可以修改個人資料後儲存。', '');
        } else if (res && /登入已過期|未授權/.test(res.error || '')) {
          clearMember();
        } else {
          setMemberStatus((res && res.error) || '個人資料讀取失敗。', 'err');
        }
      }).catch(function () {
        setMemberStatus('個人資料讀取失敗，請稍後再試。', 'err');
      });
    }
    function selectMemberView(view) {
      if (!memberSettingsTabs) return;
      memberSettingsTabs.querySelectorAll('[data-member-view]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-member-view') === view);
      });
      if (memberDirectory) memberDirectory.hidden = view !== 'directory';
      if (memberProfileForm) memberProfileForm.classList.toggle('active', view === 'profile');
      if (memberContactForm) memberContactForm.classList.toggle('active', view === 'contact');
      if (view === 'directory') loadMemberDirectory();
      if (view === 'profile') loadMemberProfile();
      if (view === 'contact') {
        var ta = document.getElementById('contactMessage');
        if (ta) setTimeout(function () { ta.focus(); }, 80);
      }
    }
    function syncMemberUi() {
      var m = currentMember();
      var loggedIn = isMemberLoggedIn();
      updateMemberButton();
      updateMemberCurrent();
      updateMemberNote();
      syncMemberGate();
      if (memberTabs) memberTabs.hidden = loggedIn;
      if (memberSettingsTabs) memberSettingsTabs.hidden = !loggedIn;
      if (loggedIn) {
        if (memberLoginForm) memberLoginForm.classList.remove('active');
        if (memberRegisterForm) memberRegisterForm.classList.remove('active');
      } else {
        clearMemberDirectory();
        if (memberTabs) memberTabs.hidden = false;
        if (memberProfileForm) memberProfileForm.classList.remove('active');
        if (memberContactForm) memberContactForm.classList.remove('active');
        memberProfileLoaded = false;
        selectMemberTab('login');
      }
    }
    function setMemberStatus(msg, type) {
      if (!memberStatus) return;
      memberStatus.textContent = msg;
      memberStatus.className = 'member-status' + (type ? ' ' + type : '');
    }
    function openMemberPopover(tab, msg) {
      if (tab && tab.type) tab = '';
      if (!memberPopover || memberAuthChecking) return;
      if (memberPopover.hidden) memberReturnFocus = document.activeElement;
      var m = currentMember();
      var loggedIn = isMemberLoggedIn();
      memberPopover.hidden = false;
      syncMemberUi();
      if (!loggedIn && tab === 'register') selectMemberTab('register');
      setMemberStatus(loggedIn ? '您已登入會員：' + m.name : (msg || '請先註冊或登入會員後觀看內容。'), loggedIn ? 'ok' : '');
      if (loggedIn) selectMemberView(tab === 'profile' || tab === 'contact' ? tab : 'directory');
      if (!loggedIn) {
        var focusTarget = tab === 'register' ? document.getElementById('memberName') : memberLoginMobile;
        if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 80);
      }
    }
    function closeMemberPopover() {
      if (memberPopover) memberPopover.hidden = true;
      var canRestore = memberReturnFocus && document.contains(memberReturnFocus) &&
        !memberReturnFocus.closest('[inert]') && memberReturnFocus.offsetParent !== null;
      if (canRestore) memberReturnFocus.focus();
      if ((!canRestore || document.activeElement !== memberReturnFocus) && ham) ham.focus();
      memberReturnFocus = null;
    }
    function finishMemberEntry() {
      closeMemberPopover();
      if (!pendingMemberTarget) return;
      var target = document.querySelector(pendingMemberTarget);
      if (target) {
        try { history.replaceState(null, document.title, pendingMemberTarget); } catch (e) {}
        target.scrollIntoView({ behavior: shouldReduceMotion() ? 'auto' : 'smooth', block: 'start' });
      }
      pendingMemberTarget = '';
    }
    if (memberOpen) memberOpen.addEventListener('click', openMemberPopover);
    if (memberSettingsOpen) memberSettingsOpen.addEventListener('click', function () { openMemberPopover('profile'); });
    if (memberSettingsTabs) {
      memberSettingsTabs.querySelectorAll('[data-member-view]').forEach(function (btn) {
        btn.addEventListener('click', function () { selectMemberView(btn.getAttribute('data-member-view')); });
      });
    }
    if (memberClose) memberClose.addEventListener('click', closeMemberPopover);
    if (memberLogout) memberLogout.addEventListener('click', clearMember);
    if (memberPopover) {
      memberPopover.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('member-backdrop')) closeMemberPopover();
      });
    }
    if (memberNoteModalClose) memberNoteModalClose.addEventListener('click', closeMemberNoteModal);
    if (memberNoteModalOk) memberNoteModalOk.addEventListener('click', closeMemberNoteModal);
    if (memberNoteModal) {
      memberNoteModal.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('member-note-modal-backdrop')) closeMemberNoteModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (memberNoteModal && !memberNoteModal.hidden) { closeMemberNoteModal(); return; }
      if (memberPopover && !memberPopover.hidden) closeMemberPopover();
    });
    document.querySelectorAll('[data-member-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-member-tab');
        selectMemberTab(tab);
        setMemberStatus(tab === 'login' ? '輸入手機即可登入。' : '請填寫資料並驗證 Email。', '');
        var firstInput = (tab === 'login' ? memberLoginForm : memberRegisterForm).querySelector('input');
        if (firstInput) firstInput.focus();
      });
    });
    function isProtectedHashLink(a) {
      var href = a && a.getAttribute('href');
      if (!href) return false;
      if (href.charAt(0) === '#') return !!protectedHashes[href];
      try {
        var url = new URL(href, location.href);
        return url.pathname === location.pathname && !!protectedHashes[url.hash];
      } catch (e) {
        return false;
      }
    }
    function requiresMember(target) {
      if (!target || target.closest('.member-popover') || target.closest('#memberOpen')) return false;
      if (target.closest('.member-lock-bar')) return false;
      // 頁籤只切換同一區塊的顯示內容，不應被會員限制攔截。
      // 部分行動瀏覽器會把點擊目標回報為頁籤容器，因此一併排除 tablist。
      if (target.closest('[data-calendar-tab], [data-dharma-tab], [role="tablist"], .calendar-tabs, .dharma-tabs')) return false;
      if (target.closest('#jumpBottom')) return true;
      var a = target.closest('a');
      // 非連結的區塊、按鈕與頁籤不導向受保護內容，不能強制開啟註冊視窗。
      if (!a) return false;
      if (a.closest('.brand') || a.closest('.member-panel')) return false;
      if (/admin\.html/i.test(a.getAttribute('href') || '')) return false;
      return isProtectedHashLink(a) || !!a.closest('main, .hero-features, .search-results');
    }
    function isContentTabEvent(e) {
      var selector = '[data-calendar-tab], [data-dharma-tab], [role="tablist"], .calendar-tabs, .dharma-tabs';
      var target = e && e.target;
      if (target && target.closest && target.closest(selector)) return true;
      var path = e && e.composedPath ? e.composedPath() : [];
      return path.some(function (node) {
        return node && node.nodeType === 1 && node.matches && node.matches(selector);
      });
    }
    function promptMemberRegistration(e) {
      // 頁籤可在未登入時自由切換，不能觸發會員註冊視窗。
      if (isContentTabEvent(e)) return;
      if (memberAuthChecking) {
        if (requiresMember(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (isMemberLoggedIn() || !requiresMember(e.target)) return;
      var link = e.target.closest && e.target.closest('a[href^="#"]');
      var section = e.target.closest && e.target.closest('main section.block');
      pendingMemberTarget = link ? link.getAttribute('href') : (section && section.id ? '#' + section.id : '');
      e.preventDefault();
      e.stopPropagation();
      if (typeof closeNavMenu === 'function') closeNavMenu();
      openMemberPopover('register', '請先註冊會員，完成後即可觀看所有內容。');
    }
    document.addEventListener('click', promptMemberRegistration);
    var siteSearch = document.getElementById('siteSearch');
    if (siteSearch) {
      siteSearch.addEventListener('submit', function (e) {
        if (isMemberLoggedIn()) return;
        e.preventDefault();
        openMemberPopover('register', '請先註冊會員，完成後即可搜尋與觀看內容。');
      }, true);
    }
    function normalizeMemberMobileInput(value) {
      var mobile = String(value || '')
        .trim()
        .replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); })
        .replace(/\.0+$/, '')
        .replace(/[^\d+]/g, '');
      mobile = mobile.replace(/^\+?886(9\d{8})$/, '0$1');
      if (/^9\d{8}$/.test(mobile)) mobile = '0' + mobile;
      return mobile;
    }
    function registrationRecord() {
      return {
        name: document.getElementById('memberName').value,
        dharmaName: document.getElementById('memberDharmaName').value,
        email: document.getElementById('memberEmail').value,
        mobile: normalizeMemberMobileInput(document.getElementById('memberMobile').value)
      };
    }
    if (memberRegisterCodeRequest) {
      memberRegisterCodeRequest.addEventListener('click', function () {
        var record = registrationRecord();
        document.getElementById('memberMobile').value = record.mobile;
        memberRegisterCodeRequest.disabled = true;
        memberRegisterCodeRequest.textContent = '寄送中…';
        API.memberRequestRegisterCode(record).then(function (res) {
          memberRegisterCodeRequest.disabled = false;
          memberRegisterCodeRequest.textContent = '重新寄送註冊驗證碼';
          setMemberStatus(res && res.ok ? (res.msg || '驗證碼已寄出。') : ((res && res.error) || '驗證碼寄送失敗。'), res && res.ok ? 'ok' : 'err');
          if (res && res.ok && memberRegisterCode) memberRegisterCode.focus();
        }).catch(function () {
          memberRegisterCodeRequest.disabled = false;
          memberRegisterCodeRequest.textContent = '寄送註冊驗證碼';
          setMemberStatus('連線失敗，請稍後再試。', 'err');
        });
      });
    }
    if (memberLoginForm) {
      memberLoginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var loginBtn = memberLoginForm.querySelector('button[type="submit"]');
        var loginMobile = memberLoginMobile ? normalizeMemberMobileInput(memberLoginMobile.value) : '';
        if (memberLoginMobile) memberLoginMobile.value = loginMobile;
        if (!loginMobile) {
          setMemberStatus('請輸入手機號碼。', 'err');
          if (memberLoginMobile) memberLoginMobile.focus();
          return;
        }
        if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = '登入中…'; }
        setMemberStatus('登入中…', '');
        API.memberLogin(loginMobile).then(function (res) {
          if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = '會員登入'; }
          if (res.ok && res.token) {
            saveMember(res.data, res.token);
            loadProtectedContent(res.token).then(function (loaded) {
              if (!loaded) {
                clearMember();
                setMemberStatus('內容載入失敗，請重新登入。', 'err');
                return;
              }
              setMemberStatus('登入成功，歡迎 ' + res.data.name + '。', 'ok');
              finishMemberEntry();
            });
          } else {
            setMemberStatus(res.error || '登入失敗。', 'err');
          }
        }).catch(function () {
          if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = '會員登入'; }
          setMemberStatus('連線失敗，請稍後再試。', 'err');
        });
      });
    }
    if (memberRegisterForm) {
      function formatMailResults(mail) {
        return (mail || []).map(function (m) {
          return [
            'label=' + (m.label || ''),
            'to=' + (m.to || ''),
            'ok=' + !!m.ok,
            'error=' + (m.error || '')
          ].join(' | ');
        }).join('\n');
      }
      memberRegisterForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var registerBtn = memberRegisterForm.querySelector('button[type="submit"]');
        if (registerBtn && registerBtn.disabled) return;
        var record = registrationRecord();
        var registerCode = memberRegisterCode ? memberRegisterCode.value.replace(/\D/g, '') : '';
        document.getElementById('memberMobile').value = record.mobile;
        if (!/^\d{6}$/.test(registerCode)) {
          setMemberStatus('請輸入 Email 中的六位數驗證碼。', 'err');
          if (memberRegisterCode) memberRegisterCode.focus();
          return;
        }
        if (registerBtn) { registerBtn.disabled = true; registerBtn.textContent = '驗證中…'; }
        setMemberStatus('驗證並註冊中…', '');
        API.memberRegister(record, registerCode).then(function (res) {
          if (registerBtn) { registerBtn.disabled = false; registerBtn.textContent = '驗證並註冊'; }
          if (res.ok && res.token) {
            saveMember(res.data, res.token);
            var failedMail = (res.mail || []).filter(function (m) { return !m.ok; });
            var mailError = failedMail.map(function (m) { return (m.label || 'mail') + ': ' + (m.error || 'unknown'); }).join('；');
            if (res.mail && res.mail.length) {
              if (failedMail.length) {
                console.error('會員註冊郵件通知失敗\n' + formatMailResults(res.mail));
                if (console.table) console.table(res.mail);
              } else {
                console.log('會員註冊郵件通知成功\n' + formatMailResults(res.mail));
                if (console.table) console.table(res.mail);
              }
            } else {
              console.warn('會員註冊未回傳郵件通知狀態', res);
            }
            loadProtectedContent(res.token).then(function (loaded) {
              if (!loaded) {
                clearMember();
                setMemberStatus('註冊完成，但內容載入失敗，請重新登入。', 'err');
                return;
              }
              setMemberStatus(failedMail.length
                ? '註冊完成；管理通知信部分失敗，但會員內容已載入。'
                : '註冊完成，已登入會員。', failedMail.length ? 'err' : 'ok');
              finishMemberEntry();
            });
          } else {
            setMemberStatus(res.error || '註冊失敗。', 'err');
          }
        }).catch(function () {
          if (registerBtn) { registerBtn.disabled = false; registerBtn.textContent = '驗證並註冊'; }
          setMemberStatus('連線失敗，請稍後再試。', 'err');
        });
      });
    }
    if (memberProfileForm) {
      memberProfileForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var member = currentMember();
        if (!isMemberLoggedIn() || !member) return;
        var btn = memberProfileForm.querySelector('button[type="submit"]');
        if (btn && btn.disabled) return;
        var mobileInput = document.getElementById('profileMobile');
        var record = {
          name: document.getElementById('profileName').value,
          dharmaName: document.getElementById('profileDharmaName').value,
          email: document.getElementById('profileEmail').value,
          mobile: normalizeMemberMobileInput(mobileInput ? mobileInput.value : '')
        };
        if (mobileInput) mobileInput.value = record.mobile;
        var activeToken = member.token;
        if (btn) { btn.disabled = true; btn.textContent = '儲存中...'; }
        setMemberStatus('儲存個人資料中…', '');
        API.memberUpdateProfile(record, activeToken).then(function (res) {
          if (btn) { btn.disabled = false; btn.textContent = '儲存修改'; }
          var active = currentMember();
          if (!active || active.token !== activeToken) return;
          if (res && res.ok && res.data) {
            saveMember(res.data, activeToken);
            if (res.profile) { fillMemberProfile(res.profile); memberProfileLoaded = true; }
            setMemberStatus('個人資料已更新。', 'ok');
          } else if (res && /登入已過期|未授權/.test(res.error || '')) {
            clearMember();
          } else {
            setMemberStatus((res && res.error) || '儲存失敗，請稍後再試。', 'err');
          }
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = '儲存修改'; }
          setMemberStatus('連線失敗，請稍後再試。', 'err');
        });
      });
    }
    if (memberContactForm) {
      memberContactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var member = currentMember();
        if (!isMemberLoggedIn() || !member) return;
        var btn = memberContactForm.querySelector('button[type="submit"]');
        if (btn && btn.disabled) return;
        var messageInput = document.getElementById('contactMessage');
        var message = messageInput ? messageInput.value.trim() : '';
        if (!message) {
          setMemberStatus('請輸入訊息內容。', 'err');
          if (messageInput) messageInput.focus();
          return;
        }
        var activeToken = member.token;
        if (btn) { btn.disabled = true; btn.textContent = '送出中...'; }
        setMemberStatus('訊息送出中…', '');
        API.memberContactAdmin(message, activeToken).then(function (res) {
          if (btn) { btn.disabled = false; btn.textContent = '送出訊息'; }
          if (res && res.ok) {
            if (messageInput) messageInput.value = '';
            setMemberStatus(res.msg || '訊息已送出，管理員會盡快回覆。', 'ok');
          } else if (res && /登入已過期|未授權/.test(res.error || '')) {
            clearMember();
          } else {
            setMemberStatus((res && res.error) || '訊息送出失敗，請稍後再試。', 'err');
          }
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = '送出訊息'; }
          setMemberStatus('連線失敗，請稍後再試。', 'err');
        });
      });
    }
    var storedMember = currentMember();
    if (storedMember && storedMember.token && API.memberContent) {
      var pendingMemberToken = storedMember.token;
      memberAuthChecking = true;
      memberAuthReady = false;
      syncMemberUi();
      // 只打一次 memberContent：它會驗證 token、回傳會員資料與內容。
      // 舊寫法要先 validateMemberToken 再 memberContent，兩次 GAS 往返是序列的，開站等待時間直接翻倍。
      loadProtectedContent(pendingMemberToken, {
        onMember: function (member) {
          var active = currentMember();
          if (!active || active.token !== pendingMemberToken) return; // 載入期間使用者已登出或切換帳號
          // 舊版後端尚未回傳 member 時，沿用本機既有 session，避免看起來被登出。
          saveMember(member || active, pendingMemberToken);
        },
        onFail: function (res) {
          var active = currentMember();
          if (!active || active.token !== pendingMemberToken) return;
          if (res && /登入已過期|未授權/.test(res.error || '')) {
            clearMember();
            setMemberStatus('會員登入已過期，請重新登入。', 'err');
            return;
          }
          // 純網路／伺服器暫時性失敗，不代表 token 失效，維持現有登入狀態
          memberAuthChecking = false;
          memberAuthReady = false;
          syncMemberUi();
          setMemberStatus('會員內容載入失敗，請稍後重試。', 'err');
        }
      }).catch(function () {
        memberAuthChecking = false;
        memberAuthReady = false;
        syncMemberUi();
        setMemberStatus('無法驗證登入狀態，請檢查網路後重試。', 'err');
      });
    } else {
      if (storedMember) localStorage.removeItem(MEMBER_KEY);
      memberAuthChecking = false;
      memberAuthReady = true;
      syncMemberUi();
    }
  }

  observeReveal();
  hydrateStaticCardShares();
  setupMemberAuth();
  boot();
  // 開站時走後端快取即可；fresh=1 會強制重抓兩次外站（官網慢且憑證有問題），
  // 讓每位訪客都付出數秒等待。使用者實際打開影片視窗時才需要即時值。
  refreshOfficialLive(false);
})();
