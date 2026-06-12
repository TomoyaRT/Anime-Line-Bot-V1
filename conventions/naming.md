# 專案規章：命名規則與架構說明

本專案以「初學者好理解」為原則，採用三層式架構，並透過「介面」與「實際依賴」解耦合。

## 一、命名規則

| 對象 | 規則 | 範例 |
|------|------|------|
| 資料夾 | 小寫 | `interfaces`、`db`、`services` |
| 型別 / 介面檔案 | PascalCase（大寫開頭） | `AnimeDataSource.ts`、`Anime.ts` |
| 函式 / 模組檔案 | camelCase（小寫開頭） | `dailyPush.ts`、`animeRepository.ts` |
| 介面 / 型別名稱 | PascalCase | `EnrichedAnime`、`MessageSender` |
| 函式 | camelCase、動詞開頭 | `fetchTodayAiring` |
| 常數 | UPPER_SNAKE_CASE | `ANILIST_URL` |

**介面原則**：介面只放在「邊界」（DB、外部 API、通訊）。自己的業務服務（services）只有一份實作、不會被替換，因此**不配介面**，避免無意義的抽象（Header Interface 反模式）。

**介面 vs 實作的大小寫**：同一個概念，介面用大寫開頭、實作用小寫開頭即可區分。
例：`interfaces/AnimeRepository.ts`（合約） ↔ `db/animeRepository.ts`（實作）。

## 二、資料夾架構

```
src/
├── index.ts          入口＝組裝點：把具體實作注入給服務層
├── types/            跨資料夾共用型別
├── interfaces/       邊界合約（services 只依賴這裡）
├── services/         業務邏輯（無介面）
├── db/               資料庫實作（Prisma）＋ schema/migrations
├── ui/               使用者看到的畫面（LINE Flex Message）
└── integrations/     第三方服務實作（LINE / AniList / Wikipedia）
```

頂層其他資料夾：

| 資料夾 | 用途 |
|------|------|
| `prisma.config.ts` | Prisma 設定，指向 `src/db/prisma` |
| `deploy/` | 部署設定（GCP 環境變數） |
| `conventions/` | 本規章文件 |
| `docs/` | 專案說明文件 |

隱密資訊一律放專案根目錄的 `.env`，不進版控。

## 三、依賴方向

```
index.ts ──注入──▶ services ──只依賴──▶ interfaces ◀──實作── db / integrations
```

服務層只認識 `interfaces/` 的合約；具體要用哪個實作，由 `index.ts` 在組裝點決定。
未來要換資料來源或資料庫，只要新增一個實作對應介面的檔案，服務層不需更動。
