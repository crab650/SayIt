# Say It — 寫下此刻 ✍️

一個極簡、優雅且專注的隨手寫作與代碼暫存空間。

---

## 💡 專案初衷
本專案的誕生，源於作者平常有一些**臨時的代碼片段**、**靈感想法**或**待辦備忘**需要隨手記錄，但又**不想在電腦中建立一堆零散的實體檔案（如 `temp.txt`、`test.py`）**。

因此，開發了這個網頁版隨手寫作空間：
- **無需建立檔案**：所有內容自動儲存在瀏覽器的 `LocalStorage` 中。
- **無縫自動存檔**：停止輸入 `450 毫秒` 後自動在背景存檔，不用擔心忘記存檔或瀏覽器崩潰。
- **支援程式碼模式**：提供輕量化語法高亮，適合臨時貼上代碼進行閱讀或編輯。
- **支援 PWA 離線使用**：可安裝至桌面或手機，隨開隨用，提供乾淨、無干擾的書寫環境。

---

## 🛠️ 功能特點
1. **多分頁管理**：可自訂分頁名稱、小標題，並指定專屬的配色與模式。
2. **語法高亮（Syntax Highlighting）**：支援 `一般文字 (.txt)`、`Python (.py)`、`SQL (.sql)`、`TypeScript (.ts)`、`C# (.cs)` 等格式的高亮顯示，並提供 Midnight、Forest、Paper 三種程式碼配色。
3. **字數與詞數統計**：即時統計字數（不含空白）與中英文詞數。
4. **快捷功能**：
   - **`F5` 鍵**：快速在游標處插入當前時間戳記（例如 `2026-07-15 13:50`）。
   - **`Tab` 鍵**：在程式碼模式下，按下 Tab 會插入兩個空白縮排。
   - **`Ctrl + S`** 或 **`Cmd + S`**：強制手動存檔。
5. **深淺色主題切換**：自動適應系統主題，亦可手動切換深色（Dark）/ 淺色（Light）模式，並動態變更瀏覽器主題顏色（Theme Color）。
6. **一鍵複製與匯出**：可快速複製全文，或將內容直接下載為對應副檔名的實體檔案。

---

## 📂 檔案目錄架構
```
SayIt/
├── index.html           # 應用程式的主頁面結構與 Dialog 彈窗
├── app.js               # 核心邏輯（LocalStorage 儲存、自訂分頁、自建語法高亮引擎、事件監聽）
├── styles.css           # 響應式與主題化 CSS（支援深淺色切換、自訂分頁主題色、毛玻璃特效）
├── sw.js                # Service Worker 腳本（用於靜態資源快取以支援 PWA 離線使用）
├── manifest.webmanifest # PWA 設定檔（定義應用程式圖示、啟動路徑及顯示模式）
├── icon.svg             # 應用程式圖示（向量格式，供 PWA 與瀏覽器使用）
├── .gitignore           # Git 忽略設定檔（排除編輯器與開發代理工具的暫存檔）
└── README.md            # 專案說明文件（本檔案）
```

---

## 🏗️ 程式碼架構解析
整個專案採用無框架的 **Vanilla JS (原生 JavaScript)** + **原生 CSS 變數** 進行開發，以極致的載入速度和極低的資源佔用為目標。

### 1. 狀態與資料管理 (`app.js`)
- **資料持久化**：使用 `localStorage` 來保存分頁配置（`sayit-custom-tabs-v2`）與各個分頁的文字內容（`sayit-tab-content-<tabId>`）。
- **資料校驗與復原 (`normalizeTabs`)**：每次載入時會自動驗證 LocalStorage 的資料格式，若損壞或為空則自動復原成預設的「我的想法」與「每日句子」分頁。
- **防抖動儲存 (Debounced Auto-save)**：監聽編輯器的 `input` 事件，利用 `setTimeout` 實作 450ms 延遲存檔，避免頻繁寫入 LocalStorage 影響網頁效能。

### 2. 語法高亮引擎 (`app.js` & `styles.css`)
為了不載入龐大的第三方代碼高亮庫（如 Prism 或 Highlight.js），專案實作了**輕量級的程式碼語法高亮 overlay**：
- **雙層堆疊 (`.editor-surface`)**：底層為一個 `pre` 元素（負責顯示高亮後的 HTML），頂層為一個 `textarea`（字體顏色設為 `transparent`、插入符 caret 設為可見）。
- **同步捲動**：透過監聽 `textarea` 的 `scroll` 事件，同步更新 `pre` 的 `scrollTop` 與 `scrollLeft`。
- **正則語法解析 (`TOKEN_RULES`)**：利用 JavaScript 的 `matchAll` 與 Regular Expression 抓取關鍵字（`keyword`）、字串（`string`）、數字（`number`）與註解（`comment`），並包覆對應的 span 標籤套用 CSS 顏色。

### 3. 主題動態渲染
- **全域 CSS 變數**：在 `styles.css` 中定義 `--bg`、`--paper`、`--ink` 等基本變數，並依據 `[data-theme="dark"]` 切換配色。
- **分頁專屬配色**：每個分頁都有獨立的 `color`。當切換分頁時，JS 會動態修改網頁根節點的 `--accent` 變數以及分頁按鈕的 `--tab-accent` 變數，實現介面主題色的無縫轉換。

---

## 🚀 如何在本地運行
本專案為純前端靜態網頁，無需搭建後端伺服器即可運行：
1. 下載或 Clone 本專案。
2. 連按兩下 `index.html` 即可在瀏覽器中開啟。
3. 若要啟用 PWA 完整功能（如離線快取與安裝），建議使用簡易網頁伺服器（例如 VS Code 的 Live Server 插件，或是執行 `npx serve`）透過 `http://localhost` 開啟。
