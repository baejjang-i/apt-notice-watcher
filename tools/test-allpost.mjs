// "전체 게시글" 봇으로 특정 글 하나를 지정해 실제 발송하는 진단 도구.
// 게시판별 검증(카테고리별 테스트)에 사용. state(seenIds)는 건드리지 않습니다.
//
//   node tools/test-allpost.mjs "<boardLabel>" "<title>" "<url>"
import { login, fetchDetail, fetchImages, LoginError } from '../src/detail.js';
import { resolveBodyText } from '../src/messages.js';
import { sendAllPosts, sendAllPostsChannel, sendTelegramImages } from '../src/notify/telegram.js';

const [boardLabel, title, url] = process.argv.slice(2);
if (!boardLabel || !title || !url) {
  console.error('사용법: node tools/test-allpost.mjs "<boardLabel>" "<title>" "<url>"');
  process.exit(1);
}

const code = new URL(url).searchParams.get('code') ?? 'test';
const item = { id: code, boardLabel, titleShort: title, postedAt: '(진단 발송)', url };

console.log(`대상 글: [${item.id}] (${boardLabel}) ${title}\n  ${url}\n`);

await login(url);
console.log('로그인 성공.');

let detail = null;
let images = [];
try {
  detail = await fetchDetail(item);
  console.log(`제목: ${detail.title}`);
  console.log(`본문(${detail.body?.length ?? 0}자): ${(detail.body ?? '(없음)').slice(0, 150)}`);
  console.log(`이미지: ${detail.images.length}장`);
  if (detail.images.length) images = await fetchImages(detail.images);
} catch (err) {
  console.error(`상세/이미지 취득 실패: ${err.message}`);
  if (err instanceof LoginError) throw err;
}

const text = `🆕 [${item.boardLabel}] ${detail?.title || item.titleShort}\n${item.postedAt}\n\n${resolveBodyText(detail)}\n\n${item.url}`;
console.log('\n--- 발송 문구 미리보기 ---');
console.log(text);

let personal = false;
let channel = false;
try { personal = await sendAllPosts(text); } catch (err) { console.error(`개인 발송 실패: ${err.message}`); }
try { channel = await sendAllPostsChannel(text); } catch (err) { console.error(`채널 발송 실패: ${err.message}`); }
console.log(`\n[send] personal=${personal ? 'sent' : 'off'} channel=${channel ? 'sent' : 'off'}`);

if (images.length && process.env.ALLPOSTS_BOT_TOKEN && (personal || channel)) {
  const chatId = process.env.ALLPOSTS_CHAT_ID;
  const channelId = process.env.ALLPOSTS_CHANNEL_ID;
  if (chatId) {
    await sendTelegramImages(chatId, images, process.env.ALLPOSTS_BOT_TOKEN)
      .then(() => console.log('[send] images personal=sent'))
      .catch((err) => console.error(`개인 이미지 발송 실패: ${err.message}`));
  }
  if (channelId) {
    await sendTelegramImages(channelId, images, process.env.ALLPOSTS_BOT_TOKEN)
      .then(() => console.log('[send] images channel=sent'))
      .catch((err) => console.error(`채널 이미지 발송 실패: ${err.message}`));
  }
}
