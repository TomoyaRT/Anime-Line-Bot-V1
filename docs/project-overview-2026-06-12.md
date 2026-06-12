# Anime LINE Bot — 專案概覽文件

> 文件製作日期：2026-06-12

---

## 專案簡介

Anime LINE Bot 是一個以動漫為主題的 LINE Messaging API 機器人。每日上午 08:30（CST）透過 GCP Cloud Scheduler 自動觸發，向指定 LINE 使用者推播當日更新的動漫清單（Flex Message Carousel）。使用者亦可透過點擊卡片上的「動漫簡介」按鈕，以 postback webhook 方式向 Bot 查詢該動漫的日文維基百科簡介。

動漫資料來源為 AniList GraphQL API，中文片名與簡介則透過 Wikipedia（日文版 / 中文版）交叉查詢取得。查詢結果持久化至 Neon（serverless PostgreSQL）以供當日復用。

---

## 技術棧列表

| 分類 | 技術 / 套件 |
|------|------------|
| **程式語言** | TypeScript（編譯至 CommonJS） |
| **Runtime** | Node.js 24（GCP Cloud Functions Gen2） |
| **主要框架** | `@google-cloud/functions-framework` v5 |
| **LINE SDK** | `@line/bot-sdk` v11（Messaging API） |
| **HTTP 客戶端** | `axios` v1 |
| **資料庫驅動** | `pg`（node-postgres）v8 |
| **編譯工具** | `typescript` v6、`ts-node` v10 |
| **環境變數** | `dotenv` v17 |
| **外部 API — 動漫資料** | AniList GraphQL API（`https://graphql.anilist.co`，無需授權） |
| **外部 API — 百科資料** | Wikipedia MediaWiki API（日文版 `ja.wikipedia.org`、中文版 `zh.wikipedia.org`） |
| **外部 API — 訊息服務** | LINE Messaging API（Webhook + Push + Reply） |
| **資料庫** | Neon serverless PostgreSQL（AWS ap-southeast-1，SSL 連線） |
| **基礎設施** | GCP Cloud Functions Gen2（`asia-east1`）、GCP Cloud Scheduler |

---

## 資料夾架構說明

```
Anime-Line-Bot-v1/
├── src/
│   ├── index.ts        # 主入口：Cloud Function 進入點、每日推播流程、Webhook 處理
│   ├── anilist.ts      # AniList GraphQL 查詢（今日播出、前傳遞迴季數、synopsis）
│   ├── wikipedia.ts    # Wikipedia 查詢（日中互查、季數解析、簡介擷取、429 重試）
│   ├── flex.ts         # LINE Flex Message Carousel 構建
│   ├── line.ts         # LINE Messaging API 封裝（pushMessage / replyMessage）
│   └── db.ts           # Neon PostgreSQL 操作（initSchema / saveAnimes / loadAnimes）
├── dist/               # TypeScript 編譯輸出（部署用，已 .gitignore）
├── docs/               # 專案技術文件
│   ├── project-overview-2026-06-12.md
│   └── flow-2026-06-12.md
├── task/               # 開發任務備忘錄
├── .claude/            # Claude Code 設定與 agent 定義
├── package.json        # 依賴宣告與 npm scripts（start / build / deploy）
├── tsconfig.json       # TypeScript 編譯設定
├── gcp-env.yaml        # GCP Cloud Function 環境變數（已 .gitignore）
├── .gcloudignore       # GCP 部署排除清單
└── .gitignore          # Git 排除清單（含 .env、gcp-env.yaml、dist/）
```

---

## 目前功能列表

### 功能一：每日動漫自動推播（Path A）

| 子功能 | 說明 |
|--------|------|
| `fetchTodayAiring` | 查詢 AniList，取得當日 CST 時間範圍內所有 TV 格式非成人動漫播出排程（最多 50 筆） |
| `findSeasonNumber` | 遞迴查詢 AniList PREQUEL 關聯，推算動漫目前第幾季（最深 8 層） |
| `lookupAnime` | 以日文原名搜尋 ja.wikipedia.org，透過 zh langlink 取得中文片名，並解析季數 |
| `enrich` | 整合 AniList 資料與 Wikipedia 結果，組成 `EnrichedAnime`；中文標題優先序：Wikipedia 中文 → AniList 同義詞 → 日文原名（剝除季數後綴） |
| `mapConcurrent(3)` | 限制最大 3 並發執行 Wikipedia 查詢，避免觸發 429 限流 |
| `initSchema` | 確保 Neon 中存在 `daily_anime` 資料表（首次自動建立） |
| `saveAnimes` | 以 UPSERT 寫入當日 EnrichedAnime 列表至 PostgreSQL |
| `loadAnimes` | 從 PostgreSQL 讀取當日資料，驗證持久化成功 |
| `validateData` | 結構異常檢查：3 部以上且全部聲優欄位為空則視為 API 異常，中止推播並傳送警告 |
| `buildFlexMessage` | 建立 Flex Message Carousel（最多 12 個 bubble），含封面圖、標題、製作公司、播出時間、集數、聲優、「動漫簡介」按鈕 |
| `pushMessage` | 呼叫 LINE Push API 將 Flex Message 推播至指定使用者 |

### 功能二：使用者查詢動漫簡介（Path B）

