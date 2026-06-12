import crypto from 'crypto';
import type { Request, Response } from '@google-cloud/functions-framework';
import type { AnimeDataSource } from '../interfaces/AnimeDataSource';
import type { AnimeInfoEnricher } from '../interfaces/AnimeInfoEnricher';
import type { AnimeRepository } from '../interfaces/AnimeRepository';
import type { MessageSender } from '../interfaces/MessageSender';
import { loadFromCache } from '../db/redisCache';
import { buildFlexMessage } from '../ui/flexMessage';
import { todayCSTDate } from '../utils/date';

export interface WebhookDeps {
  source: AnimeDataSource;
  enricher: AnimeInfoEnricher;
  repository: AnimeRepository;
  messenger: MessageSender;
}

function verifyLineSignature(rawBody: Buffer | string, secret: string, signature: string): boolean {
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function handleWebhook(req: Request, res: Response, deps: WebhookDeps): Promise<void> {
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
        if (data === 'action:today_anime') {
          const today = todayCSTDate();
          const cached = await loadFromCache(today);
          const animes = cached && cached.length > 0 ? cached : await deps.repository.load(today);
          if (animes.length === 0) {
            await deps.messenger.reply(event.replyToken, { type: 'text', text: '📺 今天暫無動漫更新資料，請等待每日 08:30 推播。' });
            return;
          }
          await deps.messenger.reply(event.replyToken, buildFlexMessage(animes));
          return;
        }

        if (data.startsWith('synopsis:')) {
          const mediaId = parseInt(data.split(':')[1]);
          if (isNaN(mediaId)) return;

          // 優先從 Redis 快取讀取當天資料，找到對應動漫的已存簡介
          const today = todayCSTDate();
          const cached = await loadFromCache(today);
          const cachedDescription = cached?.find((a) => a.mediaId === mediaId)?.description;

          if (cachedDescription) {
            await deps.messenger.reply(event.replyToken, { type: 'text', text: cachedDescription });
            return;
          }

          // Redis 未命中：查 DB 中已存的描述（涵蓋 Wikipedia 日文 + AniList 備援）
          const dbAnimes = await deps.repository.load(today);
          const dbDescription = dbAnimes.find((a) => a.mediaId === mediaId)?.description;
          if (dbDescription) {
            await deps.messenger.reply(event.replyToken, { type: 'text', text: dbDescription });
            return;
          }

          // DB 也無描述：最後手段，即時從 Wikipedia 抓取
          const nativeTitle = await deps.source.fetchNativeTitleById(mediaId);
          const synopsis = await deps.enricher.fetchJapaneseSynopsis(nativeTitle);

          await deps.messenger.reply(event.replyToken, {
            type: 'text',
            text: synopsis ?? '暫無簡介資料。',
          });
        }
      }
    })
  );

  res.status(200).send('OK');
}
