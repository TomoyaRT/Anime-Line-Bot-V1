import type { messagingApi } from '@line/bot-sdk';

// 把訊息推播 / 回覆給使用者的合約。
export interface MessageSender {
  push(message: messagingApi.Message): Promise<void>;
  reply(replyToken: string, message: messagingApi.Message): Promise<void>;
}