| 子功能 | 說明 |
|--------|------|
| `verifyLineSignature` | HMAC-SHA256 + `timingSafeEqual` 驗證 LINE webhook 的 `x-line-signature` |
| `handleWebhook` | 解析 LINE postback 事件，識別 `synopsis:<mediaId>` 格式的 data |
| `fetchNativeTitleById` | 以 mediaId 查詢 AniList，取得日文原名 |
| `fetchJapaneseSynopsis` | 以日文原名搜尋 ja.wikipedia.org，取得完整日文簡介文字 |
| `replyMessage` | 呼叫 LINE Reply API，回覆日文簡介給使用者 |

### 功能三：LINE Flex Message 卡片組裝

每部動漫產生一個 `FlexBubble`，含：封面圖（hero）、深色系主體（中文 + 日文標題、製作公司、播出時間 CST、第 N 季第 N 集、最多 5 位聲優）、頁尾「動漫簡介」Postback 按鈕。最多 12 張 Bubble 組成 Carousel。

### 功能四：資料庫持久化

資料表 `daily_anime` 以 `(push_date, media_id)` 為複合主鍵，採 UPSERT 策略確保冪等寫入，依 `airing_at` 排序讀取。

---

## 各領域職責說明

### 後端（`src/`）

| 模組 | 職責 |
|------|------|
| `index.ts` | Cloud Function 唯一進入點 `animeDailyPush`；依 `x-line-signature` 分流至推播或 Webhook；並發控制（`mapConcurrent`）；資料品質驗證（`validateData`）；本地開發支援（`require.main === module` 自動載入 dotenv） |
| `anilist.ts` | AniList GraphQL：今日播出排程、前傳遞迴季數計算、依 ID 查日文原名；過濾成人向與非 TV；AniList synonyms 中文提取 |
| `wikipedia.ts` | Wikipedia MediaWiki API：日文搜尋、跨語言連結查詢、簡介擷取；429 自動重試（最多 3 次，退避 2s×n）；季數正規表示式解析；標題清理（去季數後綴、英文副標題、消歧義後綴） |
| `flex.ts` | 純函數：`buildBubble` / `buildFlexMessage`；CST 播出時間格式化 |
| `line.ts` | LINE Messaging API 封裝：`pushMessage`（主動推播）、`replyMessage`（回覆 Webhook）；讀取 Token 與 User ID 環境變數 |
| `db.ts` | PostgreSQL 連線池（`pg.Pool`）；SSL 處理（過濾查詢參數）；Schema 初始化；Upsert 寫入；日期讀取 |

### 資料庫（Neon PostgreSQL）

- 平台：Neon Serverless PostgreSQL，AWS ap-southeast-1，需 SSL
- 資料表 `daily_anime`：儲存每日推播的動漫完整 metadata（標題、封面、製作公司、聲優陣列、季數、集數、播出 Unix timestamp）
- 連線：`db.ts` 管理 Pool 單例，自動處理 `sslmode` / `channel_binding` 查詢參數

### 基礎設施 & 部署（GCP）

- **GCP Cloud Functions Gen2**：函式名稱 `animeDailyPush`，Runtime `nodejs24`，區域 `asia-east1`，HTTP 觸發，允許未驗證呼叫
- **GCP Cloud Scheduler**：每日 08:30 CST 以 HTTP GET 觸發，無 `x-line-signature`，走每日推播路徑
- **環境變數注入**：部署時 `gcp-env.yaml` 注入 `LINE_ASSESS_TOKEN`、`LINE_USER_ID`、`LINE_SECRET`、`DATABASE_URL`
- **部署指令**：`npm run deploy` 執行 `gcloud functions deploy`

### 第三方服務

| 服務 | 用途 | 認證方式 |
|------|------|---------|
| **AniList GraphQL API** | 動漫播出排程、前傳關係、日文原名 | 無（公開 API） |
| **Wikipedia（日文版）** | 動漫條目搜尋、日文簡介、跨語言連結 | 無（帶 User-Agent） |
| **Wikipedia（中文版）** | 中文標題、季數資訊解析 | 無（帶 User-Agent） |
| **LINE Messaging API** | 接收 Webhook、Push 推播、Reply 回覆 | Channel Access Token |
| **Neon** | Serverless PostgreSQL 資料庫託管 | DATABASE_URL 連線字串 |
| **GCP Cloud Functions** | 無伺服器函式執行環境 | GCP IAM |
| **GCP Cloud Scheduler** | 每日定時觸發 | GCP IAM |

---

## 環境變數說明表

| 變數名稱 | 用途 | 使用位置 |
|---------|------|---------|
| `LINE_SECRET` | LINE Channel Secret，驗證 Webhook 請求的 HMAC-SHA256 簽章 | `src/index.ts` — `verifyLineSignature()` |
| `LINE_ASSESS_TOKEN` | LINE Channel Access Token，呼叫 Push / Reply API | `src/line.ts` — `getClient()` |
| `LINE_USER_ID` | 目標 LINE 使用者 ID，Push Message 的推播對象 | `src/line.ts` — `pushMessage()` |
| `DATABASE_URL` | Neon PostgreSQL 連線字串（含 SSL 參數） | `src/db.ts` — `getPool()` |
| `GCP_PROJECT_ID` | GCP 專案識別碼（`anime-line-bot-498503`） | 部署設定、CLAUDE.md 參考 |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub Personal Access Token（供 CI/CD 或腳本使用） | 開發工具 / CI 流程 |

> 注意：`.env` 與 `gcp-env.yaml` 均已列於 `.gitignore`，請勿提交至版本庫。
