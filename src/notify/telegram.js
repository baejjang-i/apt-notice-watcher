import { postJsonApi } from '../http.js';

// 텔레그램은 글자수 제한이 넉넉해(4096자) 본문 전문을 담을 수 있습니다.
// token/chatId를 파라미터로 받아, 공지 알림 봇과 관리자 경보 봇을 같은 함수로 처리합니다.
export async function sendTelegram(
  text,
  chatId = process.env.TELEGRAM_CHAT_ID,
  token = process.env.TELEGRAM_BOT_TOKEN
) {
  if (!token) throw new Error('텔레그램 봇 토큰이 없습니다');
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

// 시스템 경보 전용 봇 (사이트 오류·로그인 실패·하트비트 등, 관리자만 수신).
// 공지 알림 봇("도파타 알리미")과 완전히 분리해, 평상시엔 도착하는 게 이상한 신호로
// 바로 구분되게 합니다. TELEGRAM_ADMIN_BOT_TOKEN/CHAT_ID가 없으면 공지 알림 봇으로
// 자동 대체되어, 별도 봇을 아직 안 만들었어도 경보 자체는 끊기지 않습니다.
export async function sendTelegramAdmin(text) {
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  await sendTelegram(text, chatId, token);
}

function requireNoticeBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 환경변수가 없습니다');
  return token;
}

// 본문 이미지 1장 전송. doduck.co.kr 이미지는 로그인 벽 뒤에 있어
// 텔레그램 서버가 URL을 직접 가져올 수 없으므로, 우리가 먼저 내려받은
// 바이트를 multipart로 업로드합니다. (공지 알림 봇 전용 — 관리자 봇은 이미지 미사용)
async function sendPhoto(chatId, image) {
  const token = requireNoticeBotToken();
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('photo', new Blob([image.buffer], { type: image.contentType }), 'image.jpg');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`텔레그램 이미지 발송 실패: ${json.description ?? JSON.stringify(json)}`);
  return json;
}

// 이미지 2~10장은 앨범(sendMediaGroup)으로 한 번에 보냅니다.
async function sendMediaGroup(chatId, images) {
  const token = requireNoticeBotToken();
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set(
    'media',
    JSON.stringify(images.map((_, i) => ({ type: 'photo', media: `attach://photo${i}` })))
  );
  images.forEach((img, i) => {
    form.set(`photo${i}`, new Blob([img.buffer], { type: img.contentType }), `image${i}.jpg`);
  });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`텔레그램 앨범 발송 실패: ${json.description ?? JSON.stringify(json)}`);
  return json;
}

// 이미지 배열을 chatId 하나에 전송. 10장 넘으면 앨범 단위로 나눕니다.
export async function sendTelegramImages(chatId, images) {
  if (!chatId || !images?.length) return;
  if (images.length === 1) {
    await sendPhoto(chatId, images[0]);
    return;
  }
  for (let i = 0; i < images.length; i += 10) {
    await sendMediaGroup(chatId, images.slice(i, i + 10));
  }
}
