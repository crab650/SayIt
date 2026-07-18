# Implementation Plan — 可部署至 PythonAnywhere 的 Flask + SQLite 同步版本

## 1. 目標與本期範圍

本期將 SayIt 從純前端 LocalStorage 應用，擴充為可部署至 **PythonAnywhere** 的單站式 PWA：

- Flask 同時提供現有前端檔案與 `/api/*` 同步 API。
- SQLite 儲存帳號、分頁內容、版本及刪除紀錄。
- 使用者登入同一帳號後，可在桌面、手機及 PWA 之間同步。
- 本地仍以 LocalStorage 工作；離線時可繼續編輯，上線後補同步。
- 偵測雙端修改，不以 Last-Write-Wins 靜默覆蓋內容。
- 支援部署在 `https://<username>.pythonanywhere.com`。

本期不包含 GitHub Gist、WebDAV、Supabase/Firebase、即時協作、WebSocket 和逐字 CRDT。這些可在同步協議穩定後，以 storage adapter 或後續版本加入。

---

## 2. 實作前待辨事項

下列事項應在開始實作前確認；未確認前採括號內的建議預設值：

1. **PythonAnywhere 帳號方案**：免費或付費方案，以及是否使用自訂網域。（預設先使用 `https://<username>.pythonanywhere.com`）
2. **帳號開放方式**：任何訪客可自行註冊，或只有管理者能建立帳號。（預設第一版開放註冊，但保留關閉註冊的環境設定）
3. **既有本地資料首次上雲策略**：雲端為空時是否自動匯入。（預設顯示資料摘要，使用者確認後整批匯入）
4. **本地與雲端都已有資料時的初次同步策略**：逐筆合併、整批覆蓋或另存備份。（預設逐筆合併；同 ID 不同內容視為衝突，絕不自動整批覆蓋）
5. **未登入模式**：是否繼續允許純本機使用。（預設允許，登入是選用功能）
6. **登出後的本機資料**：留在該裝置或清除。（預設保留，另提供明確的「清除此裝置資料」操作）
7. **共用裝置隱私**：是否需要登入後才顯示本機既有內容，或提供本機資料加密。（第一版不加密 LocalStorage，必須在 UI 清楚提示共用裝置風險）
8. **帳號與資料救援**：是否實作忘記密碼、管理者重設及資料匯出。（預設第一版至少提供 JSON 匯出／匯入；忘記密碼可先由管理者重設）
9. **內容與帳號限制**：單一分頁大小、分頁數量、帳號數量及同步 request 上限。（實作前設定保守上限，避免耗盡 PythonAnywhere 儲存與 worker）
10. **同步頻率**：只在存檔／回到前景／手動時同步，或加入固定輪詢。（預設事件觸發加前景每 60 秒 pull）
11. **衝突 UI 第一版範圍**：完整 side-by-side diff 或先提供兩份文字及三種處理按鈕。（預設先做可靠的選擇與手動合併，行級 diff 可後補）
12. **刪除保留期與備份頻率**：tombstone 保存多久、SQLite 多久備份一次。（預設 tombstone 90 天、每日備份並保留最近 7 份；依帳號方案調整）
13. **舊瀏覽器支援**：`crypto.randomUUID()` 不可用時是否需要 fallback。（預設提供 fallback）
14. **正式站是否保留 AI 功能**：現有 AI API key 的保存方式與 PythonAnywhere 部署是否一起調整。（預設與本次同步功能分開，不把 AI key 上傳至同步資料庫）

上述選擇應記錄在 README 或部署設定中，避免程式行為只存在口頭約定。

---

## 3. 既有 LocalStorage 資料遷移與保護

導入資料庫不代表用資料庫取代並清空 LocalStorage。SayIt 仍是 offline-first：LocalStorage 是裝置上的工作副本，SQLite 是跨裝置同步副本。既有資料必須採非破壞式遷移。

### 3.1 必須辨識的舊資料

- 分頁設定：`sayit-custom-tabs-v2`
- 目前分頁：`sayit-active-tab-id-v2`
- 「我的想法」內容：`sayit-content-v1`
- 「每日句子」內容：`sayit-daily-v1`
- 自訂分頁內容：`sayit-tab-content-<tabId>`
- 更舊的每日句子格式：`sayit-phrases-v1`

主題、Markdown 顯示模式和 AI key 等裝置設定預設不進入同步資料庫。

