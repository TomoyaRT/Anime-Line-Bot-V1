import type { AiringAnime } from '../types/Anime';

// 主要來源：取得今日放送的動漫資料。
export interface AnimeDataSource {
  fetchTodayAiring(): Promise<AiringAnime[]>;
  fetchNativeTitleById(mediaId: number): Promise<string>;
}
