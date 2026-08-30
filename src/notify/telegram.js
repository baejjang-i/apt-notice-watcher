import { postJsonApi } from '../http.js';

// 텔레그램은 글자수 제한이 넉넉해(4096자) 본문 전문을 담을 수 있습니다.
// 카카오 도달 여부를 눈으로 비교하는 대조군 역할도 합니다.
export async function sendTelegram(text, chatId = process.env.TELEGRAM_CHAT_ID) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 환경변수가 없습니다');
  if (!chatId) throw new Error('보낼 chat_id가 없습니다');

  const { ok, status, json } = await postJsonApi(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { body: { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: false } }
  );
  if (!ok || json?.ok === false) {
    throw new Error(`텔레그램 발송 실패 (${status}): ${json?.description ?? JSON.stringify(json)}`);
  }
  return true;
}

// 입주민 구독용 채널. 미설정이면 조용히 건너뜁니다.
export async function sendTelegramChannel(text) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return false;
  await sendTelegram(text, channelId);
  return true;
}
