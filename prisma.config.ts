import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// schema 與 migrations 收進 src/db/prisma 底下（DB 相關都在 DB 資料夾）。
// 有了這個設定檔，Prisma 不再自動載入 .env，故在最上方 import 'dotenv/config' 補上。
export default defineConfig({
  schema: path.join('src', 'db', 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join('src', 'db', 'prisma', 'migrations'),
  },
});
