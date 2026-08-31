import { postJsonApi } from '../http.js';

/*
 * 네이버 밴드 Open API (https://developers.band.us/develop/guide/api)
 *
 * - 토큰: 개발자센터 My Apps → "밴드 계정 연동"으로 발급. expires_in ≈ 10년이라
 *   카카오처럼 주기적 갱신이 필요 없습니다. 만료/무효 시 result_code 10401.
 * - 글 작성 API는 content(문자열) 하나만 받습니다. 사진 첨부 파라미터가 없어
 *   (사진은 읽기 API만 존재) 이미지는 붙일 수 없습니다. 호출부에서
 *   "사진 N장은 링크에서 확인" 안내문으로 대신합니다.
 * - 호출량 제한(1001/1002/1003)이 있으므로 공지 1건당 1회만 호출합니다.
 */
const BANDS_URL = 'https://openapi.band.us/v2.1/bands';
const POST_URL = 'https://openapi.band.us/v2.2/band/post/create';

function requireEnv() {
  const token = process.env.BAND_ACCESS_TOKEN;
  if (!token) throw new Error('BAND_ACCESS_TOKEN 환경변수가 없습니다');
  return token;
}

function describeError(json) {
  const code = json?.result_code;
  const hints = {
    10401: '토큰이 없거나 만료됨 — 개발자센터에서 "밴드 계정 연동"으로 재발급 필요',
    10403: '권한 없음 — 앱에 WRITE_POST 권한이 있는지 확인',
    1001: '앱 호출량 초과',
    1002: '사용자 호출량 초과',
    1003: '짧은 시간 연속 호출 제한 — 잠시 후 재시도',
    3001: '본문 글자수 초과',
    60102: '밴드 멤버가 아님 — 토큰 주인 계정이 해당 밴드에 가입돼 있어야 함',
    60200: 'band_key가 잘못됐거나 밴드가 없음',
  };
  const msg = json?.result_data?.message ?? json?.message ?? '';
  return `result_code=${code} ${msg} ${hints[code] ? `(${hints[code]})` : ''}`.trim();
}

// 토큰 주인이 가입한 밴드 목록. band_key를 알아낼 때 씁니다.
export async function listBands() {
  const token = requireEnv();
  const res = await fetch(`${BANDS_URL}?access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (json?.result_code !== 1) throw new Error(`밴드 목록 조회 실패: ${describeError(json)}`);
  return json.result_data?.bands ?? [];
}

export async function sendBandPost(content, { doPush = true } = {}) {
  const token = requireEnv();
  const bandKey = process.env.BAND_KEY;
  if (!bandKey) throw new Error('BAND_KEY 환경변수가 없습니다');

  const { ok, status, json } = await postJsonApi(POST_URL, {
    form: {
      access_token: token,
      band_key: bandKey,
      content,
      do_push: doPush ? 'true' : 'false',
    },
  });
  if (!ok || json?.result_code !== 1) {
    throw new Error(`밴드 글 작성 실패 (${status}): ${describeError(json)}`);
  }
  return json.result_data?.post_key ?? null;
}
