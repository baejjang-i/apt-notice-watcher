import config from '../../config.js';
import { getAccessToken, sendKakaoMemo } from './kakao.js';
import { sendTelegram, sendTelegramChannel, sendTelegramImages, sendTelegramAdmin } from './telegram.js';
import { sendBandPost } from './band.js';

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
 * 입주민 구독용 채널(텔레그램 채널·네이버 밴드)이 설정되어 있으면 그쪽에도 함께 발행합니다.
 * @returns {{kakao,telegram,channel,band: 'sent'|'failed'|'off', errors: string[]}}
 */
export async function notify({ kakaoText, fullText, channelText, bandText, linkUrl }) {
  const result = { kakao: 'off', telegram: 'off', channel: 'off', band: 'off', errors: [] };
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

  // 네이버 밴드(입주민 주채널). 토큰/키가 없으면 조용히 건너뜁니다.
  const band = config.notify.band;
  if (band?.enabled && process.env.BAND_ACCESS_TOKEN && process.env.BAND_KEY) {
    try {
      await sendBandPost(bandText ?? fullText, { doPush: band.doPush });
      result.band = 'sent';
    } catch (err) {
      result.band = 'failed';
      result.errors.push(`band: ${err.message}`);
    }
  }
  return result;
}

/**
 * 본문 이미지를 개인 텔레그램·입주민 채널에 전송합니다.
 * 카카오는 텍스트 템플릿만 지원해 이미지를 담을 수 없어 대상에서 제외합니다.
 * @returns {{personal,channel: 'sent'|'failed'|'off'}}
 */
export async function sendImages(images) {
  const out = { personal: 'off', channel: 'off' };
  if (!images?.length || !config.notify.telegram.enabled) return out;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) {
    try {
      await sendTelegramImages(chatId, images);
      out.personal = 'sent';
    } catch (err) {
      out.personal = 'failed';
      console.error(`[images] 개인 채널 전송 실패: ${err.message}`);
    }
  }

  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (config.notify.telegram.channel?.enabled && channelId) {
    try {
      await sendTelegramImages(channelId, images);
      out.channel = 'sent';
    } catch (err) {
      out.channel = 'failed';
      console.error(`[images] 입주민 채널 전송 실패: ${err.message}`);
    }
  }
  return out;
}

// 운영 경보(로그인 실패·파싱 오류·하트비트 등). 텔레그램은 공지 알림 봇과 분리된
// 관리자 전용 봇으로 보내, 평소 안 오던 채널에서 메시지가 오면 그 자체로 "뭔가 문제"
// 신호가 되게 합니다. 관리자 봇을 아직 안 만들었으면 공지 알림 봇으로 자동 대체됩니다
// (sendTelegramAdmin 내부 폴백).
export async function alert(message) {
  const text = `[공지알리미 경보]\n${message}`;
  const out = { kakao: 'off', telegram: 'off' };
  if (config.notify.kakao.enabled) {
    try { await sendKakaoMemo(await token(), text, null); out.kakao = 'sent'; }
    catch (err) { out.kakao = 'failed'; console.error(`[alert] 카카오 실패: ${err.message}`); }
  }
  if (config.notify.telegram.enabled) {
    try { await sendTelegramAdmin(text); out.telegram = 'sent'; }
    catch (err) { out.telegram = 'failed'; console.error(`[alert] 텔레그램(관리자) 실패: ${err.message}`); }
  }
  return out;
}
