/**
 * 真如音檔 — iPod 皮膚的操作邏輯
 *
 * 只用 app.js 匯出的 window.TalkPlayer，不改動原本的清單／分頁／播放流程。
 *   menu   ：播放畫面 → 回選單；選單 → 關閉視窗
 *   ◀◀ ／ ▶▶：上一則／下一則
 *   ▶❙❙  ：播放／暫停
 *   中央鍵 ：游標指到別則＝選定並播放；指到正在播的那一則＝播放／暫停交互輪替
 *   內圈轉盤：選單畫面＝上下捲動游標；播放畫面＝前後快轉
 */
(function () {
  'use strict';

  var SEEK_STEP = 5;          // 播放畫面轉一格 = 5 秒
  var WHEEL_STEP_DEG = 24;    // 轉盤每 24 度移動一格
  var SWIPE_MIN = 48;         // 換色滑動的最短距離（px）
  var SWIPE_MAX_MS = 800;

  // 機身配色，順序＝左右滑動的循環順序。'' 代表預設白色。
  var SKINS = ['', 'orange', 'red', 'blue', 'green', 'purple'];
  var SKIN_NAMES = {
    '': '白色', orange: '月亮橘', red: '太陽紅',
    blue: '星星藍', green: '星星綠', purple: '紫'
  };
  var SKIN_KEY = 'shinnyo_ipod_skin';

  var pod = document.getElementById('ipod');
  var wheel = document.getElementById('ipodWheel');
  var scroll = document.getElementById('ipodScroll');
  var pickList = document.getElementById('talkPickerList');
  var filter = document.getElementById('talkFilter');
  var bar = document.getElementById('ipodBar');
  var fill = document.getElementById('ipodBarFill');
  var tNow = document.getElementById('ipodTimeNow');
  var tLeft = document.getElementById('ipodTimeLeft');
  var nowMeta = document.getElementById('ipodNowMeta');
  var selectBtn = document.getElementById('ipodSelect');
  var progress = document.getElementById('ipodProgress');
  if (!pod || !wheel) return;

  var cursor = 0;             // 游標在「篩選後清單」中的位置
  var view = 'menu';
  var skinIndex = 0;

  /* ---------- 機身配色 ---------- */

  function applySkin(next, remember) {
    skinIndex = ((next % SKINS.length) + SKINS.length) % SKINS.length;
    var name = SKINS[skinIndex];
    if (name) pod.setAttribute('data-skin', name);
    else pod.removeAttribute('data-skin');
    if (remember) {
      try { localStorage.setItem(SKIN_KEY, name); } catch (e) {}
    }
    return name;
  }

  function restoreSkin() {
    var saved = '';
    try { saved = localStorage.getItem(SKIN_KEY) || ''; } catch (e) {}
    var i = SKINS.indexOf(saved);
    applySkin(i < 0 ? 0 : i, false);
  }

  // 左右滑動換色。轉盤要留給轉動，所以從轉盤上開始的手勢不算。
  var swipeId = null, swipeX = 0, swipeY = 0, swipeAt = 0;

  function swipeStart(e) {
    if (e.target.closest && e.target.closest('#ipodWheel')) { swipeId = null; return; }
    swipeId = e.pointerId;
    swipeX = e.clientX;
    swipeY = e.clientY;
    swipeAt = e.timeStamp;
  }

  function swipeEnd(e) {
    if (swipeId !== e.pointerId) return;
    swipeId = null;
    if (e.timeStamp - swipeAt > SWIPE_MAX_MS) return;
    var dx = e.clientX - swipeX;
    var dy = e.clientY - swipeY;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    var name = applySkin(skinIndex + (dx < 0 ? 1 : -1), true);
    showSkinToast(SKIN_NAMES[name]);
  }

  // 換色時在螢幕上短暫顯示顏色名稱，讓使用者知道發生了什麼
  var skinToastTimer = null;
  function showSkinToast(label) {
    if (!label) return;
    var el = document.getElementById('ipodSkinToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ipodSkinToast';
      el.className = 'ipod-skin-toast';
      el.setAttribute('aria-live', 'polite');
      var screen = pod.querySelector('.ipod-screen');
      if (!screen) return;
      screen.appendChild(el);
    }
    el.textContent = label;
    el.classList.add('is-on');
    if (skinToastTimer) window.clearTimeout(skinToastTimer);
    skinToastTimer = window.setTimeout(function () { el.classList.remove('is-on'); }, 900);
  }

  pod.addEventListener('pointerdown', swipeStart);
  pod.addEventListener('pointerup', swipeEnd);
  pod.addEventListener('pointercancel', function () { swipeId = null; });

  function TP() { return window.TalkPlayer || null; }
  function matched() { var tp = TP(); return (tp && tp.matched && tp.matched()) || []; }
  function pageSize() { return 8; }

  function setView(next) {
    view = next;
    pod.classList.toggle('view-now', next === 'now');
    pod.classList.toggle('view-menu', next !== 'now');
    var title = document.getElementById('talkDialogTitle');
    var tp = TP();
    var hasRows = !!(tp && (tp.rows() || []).length);
    if (title) title.textContent = (next === 'now' && hasRows) ? '播放中' : 'Shinnyo iPod 真如音檔';
    if (next === 'now') syncProgress();
  }

  // 沒有任何音檔時（例如尚未登入），清單是隱藏的，改讓播放畫面顯示提示訊息；
  // 資料稍後載進來時再自動切回選單。
  function autoView() {
    var tp = TP();
    var total = tp ? (tp.rows() || []).length : 0;
    if (!total) { setView('now'); return; }
    if (view === 'now' && document.querySelector('#talkList .search-empty')) setView('menu');
  }

  /* ---------- 游標 ---------- */

  // 清單每次重畫都會把 class 洗掉，這裡負責補回游標那一列
  function paintCursor() {
    if (!pickList) return;
    var rows = matched();
    if (!rows.length) return;
    cursor = Math.max(0, Math.min(rows.length - 1, cursor));
    var target = rows[cursor];
    var btns = pickList.querySelectorAll('.talk-pick');
    var hit = null;
    for (var i = 0; i < btns.length; i++) {
      var isCur = target && String(btns[i].getAttribute('data-talk-index')) === String(target.index);
      btns[i].classList.toggle('is-cursor', isCur);
      if (isCur) hit = btns[i];
    }
    if (hit && hit.scrollIntoView) hit.scrollIntoView({ block: 'nearest' });
  }

  // 游標移出目前這一頁時自動翻頁，翻完再把游標畫回去
  function moveCursor(delta) {
    var tp = TP();
    var rows = matched();
    if (!tp || !rows.length) return;
    var next = Math.max(0, Math.min(rows.length - 1, cursor + delta));
    if (next === cursor) return;
    cursor = next;
    var wantPage = Math.floor(cursor / pageSize());
    if (tp.page && tp.page() !== wantPage && tp.setPage) tp.setPage(wantPage);
    paintCursor();
  }

  // 打開視窗或換曲時，讓游標對齊正在播放的那一則
  function cursorToCurrent() {
    var tp = TP();
    if (!tp) return;
    var rows = matched();
    var cur = tp.current();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].index === cur) { cursor = i; break; }
    }
    paintCursor();
  }

  /* ---------- 按鍵 ---------- */

  function audio() { var tp = TP(); return tp && tp.audio ? tp.audio() : null; }

  function stepTrack(delta) {
    var tp = TP();
    if (!tp) return;
    var total = (tp.rows() || []).length;
    if (!total) return;
    var next = tp.current() + delta;
    if (next < 0 || next > total - 1) return;
    var wasPlaying = isPlaying();
    tp.select(next);
    cursorToCurrent();
    if (wasPlaying || view === 'now') { setView('now'); tp.play(); }
  }

  function isPlaying() {
    var a = audio();
    return !!(a && !a.paused && !a.ended);
  }

  // 中央鍵：播放中顯示暫停符號，停著時顯示三角形
  // 順便同步清單右側的狀態字（app.js 重畫時會給初值，這裡負責之後的變化）
  function syncPlayIcon() {
    var playing = isPlaying();
    if (selectBtn) {
      selectBtn.classList.toggle('is-playing', playing);
      selectBtn.setAttribute('aria-label', playing ? '暫停' : '播放');
    }
    if (!pickList) return;
    var picks = pickList.querySelectorAll('.talk-pick');
    for (var i = 0; i < picks.length; i++) {
      var state = picks[i].querySelector('.talk-pick-state');
      if (!state) continue;
      var want = picks[i].classList.contains('is-active') ? (playing ? '播放中' : '已選取') : '';
      if (state.textContent !== want) state.textContent = want;
    }
  }

  // 換曲時 app.js 會重建 <audio>，所以每次重畫都要重新掛一次事件
  function bindAudioEvents() {
    var a = audio();
    if (!a || a.getAttribute('data-ipod-bound') === '1') return;
    a.setAttribute('data-ipod-bound', '1');
    ['play', 'playing', 'pause', 'ended'].forEach(function (t) {
      a.addEventListener(t, syncPlayIcon);
    });
  }

  function togglePlay() {
    var tp = TP();
    var a = audio();
    if (!tp || !a) return;
    setView('now');
    if (a.paused || a.ended) tp.play();
    else a.pause();
  }

  function selectCursor() {
    var tp = TP();
    var rows = matched();
    if (!tp || !rows.length) return;
    var target = rows[Math.max(0, Math.min(rows.length - 1, cursor))];
    if (!target) return;
    // 已經是正在播的那一則：中央鍵當成播放／暫停，按一下播、再按一下停，交互輪替
    if (target.index === tp.current() && audio()) { togglePlay(); return; }
    tp.select(target.index);
    setView('now');
    tp.play();
  }

  function pressMenu() {
    var tp = TP();
    var hasRows = !!(tp && (tp.rows() || []).length);
    if (view === 'now' && hasRows) { setView('menu'); cursorToCurrent(); return; }
    if (tp && tp.close) tp.close();
  }

  function seek(seconds) {
    var a = audio();
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + seconds));
    syncProgress();
  }

  wheel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ipod]');
    if (!btn) return;
    var act = btn.getAttribute('data-ipod');
    if (act === 'menu') pressMenu();
    else if (act === 'prev') stepTrack(-1);
    else if (act === 'next') stepTrack(1);
    else if (act === 'play') togglePlay();
    else if (act === 'select') selectCursor();
  });

  /* ---------- 內圈轉盤 ---------- */

  var dragId = null, lastAngle = 0, acc = 0;

  function angleAt(e) {
    var r = scroll.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  }

  function wheelStep(dir) {
    if (view === 'now') seek(dir * SEEK_STEP);
    else moveCursor(dir);
  }

  if (scroll) {
    scroll.addEventListener('pointerdown', function (e) {
      dragId = e.pointerId;
      lastAngle = angleAt(e);
      acc = 0;
      scroll.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    scroll.addEventListener('pointermove', function (e) {
      if (dragId !== e.pointerId) return;
      var a = angleAt(e);
      var d = a - lastAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      lastAngle = a;
      acc += d;
      while (acc >= WHEEL_STEP_DEG) { acc -= WHEEL_STEP_DEG; wheelStep(1); }
      while (acc <= -WHEEL_STEP_DEG) { acc += WHEEL_STEP_DEG; wheelStep(-1); }
      e.preventDefault();
    });
    function endDrag(e) {
      if (dragId !== e.pointerId) return;
      dragId = null;
      try { scroll.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    scroll.addEventListener('pointerup', endDrag);
    scroll.addEventListener('pointercancel', endDrag);
  }

  // 滑鼠滾輪也能捲動選單
  wheel.addEventListener('wheel', function (e) {
    if (!e.deltaY) return;
    e.preventDefault();
    wheelStep(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  /* ---------- 進度條 ---------- */

  function mmss(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function syncProgress() {
    var a = audio();
    var dur = a && isFinite(a.duration) ? a.duration : 0;
    var cur = a ? a.currentTime || 0 : 0;
    var pct = dur ? Math.max(0, Math.min(100, cur / dur * 100)) : 0;
    if (fill) fill.style.width = pct + '%';
    if (tNow) tNow.textContent = mmss(cur);
    if (tLeft) tLeft.textContent = dur ? '-' + mmss(dur - cur) : '-0:00';
    if (bar) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (nowMeta) {
      var tp = TP();
      var total = tp ? (tp.rows() || []).length : 0;
      nowMeta.textContent = total ? (tp.current() + 1) + ' / ' + total : '';
    }
    if (progress) progress.classList.toggle('is-idle', !a);
    bindAudioEvents();
    syncPlayIcon();
  }

  function seekToClientX(x) {
    var a = audio();
    if (!a || !isFinite(a.duration) || !bar) return;
    var r = bar.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * a.duration;
    syncProgress();
  }

  if (bar) {
    var barDrag = false;
    bar.addEventListener('pointerdown', function (e) {
      barDrag = true;
      bar.setPointerCapture(e.pointerId);
      seekToClientX(e.clientX);
    });
    bar.addEventListener('pointermove', function (e) { if (barDrag) seekToClientX(e.clientX); });
    bar.addEventListener('pointerup', function (e) {
      barDrag = false;
      try { bar.releasePointerCapture(e.pointerId); } catch (err) {}
    });
    bar.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { seek(SEEK_STEP); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { seek(-SEEK_STEP); e.preventDefault(); }
    });
  }

  window.setInterval(function () {
    if (!document.documentElement.classList.contains('talk-open')) return;
    bindAudioEvents();
    syncPlayIcon();
    if (view === 'now') syncProgress();
  }, 400);

  /* ---------- 與 app.js 的重繪同步 ---------- */

  // 清單／播放區被重畫時，補回游標並更新進度
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () {
      autoView(); paintCursor(); syncProgress(); bindAudioEvents(); syncPlayIcon();
    });
    if (pickList) mo.observe(pickList, { childList: true });
    var list = document.getElementById('talkList');
    if (list) mo.observe(list, { childList: true, subtree: true });
  }

  // 點清單＝選定並播放，畫面同時切到播放中
  if (pickList) {
    pickList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-talk-index]');
      if (!btn) return;
      var rows = matched();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].index) === String(btn.getAttribute('data-talk-index'))) { cursor = i; break; }
      }
      setView('now');
    });
  }

  // 打字篩選時游標回到第一列
  if (filter) {
    filter.addEventListener('input', function () { cursor = 0; window.setTimeout(paintCursor, 0); });
    // 在輸入框裡按上下鍵也能移動游標
    filter.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { moveCursor(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { moveCursor(-1); e.preventDefault(); }
      else if (e.key === 'Enter') { selectCursor(); e.preventDefault(); }
    });
  }

  // 鍵盤操作：視窗開著時，上下鍵捲動、Enter 播放、空白鍵播放／暫停
  document.addEventListener('keydown', function (e) {
    if (!document.documentElement.classList.contains('talk-open')) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowDown') { moveCursor(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { moveCursor(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { view === 'now' ? seek(SEEK_STEP) : stepTrack(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { view === 'now' ? seek(-SEEK_STEP) : stepTrack(-1); e.preventDefault(); }
    else if (e.key === 'Enter') { selectCursor(); e.preventDefault(); }
    else if (e.key === ' ') { togglePlay(); e.preventDefault(); }
  });

  // 開窗時回到選單畫面；只有一則音檔時（清單會被隱藏）直接進播放畫面。
  // app.js 在 openTalkPopover() 發這個事件，所以用導覽鈕開或用分享網址開都會走到這裡。
  document.addEventListener('talk:opened', function () {
    window.setTimeout(function () {
      var picker = document.getElementById('talkPicker');
      setView(picker && picker.hidden ? 'now' : 'menu');
      autoView();
      cursorToCurrent();
    }, 0);
  });

  restoreSkin();
  setView('menu');
  syncPlayIcon();
})();
