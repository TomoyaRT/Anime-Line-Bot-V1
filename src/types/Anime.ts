// 跨資料夾共用的動漫資料型別。
// AiringAnime：來自主要來源（AniList）的原始放送資料。
// EnrichedAnime：合併主來源＋補完來源後，最終要存 DB / 顯示的完整資料。

export interface AiringAnime {
  airingAt: number;
  episode: number;
  mediaId: number;
  nativeTitle: string;
  englishTitle: string;
  synonymsChineseTitle: string | null;
  description: string;
  coverImage: string;
  studio: string;
  voiceActors: string[];
  anilistSeason: number;
}

export interface EnrichedAnime {
  airingAt: number;
  episode: number;
  mediaId: number;
  chineseTitle: string;
  nativeTitle: string;
  coverImage: string;
  studio: string;
  voiceActors: string[];
  season: number;
}
