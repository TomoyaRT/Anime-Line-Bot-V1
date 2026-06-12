# Anime LINE Bot V1 — 專案概覽

> 文件製作日期：2026-06-12

---

## 一、領域範疇

| 層次 | 說明 |
|------|------|
| 後端 / API 服務 | Node.js Cloud Function，處理 LINE Webhook 與每日推播邏輯 |
| 資料層 | PostgreSQL（Neon serverless）儲存每日動漫快取資料 |
| 基礎設施 | GCP Cloud Functions Gen2 + Cloud Scheduler 排程觸發 |
| 外部 API 整合 | AniList GraphQL API（動漫資料）、Wikipedia API（中文名稱查詢）、LINE Messaging API（推播） |

本專案不含傳統前端介面，使用者透過 LINE App 接收推播與互動回覆。

---

## 二、技術棧

### Runtime & 語言

| 項目 | 版本 / 說明 |
|------|-------------|
| Node.js | 24（GCP Cloud Functions runtime: nodejs24） |
| TypeScript | ^6.0.3 |

### 主要依賴套件

| 套件 | 用途 |
|------|------|
| `@google-cloud/functions-framework` ^5.0.2 | GCP Cloud Functions HTTP handler 框架 |
| `@line/bot-sdk` ^11.0.1 | LINE Messaging API 用戶端（push / reply / Flex Message） |
| `axios` ^1.17.0 | HTTP 用戶端，用於呼叫 AniList GraphQL 與 Wikipedia REST API |
| `pg` ^8.21.0 | PostgreSQL 用戶端，連線至 Neon serverless DB |

### 開發依賴

| 套件 | 用途 |
|------|------|
| `typescript` ^6.0.3 | TypeScript 編譯器 |
| `ts-node` ^10.9.2 | 本機直接執行 TypeScript（不需先 build） |
| `dotenv` ^17.4.2 | 本機開發時從 `local.env` 載入環境變數 |
| `@types/node` ^25.9.3 | Node.js 型別定義 |
| `@types/pg` ^8.20.0 | pg 型別定義 |

### 外部服務

| 服務 | 說明 |
|------|------|
| AniList GraphQL API | 查詢今日播出排程、動漫資訊、聲優資料（免費，無需 Auth） |
| Wikipedia API（ja / zh） | 透過日文標題查中文名稱（langlink）與日文簡介摘要 |
| LINE Messaging API | Push Message 推播 + Webhook 接收 postback 事件 |
| Neon PostgreSQL | Serverless PostgreSQL，儲存每日動漫推播快取 |
| GCP Cloud Functions | 無伺服器函式部署，asia-east1 區域 |
| GCP Cloud Scheduler | 每天 08:30 Asia/Taipei 觸發 Cloud Function |

---

## 三、運作流程

### 3-1 每日自動推播流程

```
GCP Cloud Scheduler（每日 08:30 Asia/Taipei）
  │
  │ HTTP POST → Cloud Function URL
  ▼
animeDailyPush（src/index.ts）
  │
  ├─ [1] fetchTodayAiring()（src/anilist.ts）
  │    └─ AniList GraphQL：查詢今日 airingSchedules（00:00~23:59 CST）
  │         過濾 isAdult=false、format=TV
  │         取得：標題(native/english/romaji)、封面圖、製作公司、
  │               角色聲優（JAPANESE，native 日文優先）、同義詞
  │         findSeasonNumber()：遞迴查詢 PREQUEL 關係鏈計算季數
  │
  ├─ [2] mapConcurrent(limit=3)→ enrich()（src/index.ts + src/wikipedia.ts）
  │    └─ 每部動漫：
  │         lookupAnime(nativeTitle)
  │           ├─ stripSeasonSuffix() + stripEnglishSubtitle() 清理標題
  │           ├─ searchJaWiki()：日文 Wikipedia 搜尋
  │           ├─ getZhLangLink()：取得中文 Wikipedia 對應標題
  │           ├─ cleanZhTitle()：清除消歧義後綴如「(動畫)」
  │           └─ getJaExtract()：取得日文簡介摘要
  │         中文標題優先順序：
  │           Wikipedia zh langlink > AniList synonyms（純中文） > 日文原名
  │
  ├─ [3] initSchema() → saveAnimes()（src/db.ts）
  │    └─ 將 EnrichedAnime 資料 upsert 到 Neon PostgreSQL daily_anime 表
  │
  ├─ [4] loadAnimes()（src/db.ts）
  │    └─ 從 DB 讀回資料確認持久化成功
  │
  ├─ [5] validateData()
  │    └─ 若所有動漫聲優均為空（API 結構異常）→ 傳送錯誤警告並中止推播
  │       中文名稱缺失只記錄 warning，不阻擋推播
  │
  └─ [6] pushMessage(buildFlexMessage())（src/flex.ts + src/line.ts）
       └─ 組合 LINE Flex Message Carousel（最多 12 個 bubble）
            每個 bubble 包含：封面圖、中日文標題、製作公司、
            播出時間、季集數、聲優列表、「動漫簡介」按鈕
          → LINE Messaging API pushMessage 發送給 LINE_USER_ID
```

### 3-2 使用者點擊「動漫簡介」流程

