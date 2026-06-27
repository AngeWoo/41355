/**
 * 真如苑資料網站 (非官方) — Google Apps Script 後端 API
 * ----------------------------------------------------------------
 * 部署方式：
 *   1. 到 https://script.google.com 建立新專案，貼上本檔內容。
 *   2. 第一次執行 setup() 函式（會自動建立試算表與分頁、寫入初始密碼）。
 *   3. 部署 → 新增部署作業 → 類型「網頁應用程式」
 *        - 執行身分：我 (your account)
 *        - 具有存取權的使用者：任何人
 *   4. 複製 /exec 網址，貼到前端 assets/js/config.js 的 GAS_URL。
 *
 * 安全性：
 *   - 讀取 (list) 為公開。
 *   - 新增/修改/刪除/排序 需先 login 取得 token。
 *   - 密碼以 SHA-256 雜湊存於 Script Properties，不存明碼。
 *
 * 資料儲存：Google 試算表，一個內容類型一個分頁，第一列為欄位標頭。
 */

// ====================== 設定 ======================
var ADMIN_PASSWORD_DEFAULT = 'shinnyo2026'; // 第一次 setup() 後請從後台或這裡修改
var TOKEN_TTL_SECONDS = 60 * 60 * 6;        // token 有效 6 小時
var PROP = PropertiesService.getScriptProperties();

// 每個內容類型對應的分頁與預設欄位（標頭）。
// 可自行在試算表增加欄位，list 會自動帶出。
var SCHEMA = {
  news: {
    sheet: '最新消息',
    headers: ['id', 'title', 'date', 'body', 'link', 'pinned', 'order', 'createdAt', 'updatedAt']
  },
  podcast: {
    sheet: 'Podcast',
    headers: ['id', 'ep', 'title', 'guest', 'date', 'desc', 'link', 'cover', 'order', 'createdAt', 'updatedAt']
  },
  calendar: {
    sheet: '行事曆',
    headers: ['id', 'date', 'title', 'location', 'desc', 'tag', 'link', 'order', 'createdAt', 'updatedAt']
  },
  newsletter: {
    sheet: '親苑時報',
    headers: ['id', 'issue', 'title', 'date', 'link', 'cover', 'order', 'createdAt', 'updatedAt']
  },
  dharma: {
    sheet: '瑞聲法語',
    headers: ['id', 'title', 'category', 'date', 'content', 'link', 'order', 'createdAt', 'updatedAt']
  },
  tools: {
    sheet: '互動程式',
    headers: ['id', 'title', 'desc', 'link', 'icon', 'order', 'createdAt', 'updatedAt']
  }
};

// ====================== 安裝 ======================
function setup() {
  var ss = getSpreadsheet();
  Object.keys(SCHEMA).forEach(function (type) {
    ensureSheet(ss, SCHEMA[type]);
  });
  if (!PROP.getProperty('ADMIN_PWD_HASH')) {
    setAdminPassword(ADMIN_PASSWORD_DEFAULT);
  }
  seedSampleData();
  return '安裝完成，試算表：' + ss.getUrl();
}

function getSpreadsheet() {
  var id = PROP.getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* fallthrough */ }
  }
  var ss = SpreadsheetApp.create('真如苑資料網站 — 資料庫');
  PROP.setProperty('SPREADSHEET_ID', ss.getId());
  // 移除預設空白分頁
  var def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  return ss;
}

