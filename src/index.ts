import type { Request, Response } from '@google-cloud/functions-framework';
import { anilistSource } from './integrations/anilist';
import { wikipediaEnricher } from './integrations/wikipedia';
import { lineMessenger } from './integrations/line';
import { animeRepository } from './db/animeRepository';
import { runDailyPush } from './services/dailyPush';
import { handleWebhook } from './services/webhook';

// 組裝點（composition root）：把具體的第三方實作注入給只認識介面的服務層。
const deps = {
  source: anilistSource,
  enricher: wikipediaEnricher,
  repository: animeRepository,
  messenger: lineMessenger,
};

export async function animeDailyPush(req: Request, res: Response): Promise<void> {
  if (req.headers['x-line-signature']) {
    await handleWebhook(req, res, deps);
    return;
  }
  await runDailyPush(deps);
  res.status(200).send('OK');
}

if (require.main === module) {
  require('dotenv').config();
  runDailyPush(deps)
    .then(() => console.log('推播成功！'))
    .catch((err) => console.error('錯誤：', err));
}