### 3.2 首次登入流程

1. 登入前不修改任何既有 LocalStorage key。
2. 登入成功後掃描上述 key，建立本地資料摘要：分頁數、內容筆數及最近本地修改時間。
3. 先向 server 取得該帳號的資料摘要，不立即 push 或 pull。
4. 若雲端為空而本地有資料，顯示「將此裝置現有資料匯入雲端」確認畫面。
5. 使用者確認後，把現有資料轉成 initial import operations；server 在 transaction 中全部接收或全部 rollback。
6. server 成功回傳 accepted revisions 後，才為本地項目寫入 `baseRevision` 和 sync cursor。
7. 原始內容繼續保留在 LocalStorage，不因上傳成功而刪除。

### 3.3 本地與雲端都有資料

- 不允許登入後自動以空資料覆蓋本地，也不允許自動以本地整批覆蓋雲端。
- 不同 tab ID 直接合併。
- 相同 tab ID 且內容相同，建立 revision 關聯即可。
- 相同 tab ID 但設定或內容不同，建立首次同步 conflict，讓使用者選擇本地、雲端或手動合併。
- 首次同步完成前，本地資料保持原狀，並允許取消。

### 3.4 遷移失敗與回復

- 遷移開始前，提供 JSON 備份下載；至少也要把 snapshot 存入獨立的 versioned LocalStorage backup key。
- 遷移狀態使用明確版本，例如 `sayit-sync-migration-version`，流程必須可重入；重新整理或斷線後可以安全重試。
- Server 回應失敗、逾時或只有部分 operation 被接受時，不移除或覆蓋原始本地內容。
- 不使用 `localStorage.clear()`。
- 舊 key 至少保留一個版本週期；只有使用者主動執行「清除此裝置資料」才移除。
- 提供 JSON 匯出及匯入作為資料救援途徑，並測試舊版資料能還原。

### 3.5 驗收條件

使用一份含有 `thoughts`、`phrases` 和自訂分頁的真實舊資料副本測試：升級、登入、首次匯入、重新整理、離線、登出及再次登入後，所有內容必須逐字一致。任何一步失敗時，舊版本頁面仍應能從原 LocalStorage key 讀回資料。

---

## 4. 部署架構

採用前後端同源架構：

```text
Browser / Installed PWA
  ├─ LocalStorage：本地內容、版本、待同步變更
  ├─ Service Worker：離線載入應用程式外殼
  └─ HTTPS /api/*
          │
PythonAnywhere WSGI
  └─ Flask
      ├─ 提供 index.html、JS、CSS、manifest、icon
      ├─ 帳號與 Session API
      ├─ 同步 API
      └─ instance/sayit.db
```

同源部署的好處：

- 前端固定呼叫相對路徑 `/api`，不再預設 `127.0.0.1`。
- 不需開放任意來源 CORS。
- 可使用 `Secure`、`HttpOnly`、`SameSite=Lax` Cookie。
- 手機和 PWA 直接連線 PythonAnywhere 網址。

本機開發仍由 Flask 提供網站，例如 `http://127.0.0.1:5000`；該網址只用於本機，不寫入正式 UI 預設值。

---

## 5. 專案結構

```text
SayIt/
├─ server/
│  ├─ __init__.py
│  ├─ app.py                 # create_app() 與路由
│  ├─ db.py                  # SQLite 連線、transaction、migration
│  ├─ auth.py                # 註冊、登入、登出、current user
│  ├─ sync.py                # 同步協議與衝突判定
│  ├─ schema.sql
│  └─ requirements.txt
├─ instance/                 # 不提交至 Git；PythonAnywhere 可寫目錄
│  └─ sayit.db
├─ tests/
│  ├─ test_auth.py
│  └─ test_sync.py
├─ index.html
├─ app.js
├─ sync-service.js
├─ styles.css
├─ sw.js
├─ manifest.webmanifest
├─ .env.example
└─ wsgi.py                   # PythonAnywhere WSGI 入口
```

`sayit.db`、環境密鑰、虛擬環境及測試產物必須加入 `.gitignore`。

---

## 6. 身分驗證與安全設計

### 4.1 Session

本期不把永久 JWT 放入 LocalStorage。登入成功後，由 Flask 建立有期限的簽章 Session Cookie：

- `HttpOnly=true`
- `Secure=true`（正式環境）
- `SameSite=Lax`
- 有明確有效期限，例如 30 天
- 登出時立即清除 Cookie

