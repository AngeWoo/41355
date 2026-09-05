const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const properties = new Map(), files = new Map();
let rows = [{ id: 'alice' }, { id: 'bob' }], counter = 0, reads = 0, failWrite = false;
const privateAccess = 'PRIVATE';
const folder = {
  getId: () => 'private-folder', isTrashed: () => false,
  getSharingAccess: () => privateAccess, getEditors: () => [], getViewers: () => [],
  createFile(blob) {
    const id = 'image-' + (++counter);
    const file = {
      description: '', trashed: false, blob,
      getId: () => id, getSize: () => blob.bytes.length, getBlob: () => blob,
      getDescription() { return this.description; }, setDescription(v) { this.description = v; },
      isTrashed() { return this.trashed; }, setTrashed(v) { this.trashed = v; },
      getSharingAccess: () => privateAccess, getEditors: () => [], getViewers: () => [],
      getParents() { let next = true; return { hasNext: () => next, next: () => { next = false; return folder; } }; }
    };
    files.set(id, file); return file;
  }
};
const sandbox = {
  console: { warn() {}, error() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties.get(k), setProperty: (k, v) => properties.set(k, v) }) },
  DriveApp: { Access: { PRIVATE: privateAccess }, createFolder: () => folder, getFolderById: () => folder,
    getFileById: id => { reads++; if (!files.has(id)) throw Error('missing'); return files.get(id); } },
  Utilities: {
    getUuid: () => 'test-uuid', base64Decode: s => [...Buffer.from(s, 'base64')], base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (bytes, mime) => ({ bytes, getBytes: () => bytes, getContentType: () => mime })
  },
  SpreadsheetApp: { flush() {} }, CacheService: { getScriptCache: () => ({ remove() {} }) }
};
vm.createContext(sandbox);
// 與實際部署一致：只載入 Code.gs，防止漏傳額外檔案卻在測試中通過。
vm.runInContext(fs.readFileSync('gas/Code.gs', 'utf8'), sandbox, { filename: 'gas/Code.gs' });
Object.assign(sandbox, {
  json: x => x, consumeRateLimit: () => true, withWriteLock: fn => fn(),
  resolveMemberToken: token => ({ member: rows.find(r => token === 'token-' + r.id), code: 'auth_invalid' }),
  findMemberById: id => { const row = rows.find(r => r.id === id); return row ? { ...row } : null; },
  updateRecord: (type, record) => { if (failWrite) throw Error('write failed'); Object.assign(rows.find(r => r.id === record.id), record); }
});
const call = (token, action, extra = {}) => sandbox.doPost({ postData: { contents: JSON.stringify({ token, action, ...extra }) } });
const fixture = { mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' };
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
test('anonymous cannot read or write', () => {
  const before = reads;
  assert.equal(call('', 'memberBarcode').code, 'auth_invalid');
  assert.equal(call('', 'memberSaveBarcode', { file: fixture }).code, 'auth_invalid');
  assert.equal(reads, before); assert.equal(files.size, 0);
});
test('empty account returns no image', () => assert.equal(call('token-alice', 'memberBarcode').data, null));
test('upload persists pointer to authenticated member only', () => {
  assert.equal(call('token-alice', 'memberSaveBarcode', { file: fixture, memberId: 'bob' }).ok, true);
  assert.ok(rows[0].barcodeFileId); assert.equal(rows[1].barcodeFileId, undefined);
});
test('read returns original image bytes', () => assert.equal(call('token-alice', 'memberBarcode').data.dataUrl, 'data:image/png;base64,' + fixture.base64));
test('other member cannot choose file ID', () => assert.equal(call('token-bob', 'memberBarcode', { fileId: rows[0].barcodeFileId, memberId: 'alice' }).data, null));
test('reject SVG, MIME spoof, bad base64 and oversized input', () => {
  for (const file of [{ ...fixture, mimeType: 'image/svg+xml' }, { mimeType: 'image/png', base64: 'aGVsbG8=' }, { ...fixture, base64: '@@@@' }, { ...fixture, base64: 'A'.repeat(6990512) }]) {
    assert.equal(call('token-alice', 'memberSaveBarcode', { file }).ok, false);
  }
  assert.equal(files.size, 1);
});
test('failed write preserves existing picture and trashes staged upload', () => {
  const oldId = rows[0].barcodeFileId; failWrite = true;
  assert.equal(call('token-alice', 'memberSaveBarcode', { file: fixture }).ok, false);
  failWrite = false;
  assert.equal(rows[0].barcodeFileId, oldId); assert.equal(files.get(oldId).trashed, false);
  assert.equal(files.get('image-2').trashed, true);
});
test('replacement trashes prior picture after pointer is saved', () => {
  const oldId = rows[0].barcodeFileId;
  assert.equal(call('token-alice', 'memberSaveBarcode', { file: fixture }).ok, true);
  assert.notEqual(rows[0].barcodeFileId, oldId); assert.equal(files.get(oldId).trashed, true);
});
test('uncertain flush does not trash an already referenced new image', () => {
  sandbox.SpreadsheetApp.flush = () => { throw Error('flush timeout'); };
  assert.equal(call('token-alice', 'memberSaveBarcode', { file: fixture }).ok, false);
  assert.equal(files.get(rows[0].barcodeFileId).trashed, false);
  sandbox.SpreadsheetApp.flush = () => {};
  assert.equal(call('token-alice', 'memberBarcode').ok, true);
});
test('file ownership mismatch is denied', () => {
  rows[1].barcodeFileId = rows[0].barcodeFileId;
  assert.equal(call('token-bob', 'memberBarcode').ok, false); delete rows[1].barcodeFileId;
});
test('shared file or folder is denied', () => {
  const file = files.get(rows[0].barcodeFileId);
  file.getEditors = () => ['other']; assert.equal(call('token-alice', 'memberBarcode').ok, false); file.getEditors = () => [];
  folder.getSharingAccess = () => 'ANYONE'; assert.equal(call('token-alice', 'memberBarcode').ok, false);
  assert.equal(call('token-alice', 'memberSaveBarcode', { file: fixture }).ok, false);
  folder.getSharingAccess = () => privateAccess;
});
test('remove clears reference and moves image to trash', () => {
  const id = rows[0].barcodeFileId;
  assert.equal(call('token-alice', 'memberSaveBarcode', { remove: true }).ok, true);
  assert.equal(rows[0].barcodeFileId, ''); assert.equal(files.get(id).trashed, true);
  assert.equal(call('token-alice', 'memberBarcode').data, null);
});
test('temporary auth failure is preserved', () => {
  sandbox.resolveMemberToken = () => ({ code: 'temporary' });
  assert.equal(call('token-alice', 'memberBarcode').code, 'temporary');
});
console.log(count + ' member barcode backend checks passed.');
