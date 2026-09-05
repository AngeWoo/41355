const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const entries = new Map();
let reads = 0, batches = 0;
const blob = data => { const bytes = Buffer.from(data); return { getBytes: () => [...bytes], getDataAsString: () => bytes.toString('utf8') }; };
const cache = {
  get: k => entries.get(k), getAll: keys => Object.fromEntries(keys.filter(k => entries.has(k)).map(k => [k, entries.get(k)])),
  putAll(values) { batches++; Object.entries(values).forEach(([k,v]) => { assert.ok(Buffer.byteLength(v) < 100000); entries.set(k,v); }); },
  removeAll: keys => keys.forEach(k => entries.delete(k))
};
const table = [['id','title','order','mobile'],['a','測試',2,'0912345678'],['b','第二筆',1,'']];
const sheet = {
  getLastRow: () => table.length, getLastColumn: () => table[0].length,
  getRange(r,c,h,w) { assert.deepEqual([r,c,h,w],[1,1,3,4]); return { getValues() { reads++; return table.map(r => r.slice()); } }; }
};
const ss = { getSheetByName: name => name === '最新消息' || name === '會員' ? sheet : null };
const sandbox = {
  console, PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-sheet' }) },
  SpreadsheetApp: { openById: () => ss }, CacheService: { getScriptCache: () => cache },
  Utilities: { newBlob: blob, gzip: b => blob(zlib.gzipSync(Buffer.from(b.getBytes()))), ungzip: b => blob(zlib.gunzipSync(Buffer.from(b.getBytes()))), base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => [...Buffer.from(s,'base64')] }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Code.gs','utf8'),sandbox);
const rows = sandbox.listRecords('news');
assert.equal(reads,1); assert.equal(rows[0].id,'b');
assert.equal(sandbox.listRecords('members')[1].mobile,'0912345678');
assert.equal(sandbox.listRecords('tools').length,0);
console.log('PASS single range read, no schema/format writes, sorting and member mobile preserved');
const large = [{id:'large',body:'繁體中文內容'.repeat(20000)}];
const encoded = sandbox.encodeDataCache(large);
assert.ok(encoded.startsWith('gzip:'));
assert.equal(JSON.stringify(sandbox.decodeDataCache(encoded)),JSON.stringify(large));
entries.set('list_news',encoded);
const before = reads;
assert.equal(sandbox.cachedListRecords('news')[0].body,large[0].body); assert.equal(reads,before);
console.log('PASS large Chinese payload cached under 100 KB, decoded without sheet read');
entries.clear(); sandbox.isMemberVisibleRecord = () => true;
const content = sandbox.contentData(true);
assert.equal(batches,1); assert.equal(content.news.length,2); assert.equal(content.members,undefined);
const warmReads = reads; sandbox.contentData(true); assert.equal(reads,warmReads);
sandbox.clearDataCache('members'); sandbox.contentData(true); assert.equal(reads,warmReads);
sandbox.clearDataCache('news'); sandbox.contentData(true); assert.equal(reads,warmReads+1);
console.log('PASS batched content cache, warm zero reads, selective invalidation, no member exposure');
entries.set('list_news','gzip:broken'); sandbox.cachedListRecords('news'); assert.equal(reads,warmReads+2);
cache.putAll = () => { throw Error('cache unavailable'); };
sandbox.clearDataCache('news'); assert.equal(sandbox.cachedListRecords('news').length,2);
console.log('PASS corrupt/unavailable cache falls back to source data');
sandbox.json = x => x; sandbox.verifyToken = () => false;
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify({action:'adminAll',token:'invalid'})}}).ok,false);
console.log('PASS batch API still requires administrator authorization');

async function verifyClient() {
  const requests = [];
  const client = { window:{ SITE_CONFIG:{ GAS_URL:'https://test.invalid/exec' } }, document:{readyState:'complete',getElementById:()=>null,querySelector:()=>null},
    localStorage:{removeItem(){}}, setTimeout,clearTimeout,setInterval,clearInterval,AbortController,
    fetch: (url, options) => new Promise(resolve => requests.push({body:JSON.parse(options.body),resolve:() => resolve({ok:true,json:() => Promise.resolve({ok:true,data:[]})})})) };
  vm.createContext(client); vm.runInContext(fs.readFileSync('assets/js/api.js','utf8'),client);
  const api = client.window.API;
  const first = api.adminAll('admin-a'), duplicate = api.adminAll('admin-a'), separate = api.adminAll('admin-b');
  assert.equal(requests.length,2); assert.equal(first,duplicate);
  const write = api.update('news',{id:'a'},'admin-a');
  const afterWrite = api.adminAll('admin-a'); assert.equal(requests.length,4); assert.notEqual(first,afterWrite);
  requests.forEach(r=>r.resolve()); await Promise.all([first,duplicate,separate,write,afterWrite]);
  const fresh = api.adminAll('admin-a'); assert.equal(requests.length,5); requests[4].resolve(); await fresh;
  console.log('PASS concurrent read deduplication, token separation, write invalidation, no completed response cache');
}
verifyClient().catch(err => { console.error(err); process.exitCode=1; });
