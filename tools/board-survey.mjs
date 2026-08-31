// 사이트에 실제로 존재하는 게시판 종류를 rpost(전 게시판 통합 최근글) 여러 페이지에서
// 수집하고, 게시판별 샘플 글 하나씩을 골라 상세 페이지 구조(제목/본문/이미지 추출)가
// 공지사항 게시판과 같은 템플릿인지 검증합니다.
//
//   node tools/board-survey.mjs [조회할 페이지 수, 기본 8]
import config from '../config.js';
import { getHtml } from '../src/http.js';
import { login, extractDetail } from '../src/detail.js';
import { parseRecentPosts } from '../src/recentPosts.js';

const PAGES = Number(process.argv[2] ?? 8);
const BASE = config.allPosts.listUrl;

await login(BASE);
console.log('로그인 성공.\n');

// 1) 여러 페이지를 돌며 게시판 라벨별 샘플(가장 최근 글 1건)을 수집합니다.
const samples = new Map(); // boardLabel -> item
for (let page = 1; page <= PAGES; page++) {
  const url = page === 1 ? BASE : `${BASE}&page=${page}`;
  const html = await getHtml(url, { label: `rpost p${page}` });
  const items = parseRecentPosts(html);
  if (items.length === 0) {
    console.log(`(p${page}) 항목 없음 — 목록 끝으로 보고 중단`);
    break;
  }
  for (const it of items) {
    if (!samples.has(it.boardLabel)) samples.set(it.boardLabel, it);
  }
  console.log(`(p${page}) 누적 게시판 종류: ${samples.size}개`);
}

console.log('\n=== 발견된 게시판 목록 ===');
for (const [label, it] of samples) {
  console.log(`  ${label}  (샘플: [${it.id}] ${it.titleShort})`);
}

// 2) 게시판별 샘플 글 하나씩 상세를 열어 추출 결과를 확인합니다.
console.log('\n=== 게시판별 상세 추출 검증 ===\n');
for (const [label, it] of samples) {
  try {
    const html = await getHtml(it.url, { label: `상세 ${it.id}` });
    const d = extractDetail(html);
    console.log(`[${label}] "${it.titleShort}"`);
    console.log(`  URL: ${it.url}`);
    console.log(`  title 추출: ${d.title ?? '(null)'}`);
    console.log(`  body 길이: ${d.body?.length ?? 0}자  |  images: ${d.images.length}장`);
    console.log(`  body 미리보기: ${(d.body ?? '(없음)').slice(0, 80).replace(/\n/g, ' ')}`);
    console.log(`  blocked(로그인벽 감지): ${d.blocked}`);
  } catch (err) {
    console.log(`[${label}] 취득 실패: ${err.message}`);
  }
  console.log('');
}
