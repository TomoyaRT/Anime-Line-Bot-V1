import { Redis } from '@upstash/redis';
import type { EnrichedAnime } from '../types/Anime';

const CACHE_TTL_SEC = 90000; // 25 小時，確保當天所有查詢都能命中後自動過期

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const cacheKey = (date: string) => `daily_anime:${date}`;

export async function saveToCache(animes: EnrichedAnime[], date: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey(date), animes, { ex: CACHE_TTL_SEC });
  } catch (err) {
    console.warn('⚠️ Redis saveToCache 失敗（推播不受影響）:', err);
  }
}

export async function loadFromCache(date: string): Promise<EnrichedAnime[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get<EnrichedAnime[]>(cacheKey(date));
  } catch (err) {
    console.warn('⚠️ Redis loadFromCache 失敗（fallback 至 DB）:', err);
    return null;
  }
}
