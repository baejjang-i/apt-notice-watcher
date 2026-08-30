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

// 상세 페이지에서 전체 제목과 본문을 뽑습니다.
// 이 사이트는 테이블 레이아웃이라 고정 셀렉터가 없어, 텍스트가 가장 실한 블록을 고릅니다.
export function extractDetail(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();

  let title = null;
  // 상세 화면의 제목은 보통 td.td_subject 또는 굵은 헤더 셀에 들어갑니다.
  for (const sel of ['td.td_subject', '.board_view_title', 'h3', 'h2']) {
    const t = $(sel).first().text().trim();
    if (t && t.length > 1 && t.length < 200) { title = t; break; }
  }

  let best = '';
  let bestEl = null;
  $('td, div').each((_, el) => {
    const $el = $(el);
    // 자식에 표/블록이 많으면 컨테이너일 뿐 본문이 아닙니다.
    if ($el.find('table, td, div').length > 2) return;
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length > best.length) { best = text; bestEl = $el; }
  });

  const body = best.length >= 20 ? best : null;

  // 본문 블록(WYSIWYG 에디터로 작성된 영역)에 인라인으로 들어간 이미지만 취합니다.
  const images = [];
  if (bestEl) {
    bestEl.find('img').each((_, img) => {
      const src = $(img).attr('src');
      if (!src || DECORATIVE_IMG.test(src)) return;
      try {
        images.push(new URL(src, config.site.base).toString());
      } catch {
        /* 잘못된 URL은 건너뜀 */
      }
    });
  }

  return { title, body, images, blocked: LOGIN_WALL.test(html) };
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
