// "전체 게시글" 감시 — 공지사항(생활지원센터-공지사항)을 제외한 사이트 내 모든 게시판의
// 새 글을 별도 텔레그램 봇으로 알립니다.
//
// board-survey 조사 결과(2026-08-31), 실제 활동 중인 게시판 5개
// (공지사항·민원게시판·선거관리위원회·자유게시판·계약서)가 전부 공지사항과 동일한
// 상세 템플릿(.board_vtit / .view-content-box)을 쓰는 것을 확인했습니다. 그래서 이
// 파이프라인도 공지사항 파이프라인과 동일하게 본문·이미지까지 전부 가져옵니다.
// 새 게시판이 생겨 템플릿이 다르면 detail.js의 폴백 휴리스틱이 대신 동작합니다.
import config from '../config.js';
import { getHtml } from './http.js';
import { login, fetchDetail, fetchImages, LoginError } from './detail.js';
import { resolveBodyText } from './messages.js';
import { parseRecentPosts, excludeConfiguredBoards } from './recentPosts.js';
import { loadState, saveState, pickNew } from './state.js';
import { sendAllPosts, sendAllPostsChannel, sendTelegramImages } from './notify/telegram.js';

const args = new Set(process.argv.slice(2));
const SEED = args.has('--seed');
const DRY = args.has('--dry-run');

const STATE_PATH = config.allPosts.statePath;

function buildText(item, detail) {
  const title = detail?.title || item.titleShort;
  const body = resolveBodyText(detail);
  return `🆕 [${item.boardLabel}] ${title}\n${item.postedAt}\n\n${body}\n\n${item.url}`;
}

async function main() {
  if (!config.allPosts?.enabled) {
    console.log('[allposts] 비활성화됨 (config.allPosts.enabled=false)');
    return;
  }

  const state = loadState(STATE_PATH);

  // 이 목록(rpost)은 공지 위젯과 달리 로그인 없이는 볼 수 없습니다.
  let loggedIn = false;
  try {
    await login(config.allPosts.listUrl);
    loggedIn = true;
  } catch (err) {
    // 로그인 실패 경보는 공지 파이프라인(src/index.js)이 이미 보내므로 여기서는 중복 발송하지 않습니다.
    console.error(`[allposts] 로그인 실패: ${err.message}`);
    return;
  }

  const html = await getHtml(config.allPosts.listUrl, { label: '최근게시글' });
  const parsed = parseRecentPosts(html);
  if (parsed.length === 0) {
    console.error('[allposts] 목록 파싱 0건 — 셀렉터 확인 필요');
    return;
  }

  const items = excludeConfiguredBoards(parsed);
  const fresh = pickNew(items, state).sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`[allposts] 수집 ${parsed.length}건 / 공지 제외 ${items.length}건 / 신규 ${fresh.length}건`);

  // 최초 실행은 저장만 — 기존 글이 한꺼번에 날아가는 사고를 막습니다.
  if (!state.seeded || SEED) {
    state.seenIds = [...state.seenIds, ...items.map((i) => i.id)];
    state.seeded = true;
    saveState(state, STATE_PATH);
    console.log(`[allposts] 시딩 완료: 기존 ${items.length}건을 발송 없이 기록했습니다.`);
    return;
  }

  const botToken = process.env.ALLPOSTS_BOT_TOKEN;
  const chatId = process.env.ALLPOSTS_CHAT_ID;
  const channelId = process.env.ALLPOSTS_CHANNEL_ID;

  for (const item of fresh) {
    let detail = null;
    let images = [];
    if (loggedIn) {
      try {
        detail = await fetchDetail(item);
        if (config.detail.includeImages && detail.images?.length) {
          images = await fetchImages(detail.images);
        }
      } catch (err) {
        console.error(`[allposts] 상세 취득 실패 (${item.id}): ${err.message}`);
        if (err instanceof LoginError) loggedIn = false; // 세션 끊김 — 이후 시도 생략, 제목만으로 발송
      }
    }

    const text = buildText(item, detail);

    if (DRY) {
      console.log('\n--- DRY RUN ---\n' + text);
      if (images.length) console.log(`(이미지 ${images.length}장 첨부 예정)`);
      continue;
    }

    let personal = false;
    let channel = false;
    try {
      personal = await sendAllPosts(text);
    } catch (err) {
      console.error(`[allposts] 개인 발송 실패 (${item.id}): ${err.message}`);
    }
    try {
      channel = await sendAllPostsChannel(text);
    } catch (err) {
      console.error(`[allposts] 채널 발송 실패 (${item.id}): ${err.message}`);
    }
    console.log(`[allposts send] ${item.id} personal=${personal ? 'sent' : 'off'} channel=${channel ? 'sent' : 'off'}`);

    if (images.length && botToken && (personal || channel)) {
      if (chatId) {
        await sendTelegramImages(chatId, images, botToken)
          .catch((err) => console.error(`[allposts] 개인 이미지 발송 실패 (${item.id}): ${err.message}`));
      }
      if (channelId) {
        await sendTelegramImages(channelId, images, botToken)
          .catch((err) => console.error(`[allposts] 채널 이미지 발송 실패 (${item.id}): ${err.message}`));
      }
    }

    // 어느 한 쪽이라도 성공해야 "본 것"으로 처리. 봇 미설정 시 다음 실행에서 재시도됩니다.
    if (personal || channel) state.seenIds.push(item.id);

    await new Promise((r) => setTimeout(r, 800));
  }

  saveState(state, STATE_PATH);
}

main().catch((err) => {
  console.error('[allposts fatal]', err);
  process.exitCode = 1;
});
