/**
 * 公開 JSON 快取已停用。
 * 會員限定內容必須透過 GAS 的 memberContent（會員權杖）或 adminList（管理員權杖）取得。
 */
console.error('sync-cache 已停用：不可將會員限定內容寫入 assets/data/cache.json。');
process.exitCode = 1;
