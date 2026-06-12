import type { EnrichedAnime } from '../types/Anime';

// 把動漫資料存進 / 讀出我們自己的 DB 的合約。
// 建表由 Prisma migration 管理，不在執行期處理。
export interface AnimeRepository {
  save(animes: EnrichedAnime[], date: string): Promise<void>;
  load(date: string): Promise<EnrichedAnime[]>;
}
