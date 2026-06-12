import type { AnimeDataSource } from '../interfaces/AnimeDataSource';
import type { AnimeInfoEnricher } from '../interfaces/AnimeInfoEnricher';
import type { AnimeRepository } from '../interfaces/AnimeRepository';
import type { MessageSender } from '../interfaces/MessageSender';
import type { EnrichedAnime } from '../types/Anime';
import { assembleDailyAnimes } from './dailyAnimeAssembler';
import { buildFlexMessage } from '../ui/flexMessage';

export interface DailyPushDeps {
  source: AnimeDataSource;
  enricher: AnimeInfoEnricher;
  repository: AnimeRepository;
  messenger: MessageSender;
}

// 只阻擋結構性異常（全部聲優為空 = API 查詢有問題）
// 找不到中文名稱屬於資料缺失，記錄警告但不阻擋推播
function validateData(animes: EnrichedAnime[]): string[] {
  const issues: string[] = [];

  const noTitle = animes.filter((a) => !/[㐀-鿿豈-﫿]/.test(a.chineseTitle));
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

export async function runDailyPush(deps: DailyPushDeps): Promise<void> {
  const animes = await deps.source.fetchTodayAiring();
  if (animes.length === 0) {
    await deps.messenger.push({ type: 'text', text: '📺 今天沒有動漫更新 😴' });
    return;
  }

  const enriched = await assembleDailyAnimes(animes, deps.enricher);
  const date = todayCSTDate();

  await deps.repository.save(enriched, date);
  const saved = await deps.repository.load(date);

  const dataToSend = saved.length > 0 ? saved : enriched;
  const issues = validateData(dataToSend);

  if (issues.length > 0) {
    const msg = `⚠️ 資料結構異常，推播已暫停：\n${issues.join('\n')}`;
    console.error(msg);
    await deps.messenger.push({ type: 'text', text: msg });
    return;
  }

  await deps.messenger.push(buildFlexMessage(dataToSend));
}
