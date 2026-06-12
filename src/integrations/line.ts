import { messagingApi } from '@line/bot-sdk';
import type { MessageSender } from '../interfaces/MessageSender';
type Message = messagingApi.Message;

function getClient(): messagingApi.MessagingApiClient {
  const token = process.env.LINE_ASSESS_TOKEN;
  if (!token) throw new Error('LINE_ASSESS_TOKEN is not set');
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
}

export async function pushMessage(message: Message): Promise<void> {
  const userId = process.env.LINE_USER_ID;
  if (!userId) throw new Error('LINE_USER_ID is not set');
  await getClient().pushMessage({ to: userId, messages: [message] });
}

export async function replyMessage(replyToken: string, message: Message): Promise<void> {
  await getClient().replyMessage({ replyToken, messages: [message] });
}

// LINE 對 MessageSender 合約的實作。
export const lineMessenger: MessageSender = {
  push: pushMessage,
  reply: replyMessage,
};
