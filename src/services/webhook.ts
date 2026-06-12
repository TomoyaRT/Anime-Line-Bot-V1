import crypto from 'crypto';
import type { Request, Response } from '@google-cloud/functions-framework';
import type { AnimeDataSource } from '../interfaces/AnimeDataSource';
import type { AnimeInfoEnricher } from '../interfaces/AnimeInfoEnricher';
import type { MessageSender } from '../interfaces/MessageSender';

export interface WebhookDeps {
  source: AnimeDataSource;
  enricher: AnimeInfoEnricher;
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
        if (data.startsWith('synopsis:')) {
          const mediaId = parseInt(data.split(':')[1]);
          if (isNaN(mediaId)) return;

          const nativeTitle = await deps.source.fetchNativeTitleById(mediaId);
          const synopsis = await deps.enricher.fetchJapaneseSynopsis(nativeTitle);

          await deps.messenger.reply(event.replyToken, {
            type: 'text',
            text: synopsis ?? '暫無日文簡介資料。',
          });
        }
      }
    })
  );

  res.status(200).send('OK');
}
