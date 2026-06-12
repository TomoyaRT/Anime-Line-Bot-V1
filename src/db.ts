import { Pool } from 'pg';
import type { EnrichedAnime } from './flex';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    // 移除 sslmode / channel_binding 查詢參數，改由 ssl 選項直接指定，避免 pg v9 SSL warning
    const rawUrl = process.env.DATABASE_URL ?? '';
    const [base, qs = ''] = rawUrl.split('?');
    const filteredQs = qs.split('&').filter((p) => !p.startsWith('sslmode=') && !p.startsWith('channel_binding=')).join('&');
    const connectionString = filteredQs ? `${base}?${filteredQs}` : base;
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export async function initSchema(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS daily_anime (
      push_date DATE NOT NULL,
      media_id INT NOT NULL,
      chinese_title TEXT NOT NULL,
      native_title TEXT NOT NULL,
      cover_image TEXT,
      studio TEXT,
      voice_actors TEXT[],
      season INT,
      episode INT,
      airing_at BIGINT,
      PRIMARY KEY (push_date, media_id)
    )
  `);
}

export async function saveAnimes(animes: EnrichedAnime[], date: string): Promise<void> {
  const db = getPool();
  for (const a of animes) {
    await db.query(
      `INSERT INTO daily_anime
         (push_date, media_id, chinese_title, native_title, cover_image, studio, voice_actors, season, episode, airing_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (push_date, media_id) DO UPDATE SET
         chinese_title = EXCLUDED.chinese_title,
         native_title  = EXCLUDED.native_title,
         cover_image   = EXCLUDED.cover_image,
         studio        = EXCLUDED.studio,
         voice_actors  = EXCLUDED.voice_actors,
         season        = EXCLUDED.season,
         episode       = EXCLUDED.episode,
         airing_at     = EXCLUDED.airing_at`,
      [date, a.mediaId, a.chineseTitle, a.nativeTitle, a.coverImage, a.studio, a.voiceActors, a.season, a.episode, a.airingAt]
    );
  }
}

export async function loadAnimes(date: string): Promise<EnrichedAnime[]> {
  const res = await getPool().query(
    'SELECT * FROM daily_anime WHERE push_date = $1 ORDER BY airing_at',
    [date]
  );
  return res.rows.map((row) => ({
    airingAt: Number(row.airing_at),
    episode: Number(row.episode),
    mediaId: Number(row.media_id),
    chineseTitle: row.chinese_title,
    nativeTitle: row.native_title,
    coverImage: row.cover_image ?? '',
    studio: row.studio ?? '不明',
    voiceActors: (row.voice_actors as string[]) ?? [],
    season: Number(row.season),
  }));
}
