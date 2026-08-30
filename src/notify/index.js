import config from '../../config.js';
import { getAccessToken, sendKakaoMemo } from './kakao.js';
import { sendTelegram, sendTelegramChannel } from './telegram.js';

// 카카오 토큰은 실행당 한 번만 발급받아 재사용합니다.
let cachedToken = null;
export let pendingRefreshToken = null;

async function token() {
  if (cachedToken) return cachedToken;
  const { accessToken, newRefreshToken, refreshExpiresIn } = await getAccessToken();
  if (newRefreshToken) pendingRefreshToken = { newRefreshToken, refreshExpiresIn };
  cachedToken = accessToken;
  return cachedToken;
}

/**
 * 카카오를 주채널로, 텔레그램을 보조/폴백으로 발송합니다.
 * 카카오 발송이 실패해도 텔레그램으로는 반드시 나가도록 서로를 격리합니다.
 * 입주민 구독용 채널이 설정되어 있으면 그쪽에도 함께 발행합니다.
 * @returns {{kakao,telegram,channel: 'sent'|'failed'|'off', errors: string[]}}
 */
export async function notify({ kakaoText, fullText, channelText, linkUrl }) {
  const result = { kakao: 'off', telegram: 'off', channel: 'off', errors: [] };
  const tg = config.notify.telegram;

  if (config.notify.kakao.enabled) {
    try {
      await sendKakaoMemo(await token(), kakaoText, linkUrl);
      result.kakao = 'sent';
    } catch (err) {
      result.kakao = 'failed';
      result.errors.push(`kakao: ${err.message}`);
    }
  }

  const needTelegram =
    tg.enabled && (tg.mode === 'always' || (tg.mode === 'fallback' && result.kakao !== 'sent'));

  if (needTelegram) {
    try {
      await sendTelegram(fullText);
      result.telegram = 'sent';
    } catch (err) {
      result.telegram = 'failed';
      result.errors.push(`telegram: ${err.message}`);
    }
  }

  // 입주민 채널은 개인 알림과 독립적으로 발행합니다.
  if (tg.enabled && tg.channel?.enabled) {
    try {
      const sent = await sendTelegramChannel(channelText ?? fullText);
      result.channel = sent ? 'sent' : 'off';
    } catch (err) {
      result.channel = 'failed';
      result.errors.push(`channel: ${err.message}`);
    }
  }
  return result;
}

// 운영 경보는 본문 없이 짧게, 두 채널 모두에 시도합니다.
export async function alert(message) {
  const text = `[공지알리미 경보]\n${message}`;
  const out = { kakao: 'off', telegram: 'off' };
  if (config.notify.kakao.enabled) {
    try { await sendKakaoMemo(await token(), text, null); out.kakao = 'sent'; }
    catch (err) { out.kakao = 'failed'; console.error(`[alert] 카카오 실패: ${err.message}`); }
  }
  if (config.notify.telegram.enabled) {
    try { await sendTelegram(text); out.telegram = 'sent'; }
    catch (err) { out.telegram = 'failed'; console.error(`[alert] 텔레그램 실패: ${err.message}`); }
  }
  return out;
}
