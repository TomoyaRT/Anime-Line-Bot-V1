import crypto from 'crypto';
import type { Request, Response } from '@google-cloud/functions-framework';
import { fetchTodayAiring, fetchNativeTitleById, type AiringAnime } from './anilist';
import { lookupAnime, fetchJapaneseSynopsis, stripSeasonSuffix } from './wikipedia';
import { buildFlexMessage, type EnrichedAnime } from './flex';
import { pushMessage, replyMessage } from './line';
import { initSchema, saveAnimes, loadAnimes } from './db';

async function enrich(anime: AiringAnime): Promise<EnrichedAnime> {
  const wiki = await lookupAnime(anime.nativeTitle);

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

// 只阻擋結構性異常（全部聲優為空 = API 查詢有問題）
// 找不到中文名稱屬於資料缺失，記錄警告但不阻擋推播
function validateData(animes: EnrichedAnime[]): string[] {
  const issues: string[] = [];

  const noTitle = animes.filter((a) => !/[㐀-鿿豈-﫿]/.test(a.chineseTitle));
  if (noTitle.length > 0) {
    console.warn(`⚠️ ${noTitle.length}/${animes.length} 部無法取得中日文名稱，退回英文標題`);
  }

  const totalVA = animes.reduce((sum, a) => sum + a.voiceActors.length, 0);
  if (totalVA === 0 && animes.length >= 3) {
    issues.push('全部動漫均無聲優資料（API 結構異常，請查閱 anilist.ts）');
  }

  return issues;
}

function todayCSTDate(): string {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function runDailyPush(): Promise<void> {
  const animes = await fetchTodayAiring();
  if (animes.length === 0) {
    await pushMessage({ type: 'text', text: '📺 今天沒有動漫更新 😴' });
    return;
  }

  // 限制 3 並發，避免 Wikipedia 429
  const enriched = await mapConcurrent(animes, 3, enrich);
  const date = todayCSTDate();

  await initSchema();
  await saveAnimes(enriched, date);
  const saved = await loadAnimes(date);

  const dataToSend = saved.length > 0 ? saved : enriched;
  const issues = validateData(dataToSend);

  if (issues.length > 0) {
    const msg = `⚠️ 資料結構異常，推播已暫停：\n${issues.join('\n')}`;
    console.error(msg);
    await pushMessage({ type: 'text', text: msg });
    return;
  }

  await pushMessage(buildFlexMessage(dataToSend));
}

function verifyLineSignature(rawBody: Buffer | string, secret: string, signature: string): boolean {
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function handleWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.LINE_SECRET;
  const signature = req.headers['x-line-signature'] as string;

  if (!secret || !signature) {
    res.status(400).send('Missing LINE_SECRET or signature');
    return;
  }

  const rawBody: Buffer | string = (req as any).rawBody ?? JSON.stringify(req.body);
  if (!verifyLineSignature(rawBody, secret, signature)) {
    res.status(403).send('Invalid signature');
    return;
  }

  const events: any[] = req.body?.events ?? [];
  await Promise.all(
    events.map(async (event) => {
      if (event.type === 'postback' && typeof event.postback?.data === 'string') {
        const data: string = event.postback.data;
        if (data.startsWith('synopsis:')) {
          const mediaId = parseInt(data.split(':')[1]);
          if (isNaN(mediaId)) return;

          const nativeTitle = await fetchNativeTitleById(mediaId);
          const synopsis = await fetchJapaneseSynopsis(nativeTitle);

          await replyMessage(event.replyToken, {
            type: 'text',
            text: synopsis ?? '暫無日文簡介資料。',
          });
        }
      }
    })
  );

  res.status(200).send('OK');
}

export async function animeDailyPush(req: Request, res: Response): Promise<void> {
  if (req.headers['x-line-signature']) {
    await handleWebhook(req, res);
    return;
  }
  await runDailyPush();
  res.status(200).send('OK');
}

if (require.main === module) {
  require('dotenv').config({ path: 'local.env' });
  runDailyPush()
    .then(() => console.log('推播成功！'))
    .catch((err) => console.error('錯誤：', err));
}
