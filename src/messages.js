import config from '../config.js';
import { TEXT_LIMIT as KAKAO_TEXT_LIMIT } from './notify/kakao.js';

// detail이 null이면 "취득 자체를 못 한 것"(로그인 실패 등)이고,
// detail은 있는데 detail.body가 null이면 "실제로 본문 내용이 없는 글"입니다.
// (이 사이트는 이미지만 첨부하고 텍스트는 안 쓰는 공지가 많습니다.)
export function resolveBodyText(detail) {
  if (!detail) return '(본문을 가져오지 못했습니다. 링크에서 확인해 주세요)';
  if (!detail.body) return '(본문 내용은 없습니다.)';
  return detail.body.slice(0, config.detail.maxBodyChars);
}

// 카카오는 195자 제한이라, 링크가 잘려서 깨지지 않도록 URL 몫을 먼저 떼어두고
// 남는 공간에 제목·날짜·본문을 채웁니다. (카카오 버튼 링크만 믿으면 안 되는 이유는
// notify/kakao.js의 link 필드 주석 참고 — 텍스트에도 링크를 그대로 노출합니다.)
export function buildKakaoText(title, postedAt, body, url) {
  const urlPart = `\n\n${url}`;
  const headBudget = KAKAO_TEXT_LIMIT - urlPart.length;
  const head = `[새 공지] ${title}\n${postedAt}`;

  if (head.length > headBudget) {
    return head.slice(0, Math.max(0, headBudget - 1)) + '…' + urlPart;
  }
  const bodyBudget = headBudget - head.length - 2; // '\n\n' 몫
  if (bodyBudget > 10 && body) {
    const bodyPart = body.length > bodyBudget ? body.slice(0, bodyBudget - 1) + '…' : body;
    return `${head}\n\n${bodyPart}${urlPart}`;
  }
  return head + urlPart;
}

export function buildMessages(item, detail, imageCount = 0) {
  const title = detail?.title || item.titleShort;
  const body = resolveBodyText(detail);

  const kakaoText = buildKakaoText(title, item.postedAt, body, item.url);

  const fullText =
    `📢 새 공지 · ${config.site.name}\n\n` +
    `${title}\n${item.postedAt}\n\n${body}\n\n${item.url}`;

  const linkOnly =
    `📢 새 공지 · ${config.site.name}\n\n${title}\n${item.postedAt}\n\n` +
    `아래 링크에서 확인하세요 (홈페이지 로그인 필요)\n${item.url}`;

  // 텔레그램 채널: 사진은 별도 메시지로 첨부되므로 텍스트에는 언급 불필요
  const channelText = config.notify.telegram.channel?.includeBody ? fullText : linkOnly;

  // 네이버 밴드: 사진 첨부 API가 없어 텍스트로만 발행. 사진이 있으면 링크로 유도.
  const photoNote = imageCount > 0
    ? `\n\n📷 첨부 사진 ${imageCount}장은 위 링크에서 확인하세요.`
    : '';
  const bandText = (config.notify.band?.includeBody ? fullText : linkOnly) + photoNote;

  return { kakaoText, fullText, channelText, bandText, linkUrl: item.url };
}
