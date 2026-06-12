import type { AiringAnime, EnrichedAnime } from '../types/Anime';
import type { AnimeInfoEnricher } from '../interfaces/AnimeInfoEnricher';
import { stripSeasonSuffix } from '../integrations/wikipedia';

async function enrich(anime: AiringAnime, enricher: AnimeInfoEnricher): Promise<EnrichedAnime> {
  const wiki = await enricher.lookupAnime(anime.nativeTitle, anime.englishTitle || undefined);

  // 優先中文 → AniList 中文同義詞 → 日文原名（不用英文，避免顯示英文標題）
  const chineseTitle =
    wiki.chineseTitle ??
    anime.synonymsChineseTitle ??
    stripSeasonSuffix(anime.nativeTitle);

  const season =
    wiki.seasonCount !== null
      ? Math.max(anime.anilistSeason, wiki.seasonCount)
      : anime.anilistSeason;

  return {
    airingAt: anime.airingAt,
    episode: anime.episode,
    mediaId: anime.mediaId,
    chineseTitle,
    nativeTitle: stripSeasonSuffix(anime.nativeTitle),
    coverImage: anime.coverImage,
    studio: anime.studio,
    voiceActors: anime.voiceActors,
    season,
  };
}

// 限制並發數，避免同時發出大量 Wikipedia 請求觸發 429
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// 合併主要來源（AniList）與補完來源（Wikipedia），組成最終完整資料。
// 限制 3 並發，避免 Wikipedia 429。
export async function assembleDailyAnimes(
  animes: AiringAnime[],
  enricher: AnimeInfoEnricher
): Promise<EnrichedAnime[]> {
  return mapConcurrent(animes, 3, (anime) => enrich(anime, enricher));
}