前端只查詢 `/api/auth/me` 判斷登入狀態，不能讀取憑證內容。

### 4.2 密碼與密鑰

- 密碼以 Werkzeug `generate_password_hash()` 儲存，不保存明文。
- 註冊時檢查帳號格式、密碼最小長度及 request size。
- `SECRET_KEY` 由 PythonAnywhere 環境或 WSGI 設定提供，不寫入 Git。
- 正式站只允許 HTTPS；回應增加基本安全標頭。
- 所有 SQL 使用參數化查詢。
- 登入與註冊加入簡單 rate limit；若第一版不引入套件，至少記錄失敗並預留反向代理限流設定。
- 所有資料查詢都必須包含 authenticated `user_id`，不得信任 client 傳入的 user ID。

由於前後端同源，正式版本預設不啟用 Flask-CORS。若未來分站部署，再以 allowlist 明確設定允許來源。

---

## 7. SQLite 資料模型

### `users`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | 使用者 ID |
| `username` | TEXT UNIQUE | 正規化後帳號 |
| `password_hash` | TEXT | 密碼雜湊 |
| `created_at` | INTEGER | Server Unix milliseconds |

### `tabs`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `user_id` | INTEGER | 所屬使用者 |
| `tab_id` | TEXT | Client 產生的 UUID |
| `name` | TEXT | 分頁名稱 |
| `color` | TEXT | 顏色 |
| `eyebrow` | TEXT | 眉標文字 |
| `placeholder` | TEXT | 提示文字 |
| `language` | TEXT | 內容語言 |
| `code_theme` | TEXT | 程式碼主題 |
| `content` | TEXT | 分頁內容 |
| `revision` | INTEGER | Server 配發、每次變更遞增 |
| `updated_at` | INTEGER | Server 時間，僅供顯示與排序 |
| `updated_by` | TEXT | 最後更新的 device ID |

主鍵為 `(user_id, tab_id)`。

### `tombstones`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `user_id` | INTEGER | 所屬使用者 |
| `tab_id` | TEXT | 被刪除分頁 ID |
| `revision` | INTEGER | 刪除版本 |
| `deleted_at` | INTEGER | Server 刪除時間 |
| `deleted_by` | TEXT | 刪除來源 device ID |

刪除不立即失去同步資訊，而是寫入 tombstone。tombstone 可在例如 90 天後，透過維護命令清理。

### `user_revisions`

每位使用者保存一個單調遞增的 revision counter。任何新增、更新或刪除都必須在同一 SQLite transaction 中取得下一版號並寫入資料。

`updated_at` 不用於決定勝負；跨裝置時鐘不準也不會覆蓋資料。

---

## 8. 同步協議

### 6.1 Client 本地狀態

保留現有內容 key，並新增：

- `sayit-sync-device-id`：首次產生的 UUID。
- `sayit-sync-cursor`：上次成功接收的 server revision。
- `sayit-sync-pending`：待上傳操作佇列。
- 每個 tab 保存 `baseRevision`，代表目前本地內容源自哪個 server revision。

pending operation 格式：

```json
{
  "operationId": "uuid",
  "type": "upsert",
  "tabId": "uuid",
  "baseRevision": 12,
  "tab": { "name": "...", "content": "..." },
  "localUpdatedAt": 1784300000000
}
```

刪除操作使用 `type: "delete"`，同樣帶 `baseRevision`。`operationId` 讓重送具備 idempotency，避免網路逾時後重複套用。

### 6.2 API

#### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

#### Synchronization

- `POST /api/sync`
- `GET /api/health`

同步請求：

```json
{
  "deviceId": "uuid",
  "cursor": 12,
  "operations": []
}
```

同步回應：

```json
{
  "cursor": 18,
  "accepted": [{ "operationId": "...", "tabId": "...", "revision": 15 }],
  "changes": [{ "type": "upsert", "tab": {}, "revision": 16 }],
  "conflicts": [],
  "serverTime": 1784300000000
}
```

### 6.3 Server 合併規則

每個同步請求在 transaction 中處理：

1. 驗證 payload、device ID、欄位長度與 operations 數量。
2. 依 `operationId` 忽略已成功處理過的重送操作。
3. 若操作的 `baseRevision` 等於 server 當前 tab revision，接受更新並配發新 revision。
4. 若兩者不同，表示其他裝置已修改，回傳 conflict；不可靜默覆蓋。
5. delete 也使用相同 revision 規則，並建立 tombstone。
6. 回傳 `revision > cursor` 的 upsert 與 delete changes。
7. transaction 成功後才回傳新 cursor。