```
使用者在 LINE 點擊「動漫簡介」按鈕
  │
  │ LINE Platform → Postback Event（data: "synopsis:<mediaId>"）
  ▼
animeDailyPush Webhook handler（src/index.ts）
  │
  ├─ verifyLineSignature()
  │    └─ HMAC-SHA256(rawBody, LINE_SECRET)，使用 timingSafeEqual 驗證
  │
  ├─ fetchNativeTitleById(mediaId)（src/anilist.ts）
  │    └─ AniList GraphQL 查詢取得日文原名
  │
  ├─ fetchJapaneseSynopsis(nativeTitle)（src/wikipedia.ts）
  │    └─ searchJaWiki() → getJaExtract() 取得日文簡介全文
  │
  └─ replyMessage(event.replyToken, synopsis text)（src/line.ts）
       └─ LINE Messaging API replyMessage 回覆給使用者
```

---

## 四、現有功能清單

| 功能 | 觸發方式 | 說明 |
|------|----------|------|
| **每日動漫推播** | Cloud Scheduler 08:30 CST 自動觸發 | 查詢 AniList 當日播出排程，組成 Flex Message Carousel 推播至 LINE |
| **Flex Message Carousel** | 隨推播發送 | 深色主題卡片，每張包含封面圖、中日文標題、製作公司、播出時間、季集數、聲優列表 |
| **中文名稱查詢** | 推播流程中自動執行 | 透過 Wikipedia zh langlink 取得繁體中文名稱，fallback 至 AniList synonyms 或日文原名 |
| **聲優資料查詢** | 推播流程中自動執行 | 從 AniList 取得日文配音聲優，以日文原名（native）呈現 |
| **動漫簡介查詢** | 使用者點擊 Flex Message 按鈕 | 透過 LINE postback + Wikipedia 取得日文簡介，回覆給使用者 |
| **資料持久化** | 每次推播前自動執行 | 將當日動漫資料 upsert 至 Neon PostgreSQL，供審計與重推使用 |
| **資料品質驗證** | 推播前自動執行 | 聲優全空（API 結構異常）時中止推播並發送錯誤通知 |
| **Webhook 簽名驗證** | 每次收到 LINE Webhook | HMAC-SHA256 + timingSafeEqual，防止偽造請求 |

---

## 五、資料庫結構

### 表：`daily_anime`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `push_date` | DATE | 推播日期（CST） |
| `media_id` | INT | AniList media ID |
| `chinese_title` | TEXT | 中文（或日文 fallback）名稱 |
| `native_title` | TEXT | 日文原名（已去除季數後綴） |
| `cover_image` | TEXT | 封面圖片 URL |
| `studio` | TEXT | 製作公司名稱 |
| `voice_actors` | TEXT[] | 聲優名稱列表（日文，最多 5 人） |
| `season` | INT | 季數 |
| `episode` | INT | 集數 |
| `airing_at` | BIGINT | 播出時間 Unix timestamp |

PRIMARY KEY：`(push_date, media_id)`

---

## 六、環境變數

| 變數名稱 | 說明 | 使用位置 |
|----------|------|----------|
| `LINE_ASSESS_TOKEN` | LINE Channel Access Token | `src/line.ts` — 呼叫 Messaging API |
| `LINE_USER_ID` | 推播目標的 LINE User ID | `src/line.ts` — pushMessage |
| `LINE_SECRET` | LINE Channel Secret，用於 Webhook 簽名驗證 | `src/index.ts` — verifyLineSignature |
| `DATABASE_URL` | Neon PostgreSQL 連線字串 | `src/db.ts` — pg Pool |
| `GCP_PROJECT_ID` | GCP 專案 ID | 部署時使用 |

> 本機開發：儲存於 `local.env`（不 commit）
> GCP 部署：儲存於 `gcp-env.yaml`（不 commit），部署時透過 `--env-vars-file` 注入

---

## 七、部署資訊

| 項目 | 設定值 |
|------|--------|
| GCP 專案 | `anime-line-bot-498503` |
| Cloud Function 名稱 | `animeDailyPush` |
| 區域 | `asia-east1`（台灣）|
| Runtime | `nodejs24` |
| Timeout | 300 秒 |
| 觸發方式 | HTTP trigger（unauthenticated） |
| Scheduler 排程 | `0 8 * * *` Asia/Taipei（08:00 CST） |

---

## 八、專案目錄結構

```
anime-line-bot-v1/
├── src/
│   ├── index.ts        # Cloud Function 主進入點，orchestration 邏輯
│   ├── anilist.ts      # AniList GraphQL 查詢（動漫資料、聲優、季數）
│   ├── wikipedia.ts    # Wikipedia API（中文名稱、日文簡介）
│   ├── flex.ts         # LINE Flex Message Carousel 組裝
│   ├── line.ts         # LINE Messaging API push / reply
│   └── db.ts           # PostgreSQL CRUD（Neon）
├── docs/
│   └── project-overview.md   # 本文件
├── .claude/
│   ├── agents/
│   │   ├── git-commit.md     # git commit subagent
│   │   └── pm.md             # PM 文件製作 subagent
│   └── settings.json
├── package.json
├── tsconfig.json
├── CLAUDE.md
├── .gitignore          # 排除 local.env / gcp-env.yaml / node_modules / dist
├── local.env           # ⚠️ 不 commit — 本機密鑰
└── gcp-env.yaml        # ⚠️ 不 commit — GCP 部署密鑰
```
