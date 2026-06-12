import 'dotenv/config';
import zlib from 'zlib';
import { messagingApi } from '@line/bot-sdk';

// CRC32 needed for valid PNG chunk checksums
function crc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

// Generates a minimal solid-color PNG (LINE Rich Menu requires 2500x843 or 2500x1686)
function generateSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // RGB color type
  const ihdr = pngChunk('IHDR', ihdrData);

  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(height * rowSize);
  raw[0] = 0; // row filter: None
  for (let x = 0; x < width; x++) {
    raw[1 + x * 3] = r;
    raw[1 + x * 3 + 1] = g;
    raw[1 + x * 3 + 2] = b;
  }
  for (let y = 1; y < height; y++) raw.copyWithin(y * rowSize, 0, rowSize);

  const idat = pngChunk('IDAT', zlib.deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

async function main(): Promise<void> {
  const token = process.env.LINE_ASSESS_TOKEN;
  if (!token) throw new Error('LINE_ASSESS_TOKEN is not set');

  const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken: token });

  // Step 1: Create Rich Menu definition
  const { richMenuId } = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'AnimeBot Main Menu',
    chatBarText: '今日動漫',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 2500, height: 843 },
        action: {
          type: 'postback',
          label: '📺 今日動漫',
          data: 'action:today_anime',
          displayText: '📺 今日動漫',
        },
      },
    ],
  });
  console.log(`✅ 建立 Rich Menu: ${richMenuId}`);

  // Step 2: Upload background image (#1a1a2e dark blue)
  // Replace this image with a custom design for better UX
  const imgBuffer = generateSolidPng(2500, 843, 26, 26, 46);
  await blobClient.setRichMenuImage(richMenuId, new Blob([new Uint8Array(imgBuffer)], { type: 'image/png' }));
  console.log('✅ 上傳選單背景圖片');

  // Step 3: Set as default for all channel members
  await client.setDefaultRichMenu(richMenuId);
  console.log('✅ 已設定為預設選單（所有成員可見）');
  console.log('🎉 LINE Rich Menu 設定完成！點擊選單即可重新顯示今日動漫。');
}

main().catch((err) => {
  console.error('❌ 設定失敗:', err);
  process.exit(1);
});
