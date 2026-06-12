import { PrismaClient } from '@prisma/client';

// Neon 連線字串含 channel_binding=require，Prisma 不支援該參數；移除後保留
// sslmode=require 走 SSL（沿用重構前對連線字串的處理意圖）。
function databaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? '';
  const [base, qs = ''] = raw.split('?');
  const filtered = qs
    .split('&')
    .filter((p) => !p.startsWith('channel_binding='))
    .join('&');
  return filtered ? `${base}?${filtered}` : base;
}

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl() });
  }
  return prisma;
}
