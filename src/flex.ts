import { messagingApi } from '@line/bot-sdk';
type FlexBubble = messagingApi.FlexBubble;
type FlexCarousel = messagingApi.FlexCarousel;
type FlexMessage = messagingApi.FlexMessage;

export interface EnrichedAnime {
  airingAt: number;
  episode: number;
  mediaId: number;
  chineseTitle: string;
  nativeTitle: string;
  coverImage: string;
  studio: string;
  voiceActors: string[];
  season: number;
}

const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function formatAirTime(airingAt: number): string {
  const cst = new Date(airingAt * 1000 + 8 * 60 * 60 * 1000);
  const day = DAY_ZH[cst.getUTCDay()];
  const hh = String(cst.getUTCHours()).padStart(2, '0');
  const mm = String(cst.getUTCMinutes()).padStart(2, '0');
  return `每週${day} ${hh}:${mm}`;
}

function buildBubble(anime: EnrichedAnime): FlexBubble {
  const titleText =
    anime.chineseTitle !== anime.nativeTitle
      ? `${anime.chineseTitle}（${anime.nativeTitle}）`
      : anime.chineseTitle;

  const airTime = formatAirTime(anime.airingAt);

  return {
    type: 'bubble',
    hero: {
      type: 'image',
      url: anime.coverImage || 'https://placehold.co/300x400/1a1a2e/aaaaaa?text=No+Image',
      size: 'full',
      aspectRatio: '3:4',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1a1a2e',
      paddingAll: 'lg',
      contents: [
        {
          type: 'text',
          text: titleText,
          weight: 'bold',
          size: 'sm',
          color: '#ffffff',
          wrap: true,
        },
        {
          type: 'separator',
          margin: 'sm',
          color: '#2d2d4e',
        },
        {
          type: 'text',
          text: `製作公司：${anime.studio}`,
          size: 'xs',
          color: '#aaaaaa',
          margin: 'sm',
        },
        {
          type: 'text',
          text: `更新時間：${airTime}`,
          size: 'xs',
          color: '#e94560',
          margin: 'xs',
        },
        {
          type: 'text',
          text: `目前集數：第${anime.season}季第${anime.episode}集`,
          size: 'xs',
          color: '#e94560',
          margin: 'xs',
        },
        {
          type: 'text',
          text: anime.voiceActors.length > 0
            ? `聲優：${anime.voiceActors.join('・')}`
            : '聲優：暫無資料',
          size: 'xs',
          color: '#aaaaaa',
          wrap: true,
          margin: 'xs',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#12122a',
      paddingAll: 'sm',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '動漫簡介',
            data: `synopsis:${anime.mediaId}`,
            displayText: '動漫簡介',
          },
          style: 'primary',
          color: '#3d3d6b',
          height: 'sm',
        },
      ],
    },
  };
}

export function buildFlexMessage(animes: EnrichedAnime[]): FlexMessage {
  const carousel: FlexCarousel = {
    type: 'carousel',
    contents: animes.slice(0, 12).map(buildBubble),
  };

  return {
    type: 'flex',
    altText: `📺 今日更新動漫 - 共 ${animes.length} 部`,
    contents: carousel,
  };
}
