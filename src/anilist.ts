import axios from 'axios';

const ANILIST_URL = 'https://graphql.anilist.co';

const TODAY_QUERY = `
  query AiringToday($start: Int, $end: Int) {
    Page(page: 1, perPage: 50) {
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: [TIME]) {
        airingAt
        episode
        media {
          id
          title { romaji native english }
          synonyms
          description(asHtml: false)
          format
          coverImage { large }
          studios(isMain: true) { nodes { name } }
          characters(sort: [ROLE, RELEVANCE, ID], perPage: 25) {
            edges {
              node { id }
              voiceActors(language: JAPANESE) {
                name { full native }
              }
            }
          }
          relations {
            edges {
              relationType
              node { id format }
            }
          }
          isAdult
        }
      }
    }
  }
`;

const PREQUEL_QUERY = `
  query Prequel($id: Int) {
    Media(id: $id) {
      relations {
        edges {
          relationType
          node { id format }
        }
      }
    }
  }
`;

const SYNOPSIS_QUERY = `
  query Synopsis($id: Int) {
    Media(id: $id) {
      title { native }
      description(asHtml: false)
    }
  }
`;

async function findSeasonNumber(mediaId: number, depth = 0): Promise<number> {
  if (depth >= 8) return depth + 1;
  try {
    const res = await axios.post(ANILIST_URL, { query: PREQUEL_QUERY, variables: { id: mediaId } });
    const edges: any[] = res.data?.data?.Media?.relations?.edges ?? [];
    const prequel = edges.find((e) => e.relationType === 'PREQUEL' && e.node.format === 'TV');
    if (!prequel) return depth + 1;
    return findSeasonNumber(prequel.node.id, depth + 1);
  } catch {
    return depth + 1;
  }
}

function stripDescription(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/~![\s\S]*?!~/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

// 只接受含中文字符且不含日文假名的字串（排除「転スラ4」等日文縮寫）
function hasChinese(s: string): boolean {
  const hasCJK = /[一-鿿㐀-䶿豈-﫿]/.test(s);
  const hasKana = /[぀-ヿ]/.test(s);
  return hasCJK && !hasKana;
}

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

export async function fetchTodayAiring(): Promise<AiringAnime[]> {
  const now = new Date();
  const offset = 8 * 60 * 60 * 1000;
  const todayCST = new Date(now.getTime() + offset);
  todayCST.setUTCHours(0, 0, 0, 0);
  const start = Math.floor(todayCST.getTime() / 1000);
  const end = start + 86399;

  const res = await axios.post(ANILIST_URL, { query: TODAY_QUERY, variables: { start, end } });
  const schedules: any[] = res.data?.data?.Page?.airingSchedules ?? [];
  const filtered = schedules.filter((s) => !s.media.isAdult && s.media.format === 'TV');

  return Promise.all(
    filtered.map(async (s) => {
      const m = s.media;
      const anilistSeason = await findSeasonNumber(m.id);

      const voiceActors: string[] = (m.characters.edges as any[])
        .flatMap((e) => (e.voiceActors as any[]) ?? [])
        .map((va: any) => (va.name.native as string) || (va.name.full as string))
        .filter((name: string, i: number, arr: string[]) => arr.indexOf(name) === i)
        .slice(0, 5);

      const synonymsChineseTitle = (m.synonyms as string[]).find(hasChinese) ?? null;

      return {
        airingAt: s.airingAt,
        episode: s.episode,
        mediaId: m.id,
        nativeTitle: m.title.native ?? '',
        englishTitle: m.title.english ?? m.title.romaji ?? '',
        synonymsChineseTitle,
        description: stripDescription(m.description ?? ''),
        coverImage: m.coverImage.large ?? '',
        studio: (m.studios.nodes[0]?.name as string) ?? '不明',
        voiceActors,
        anilistSeason,
      };
    })
  );
}

export async function fetchNativeTitleById(mediaId: number): Promise<string> {
  const res = await axios.post(ANILIST_URL, { query: SYNOPSIS_QUERY, variables: { id: mediaId } });
  return res.data?.data?.Media?.title?.native ?? '';
}
