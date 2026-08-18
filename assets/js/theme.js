/* ============================================================
   日間／夜間模式
   - 預設「自動」：以所在地的日出／日落時間為切換點
   - 使用者可按切換鈕手動固定為日間或夜間；再按一次回到自動
   - 在 <head> 以同步方式載入，於首次繪製前就套用主題，避免閃爍
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'shinnyo-theme';   // 'auto' | 'light' | 'dark'
  var AUTO = 'auto';
  var LIGHT = 'light';
  var DARK = 'dark';
  var THEME_COLOR = { dark: '#0d1728', light: '#f4f1e9' };

  // 自動切換的參考座標（預設台北）。若要改成其他地點，
  // 可在載入本檔前設定 window.SHINNYO_THEME_LOCATION = { lat: 24.15, lng: 120.68 }。
  var DEFAULT_LOCATION = { lat: 25.0330, lng: 121.5654 };

  var root = document.documentElement;
  var mode = AUTO;      // 使用者選的模式
  var theme = DARK;     // 實際套用的主題
  var sunToday = null;  // 目前這一天的日出／日落
  var timer = null;

  /* ---------- 日出／日落計算（NOAA 近似式，離線可用） ---------- */
  var RAD = Math.PI / 180;
  var DAY_MS = 86400000;
  var J1970 = 2440588;
  var J2000 = 2451545;
  var OBLIQUITY = RAD * 23.4397;
  var J0 = 0.0009;

  function toDays(date) { return (date.valueOf() / DAY_MS - 0.5 + J1970) - J2000; }
  function fromJulian(j) { return new Date((j + 0.5 - J1970) * DAY_MS); }
  function solarMeanAnomaly(d) { return RAD * (357.5291 + 0.98560028 * d); }
  function eclipticLongitude(m) {
    var c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
    return m + c + RAD * 102.9372 + Math.PI;
  }
  function declination(l) { return Math.asin(Math.sin(OBLIQUITY) * Math.sin(l)); }
  function approxTransit(ht, lw, n) { return J0 + (ht + lw) / (2 * Math.PI) + n; }
  function solarTransitJ(ds, m, l) { return J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l); }

  // 回傳該日的日出／日落；極晝極夜等無解時回傳 null
  function sunTimes(date, lat, lng) {
    var lw = RAD * -lng;
    var phi = RAD * lat;
    var d = toDays(date);
    var n = Math.round(d - J0 - lw / (2 * Math.PI));
    var ds = approxTransit(0, lw, n);
    var m = solarMeanAnomaly(ds);
    var l = eclipticLongitude(m);
    var dec = declination(l);
    var jNoon = solarTransitJ(ds, m, l);
    var cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (!(cosW >= -1 && cosW <= 1)) return null;
    var w = Math.acos(cosW);
    var jSet = solarTransitJ(approxTransit(w, lw, n), m, l);
    var sunset = fromJulian(jSet);
    var sunrise = fromJulian(jNoon - (jSet - jNoon));
    if (isNaN(sunrise.valueOf()) || isNaN(sunset.valueOf())) return null;
    return { sunrise: sunrise, sunset: sunset };
  }

  function location() {
    var c = window.SHINNYO_THEME_LOCATION;
    if (c && isFinite(c.lat) && isFinite(c.lng)) return { lat: Number(c.lat), lng: Number(c.lng) };
    return DEFAULT_LOCATION;
  }

  // 依現在時間判斷該用哪個主題，並算出下一個切換時間點
  function autoState(now) {
    var loc = location();
    var t = sunTimes(now, loc.lat, loc.lng);
    if (!t) {
      // 極區或計算失敗：退回固定的 06:00–18:00
      var h = now.getHours();
      var edge = new Date(now);
      edge.setMinutes(0, 0, 0);
      edge.setHours(h < 6 ? 6 : (h < 18 ? 18 : 30));
      return { theme: (h >= 6 && h < 18) ? LIGHT : DARK, next: edge, times: null };
    }
    if (now < t.sunrise) return { theme: DARK, next: t.sunrise, times: t };
    if (now < t.sunset) return { theme: LIGHT, next: t.sunset, times: t };
    var tomorrow = sunTimes(new Date(now.getTime() + DAY_MS), loc.lat, loc.lng);
    return { theme: DARK, next: tomorrow ? tomorrow.sunrise : new Date(now.getTime() + 3600000), times: t };
  }

  /* ---------- 主題套用 ---------- */
  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return (v === LIGHT || v === DARK || v === AUTO) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function store(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (e) {}
  }

  function setMeta(name, content) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el) el.setAttribute('content', content);
  }

  function hhmm(date) {
    if (!date) return '';
    return ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
  }

  function stateLabel() {
    if (mode === AUTO) return theme === LIGHT ? '自動 · 日間' : '自動 · 夜間';
    return mode === LIGHT ? '日間模式' : '夜間模式';
  }

  function nextLabel() {
    if (mode === AUTO) return '日間模式';
    return mode === LIGHT ? '夜間模式' : '自動（依日出日落）';
  }

  function syncButtons() {
    var hint = '目前：' + stateLabel() + '，點此切換為' + nextLabel();
    if (mode === AUTO && sunToday) {
      hint += '（日出 ' + hhmm(sunToday.sunrise) + '、日落 ' + hhmm(sunToday.sunset) + '）';
    }
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-label', hint);
      btns[i].setAttribute('title', hint);
      var text = btns[i].querySelector('.theme-toggle-text');
      if (text) text.textContent = stateLabel();
    }
  }

  function applyTheme(next) {
    theme = (next === LIGHT) ? LIGHT : DARK;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-mode', mode);
    setMeta('theme-color', THEME_COLOR[theme]);
    setMeta('color-scheme', theme);
    syncButtons();
  }

  function scheduleNext(at) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (mode !== AUTO) return;
    var delay = (at ? at.getTime() : 0) - Date.now();
    if (!isFinite(delay) || delay < 1000) delay = 1000;
    // 最多睡 30 分鐘就重新確認一次，避免裝置休眠造成計時器失準
    timer = window.setTimeout(refresh, Math.min(delay, 30 * 60 * 1000));
  }

  function refresh() {
    if (mode !== AUTO) { sunToday = null; applyTheme(mode); return; }
    var state = autoState(new Date());
    sunToday = state.times;
    applyTheme(state.theme);
    scheduleNext(state.next);
  }

  function set(next, persist) {
    mode = (next === LIGHT || next === DARK) ? next : AUTO;
    if (persist !== false) store(mode);
    refresh();
  }

  function toggle() {
    set(mode === AUTO ? LIGHT : (mode === LIGHT ? DARK : AUTO));
  }

  mode = readStored() || AUTO;
  refresh();

  document.addEventListener('DOMContentLoaded', syncButtons);

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (!btn) return;
    e.preventDefault();
    toggle();
  });

  // 分頁重新顯示時補算一次（裝置休眠期間計時器可能沒被觸發）
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && mode === AUTO) refresh();
  });
  window.addEventListener('focus', function () {
    if (mode === AUTO) refresh();
  });

  // 同一瀏覽器的其他分頁切換時一起同步
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY) return;
    mode = readStored() || AUTO;
    refresh();
  });

  window.ShinnyoTheme = {
    get: function () { return theme; },          // 目前實際套用的主題
    getMode: function () { return mode; },        // 'auto' | 'light' | 'dark'
    getSunTimes: function () { return autoState(new Date()).times; },
    set: set,                                     // set('auto' | 'light' | 'dark')
    toggle: toggle
  };
})();
