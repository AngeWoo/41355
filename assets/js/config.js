/**
 * 全站設定。部署 GAS 後，把 /exec 網址貼到 GAS_URL。
 * 若留空，網站會自動使用內建範例資料 (demo) 以便預覽外觀。
 */
window.SITE_CONFIG = {
  // 例：'https://script.google.com/macros/s/AKfycb..../exec'
  // 設定後＝完整讀寫模式（前台讀取＋後台可新增/修改/刪除）。
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzJrxA_9b0vkbtxZ9bDCJv3spox4An_KNTXyU3c41TV--ynLQaiAmkJIlcsV-DsXiUycw/exec',

  // 唯讀模式：直接讀取「已發布到網路」的 Google 試算表（CSV）。
  // 只在 GAS_URL 留空時生效；此模式前台可顯示即時資料，但後台無法寫入
  //（維護方式＝直接在 Google 試算表編輯）。
  PUBLISHED_SHEET: {
    base: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjdz0SpM8SQ8J1CE0hL6Nrq9NN748zSdjqYBzk81PBsx7eXgQqWa-M9X_or4HbPsl6POanujjFqFlt/pub',
    gid: {
      news: '723478343',
      podcast: '692613060',
      calendar: '1512334294',
      newsletter: '85508596',
      dharma: '184494417'
    }
  },

  SITE_TITLE: '真如苑資料網站',
  SITE_SUBTITLE: '非官方資訊彙整 · Shinnyo-en Archive',
  OFFICIAL_LINK: 'https://www.shinnyo-en.org.tw/at2022/',
  FOOTER_NOTE: '本站為非官方資料彙整，內容僅供苑信徒參考交流之用。'
};