function ensureSheet(ss, def) {
  var sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ====================== HTTP 入口 ======================
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action || 'list';
    if (action === 'list') {
      return json({ ok: true, data: listRecords(params.type) });
    }
    if (action === 'all') {
      var out = {};
      Object.keys(SCHEMA).forEach(function (t) { out[t] = listRecords(t); });
      return json({ ok: true, data: out });
    }
    if (action === 'ping') {
      return json({ ok: true, msg: 'pong' });
    }
    return json({ ok: false, error: '未知的 action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action;

    if (action === 'login') {
      return handleLogin(body);
    }

    // 以下動作需驗證 token
    var mutating = ['create', 'update', 'delete', 'reorder', 'changePassword'];
    if (mutating.indexOf(action) !== -1) {
      if (!verifyToken(body.token)) {
        return json({ ok: false, error: '未授權或登入逾時，請重新登入。' });
      }
    }

    switch (action) {
      case 'create':         return json({ ok: true, data: createRecord(body.type, body.record) });
      case 'update':         return json({ ok: true, data: updateRecord(body.type, body.record) });
      case 'delete':         return json({ ok: true, data: deleteRecord(body.type, body.id) });
      case 'reorder':        return json({ ok: true, data: reorder(body.type, body.ids) });
      case 'changePassword': return handleChangePassword(body);
      default:               return json({ ok: false, error: '未知的 action: ' + action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====================== 認證 ======================
function sha256(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function setAdminPassword(pwd) {
  var salt = Utilities.getUuid();
  PROP.setProperty('ADMIN_SALT', salt);
  PROP.setProperty('ADMIN_PWD_HASH', sha256(salt + ':' + pwd));
}

function checkPassword(pwd) {
  var salt = PROP.getProperty('ADMIN_SALT') || '';
  var hash = PROP.getProperty('ADMIN_PWD_HASH') || '';
  return hash && sha256(salt + ':' + pwd) === hash;
}

function handleLogin(body) {
  if (!checkPassword(body.password || '')) {
    Utilities.sleep(600); // 簡單防爆破
    return json({ ok: false, error: '密碼錯誤。' });
  }
  var token = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tok_' + token, '1', TOKEN_TTL_SECONDS);
  return json({ ok: true, token: token, ttl: TOKEN_TTL_SECONDS });
}

function verifyToken(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('tok_' + token) === '1';
}

function handleChangePassword(body) {
  if (!checkPassword(body.oldPassword || '')) {
    return json({ ok: false, error: '舊密碼錯誤。' });
  }
  if (!body.newPassword || body.newPassword.length < 6) {
    return json({ ok: false, error: '新密碼至少 6 碼。' });
  }
  setAdminPassword(body.newPassword);
  return json({ ok: true, msg: '密碼已更新。' });
}

// ====================== 資料操作 ======================
function sheetFor(type) {
  var def = SCHEMA[type];
  if (!def) throw new Error('未知的資料類型: ' + type);
  return ensureSheet(getSpreadsheet(), def);
}

function readHeaders(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function listRecords(type) {
  var sh = sheetFor(type);
  var headers = readHeaders(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  }).filter(function (o) { return String(o.id || '').length > 0; });

  rows.sort(function (a, b) {
    var ao = Number(a.order || 0), bo = Number(b.order || 0);
    if (ao !== bo) return ao - bo;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
  return rows;
}

function findRowById(sh, id) {
  var headers = readHeaders(sh);
  var idIdx = headers.indexOf('id');
  var lastRow = sh.getLastRow();
  if (idIdx === -1 || lastRow < 2) return -1;
  var ids = sh.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // 實際列號
  }
  return -1;
}

function createRecord(type, record) {
  var sh = sheetFor(type);
  var headers = readHeaders(sh);
  record = record || {};
  record.id = record.id || Utilities.getUuid();
  var now = new Date().toISOString();
  record.createdAt = now;
  record.updatedAt = now;
  if (record.order === undefined || record.order === '') {
    record.order = sh.getLastRow(); // 預設排在最後
  }
  var row = headers.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
  sh.appendRow(row);
  return record;
}

function updateRecord(type, record) {
  var sh = sheetFor(type);
  var headers = readHeaders(sh);
  var rowNum = findRowById(sh, record.id);
  if (rowNum === -1) throw new Error('找不到資料 id: ' + record.id);
  record.updatedAt = new Date().toISOString();
  var existing = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  var row = headers.map(function (h, i) {
    return record[h] !== undefined ? record[h] : existing[i];
  });
  sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = row[i]; });
  return obj;
}

function deleteRecord(type, id) {
  var sh = sheetFor(type);
  var rowNum = findRowById(sh, id);
  if (rowNum === -1) throw new Error('找不到資料 id: ' + id);
  sh.deleteRow(rowNum);
  return { id: id, deleted: true };
}

function reorder(type, ids) {
  var sh = sheetFor(type);
  var headers = readHeaders(sh);
  var orderIdx = headers.indexOf('order');
  if (orderIdx === -1) throw new Error('此類型沒有 order 欄位');
  ids.forEach(function (id, idx) {
    var rowNum = findRowById(sh, id);
    if (rowNum !== -1) sh.getRange(rowNum, orderIdx + 1).setValue(idx + 1);
  });
  return { ok: true };
}

// ====================== 範例資料 ======================
function seedSampleData() {
  if (PROP.getProperty('SEEDED')) return;
  var DATA = {
    "news": [
      {
        "id": "an-1",
        "title": "親苑時報 2026年6月號已更新",
        "date": "2026-06-01",
        "body": "最新一期親苑時報已上線，歡迎點閱。",
        "link": "https://twgo.io/bqkop",
        "pinned": "TRUE",
        "order": 1
      },
      {
        "id": "an-2",
        "title": "2026年8月 台灣行事曆已上線",
        "date": "2026-08-01",
        "body": "最新台灣行事曆已公布，請查閱本月活動安排。",
        "link": "https://meee.ing/a6546d",
        "pinned": "",
        "order": 2
      },
      {
        "id": "an-3",
        "title": "Podcast「等一個人的真如café」已更新至 EP01",
        "date": "",
        "body": "邀請分享修行因緣，歡迎收聽。",
        "link": "https://www.youtube.com/watch?v=QzJmT6P0bac",
        "pinned": "",
        "order": 3
      },
      {
        "id": "an-4",
        "title": "瑞聲法語已更新至第48號",
        "date": "",
        "body": "瑞聲法語全集持續整理上架。",
        "link": "https://srt.tw/k9pLsY",
        "pinned": "",
        "order": 4
      }
    ],
    "podcast": [
      {
        "id": "pod-ep01",
        "ep": "EP01",
        "title": "等一個人的真如café",
        "guest": "",
        "date": "3/28",
        "desc": "系列首集",
        "link": "https://www.youtube.com/watch?v=QzJmT6P0bac",
        "cover": "",
        "order": 16
      },
      {
        "id": "pod-ep02",
        "ep": "EP02",
        "title": "等一個人的真如café",
        "guest": "陳昱良",
        "date": "4/04",
        "desc": "來賓：陳昱良",
        "link": "https://www.youtube.com/watch?v=QzJmT6P0bac",
        "cover": "",
        "order": 15
      },
      {
        "id": "pod-ep03",
        "ep": "EP03",
        "title": "等一個人的真如café",
        "guest": "潘翠雪",
        "date": "4/25",
        "desc": "來賓：潘翠雪",
        "link": "https://www.youtube.com/watch?v=iEWhSuGwr8w",
        "cover": "",
        "order": 14
      },
      {
        "id": "pod-ep04",
        "ep": "EP04",
        "title": "等一個人的真如café",
        "guest": "盧郁仁",
        "date": "5/04",
        "desc": "來賓：盧郁仁",
        "link": "https://www.youtube.com/watch?v=hvXQvoQLc1w",
        "cover": "",
        "order": 13
      },
      {
        "id": "pod-ep05",
        "ep": "EP05",
        "title": "等一個人的真如café",
        "guest": "何汶儒",
        "date": "5/25",
        "desc": "來賓：何汶儒",
        "link": "https://www.youtube.com/watch?v=hvZUPkcUuFU",
        "cover": "",
        "order": 12
      },
      {
        "id": "pod-ep06",
        "ep": "EP06",
        "title": "等一個人的真如café",
        "guest": "張啟豐",
        "date": "6/04",
        "desc": "來賓：張啟豐",
        "link": "https://www.youtube.com/watch?v=hvZUPkcUuFU",
        "cover": "",
        "order": 11
      },
      {
        "id": "pod-ep07",
        "ep": "EP07",
        "title": "等一個人的真如café",
        "guest": "林楚培",
        "date": "6/25",
        "desc": "來賓：林楚培",
        "link": "https://www.youtube.com/watch?v=iUTZvEHOeB8",
        "cover": "",
        "order": 10
      },
      {
        "id": "pod-ep08",
        "ep": "EP08",
        "title": "等一個人的真如café",
        "guest": "温瑞萍",
        "date": "7/04",
        "desc": "來賓：温瑞萍",
        "link": "https://www.youtube.com/watch?v=vW1yieXgBc4",
        "cover": "",
        "order": 9
      },
      {
        "id": "pod-ep09",
        "ep": "EP09",
        "title": "等一個人的真如café",
        "guest": "林采柔",
        "date": "7/25",
        "desc": "來賓：林采柔",
        "link": "https://youtu.be/gFoVmOEoxC8",
        "cover": "",
        "order": 8
      },
      {
        "id": "pod-ep10",
        "ep": "EP10",
        "title": "等一個人的真如café",
        "guest": "閻凱偉",
        "date": "8/04",
        "desc": "來賓：閻凱偉",
        "link": "https://youtu.be/dTamY1HhofM",
        "cover": "",
        "order": 7
      },
      {
        "id": "pod-ep11",
        "ep": "EP11",
        "title": "等一個人的真如café",
        "guest": "林淑菁",
        "date": "8/25",
        "desc": "來賓：林淑菁",
        "link": "https://youtu.be/9ZjPF4W4Sp8",
        "cover": "",
        "order": 6
      },
      {
        "id": "pod-ep12",
        "ep": "EP12",
        "title": "等一個人的真如café",
        "guest": "石井希怜",
        "date": "9/04",
        "desc": "來賓：石井希怜",
        "link": "https://www.youtube.com/watch?v=8VerqpmUa2U",
        "cover": "",
        "order": 5
      },
      {
        "id": "pod-ep13",
        "ep": "EP13",
        "title": "等一個人的真如café",
        "guest": "林志光",
        "date": "9/25",
        "desc": "來賓：林志光",
        "link": "https://youtu.be/zQ-x1sEtYTU",
        "cover": "",
        "order": 4
      },
      {
        "id": "pod-ep14",
        "ep": "EP14",
        "title": "等一個人的真如café",
        "guest": "陳小玲",
        "date": "10/04",
        "desc": "來賓：陳小玲",
        "link": "https://youtu.be/IPSVRaNWJ-Y",
        "cover": "",
        "order": 3
      },
      {
        "id": "pod-ep15",
        "ep": "EP15",
        "title": "等一個人的真如café",
        "guest": "林玉萍、陳千煒",
        "date": "10/25",
        "desc": "來賓：林玉萍、陳千煒",
        "link": "https://youtu.be/eeNPLRBOEyE",
        "cover": "",
        "order": 2
      },
      {
        "id": "pod-ep16",
        "ep": "EP16",
        "title": "等一個人的真如café",
        "guest": "製作團隊",
        "date": "11/04",
        "desc": "來賓：製作團隊",
        "link": "https://youtu.be/jHiBO_ptHMQ",
        "cover": "",
        "order": 1
      }
    ],
    "calendar": [
      {
        "id": "cal-202608",
        "date": "2026-08-01",
        "title": "2026年8月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://meee.ing/a6546d",
        "order": 1
      },
      {
        "id": "cal-202607",
        "date": "2026-07-01",
        "title": "2026年7月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://bely.cc/PqPMTE",
        "order": 2
      },
      {
        "id": "cal-202606",
        "date": "2026-06-01",
        "title": "2026年6月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://twgo.io/ewuub",
        "order": 3
      },
      {
        "id": "cal-202605",
        "date": "2026-05-01",
        "title": "2026年5月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://srt.tw/SrU8SU",
        "order": 4
      },
      {
        "id": "cal-202604",
        "date": "2026-04-01",
        "title": "2026年4月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://meee.ing/f9fbc0",
        "order": 5
      },
      {
        "id": "cal-202603",
        "date": "2026-03-01",
        "title": "2026年3月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://twgo.io/acyei",
        "order": 6
      },
      {
        "id": "cal-202602",
        "date": "2026-02-01",
        "title": "2026年2月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://meee.ing/b35d77",
        "order": 7
      },
      {
        "id": "cal-202601",
        "date": "2026-01-01",
        "title": "2026年1月 台灣行事曆",
        "location": "",
        "desc": "本月台灣地區行事曆",
        "tag": "月曆",
        "link": "https://twgo.io/eeznt",
        "order": 8
      }
    ],
    "newsletter": [
      {
        "id": "news-202606",
        "issue": "2026-06",
        "title": "親苑時報 2026年6月號",
        "date": "2026-06-01",
        "link": "https://twgo.io/bqkop",
        "cover": "",
        "order": 1
      },
      {
        "id": "news-202605",
        "issue": "2026-05",
        "title": "親苑時報 2026年5月號",
        "date": "2026-05-01",
        "link": "https://meee.ing/8f8d2e",
        "cover": "",
        "order": 2
      },
      {
        "id": "news-202604",
        "issue": "2026-04",
        "title": "親苑時報 2026年4月號",
        "date": "2026-04-01",
        "link": "https://srt.tw/fNnZdY",
        "cover": "",
        "order": 3
      },
      {
        "id": "news-202603",
        "issue": "2026-03",
        "title": "親苑時報 2026年3月號",
        "date": "2026-03-01",
        "link": "https://meee.ing/831c61",
        "cover": "",
        "order": 4
      },
      {
        "id": "news-202602",
        "issue": "2026-02",
        "title": "親苑時報 2026年2月號",
        "date": "2026-02-01",
        "link": "https://meee.ing/7471e5",
        "cover": "",
        "order": 5
      },
      {
        "id": "news-202601",
        "issue": "2026-01",
        "title": "親苑時報 2026年1月號",
        "date": "2026-01-01",
        "link": "https://meee.ing/f9a654",
        "cover": "",
        "order": 6
      },
      {
        "id": "news-202512",
        "issue": "2025-12",
        "title": "親苑時報 2025年12月號",
        "date": "2025-12-01",
        "link": "https://meee.ing/9a5fd3",
        "cover": "",
        "order": 7
      },
      {
        "id": "news-202511",
        "issue": "2025-11",
        "title": "親苑時報 2025年11月號",
        "date": "2025-11-01",
        "link": "https://twgo.io/yasks",
        "cover": "",
        "order": 8
      },
      {
        "id": "news-202510",
        "issue": "2025-10",
        "title": "親苑時報 2025年10月號",
        "date": "2025-10-01",
        "link": "https://twgo.io/mskxz",
        "cover": "",
        "order": 9
      },
      {
        "id": "news-202509",
        "issue": "2025-09",
        "title": "親苑時報 2025年9月號",
        "date": "2025-09-01",
        "link": "https://twgo.io/whuyr",
        "cover": "",
        "order": 10
      },
      {
        "id": "news-202508",
        "issue": "2025-08",
        "title": "親苑時報 2025年8月號",
        "date": "2025-08-01",
        "link": "https://twgo.io/fmtpu",
        "cover": "",
        "order": 11
      },
      {
        "id": "news-202507",
        "issue": "2025-07",
        "title": "親苑時報 2025年7月號",
        "date": "2025-07-01",
        "link": "https://supr.link/IBEyN",
        "cover": "",
        "order": 12
      },
      {
        "id": "news-202506",
        "issue": "2025-06",
        "title": "親苑時報 2025年6月號",
        "date": "2025-06-01",
        "link": "https://supr.link/UiWWj",
        "cover": "",
        "order": 13
      },
      {
        "id": "news-202505",
        "issue": "2025-05",
        "title": "親苑時報 2025年5月號",
        "date": "2025-05-01",
        "link": "https://supr.link/P73IH",
        "cover": "",
        "order": 14
      },
      {
        "id": "news-202504",
        "issue": "2025-04",
        "title": "親苑時報 2025年4月號",
        "date": "2025-04-01",
        "link": "https://supr.link/rLdfF",
        "cover": "",
        "order": 15
      },
      {
        "id": "news-202503",
        "issue": "2025-03",
        "title": "親苑時報 2025年3月號",
        "date": "2025-03-01",
        "link": "https://supr.link/Y4NrV",
        "cover": "",
        "order": 16
      },
      {
        "id": "news-202502",
        "issue": "2025-02",
        "title": "親苑時報 2025年2月號",
        "date": "2025-02-01",
        "link": "https://supr.link/3JvF2",
        "cover": "",
        "order": 17
      },
      {
        "id": "news-202501",
        "issue": "2025-01",
        "title": "親苑時報 2025年1月號",
        "date": "2025-01-01",
        "link": "https://supr.link/geOHP",
        "cover": "",
        "order": 18
      },
      {
        "id": "news-202412",
        "issue": "2024-12",
        "title": "親苑時報 2024年12月號",
        "date": "2024-12-01",
        "link": "https://supr.link/uZH2M",
        "cover": "",
        "order": 19
      },
      {
        "id": "news-202411",
        "issue": "2024-11",
        "title": "親苑時報 2024年11月號",
        "date": "2024-11-01",
        "link": "https://supr.link/hpVGP",
        "cover": "",
        "order": 20
      },
      {
        "id": "news-202410",
        "issue": "2024-10",
        "title": "親苑時報 2024年10月號",
        "date": "2024-10-01",
        "link": "https://supr.link/7EGbe",
        "cover": "",
        "order": 21
      },
      {
        "id": "news-202409",
        "issue": "2024-09",
        "title": "親苑時報 2024年9月號",
        "date": "2024-09-01",
        "link": "https://supr.link/0oABk",
        "cover": "",
        "order": 22
      },
      {
        "id": "news-202408",
        "issue": "2024-08",
        "title": "親苑時報 2024年8月號",
        "date": "2024-08-01",
        "link": "https://supr.link/jOxeI",
        "cover": "",
        "order": 23
      },
      {
        "id": "news-202407",
        "issue": "2024-07",
        "title": "親苑時報 2024年7月號",
        "date": "2024-07-01",
        "link": "https://supr.link/u2K0w",
        "cover": "",
        "order": 24
      },
      {
        "id": "news-202406",
        "issue": "2024-06",
        "title": "親苑時報 2024年6月號",
        "date": "2024-06-01",
        "link": "https://supr.link/l7Lbn",
        "cover": "",
        "order": 25
      },
      {
        "id": "news-202405",
        "issue": "2024-05",
        "title": "親苑時報 2024年5月號",
        "date": "2024-05-01",
        "link": "https://supr.link/I4adR",
        "cover": "",
        "order": 26
      },
      {
        "id": "news-202404",
        "issue": "2024-04",
        "title": "親苑時報 2024年4月號",
        "date": "2024-04-01",
        "link": "https://supr.link/jK53E",
        "cover": "",
        "order": 27
      },
      {
        "id": "news-202403",
        "issue": "2024-03",
        "title": "親苑時報 2024年3月號",
        "date": "2024-03-01",
        "link": "https://supr.link/ldLyp",
        "cover": "",
        "order": 28
      },
      {
        "id": "news-202402",
        "issue": "2024-02",
        "title": "親苑時報 2024年2月號",
        "date": "2024-02-01",
        "link": "https://supr.link/YC1TM",
        "cover": "",
        "order": 29
      },
      {
        "id": "news-202401",
        "issue": "2024-01",
        "title": "親苑時報 2024年1月號",
        "date": "2024-01-01",
        "link": "https://supr.link/n8L0V",
        "cover": "",
        "order": 30
      },
      {
        "id": "news-202312",
        "issue": "2023-12",
        "title": "親苑時報 2023年12月號",
        "date": "2023-12-01",
        "link": "https://supr.link/uGedx",
        "cover": "",
        "order": 31
      },
      {
        "id": "news-202311",
        "issue": "2023-11",
        "title": "親苑時報 2023年11月號",
        "date": "2023-11-01",
        "link": "https://supr.link/Iw1qu",
        "cover": "",
        "order": 32
      },
      {
        "id": "news-202310",
        "issue": "2023-10",
        "title": "親苑時報 2023年10月號",
        "date": "2023-10-01",
        "link": "https://supr.link/HdBrQ",
        "cover": "",
        "order": 33
      },
      {
        "id": "news-202309",
        "issue": "2023-09",
        "title": "親苑時報 2023年9月號",
        "date": "2023-09-01",
        "link": "https://supr.link/6TWus",
        "cover": "",
        "order": 34
      },
      {
        "id": "news-202308",
        "issue": "2023-08",
        "title": "親苑時報 2023年8月號",
        "date": "2023-08-01",
        "link": "https://supr.link/QXsbQ",
        "cover": "",
        "order": 35
      },
      {
        "id": "news-202307",
        "issue": "2023-07",
        "title": "親苑時報 2023年7月號",
        "date": "2023-07-01",
        "link": "https://supr.link/Jira6",
        "cover": "",
        "order": 36
      },
      {
        "id": "news-202306",
        "issue": "2023-06",
        "title": "親苑時報 2023年6月號",
        "date": "2023-06-01",
        "link": "https://supr.link/ejanA",
        "cover": "",
        "order": 37
      },
      {
        "id": "news-202305",
        "issue": "2023-05",
        "title": "親苑時報 2023年5月號",
        "date": "2023-05-01",
        "link": "https://supr.link/Sll9s",
        "cover": "",
        "order": 38
      },
      {
        "id": "news-202304",
        "issue": "2023-04",
        "title": "親苑時報 2023年4月號",
        "date": "2023-04-01",
        "link": "https://supr.link/AOWwv",
        "cover": "",
        "order": 39
      },
      {
        "id": "news-202303",
        "issue": "2023-03",
        "title": "親苑時報 2023年3月號",
        "date": "2023-03-01",
        "link": "https://supr.link/cFyYd",
        "cover": "",
        "order": 40
      },
      {
        "id": "news-202302",
        "issue": "2023-02",
        "title": "親苑時報 2023年2月號",
        "date": "2023-02-01",
        "link": "https://supr.link/3jThn",
        "cover": "",
        "order": 41
      },
      {
        "id": "news-202301",
        "issue": "2023-01",
        "title": "親苑時報 2023年1月號",
        "date": "2023-01-01",
        "link": "https://supr.link/Ecqm0",
        "cover": "",
        "order": 42
      },
      {
        "id": "news-202212",
        "issue": "2022-12",
        "title": "親苑時報 2022年12月號",
        "date": "2022-12-01",
        "link": "https://supr.link/vtojo",
        "cover": "",
        "order": 43
      },
      {
        "id": "news-202211",
        "issue": "2022-11",
        "title": "親苑時報 2022年11月號",
        "date": "2022-11-01",
        "link": "https://supr.link/tw5Ie",
        "cover": "",
        "order": 44
      },
      {
        "id": "news-202210",
        "issue": "2022-10",
        "title": "親苑時報 2022年10月號",
        "date": "2022-10-01",
        "link": "https://supr.link/0PScD",
        "cover": "",
        "order": 45
      },
      {
        "id": "news-202209",
        "issue": "2022-09",
        "title": "親苑時報 2022年9月號",
        "date": "2022-09-01",
        "link": "https://supr.link/zu92w",
        "cover": "",
        "order": 46
      },
      {
        "id": "news-202208",
        "issue": "2022-08",
        "title": "親苑時報 2022年8月號",
        "date": "2022-08-01",
        "link": "https://supr.link/RXIEw",
        "cover": "",
        "order": 47
      },
      {
        "id": "news-202207",
        "issue": "2022-07",
        "title": "親苑時報 2022年7月號",
        "date": "2022-07-01",
        "link": "https://supr.link/ODWwq",
        "cover": "",
        "order": 48
      },
      {
        "id": "news-202206",
        "issue": "2022-06",
        "title": "親苑時報 2022年6月號",
        "date": "2022-06-01",
        "link": "https://supr.link/wM0S1",
        "cover": "",
        "order": 49
      },
      {
        "id": "news-202205",
        "issue": "2022-05",
        "title": "親苑時報 2022年5月號",
        "date": "2022-05-01",
        "link": "https://supr.link/2MA2A",
        "cover": "",
        "order": 50
      },
      {
        "id": "news-202204",
        "issue": "2022-04",
        "title": "親苑時報 2022年4月號",
        "date": "2022-04-01",
        "link": "https://supr.link/FZiB2",
        "cover": "",
        "order": 51
      },
      {
        "id": "news-202203",
        "issue": "2022-03",
        "title": "親苑時報 2022年3月號",
        "date": "2022-03-01",
        "link": "https://supr.link/tinsA",
        "cover": "",
        "order": 52
      },
      {
        "id": "news-202202",
        "issue": "2022-02",
        "title": "親苑時報 2022年2月號",
        "date": "2022-02-01",
        "link": "https://supr.link/pEx1U",
        "cover": "",
        "order": 53
      },
      {
        "id": "news-202201",
        "issue": "2022-01",
        "title": "親苑時報 2022年1月號",
        "date": "2022-01-01",
        "link": "https://supr.link/220n3",
        "cover": "",
        "order": 54
      },
      {
        "id": "news-202112",
        "issue": "2021-12",
        "title": "親苑時報 2021年12月號",
        "date": "2021-12-01",
        "link": "https://supr.link/RbnfH",
        "cover": "",
        "order": 55
      },
      {
        "id": "news-202111",
        "issue": "2021-11",
        "title": "親苑時報 2021年11月號",
        "date": "2021-11-01",
        "link": "https://supr.link/95EKo",
        "cover": "",
        "order": 56
      },
      {
        "id": "news-202110",
        "issue": "2021-10",
        "title": "親苑時報 2021年10月號",
        "date": "2021-10-01",
        "link": "https://supr.link/ZWjoZ",
        "cover": "",
        "order": 57
      },
      {
        "id": "news-202109",
        "issue": "2021-09",
        "title": "親苑時報 2021年9月號",
        "date": "2021-09-01",
        "link": "https://supr.link/3XplT",
        "cover": "",
        "order": 58
      },
      {
        "id": "news-202108",
        "issue": "2021-08",
        "title": "親苑時報 2021年8月號",
        "date": "2021-08-01",
        "link": "https://supr.link/F5vC3",
        "cover": "",
        "order": 59
      },
      {
        "id": "news-202107",
        "issue": "2021-07",
        "title": "親苑時報 2021年7月號",
        "date": "2021-07-01",
        "link": "https://supr.link/i3q8O",
        "cover": "",
        "order": 60
      },
      {
        "id": "news-202106",
        "issue": "2021-06",
        "title": "親苑時報 2021年6月號",
        "date": "2021-06-01",
        "link": "https://supr.link/GSuZ4",
        "cover": "",
        "order": 61
      },
      {
        "id": "news-202105",
        "issue": "2021-05",
        "title": "親苑時報 2021年5月號",
        "date": "2021-05-01",
        "link": "https://supr.link/xTseQ",
        "cover": "",
        "order": 62
      },
      {
        "id": "news-202104",
        "issue": "2021-04",
        "title": "親苑時報 2021年4月號",
        "date": "2021-04-01",
        "link": "https://supr.link/PpHnd",
        "cover": "",
        "order": 63
      },
      {
        "id": "news-202103",
        "issue": "2021-03",
        "title": "親苑時報 2021年3月號",
        "date": "2021-03-01",
        "link": "https://supr.link/o37FG",
        "cover": "",
        "order": 64
      },
      {
        "id": "news-202102",
        "issue": "2021-02",
        "title": "親苑時報 2021年2月號",
        "date": "2021-02-01",
        "link": "https://supr.link/ldmxJ",
        "cover": "",
        "order": 65
      },
      {
        "id": "news-202101",
        "issue": "2021-01",
        "title": "親苑時報 2021年1月號",
        "date": "2021-01-01",
        "link": "https://supr.link/YVoCa",
        "cover": "",
        "order": 66
      },
      {
        "id": "news-202012",
        "issue": "2020-12",
        "title": "親苑時報 2020年12月號",
        "date": "2020-12-01",
        "link": "https://drive.google.com/file/d/1PwosxhePHAQWWZjaWTc0WpLw_ypmMvAs/view",
        "cover": "",
        "order": 67
      },
      {
        "id": "news-202011",
        "issue": "2020-11",
        "title": "親苑時報 2020年11月號",
        "date": "2020-11-01",
        "link": "https://drive.google.com/file/d/1hhFV2GSQqHeC9dlc68eGpK9IRcZdnau-/view",
        "cover": "",
        "order": 68
      },
      {
        "id": "news-202010",
        "issue": "2020-10",
        "title": "親苑時報 2020年10月號",
        "date": "2020-10-01",
        "link": "https://drive.google.com/file/d/1oDQ32ogJy0rXyy9WHwTVscfYr6mJy2JM/view",
        "cover": "",
        "order": 69
      },
      {
        "id": "news-202009",
        "issue": "2020-09",
        "title": "親苑時報 2020年9月號",
        "date": "2020-09-01",
        "link": "https://drive.google.com/file/d/1fjhaUF_97okvVTMrZTUv5ccAzk5bh-cT/view",
        "cover": "",
        "order": 70
      },
      {
        "id": "news-202008",
        "issue": "2020-08",
        "title": "親苑時報 2020年8月號",
        "date": "2020-08-01",
        "link": "https://drive.google.com/file/d/1K6z03Talz9IGXysCvot-qc9n2bYOiN8i/view",
        "cover": "",
        "order": 71
      },
      {
        "id": "news-202007",
        "issue": "2020-07",
        "title": "親苑時報 2020年7月號",
        "date": "2020-07-01",
        "link": "https://drive.google.com/file/d/1Z7mpKC-YwoORP5yd8vNMdvg1K_xlHlVH/view",
        "cover": "",
        "order": 72
      },
      {
        "id": "news-202006",
        "issue": "2020-06",
        "title": "親苑時報 2020年6月號",
        "date": "2020-06-01",
        "link": "https://drive.google.com/file/d/1ls_NhA8sUEvM6VXd1btU3493wsIWMClz/view",
        "cover": "",
        "order": 73
      },
      {
        "id": "news-202005",
        "issue": "2020-05",
        "title": "親苑時報 2020年5月號",
        "date": "2020-05-01",
        "link": "https://drive.google.com/file/d/1GtD972FFnet3-NhjPHgvxhCAH3t68G56/view",
        "cover": "",
        "order": 74
      },
      {
        "id": "news-202004",
        "issue": "2020-04",
        "title": "親苑時報 2020年4月號",
        "date": "2020-04-01",
        "link": "https://drive.google.com/file/d/1Txge5NoO2-YXhywRw5NTrZLJipt3fYlt/view",
        "cover": "",
        "order": 75
      },
      {
        "id": "news-202003",
        "issue": "2020-03",
        "title": "親苑時報 2020年3月號",
        "date": "2020-03-01",
        "link": "https://drive.google.com/file/d/1gupi-vZpzwYf_qGcPFt3gVf5vqiHhU2K/view",
        "cover": "",
        "order": 76
      },
      {
        "id": "news-202002",
        "issue": "2020-02",
        "title": "親苑時報 2020年2月號",
        "date": "2020-02-01",
        "link": "https://drive.google.com/file/d/1Gm8h9wPaAyASyOHS8QyG-WnBGn5ayEO2/view",
        "cover": "",
        "order": 77
      },
      {
        "id": "news-202001",
        "issue": "2020-01",
        "title": "親苑時報 2020年1月號",
        "date": "2020-01-01",
        "link": "https://drive.google.com/file/d/1fBEPSLmi6VEPav5Tbcp0PEmuvJ_El4V2/view",
        "cover": "",
        "order": 78
      },
      {
        "id": "news-201912",
        "issue": "2019-12",
        "title": "親苑時報 2019年12月號",
        "date": "2019-12-01",
        "link": "https://drive.google.com/file/d/1juMwvf9m3TAGfcTbZAsU2L_nOLFcuqAa/view",
        "cover": "",
        "order": 79
      },
      {
        "id": "news-201911",
        "issue": "2019-11",
        "title": "親苑時報 2019年11月號",
        "date": "2019-11-01",
        "link": "https://drive.google.com/file/d/1hIDirFiSTNLW4W0yfcNAyCJyv5BZMroy/view",
        "cover": "",
        "order": 80
      },
      {
        "id": "news-201910",
        "issue": "2019-10",
        "title": "親苑時報 2019年10月號",
        "date": "2019-10-01",
        "link": "https://drive.google.com/file/d/1_u7lwWyet8szIeLQx6S6qCtOcdgP0pON/view",
        "cover": "",
        "order": 81
      },
      {
        "id": "news-201909",
        "issue": "2019-09",
        "title": "親苑時報 2019年9月號",
        "date": "2019-09-01",
        "link": "https://drive.google.com/file/d/1Q3-uoFapD3ZMzplVJTzUp19j485xjhYk/view",
        "cover": "",
        "order": 82
      },
      {
        "id": "news-201908",
        "issue": "2019-08",
        "title": "親苑時報 2019年8月號",
        "date": "2019-08-01",
        "link": "https://drive.google.com/file/d/1zbBtSRYF2lVC2RX-97GBYDdhP7_7cqmh/view",
        "cover": "",
        "order": 83
      },
      {
        "id": "news-201907",
        "issue": "2019-07",
        "title": "親苑時報 2019年7月號",
        "date": "2019-07-01",
        "link": "https://drive.google.com/file/d/1jm8kCXyLDxVslGFWGSodRAAMFMqj3fAC/view",
        "cover": "",
        "order": 84
      },
      {
        "id": "news-201906",
        "issue": "2019-06",
        "title": "親苑時報 2019年6月號",
        "date": "2019-06-01",
        "link": "https://drive.google.com/file/d/1QNzjBpJNKNhulLbGUwL64ML2qK9oaJk2/view",
        "cover": "",
        "order": 85
      },
      {
        "id": "news-201905",
        "issue": "2019-05",
        "title": "親苑時報 2019年5月號",
        "date": "2019-05-01",
        "link": "https://drive.google.com/file/d/1eZw-lSmFMXp6hrcp-wA7wK4kC1F_O7qr/view",
        "cover": "",
        "order": 86
      },
      {
        "id": "news-201904",
        "issue": "2019-04",
        "title": "親苑時報 2019年4月號",
        "date": "2019-04-01",
        "link": "https://drive.google.com/file/d/1qXNAfSbexsgMCmGj9elU2hcGenOTLyWp/view",
        "cover": "",
        "order": 87
      },
      {
        "id": "news-201903",
        "issue": "2019-03",
        "title": "親苑時報 2019年3月號",
        "date": "2019-03-01",
        "link": "https://drive.google.com/file/d/1Lxe0OZicGASkezmAF2rH7QCKfAnOcVrc/view",
        "cover": "",
        "order": 88
      },
      {
        "id": "news-201902",
        "issue": "2019-02",
        "title": "親苑時報 2019年2月號",
        "date": "2019-02-01",
        "link": "https://drive.google.com/file/d/1Z9dpRJpw-dslL3Oyfk8ESwLWTUyz7z7H/view",
        "cover": "",
        "order": 89
      },
      {
        "id": "news-201901",
        "issue": "2019-01",
        "title": "親苑時報 2019年1月號",
        "date": "2019-01-01",
        "link": "https://drive.google.com/file/d/1H9ikMMVuNVNDel_MKf1h7goJpj6lZ58U/view",
        "cover": "",
        "order": 90
      },
      {
        "id": "news-201812",
        "issue": "2018-12",
        "title": "親苑時報 2018年12月號",
        "date": "2018-12-01",
        "link": "https://drive.google.com/file/d/1bledk68aRNuFb7jqo2x2SuDcTjurxKv4/view",
        "cover": "",
        "order": 91
      },
      {
        "id": "news-201811",
        "issue": "2018-11",
        "title": "親苑時報 2018年11月號",
        "date": "2018-11-01",
        "link": "https://drive.google.com/file/d/1_e6AGPhGJWLVx744uwc1_awbASbtQ62w/view",
        "cover": "",
        "order": 92
      },
      {
        "id": "news-201810",
        "issue": "2018-10",
        "title": "親苑時報 2018年10月號",
        "date": "2018-10-01",
        "link": "https://drive.google.com/file/d/1SOAjtW36Tkp_mLzRkc0MeDdwILJ85STg/view",
        "cover": "",
        "order": 93
      },
      {
        "id": "news-201809",
        "issue": "2018-09",
        "title": "親苑時報 2018年9月號",
        "date": "2018-09-01",
        "link": "https://drive.google.com/file/d/1bwA3d-sUagbDbNUXLMqYwVgOaykw7-ij/view",
        "cover": "",
        "order": 94
      },
      {
        "id": "news-201808",
        "issue": "2018-08",
        "title": "親苑時報 2018年8月號",
        "date": "2018-08-01",
        "link": "https://drive.google.com/file/d/1dQGymGysWqVOgoSkuKm-nJNtK1t96Pmr/view",
        "cover": "",
        "order": 95
      },
      {
        "id": "news-201807",
        "issue": "2018-07",
        "title": "親苑時報 2018年7月號",
        "date": "2018-07-01",
        "link": "https://drive.google.com/file/d/1aTBLvGcs1BZFr_-07figMkPwbJH5r10b/view",
        "cover": "",
        "order": 96
      },
      {
        "id": "news-201806",
        "issue": "2018-06",
        "title": "親苑時報 2018年6月號",
        "date": "2018-06-01",
        "link": "https://drive.google.com/file/d/1uAaNP4Mc8_9lJaOpfpNg3x5OJNgmFEsA/view",
        "cover": "",
        "order": 97
      },
      {
        "id": "news-201805",
        "issue": "2018-05",
        "title": "親苑時報 2018年5月號",
        "date": "2018-05-01",
        "link": "https://drive.google.com/file/d/1N3fYohep7J2zbhPXvwJkiqjQeif7pF0j/view",
        "cover": "",
        "order": 98
      },
      {
        "id": "news-201804",
        "issue": "2018-04",
        "title": "親苑時報 2018年4月號",
        "date": "2018-04-01",
        "link": "https://drive.google.com/file/d/1exCUSyw9584V_H2oHIql-p2rVio5g8f3/view",
        "cover": "",
        "order": 99
      },
      {
        "id": "news-201803",
        "issue": "2018-03",
        "title": "親苑時報 2018年3月號",
        "date": "2018-03-01",
        "link": "https://drive.google.com/file/d/1PmOv4Un5oiyigJBQMUR5h5dEE2hgN8os/view",
        "cover": "",
        "order": 100
      },
      {
        "id": "news-201802",
        "issue": "2018-02",
        "title": "親苑時報 2018年2月號",
        "date": "2018-02-01",
        "link": "https://drive.google.com/file/d/1piRQpw8eO8JfOD9V1xU9-I3hciDaKlUj/view",
        "cover": "",
        "order": 101
      },
      {
        "id": "news-201801",
        "issue": "2018-01",
        "title": "親苑時報 2018年1月號",
        "date": "2018-01-01",
        "link": "https://drive.google.com/file/d/1_FRVM6u8z8QkQExkKEWmvs7KIb_lbcWl/view",
        "cover": "",
        "order": 102
      },
      {
        "id": "news-201712",
        "issue": "2017-12",
        "title": "親苑時報 2017年12月號",
        "date": "2017-12-01",
        "link": "https://drive.google.com/file/d/1Wa4CSJA6428yKwx04F0OIcFykLTGZTjN/view",
        "cover": "",
        "order": 103
      },
      {
        "id": "news-201711",
        "issue": "2017-11",
        "title": "親苑時報 2017年11月號",
        "date": "2017-11-01",
        "link": "https://drive.google.com/file/d/1KPexRtCh5ruA0vnqwc10XzoY2_zBSYk8/view",
        "cover": "",
        "order": 104
      },
      {
        "id": "news-201710",
        "issue": "2017-10",
        "title": "親苑時報 2017年10月號",
        "date": "2017-10-01",
        "link": "https://drive.google.com/file/d/1_bMrX5P544vlqUygSpYYevFUDCt9dK68/view",
        "cover": "",
        "order": 105
      },
      {
        "id": "news-201709",
        "issue": "2017-09",
        "title": "親苑時報 2017年9月號",
        "date": "2017-09-01",
        "link": "https://drive.google.com/file/d/1dL13kuqGILh6md-YhLTMigl3qcVhRlHl/view",
        "cover": "",
        "order": 106
      },
      {
        "id": "news-201708",
        "issue": "2017-08",
        "title": "親苑時報 2017年8月號",
        "date": "2017-08-01",
        "link": "https://drive.google.com/file/d/1fV-_VXBy5Q1nuEjYvUuUzost5ZBlvbpR/view",
        "cover": "",
        "order": 107
      },
      {
        "id": "news-201707",
        "issue": "2017-07",
        "title": "親苑時報 2017年7月號",
        "date": "2017-07-01",
        "link": "https://drive.google.com/file/d/1ITk5Yg4oWk_ZOFkX0sBnYJlm7LfsfAdc/view",
        "cover": "",
        "order": 108
      },
      {
        "id": "news-201706",
        "issue": "2017-06",
        "title": "親苑時報 2017年6月號",
        "date": "2017-06-01",
        "link": "https://drive.google.com/file/d/1uYv6ppOssaBEo3eP50uVMxP9O5GOrtxW/view",
        "cover": "",
        "order": 109
      },
      {
        "id": "news-201705",
        "issue": "2017-05",
        "title": "親苑時報 2017年5月號",
        "date": "2017-05-01",
        "link": "https://drive.google.com/file/d/1c0CD2rEfzYtQMNcq-b5SgRVLCPuTLz8p/view",
        "cover": "",
        "order": 110
      },
      {
        "id": "news-201704",
        "issue": "2017-04",
        "title": "親苑時報 2017年4月號",
        "date": "2017-04-01",
        "link": "https://drive.google.com/file/d/1VBqoDFzTYjyFXmhe2t3Uc2Q4Gx0NdCMm/view",
        "cover": "",
        "order": 111
      },
      {
        "id": "news-201703",
        "issue": "2017-03",
        "title": "親苑時報 2017年3月號",
        "date": "2017-03-01",
        "link": "https://drive.google.com/file/d/1J2Z90JLvtiUvxrv-UEMtPtGKuPveD1PF/view",
        "cover": "",
        "order": 112
      },
      {
        "id": "news-201702",
        "issue": "2017-02",
        "title": "親苑時報 2017年2月號",
        "date": "2017-02-01",
        "link": "https://drive.google.com/file/d/1TbtKCjMoCy2zog0cnpi0syO6br9YH4l_/view",
        "cover": "",
        "order": 113
      },
      {
        "id": "news-201701",
        "issue": "2017-01",
        "title": "親苑時報 2017年1月號",
        "date": "2017-01-01",
        "link": "https://drive.google.com/file/d/1TMh7ILv-aeoFiB1CazexsMliB3CkQY4y/view",
        "cover": "",
        "order": 114
      }
    ],
    "dharma": [
      {
        "id": "dh-48",
        "title": "瑞聲法語 第48號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://srt.tw/k9pLsY",
        "order": 1
      },
      {
        "id": "dh-47",
        "title": "瑞聲法語 第47號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/2TzKS",
        "order": 2
      },
      {
        "id": "dh-46",
        "title": "瑞聲法語 第46號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/3kVzi",
        "order": 3
      },
      {
        "id": "dh-45",
        "title": "瑞聲法語 第45號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/ayHsU",
        "order": 4
      },
      {
        "id": "dh-44",
        "title": "瑞聲法語 第44號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/NttLb",
        "order": 5
      },
      {
        "id": "dh-43",
        "title": "瑞聲法語 第43號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/ovUQg",
        "order": 6
      },
      {
        "id": "dh-42",
        "title": "瑞聲法語 第42號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/EqT9h",
        "order": 7
      },
      {
        "id": "dh-41",
        "title": "瑞聲法語 第41號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/GOWVi",
        "order": 8
      },
      {
        "id": "dh-40",
        "title": "瑞聲法語 第40號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/kZPii",
        "order": 9
      },
      {
        "id": "dh-39",
        "title": "瑞聲法語 第39號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/jbehJ",
        "order": 10
      },
      {
        "id": "dh-38",
        "title": "瑞聲法語 第38號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/IJlOZ",
        "order": 11
      },
      {
        "id": "dh-37",
        "title": "瑞聲法語 第37號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/K6SPj",
        "order": 12
      },
      {
        "id": "dh-36",
        "title": "瑞聲法語 第36號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/ebXfl",
        "order": 13
      },
      {
        "id": "dh-35",
        "title": "瑞聲法語 第35號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/Ijt3Y",
        "order": 14
      },
      {
        "id": "dh-34",
        "title": "瑞聲法語 第34號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/gzgUn",
        "order": 15
      },
      {
        "id": "dh-33",
        "title": "瑞聲法語 第33號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/SOkGS",
        "order": 16
      },
      {
        "id": "dh-32",
        "title": "瑞聲法語 第32號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/W6vz9",
        "order": 17
      },
      {
        "id": "dh-31",
        "title": "瑞聲法語 第31號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/4AleF",
        "order": 18
      },
      {
        "id": "dh-30",
        "title": "瑞聲法語 第30號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/ezrdm",
        "order": 19
      },
      {
        "id": "dh-29",
        "title": "瑞聲法語 第29號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/FD7rb",
        "order": 20
      },
      {
        "id": "dh-28",
        "title": "瑞聲法語 第28號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/uzGgb",
        "order": 21
      },
      {
        "id": "dh-27",
        "title": "瑞聲法語 第27號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/IACmF",
        "order": 22
      },
      {
        "id": "dh-26",
        "title": "瑞聲法語 第26號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/cqz1L",
        "order": 23
      },
      {
        "id": "dh-25",
        "title": "瑞聲法語 第25號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/p4LWQ",
        "order": 24
      },
      {
        "id": "dh-24",
        "title": "瑞聲法語 第24號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/ZjyUN",
        "order": 25
      },
      {
        "id": "dh-23",
        "title": "瑞聲法語 第23號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/cOUn2",
        "order": 26
      },
      {
        "id": "dh-22",
        "title": "瑞聲法語 第22號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/IK6vG",
        "order": 27
      },
      {
        "id": "dh-21",
        "title": "瑞聲法語 第21號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/D35sa",
        "order": 28
      },
      {
        "id": "dh-20",
        "title": "瑞聲法語 第20號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/h8BJI",
        "order": 29
      },
      {
        "id": "dh-19",
        "title": "瑞聲法語 第19號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/75s2S",
        "order": 30
      },
      {
        "id": "dh-18",
        "title": "瑞聲法語 第18號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/UdFU0",
        "order": 31
      },
      {
        "id": "dh-17",
        "title": "瑞聲法語 第17號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/4P1F7",
        "order": 32
      },
      {
        "id": "dh-16",
        "title": "瑞聲法語 第16號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/34oh3",
        "order": 33
      },
      {
        "id": "dh-15",
        "title": "瑞聲法語 第15號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/kIkln",
        "order": 34
      },
      {
        "id": "dh-14",
        "title": "瑞聲法語 第14號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/dk1jP",
        "order": 35
      },
      {
        "id": "dh-13",
        "title": "瑞聲法語 第13號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/kN9Oc",
        "order": 36
      },
      {
        "id": "dh-12",
        "title": "瑞聲法語 第12號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/bhDhX",
        "order": 37
      },
      {
        "id": "dh-11",
        "title": "瑞聲法語 第11號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/gWBn8",
        "order": 38
      },
      {
        "id": "dh-10",
        "title": "瑞聲法語 第10號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/UhwXK",
        "order": 39
      },
      {
        "id": "dh-09",
        "title": "瑞聲法語 第9號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/DHj0x",
        "order": 40
      },
      {
        "id": "dh-08",
        "title": "瑞聲法語 第8號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/bSC2H",
        "order": 41
      },
      {
        "id": "dh-07",
        "title": "瑞聲法語 第7號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/Y4v8M",
        "order": 42
      },
      {
        "id": "dh-06",
        "title": "瑞聲法語 第6號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/065mE",
        "order": 43
      },
      {
        "id": "dh-05",
        "title": "瑞聲法語 第5號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/ULpTP",
        "order": 44
      },
      {
        "id": "dh-04",
        "title": "瑞聲法語 第4號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/KLWJ2",
        "order": 45
      },
      {
        "id": "dh-03",
        "title": "瑞聲法語 第3號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/P1aT1",
        "order": 46
      },
      {
        "id": "dh-02",
        "title": "瑞聲法語 第2號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/RY9Tk",
        "order": 47
      },
      {
        "id": "dh-01",
        "title": "瑞聲法語 第1號",
        "category": "瑞聲法語",
        "date": "",
        "content": "（點選下方連結閱讀本則瑞聲法語全文）",
        "link": "https://supr.link/zGyQJ",
        "order": 48
      }
    ],
    "tools": [
      {
        "id": "tool-history-today",
        "title": "真如苑史上的今天",
        "desc": "依日期查閱真如苑史上的重要事件。",
        "link": "https://angewoo.github.io/-search/",
        "icon": "史",
        "order": 1
      },
      {
        "id": "tool-quote",
        "title": "真如拔苦代受靈訓",
        "desc": "隨機閱讀拔苦代受相關靈訓。",
        "link": "https://angewoo.github.io/quote/",
        "icon": "訓",
        "order": 2
      },
      {
        "id": "tool-17",
        "title": "法母17訓",
        "desc": "快速研讀法母十七訓。",
        "link": "https://supr.link/xrUjU",
        "icon": "17",
        "order": 3
      },
      {
        "id": "tool-song-calendar",
        "title": "苑歌月曆",
        "desc": "以月曆方式瀏覽苑歌內容。",
        "link": "https://supr.link/zx2lz",
        "icon": "歌",
        "order": 4
      },
      {
        "id": "tool-history",
        "title": "真如苑史",
        "desc": "查閱真如苑歷史資料。",
        "link": "https://supr.link/X2LmQ",
        "icon": "苑",
        "order": 5
      }
    ]
  };
  Object.keys(DATA).forEach(function (type) {
    if (listRecords(type).length > 0) return;
    DATA[type].forEach(function (rec) { createRecord(type, rec); });
  });
  PROP.setProperty('SEEDED', '1');
}

/**
 * 重新載入真實資料：清空所有分頁的資料列（保留標頭），再灌入最新種子（190 筆）。
 * 用於「已用舊版 setup() 建表、只有少量範例」的情況。執行一次即可。
 * 注意：會覆蓋你目前各分頁的內容，請先確認。
 */
function forceReseed() {
  Object.keys(SCHEMA).forEach(function (type) {
    var def = SCHEMA[type];
    var sh = sheetFor(type);
    // 重設第一列標頭為最新 schema（補上新增的欄位，如行事曆的 link）
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    // 清資料列，保留標頭
    var lastRow = sh.getLastRow();
    if (lastRow > 1) sh.deleteRows(2, lastRow - 1);
  });
  PROP.deleteProperty('SEEDED');
  seedSampleData();
  return '已重新載入真實資料（Podcast 16 / 親苑時報 114 / 行事曆 8 / 瑞聲法語 48 / 最新消息 4）。';
}

/**
 * 查出「網站實際使用的資料庫」是哪一份。
 * 執行後看「執行紀錄」會印出該試算表的網址，點進去就是有資料的那一份；
 * Drive 裡其他同名檔案即為重複，可刪除以免混淆。
 */
function whichDatabase() {
  var ss = getSpreadsheet();
  var url = ss.getUrl();
  var counts = Object.keys(SCHEMA).map(function (t) { return t + '=' + listRecords(t).length; }).join(', ');
  Logger.log('使用中的資料庫：' + ss.getName());
  Logger.log('網址：' + url);
  Logger.log('筆數：' + counts);
  return url + '  |  ' + counts;
}
