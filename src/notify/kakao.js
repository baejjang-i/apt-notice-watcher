import { postJsonApi } from '../http.js';

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const MEMO_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';

// 카카오 기본 text 템플릿은 200자 제한입니다. 여유를 두고 자릅니다.
export const TEXT_LIMIT = 195;

// refresh_token이 새로 내려오면(잔여 1개월 미만) 반드시 교체해야 합니다.
// 놓치면 두 달 뒤 조용히 죽으므로, 호출부에서 경보를 띄웁니다.
export async function getAccessToken() {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const refreshToken = process.env.KAKAO_REFRESH_TOKEN;
  if (!clientId || !refreshToken) {
    throw new Error('KAKAO_REST_API_KEY / KAKAO_REFRESH_TOKEN 환경변수가 없습니다');
  }

  const form = {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  };
  if (process.env.KAKAO_CLIENT_SECRET) form.client_secret = process.env.KAKAO_CLIENT_SECRET;

  const { ok, status, json } = await postJsonApi(TOKEN_URL, { form });
  if (!ok || !json.access_token) {
    throw new Error(`카카오 토큰 갱신 실패 (${status}): ${JSON.stringify(json)}`);
  }
  return {
    accessToken: json.access_token,
    newRefreshToken: json.refresh_token ?? null,
    refreshExpiresIn: json.refresh_token_expires_in ?? null,
  };
}

export function truncateForKakao(text) {
  const t = text.replace(/\s+\n/g, '\n').trim();
  return t.length <= TEXT_LIMIT ? t : t.slice(0, TEXT_LIMIT - 1) + '…';
}

// "나에게 보내기" — 개인 계정으로 무료 사용 가능하며 수신자는 본인 1명입니다.
//
// link.web_url에 상세 글 딥링크를 넣어도, 개인(비즈니스 미인증) 카카오 앱에서는
// "공지 보기" 버튼이 등록된 플랫폼 도메인 루트로만 이동하는 경우가 실제로 관찰됐습니다
// (API 응답은 정상 성공을 반환하는데도 버튼 목적지가 치환되는 케이스). 그래서 이 필드는
// 최선을 다해 채우되, 실제 목적지는 text 안에 URL을 그대로 노출해 보장합니다
// (호출부 buildKakaoText 참고) — 텍스트에 노출된 URL은 카카오톡이 자동으로 링크 처리합니다.
export async function sendKakaoMemo(accessToken, text, linkUrl) {
  const templateObject = {
    object_type: 'text',
    text: truncateForKakao(text),
    link: linkUrl
      ? { web_url: linkUrl, mobile_web_url: linkUrl }
      : { web_url: 'http://www.doduck.co.kr/', mobile_web_url: 'http://www.doduck.co.kr/' },
    button_title: '공지 보기',
  };

  const { ok, status, json } = await postJsonApi(MEMO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    form: { template_object: JSON.stringify(templateObject) },
  });

  // 성공 시 {"result_code":0}
  if (!ok || json?.result_code !== 0) {
    throw new Error(`카카오 발송 실패 (${status}): ${JSON.stringify(json)}`);
  }
  return true;
}
