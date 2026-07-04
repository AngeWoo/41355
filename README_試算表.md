# Google 試算表說明

## 方式 A（推薦）：讓 GAS 自動建立試算表
1. 在 [script.google.com](https://script.google.com) 貼上 `gas/Code.gs`，存檔。
2. 函式選單選 **`setup`** → 按「執行」→ 授權。
3. 執行後，到你的 [Google 雲端硬碟](https://drive.google.com) 會看到一份新檔：
  **「真如苑資料網站 — 資料庫」**，裡面已自動建立各分頁與範例資料。
   （試算表網址也會顯示在 Apps Script 的「執行紀錄」中。）

> 不需要自己開試算表，setup() 全自動處理。

---

## 方式 B：用這裡的 CSV 範本自己建表
本資料夾提供各分頁 CSV 範本。任選其一：

**B-1 直接匯入既有試算表的分頁**
- Google 試算表 → 檔案 → 匯入 → 上傳對應 CSV → 選「插入新工作表」。
- 工作表名稱請改成與分頁相同：`最新消息`、`Podcast`、`行事曆`、`總部會聯絡事項`、`親苑時報`、`瑞聲法語`、`互動程式`、`真如開講`、`會員`。

**B-2 讓 GAS 改用你指定的試算表**
1. 自己建立一份試算表，複製其網址中的 ID（`/d/` 與 `/edit` 之間那段）。
2. 在 Apps Script 編輯器執行一次以下程式碼（把 ID 換成你的）：
   ```js
   PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', '你的試算表ID');
   ```
3. 再執行 `setup()`，程式會在這份試算表補上缺少的分頁與標頭。

---

## 分頁與欄位對照
| 分頁（工作表名稱） | 欄位（第一列標頭） |
|---|---|
| 最新消息 | id, title, date, body, link, pinned, order, createdAt, updatedAt |
| Podcast | id, ep, title, guest, date, desc, link, cover, order, createdAt, updatedAt |
| 行事曆 | id, date, title, location, desc, tag, order, createdAt, updatedAt |
| 總部會聯絡事項 | id, date, title, category, body, link, order, createdAt, updatedAt |
| 親苑時報 | id, issue, title, date, link, cover, order, createdAt, updatedAt |
| 瑞聲法語 | id, title, category, date, content, link, cover, order, createdAt, updatedAt |
| 互動程式 | id, title, date, desc, link, icon, order, createdAt, updatedAt |
| 真如開講 | id, title, icon, desc, link, order, createdAt, updatedAt |
| 會員 | id, name, email, mobile, createdAt, updatedAt |

- `id`：每筆唯一識別碼。透過後台新增時會自動產生（UUID）；手動建表時請自填不重複的值。
- `order`：排序，數字越小越前。
- `createdAt` / `updatedAt`：系統自動填寫，手動建表時可留空。
- `pinned`：填 `TRUE` 表示置頂，留空表示否。
