// 補完來源：用百科把主要來源缺的「中文標題、季數、日文簡介」補齊。

export interface AnimeEnrichment {
  chineseTitle: string | null;
  seasonCount: number | null;
  japaneseSynopsis: string | null;
}

export interface AnimeInfoEnricher {
  lookupAnime(nativeTitle: string, englishTitle?: string): Promise<AnimeEnrichment>;
  fetchJapaneseSynopsis(nativeTitle: string): Promise<string | null>;
}
