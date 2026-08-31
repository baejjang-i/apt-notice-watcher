import * as cheerio from 'cheerio';
import config from '../config.js';
import { getHtml, getBinary, postForm, clearCookies } from './http.js';

// 아이콘/구분선 등 본문과 무관한 장식 이미지는 제외합니다.
const DECORATIVE_IMG = /spacer|blank\.gif|icon_|btn_|line_|_bg\.(gif|png)/i;

const LOGIN_WALL = /로그인하셔야|로그인 후 이용|이용권한이 없습니다/;

export class LoginError extends Error {}

// 캡차·2단계 인증이 없는 단순 POST 로그인입니다.
// 성공 여부는 응답 문구가 아니라 "실제로 상세 글이 열리는가"로 판정합니다.
export async function login(probeUrl) {
  const id = process.env.SITE_ID;
  const pwd = process.env.SITE_PW;
  if (!id || !pwd) throw new LoginError('SITE_ID / SITE_PW 환경변수가 없습니다');

  clearCookies();
  await getHtml(config.site.base + '/', { label: '메인(세션 발급)' });
  const res = await postForm(config.site.loginUrl, { id, pwd }, { label: '로그인' });

  if (/아이디|비밀번호/.test(res) && /확인|일치하지|없습니다/.test(res) && res.length < 3000) {
    throw new LoginError('아이디 또는 비밀번호가 거부되었습니다');
  }
  if (probeUrl) {
    const probe = await getHtml(probeUrl, { label: '로그인 확인용 상세' });
    if (LOGIN_WALL.test(probe)) {
      throw new LoginError('로그인은 통과했으나 상세 글이 열리지 않습니다 (권한 또는 세션 문제)');
    }
    return probe;
  }
  return null;
}

// 이 사이트의 하위 페이지(메인 제외)는 전부 이 표 구조를 공유합니다.
//   <table class="body_layout_c"><tr>
//     <td style="width:190px">  좌측 퀵메뉴 + 로그인 박스 (#lmenu_v2 등)
//     <td style="width:762px">  실제 게시글 내용
// 좌측 칸에는 "소장인사말 직원현황 관리계획서 …" 같은 메뉴 텍스트가 줄줄이 이어져 있어,
// 실제 본문이 "이미지만 있고 텍스트가 거의 없는" 글일 경우 이 메뉴 쪽이 더 길어서
// 본문으로 잘못 뽑히는 문제가 있었습니다. 아예 스코프를 오른쪽 칸으로 좁혀 원천 차단합니다.
function contentScope($) {
  // cheerio가 HTML5 파서로 tbody를 자동 삽입하므로 두 형태를 모두 지원합니다.
  const scope = $('table.body_layout_c > tbody > tr > td, table.body_layout_c > tr > td').last();
  return scope.length ? scope : $('body'); // 템플릿이 다른 페이지면 문서 전체로 완화
}

// 상세 페이지에서 전체 제목과 본문을 뽑습니다.
// 이 사이트는 테이블 레이아웃이라 고정 셀렉터가 없어, 스코프 내에서 텍스트가 가장 실한
// 블록을 고릅니다. 실제로 본문이 비어 있으면(이미지만 첨부) body는 null이 되는 게 맞습니다.
export function extractDetail(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();
  const scope = contentScope($);

  let title = null;
  for (const sel of ['td.td_subject', '.board_view_title', 'h3', 'h2']) {
    const t = scope.find(sel).first().text().trim();
    if (t && t.length > 1 && t.length < 200) { title = t; break; }
  }

  let best = '';
  scope.find('td, div').each((_, el) => {
    const $el = $(el);
    // 자식에 표/블록이 많으면 컨테이너일 뿐 본문이 아닙니다.
    if ($el.find('table, td, div').length > 2) return;
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length > best.length) best = text;
  });
  const body = best.length >= 20 ? best : null;

  // 이 사이트의 실제 첨부/본문 이미지는 전부 /board/attach/ 경로로 업로드됩니다.
  // 이 패턴에 맞는 이미지를 우선 채택하고, 없을 때만 스코프 내 다른 이미지로 보완합니다.
  const seen = new Set();
  const images = [];
  const pushImg = (src) => {
    if (!src || DECORATIVE_IMG.test(src)) return;
    try {
      const abs = new URL(src, config.site.base).toString();
      if (!seen.has(abs)) { seen.add(abs); images.push(abs); }
    } catch {
      /* 잘못된 URL은 건너뜀 */
    }
  };
  scope.find('img').each((_, img) => {
    const src = $(img).attr('src');
    if (src && /\/board\/attach\//i.test(src)) pushImg(src);
  });
  if (images.length === 0) {
    scope.find('img').each((_, img) => pushImg($(img).attr('src')));
  }

  return { title, body, images, blocked: LOGIN_WALL.test(html) };
}

// 진단용: 스코프로 잡은 영역의 실제 HTML을 그대로 보여줍니다.
// 휴리스틱이 엉뚱한 블록을 고를 때 원인 파악용으로만 씁니다.
export function debugScopeHtml(html, maxLen = 4000) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();
  const scope = contentScope($);
  return ($.html(scope) ?? '').slice(0, maxLen);
}

export async function fetchDetail(item) {
  const html = await getHtml(item.url, { label: `상세 ${item.id}` });
  const d = extractDetail(html);
  if (d.blocked) throw new LoginError(`상세 ${item.id}이(가) 로그인 벽에 막혔습니다`);
  return d;
}

// 본문 이미지를 실제 바이트로 내려받습니다 (로그인 세션 재사용).
// 실패한 개별 이미지는 건너뛰고 나머지는 그대로 진행합니다.
export async function fetchImages(urls) {
  const { maxImages, maxImageBytes } = config.detail;
  const out = [];
  for (const url of (urls ?? []).slice(0, maxImages)) {
    try {
      const { buffer, contentType } = await getBinary(url, { label: `이미지 ${url}` });
      if (buffer.length > maxImageBytes) {
        console.warn(`[warn] 이미지 용량 초과(${buffer.length}B), 건너뜀: ${url}`);
        continue;
      }
      out.push({ buffer, contentType, url });
    } catch (err) {
      console.warn(`[warn] 이미지 다운로드 실패: ${url} (${err.message})`);
    }
  }
  return out;
}
