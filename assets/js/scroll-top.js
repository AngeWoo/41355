/* 重新整理（含手機下拉更新）後固定回到頁面最上方，不沿用先前的捲動位置。 */
(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var navEntries = performance.getEntriesByType ? performance.getEntriesByType('navigation') : [];
  var isPageReload = navEntries.length
    ? navEntries[0].type === 'reload'
    : !!(performance.navigation && performance.navigation.type === 1);
  if (!isPageReload) return;

  var self = document.currentScript;
  // 網址若帶 #區塊，瀏覽器會等該區塊渲染完成後才跳過去，蓋掉我們捲回最上方的結果，所以先清掉。
  // 後台的 hash 記的是分頁名稱而不是區塊錨點，標了 data-keep-hash 就保留。
  if (location.hash && !(self && self.hasAttribute('data-keep-hash'))) {
    try { history.replaceState(null, document.title, location.pathname + location.search); } catch (e) {}
  }

  var MOVE_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  var pinned = true;
  function release() {
    if (!pinned) return;
    pinned = false;
    MOVE_EVENTS.forEach(function (name) { window.removeEventListener(name, release); });
  }
  function toTop() {
    if (pinned) window.scrollTo(0, 0);
  }
  // 使用者一旦自己捲動或操作就交還控制權，不再強制拉回頂端。
  MOVE_EVENTS.forEach(function (name) {
    window.addEventListener(name, release, { passive: true });
  });

  toTop();
  document.addEventListener('DOMContentLoaded', toTop, { once: true });
  window.addEventListener('load', function () {
    toTop();
    // 內容是載入後才非同步渲染，版面撐開的這段期間再固定幾次。
    [0, 120, 300, 600].forEach(function (delay) { setTimeout(toTop, delay); });
    setTimeout(release, 900);
  }, { once: true });
})();