絕對禁止用「某 tab 沒出現在 Client payload」推論它已被刪除。

### 6.4 衝突處理

收到 conflict 時，本地 pending operation 保留，並顯示本地與遠端內容：

- 保留本地：以遠端最新 revision 作為新的 base，再提交本地版本。
- 使用遠端：套用遠端內容並移除本地 pending operation。
- 手動合併：使用者編輯合併結果，再以遠端最新 revision 提交。

若是 delete-vs-update 衝突，也必須明確詢問要刪除還是保留更新版本。

---

## 9. 前端修改

### `app.js`

- `normalizeTabs()` 保留並驗證 `baseRevision` 等同步欄位，不能在載入時丟掉它們。
- Legacy 內容讀取要涵蓋 `sayit-content-v1`、`sayit-daily-v1`、`sayit-tab-content-*`。
- 將舊純字串內容安全遷移成內部同步格式，但不要在 migration 時誤標為使用者新修改。
- `saveCurrentContent()` 只有在內容真的變更時才加入 pending operation。
- 同一 tab 尚未同步的多次輸入合併為最後一次 upsert，避免每 450ms 累積大量操作。
- 新 tab ID 改用 `crypto.randomUUID()`，不再只用 `Date.now()`。
- 刪除時先可靠寫入 pending delete，再移除 UI 和內容。
- 提供穩定的 `window.SayIt` bridge，讓同步服務取得 snapshot、套用 remote change、重繪 tabs。

### `sync-service.js`

- 登入、註冊、登出與 `/api/auth/me`。
- debounce 自動同步，並保證同一時間只有一個 in-flight request。
- 同步進行期間的新變更留待下一輪，不遺失 pending operation。
- 啟動、登入、手動操作及 `online` 事件觸發同步。
- 頁面持續開啟時可每 30–60 秒 pull 一次；`visibilitychange` 回到前景時再 pull。
- 網路失敗採 capped exponential backoff，不把離線視為資料錯誤。
- 只有 server 明確 accepted 後才移除 pending operation。
- 套用遠端資料時暫停本地 change listener，避免形成同步迴圈。

### UI

- topbar 加入同步按鈕及狀態：未登入、待同步、同步中、已同步、離線、失敗、衝突。
- Dialog 未登入時顯示帳號、密碼、登入、註冊；不顯示 server URL。
- 已登入時顯示帳號、最後同步時間、立即同步及登出。
- 新增 conflict dialog，支援保留本地、使用遠端、手動合併。
- 錯誤訊息不得顯示 stack trace、SQL 或敏感憑證。

### Service Worker

- 將 `sync-service.js` 加入 app-shell cache。
- 每次前端部署提升 cache version。
- `/api/*` 不進 Cache Storage，也不得由離線 fallback 偽造成功回應。
- navigation 維持離線 fallback 到 `index.html`。
- Background Sync API 只能作漸進增強；核心流程仍依賴 pending queue 與 `online`/啟動重試。

---

## 10. Flask 實作要求

### `server/requirements.txt`

使用相容版本範圍並在實作時產生已驗證 lock/部署版本，預計依賴：

```text
Flask
python-dotenv
pytest
```

Werkzeug 由 Flask 依賴提供。若加入 rate-limit 套件，再明確列入。此方案不需要 PyJWT 和 Flask-CORS。

### Application factory

`create_app(test_config=None)` 必須：

- 從環境讀取 `SECRET_KEY`、`DATABASE_PATH`、cookie 與內容大小設定。
- 使用 Flask instance path 作為預設資料庫位置。
- 每個 request 使用獨立 SQLite connection，request 結束時關閉。
- 設定 `PRAGMA foreign_keys=ON` 和合理 `busy_timeout`。
- 對寫入使用明確 transaction，處理 locked/error 並 rollback。
- 不把 connection、登入使用者或同步狀態放在 Python global variable。
- 提供可重複執行的 schema migration/init command。

`app.run()` 只放在本機開發入口並受 `if __name__ == "__main__"` 保護；PythonAnywhere 透過 WSGI 匯入 application。

---

## 11. PythonAnywhere 部署步驟

以下以 `/home/<username>/SayIt` 為例：

