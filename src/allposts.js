// "전체 게시글" 감시 — 공지사항(생활지원센터-공지사항)을 제외한 사이트 내 모든 게시판의
// 새 글을 별도 텔레그램 봇으로 알립니다. 여러 게시판 템플릿이 섞여 있어 본문/이미지는
// 가져오지 않고 제목·게시판·작성일·링크만 보냅니다(공지사항 봇과는 완전히 분리된 파이프라인).
import config from '../config.js';
import { getHtml } from './http.js';
import { login } from './detail.js';
import { parseRecentPosts, excludeConfiguredBoards } from './recentPosts.js';
import { loadState, saveState, pickNew } from './state.js';
import { sendAllPosts, sendAllPostsChannel } from './notify/telegram.js';

const args = new Set(process.argv.slice(2));
const SEED = args.has('--seed');
const DRY = args.has('--dry-run');

const STATE_PATH = config.allPosts.statePath;

function buildLine(item) {
  return `🆕 [${item.boardLabel}] ${item.titleShort}\n${item.postedAt}\n${item.url}`;
}

async function main() {
  if (!config.allPosts?.enabled) {
    console.log('[allposts] 비활성화됨 (config.allPosts.enabled=false)');
    return;
  }

  const state = loadState(STATE_PATH);

  // 이 목록(rpost)은 공지 위젯과 달리 로그인 없이는 볼 수 없습니다.
  try {
    await login(config.allPosts.listUrl);
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

  for (const item of fresh) {
    const text = buildLine(item);

    if (DRY) {
      console.log('\n--- DRY RUN ---\n' + text);
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

    // 어느 한 쪽이라도 성공해야 "본 것"으로 처리. 봇 미설정 시 다음 실행에서 재시도됩니다.
    if (personal || channel) state.seenIds.push(item.id);

    await new Promise((r) => setTimeout(r, 500));
  }

  saveState(state, STATE_PATH);
}

main().catch((err) => {
  console.error('[allposts fatal]', err);
  process.exitCode = 1;
});
