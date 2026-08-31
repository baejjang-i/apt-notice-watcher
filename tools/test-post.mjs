// 특정 글 하나를 지정해 실제로 발송하는 진단 도구.
// 최신 목록(main 페이지 상단 ~15건)에 없는 오래된 글도 URL만 알면 테스트할 수 있습니다.
// 여러 이미지의 순서 보존 여부 확인 등에 씁니다. state(seenIds)는 건드리지 않습니다.
//
//   node tools/test-post.mjs "<title>" "<url>"
import { login, fetchDetail, fetchImages, LoginError } from '../src/detail.js';
import { buildMessages } from '../src/messages.js';
import * as notifier from '../src/notify/index.js';

const [title, url] = process.argv.slice(2);
if (!title || !url) {
  console.error('사용법: node tools/test-post.mjs "<title>" "<url>"');
  process.exit(1);
}

const code = new URL(url).searchParams.get('code') ?? 'test';
const item = { id: code, titleShort: title, postedAt: '(진단 발송)', url };

console.log(`대상 글: [${item.id}] ${item.titleShort}\n  ${item.url}\n`);

await login(item.url);
console.log('로그인 성공.');

let detail = null;
let images = [];
try {
  detail = await fetchDetail(item);
  console.log(`제목: ${detail.title}`);
  console.log(`본문(${detail.body?.length ?? 0}자): ${(detail.body ?? '(없음)').slice(0, 200)}`);
  console.log(`이미지 URL(본문 순서):`);
  detail.images.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

  if (detail.images.length) {
    images = await fetchImages(detail.images);
    console.log(`\n다운로드된 이미지(전송 순서와 동일):`);
    images.forEach((img, i) => console.log(`  ${i + 1}. ${img.url} (${img.buffer.length}B, ${img.contentType})`));
  }
} catch (err) {
  console.error(`상세/이미지 취득 실패: ${err.message}`);
  if (err instanceof LoginError) throw err;
}

const msg = buildMessages(item, detail, images.length);
console.log('\n--- 발송 문구 미리보기 (텔레그램/밴드 공통 fullText) ---');
console.log(msg.fullText);

const res = await notifier.notify(msg);
console.log(`\n[send] kakao=${res.kakao} telegram=${res.telegram} channel=${res.channel} band=${res.band}`);
if (res.errors.length) console.log('오류:', res.errors.join(' | '));

if (images.length && (res.telegram === 'sent' || res.channel === 'sent')) {
  const imgRes = await notifier.sendImages(images);
  console.log(`[send] images personal=${imgRes.personal} channel=${imgRes.channel}`);
}