1. 將專案上傳或從 Git clone 到 PythonAnywhere。
2. 建立 virtualenv，Python 版本必須和 Web app 選擇的版本一致。
3. 安裝 `server/requirements.txt`。
4. 建立 `instance/`，初始化 SQLite schema，確認 web worker 可寫入。
5. 在 PythonAnywhere **Web** 頁面新增 Flask 或 Manual configuration web app。
6. 設定 virtualenv 路徑與 WSGI file。
7. WSGI file 加入專案路徑、設定正式環境變數並匯入：

   ```python
   import sys
   sys.path.insert(0, "/home/<username>/SayIt")

   from server.app import create_app
   application = create_app()
   ```

8. 使用 PythonAnywhere Static Files mapping 提供靜態檔案，或第一版先由 Flask 提供；若使用 mapping，需確保 `/api/*` 仍進入 Flask，且 `/` 的 SPA/PWA navigation 行為正確。
9. Reload web app，查看 error log 與 server log。
10. 使用 `https://<username>.pythonanywhere.com` 測試；PythonAnywhere 子網域預設支援 HTTPS。若使用自訂網域，完成憑證後再啟用 Force HTTPS。
11. 備份 `instance/sayit.db`；備份前使用 SQLite backup API 或短暫停止寫入，避免只複製部分狀態。

正式部署不能在程式內硬編碼 `/home/<username>`、密鑰或 domain。實作完成後另提供 `DEPLOY_PYTHONANYWHERE.md`，填入實際帳號、Python 版本與畫面操作步驟。

---

## 12. 測試計畫

### 自動化測試

至少涵蓋：

- 註冊、重複帳號、登入失敗、登入成功、登出及未授權 API。
- 使用者 A 無法存取使用者 B 的資料。
- 空帳號首次同步、舊 LocalStorage migration。
- A 新增，B 能 pull。
- A 更新後 B 更新舊 base，Server 回傳 conflict，A 的資料不被覆蓋。
- delete-vs-update 及 update-vs-delete 衝突。
- tombstone 能同步到離線裝置。
- 刪除後用新 revision 重建，不被舊 delete 重送刪除。
- 相同 `operationId` 重送不會重複增加 revision。
- 請求失敗不移除 pending queue。
- 多個使用者及多個 tab 的 revision/cursor 邊界。
- 過大或格式錯誤 payload 回傳 4xx，不造成部分寫入。
- `/api/*` 不被 Service Worker cache。

### 本機整合測試

1. 使用兩個不同 browser profile，不只開兩個同源分頁，避免共享 LocalStorage 造成假象。
2. A、B 登入同帳號，測試新增、修改、刪除與重新命名。
3. A 離線、B 修改同一 tab，再讓 A 上線，確認出現 conflict dialog。
4. 關閉伺服器進行多次編輯，重開後確認 pending operation 全部補送。
5. 安裝 PWA，重新啟動瀏覽器及裝置後驗證 session 與同步。

### PythonAnywhere 驗收

- `/api/health` 回傳成功，但不洩漏密鑰或檔案路徑。
- HTTPS 下可登入，Cookie 具 Secure/HttpOnly/SameSite 屬性。
- 桌面和手機可透過公開網址同步。
- Reload web app 後資料仍存在。
- 靜態檔案更新後，Service Worker 能升級且不持續使用舊版 JS。
- 檢查 error log 無 database locked、permission denied 或 import error。
- 執行一次 SQLite 備份與還原演練。

---

## 13. 實作順序與完成條件

### Phase 1 — Server foundation

- 建立 Flask application factory、SQLite schema/migration、auth 和測試。
- 完成 PythonAnywhere WSGI smoke test。

### Phase 2 — Versioned sync protocol

- 完成 revision、operation idempotency、tombstone、cursor 和 conflict API。
- 通過雙裝置及刪除競態自動化測試。

### Phase 3 — Frontend integration

- 完成 LocalStorage migration、pending queue、sync service、狀態 UI 和 conflict dialog。
- 保持未登入及離線使用體驗。

### Phase 4 — PWA and deployment

- 更新 Service Worker、cache version、README 和 PythonAnywhere 部署文件。
- 在 PythonAnywhere 公開 HTTPS 網址完成桌面＋手機驗收及備份還原測試。

只有在上述測試通過、衝突不會靜默覆蓋、刪除不由資料缺席推論、PythonAnywhere reload 後資料仍可用時，才視為本版本完成。
