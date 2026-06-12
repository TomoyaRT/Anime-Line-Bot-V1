import type { AnimeRepository } from '../interfaces/AnimeRepository';
import type { EnrichedAnime } from '../types/Anime';
import { getPrisma } from './client';

async function save(animes: EnrichedAnime[], date: string): Promise<void> {
  const db = getPrisma();
  for (const a of animes) {
    const data = {
      chineseTitle: a.chineseTitle,
      nativeTitle: a.nativeTitle,
      coverImage: a.coverImage,
      studio: a.studio,
      voiceActors: a.voiceActors,
      season: a.season,
      episode: a.episode,
      airingAt: BigInt(a.airingAt),
    };
    await db.dailyAnime.upsert({
      where: { pushDate_mediaId: { pushDate: new Date(date), mediaId: a.mediaId } },
      create: { pushDate: new Date(date), mediaId: a.mediaId, ...data },
      update: data,
    });
  }
}

async function load(date: string): Promise<EnrichedAnime[]> {
  const rows = await getPrisma().dailyAnime.findMany({
    where: { pushDate: new Date(date) },
    orderBy: { airingAt: 'asc' },
  });
  return rows.map((row) => ({
    airingAt: Number(row.airingAt),
    episode: Number(row.episode),
    mediaId: Number(row.mediaId),
    chineseTitle: row.chineseTitle,
    nativeTitle: row.nativeTitle,
    coverImage: row.coverImage ?? '',
    studio: row.studio ?? '不明',
    voiceActors: row.voiceActors ?? [],
    season: Number(row.season),
  }));
}

// db 層對 AnimeRepository 合約的實作。
export const animeRepository: AnimeRepository = { save, load };
