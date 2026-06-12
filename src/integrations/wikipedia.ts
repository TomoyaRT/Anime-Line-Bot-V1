import axios, { type AxiosRequestConfig } from 'axios';
import type { AnimeEnrichment, AnimeInfoEnricher } from '../interfaces/AnimeInfoEnricher';

const JA_WIKI = 'https://ja.wikipedia.org/w/api.php';
const ZH_WIKI = 'https://zh.wikipedia.org/w/api.php';
const TIMEOUT = 8000;
const WIKI_UA = 'AnimeLineBot/1.0 (educational project)';

export function stripSeasonSuffix(title: string): string {
  return title
    .replace(/[\s　]+第[0-9０-９一二三四五六七八九十百]+[期季].*$/u, '')
    .replace(/[\s　]+\d+(?:nd|rd|th|st)\s+Season.*/i, '')
    .replace(/[\s　]+Season\s+\d+.*/i, '')
    .replace(/[\s　]+Part\s+\d+.*/i, '')
    .replace(/[\s　]+The\s+Final\s+Season.*/i, '')
    .replace(/[\s　]+[Ⅱ-Ⅸ].*/u, '')
    .trim();
}

// 額外剝除日文標題裡的英文副標題，例：「北斗の拳 -FIST OF THE NORTH STAR-」→「北斗の拳」
function stripEnglishSubtitle(title: string): string {
  return title
    .replace(/\s+[-－]\s*[A-Z][A-Za-z0-9\s!,':.*]+[-－]?\s*$/, '')
    .trim();
}

// Wikipedia 請求帶 429 自動重試（最多 2 次，每次等 2s×n）
async function wikiGet(url: string, config: AxiosRequestConfig): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await axios.get(url, { ...config, timeout: TIMEOUT, headers: { 'User-Agent': WIKI_UA } });
    } catch (err: any) {
      const is429 = err?.response?.status === 429;
      if (is429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function searchJaWiki(query: string): Promise<string | null> {
  try {
    const res = await wikiGet(JA_WIKI, {
      params: { action: 'query', list: 'search', srsearch: query, format: 'json', srlimit: 1 },
    });
    return (res.data?.query?.search?.[0]?.title as string) ?? null;
  } catch {
    return null;
  }
}

// 直接搜尋中文 Wikipedia，作為 ja→zh langlink 找不到時的備用方案
// 中文維基百科的動漫條目文章內文通常包含日文原名，因此以日文名稱搜尋可命中對應中文條目
async function searchZhWiki(query: string): Promise<string | null> {
  try {
    const res = await wikiGet(ZH_WIKI, {
      params: { action: 'query', list: 'search', srsearch: query, format: 'json', srlimit: 1 },
    });
    return (res.data?.query?.search?.[0]?.title as string) ?? null;
  } catch {
    return null;
  }
}

async function getZhLangLink(jaTitle: string): Promise<string | null> {
  try {
    const res = await wikiGet(JA_WIKI, {
      params: { action: 'query', prop: 'langlinks', titles: jaTitle, lllang: 'zh', format: 'json', lllimit: 5 },
    });
    const pages = res.data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    const links: any[] = page?.langlinks ?? [];
    const zhLink = links.find((l) => l.lang === 'zh' || l.lang === 'zh-tw' || l.lang === 'zh-hant');
    return (zhLink?.['*'] as string) ?? null;
  } catch {
    return null;
  }
}

async function getJaExtract(jaTitle: string): Promise<string | null> {
  try {
    const res = await wikiGet(JA_WIKI, {
      params: { action: 'query', prop: 'extracts', exintro: true, explaintext: true, titles: jaTitle, format: 'json' },
    });
    const pages = res.data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    return (page?.extract as string) ?? null;
  } catch {
    return null;
  }
}

async function getZhExtract(zhTitle: string): Promise<string | null> {
  try {
    const res = await wikiGet(ZH_WIKI, {
      params: { action: 'query', prop: 'extracts', explaintext: true, titles: zhTitle, format: 'json' },
    });
    const pages = res.data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    return (page?.extract as string) ?? null;
  } catch {
    return null;
  }
}

function parseSeasonCount(text: string): number | null {
  const numeralMap: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  };
  let max = 0;
  for (const m of text.matchAll(/第(\d+)[季期]/g)) max = Math.max(max, parseInt(m[1]));
  for (const m of text.matchAll(/第([一二三四五六七八九十]+)[季期]/g)) {
    const n = numeralMap[m[1]];
    if (n) max = Math.max(max, n);
  }
  return max > 0 ? max : null;
}

// 清除 Wikipedia 消歧義後綴，例：「關於我轉生變成史萊姆這檔事 (動畫)」→「關於我轉生變成史萊姆這檔事」
function cleanZhTitle(title: string): string {
  return title.replace(/\s*[(（][^)）]+[)）]\s*$/, '').trim();
}

// 只接受含中文字符且不含日文假名的字串，用於驗證 zh.wikipedia.org 搜尋結果是真正的中文標題
function hasChinese(s: string): boolean {
  const hasCJK = /[一-鿿㐀-䶿豈-﫿]/.test(s);
  const hasKana = /[぀-ヿ]/.test(s);
  return hasCJK && !hasKana;
}

async function lookupByTitle(jaTitle: string): Promise<{ zhTitle: string | null; zhExtract: string | null; jaExtract: string | null }> {
  const [rawZhTitle, jaExtract] = await Promise.all([
    getZhLangLink(jaTitle),
    getJaExtract(jaTitle),
  ]);
  const zhTitle = rawZhTitle ? cleanZhTitle(rawZhTitle) : null;
  const zhExtract = rawZhTitle ? await getZhExtract(rawZhTitle) : null;
  return { zhTitle, zhExtract, jaExtract };
}

export async function lookupAnime(nativeTitle: string, englishTitle?: string): Promise<AnimeEnrichment> {
  if (!nativeTitle) return { chineseTitle: null, seasonCount: null, japaneseSynopsis: null };

  try {
    // 清理後再搜尋：剝除季數後綴 + 英文副標題（如「北斗の拳 -FIST OF THE NORTH STAR-」→「北斗の拳」）
    const cleaned = stripEnglishSubtitle(stripSeasonSuffix(nativeTitle));
    const jaQueries = [...new Set([nativeTitle, cleaned].filter(Boolean))];

    // zh 搜尋額外加入英文標題：純片假名標題（如「ニンジャラ」）在中文 Wikipedia 搜尋效果差，
    // 但英文標題（如「Ninjala」）出現在中文條目內文的機率較高
    const zhQueries = [...new Set([...jaQueries, englishTitle].filter(Boolean))] as string[];

    let jaTitle: string | null = null;
    for (const q of jaQueries) {
      jaTitle = await searchJaWiki(q);
      if (jaTitle) break;
    }

    if (!jaTitle) return { chineseTitle: null, seasonCount: null, japaneseSynopsis: null };

    const { zhTitle, zhExtract, jaExtract } = await lookupByTitle(jaTitle);
    const japaneseSynopsis = jaExtract?.split('\n')[0]?.trim() ?? null;

    if (!zhTitle) {
      // 嘗試 1：用剝除季數後綴的標題重新搜尋日文 Wikipedia
      const stripped = stripSeasonSuffix(jaTitle);
      if (stripped !== jaTitle) {
        const jaTitle2 = await searchJaWiki(stripped);
        if (jaTitle2) {
          const result2 = await lookupByTitle(jaTitle2);
          if (result2.zhTitle) {
            return {
              chineseTitle: result2.zhTitle,
              seasonCount: result2.zhExtract ? parseSeasonCount(result2.zhExtract) : null,
              japaneseSynopsis: result2.jaExtract?.split('\n')[0]?.trim() ?? japaneseSynopsis,
            };
          }
        }
      }

      // 嘗試 2：直接搜尋中文 Wikipedia（含英文標題，補足純片假名標題的搜尋盲區）
      for (const q of zhQueries) {
        const zhDirectTitle = await searchZhWiki(q);
        if (zhDirectTitle && hasChinese(zhDirectTitle)) {
          const cleanedZhTitle = cleanZhTitle(zhDirectTitle);
          const zhExtract2 = await getZhExtract(zhDirectTitle);
          return {
            chineseTitle: cleanedZhTitle,
            seasonCount: zhExtract2 ? parseSeasonCount(zhExtract2) : null,
            japaneseSynopsis,
          };
        }
      }

      return { chineseTitle: null, seasonCount: null, japaneseSynopsis };
    }

    return {
      chineseTitle: zhTitle,
      seasonCount: zhExtract ? parseSeasonCount(zhExtract) : null,
      japaneseSynopsis,
    };
  } catch {
    return { chineseTitle: null, seasonCount: null, japaneseSynopsis: null };
  }
}

export async function fetchJapaneseSynopsis(nativeTitle: string): Promise<string | null> {
  if (!nativeTitle) return null;
  try {
    const stripped = stripSeasonSuffix(nativeTitle);
    const jaTitle = await searchJaWiki(nativeTitle)
      ?? (stripped !== nativeTitle ? await searchJaWiki(stripped) : null);
    if (!jaTitle) return null;
    const extract = await getJaExtract(jaTitle);
    return extract?.trim() ?? null;
  } catch {
    return null;
  }
}

// Wikipedia 對 AnimeInfoEnricher 合約的實作。
export const wikipediaEnricher: AnimeInfoEnricher = {
  lookupAnime,
  fetchJapaneseSynopsis,
};
