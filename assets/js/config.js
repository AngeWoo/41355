/**
 * 全站設定。部署 GAS 後，把 /exec 網址貼到 GAS_URL。
 * 若留空，會員限定內容不會載入。
 */
window.SITE_CONFIG = {
  // 例：'https://script.google.com/macros/s/AKfycb..../exec'
  // 設定後＝完整讀寫模式（前台讀取＋後台可新增/修改/刪除）。
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxfKXGxGBOyZlg8cdYRD8ow6Du-C1rZVDqu6WZYpCm113VOLW6XlnsK4OmiYRZZlIxr/exec',

  // 會員限定內容不可使用公開 Google 試算表 CSV 備援。
  PUBLISHED_SHEET: null,

  SITE_TITLE: '真如苑資料網站',
  SITE_SUBTITLE: '非官方資訊彙整 · Shinnyo-en Archive',
  OFFICIAL_LINK: 'https://www.shinnyo-en.org.tw/at2022/',
  FOOTER_NOTE: '本站為非官方資料彙整，內容僅供苑信徒參考交流之用。'
};
