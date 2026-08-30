import config from '../config.js';
import { getHtml } from './http.js';
import { parseNoticeList, applyFilters } from './parse.js';
import { loadState, saveState, pickNew } from './state.js';
import { login, fetchDetail, fetchImages, LoginError } from './detail.js';
import * as notifier from './notify/index.js';

const args = new Set(process.argv.slice(2));
const SEED = args.has('--seed');
const DRY = args.has('--dry-run');
const LOGIN_TEST = args.has('--login-test');

const kstNow = () => new Date(Date.now() + 9 * 60 * 60 * 1000);
const kstDate = () => kstNow().toISOString().slice(0, 10);

function buildMessages(item, detail) {
  const title = detail?.title || item.titleShort;
  const body = detail?.body
    ? detail.body.slice(0, config.detail.maxBodyChars)
    : '(본문을 가져오지 못했습니다. 링크에서 확인해 주세요)';

  // 카카오는 195자 제한이라 제목 위주 + 본문 앞부분만 담깁니다.
  const kakaoText = `[새 공지] ${title}\n${item.postedAt}\n\n${body}`;

  const fullText =
    `📢 새 공지 · ${config.site.name}\n\n` +
    `${title}\n${item.postedAt}\n\n${body}\n\n${item.url}`;

  // 입주민 채널은 불특정 다수가 볼 수 있으므로, 회원 전용 본문은 기본적으로 빼고
  // 제목·날짜·링크만 발행합니다. (config.notify.telegram.channel.includeBody)
  const channelText = config.notify.telegram.channel?.includeBody
    ? fullText
    : `📢 새 공지 · ${config.site.name}\n\n${title}\n${item.postedAt}\n\n` +
      `아래 링크에서 확인하세요 (홈페이지 로그인 필요)\n${item.url}`;

  return { kakaoText, fullText, channelText, linkUrl: item.url };
}

async function main() {
  const state = loadState();
  state.lastRunAt = new Date().toISOString();

  if (LOGIN_TEST) {
    const html = await getHtml(config.site.listUrl, { label: '메인' });
    const probe = applyFilters(parseNoticeList(html))[0];
    if (!probe) throw new Error('로그인 테스트에 쓸 글을 찾지 못했습니다');
    console.log(`  대상 글: [${probe.id}] ${probe.titleShort} (${probe.url})`);
    await login(probe.url);
    const d = await fetchDetail(probe);
    console.log('로그인 성공. 상세 취득 결과:');
    console.log(`  제목: ${d.title}`);
    console.log(`  본문(${d.body?.length ?? 0}자): ${(d.body ?? '(없음)').slice(0, 300)}`);
    console.log(`  이미지(${d.images.length}장): ${d.images.join(', ') || '(없음)'}`);
    return;
  }

  // 1) 목록 수집 — 로그인 없이 메인에서 신규 여부를 판별합니다.
  const html = await getHtml(config.site.listUrl, { label: '메인' });
  const parsed = parseNoticeList(html);

  if (parsed.length === 0) {
    state.emptyParseStreak += 1;
    console.error(`[warn] 목록 파싱 0건 (연속 ${state.emptyParseStreak}회)`);
    if (state.emptyParseStreak === config.emptyParseAlertThreshold) {
      await notifier.alert(
        `공지 목록을 ${state.emptyParseStreak}회 연속 읽지 못했습니다.\n` +
        `사이트 개편으로 셀렉터가 깨졌을 수 있습니다. config.js 확인이 필요합니다.`
      );
    }
    saveState(state);
    return;
  }
  state.emptyParseStreak = 0;

  const items = applyFilters(parsed);
  const fresh = pickNew(items, state).sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`[info] 수집 ${parsed.length}건 / 대상 ${items.length}건 / 신규 ${fresh.length}건`);

  // 2) 최초 실행은 저장만 — 기존 글이 한꺼번에 날아가는 사고를 막습니다.
  if (!state.seeded || SEED) {
    state.seenIds = [...state.seenIds, ...items.map((i) => i.id)];
    state.seeded = true;
    saveState(state);
    console.log(`[info] 시딩 완료: 기존 ${items.length}건을 발송 없이 기록했습니다.`);
    return;
  }

  // 3) 신규가 있으면 로그인해서 본문을 확보합니다. 실패해도 제목+링크는 보냅니다.
  let loggedIn = false;
  if (fresh.length > 0 && config.detail.enabled) {
    try {
      await login(fresh[0].url);
      loggedIn = true;
    } catch (err) {
      console.error(`[warn] 로그인 실패: ${err.message}`);
      if (!DRY) {
        await notifier.alert(
          `사이트 로그인에 실패했습니다: ${err.message}\n` +
          `제목과 링크만 발송합니다. 계정/세션 확인이 필요합니다.`
        );
      }
    }
  }

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
        console.error(`[warn] 상세 취득 실패 (${item.id}): ${err.message}`);
        if (err instanceof LoginError) loggedIn = false; // 세션이 끊긴 경우 이후 시도 생략
      }
    }

    const msg = buildMessages(item, detail);

    if (DRY) {
      console.log('\n--- DRY RUN ---\n' + msg.fullText);
      if (images.length) console.log(`(이미지 ${images.length}장 첨부 예정: ${images.map((i) => i.url).join(', ')})`);
      continue;
    }

    const res = await notifier.notify(msg);
    console.log(`[send] ${item.id} kakao=${res.kakao} telegram=${res.telegram} channel=${res.channel}`);

    // 어느 한 채널이라도 성공해야 "본 것"으로 처리합니다.
    // 전부 실패하면 기록하지 않아 다음 실행에서 재시도됩니다.
    if (res.kakao === 'sent' || res.telegram === 'sent' || res.channel === 'sent') {
      state.seenIds.push(item.id);
    } else {
      console.error(`[error] ${item.id} 전 채널 발송 실패: ${res.errors.join(' | ')}`);
    }
    if (res.kakao === 'failed') state.kakaoFailStreak += 1;
    else if (res.kakao === 'sent') state.kakaoFailStreak = 0;

    // 이미지는 텍스트 알림이 최소 한 곳에는 나간 뒤 이어서 전송합니다 (카카오 미지원).
    if (images.length && (res.telegram === 'sent' || res.channel === 'sent')) {
      const imgRes = await notifier.sendImages(images);
      console.log(`[send] ${item.id} images personal=${imgRes.personal} channel=${imgRes.channel}`);
    }

    await new Promise((r) => setTimeout(r, 800)); // 연속 발송 간격
  }

  // 4) 카카오만 계속 실패하면 알려줍니다 (텔레그램으로는 계속 오는 상황)
  if (state.kakaoFailStreak >= 3) {
    await notifier.alert(`카카오 발송이 ${state.kakaoFailStreak}회 연속 실패했습니다. 토큰 확인이 필요합니다.`);
    state.kakaoFailStreak = 0;
  }

  // 5) refresh_token이 갱신되면 즉시 교체해야 합니다 (놓치면 두 달 뒤 정지)
  if (notifier.pendingRefreshToken) {
    const { newRefreshToken, refreshExpiresIn } = notifier.pendingRefreshToken;
    await notifier.alert(
      `카카오 refresh_token이 갱신되었습니다. GitHub Secrets의 KAKAO_REFRESH_TOKEN을 아래 값으로 교체하세요.\n` +
      `${newRefreshToken}\n(유효 ${refreshExpiresIn}초)`
    );
    console.log('[info] 새 refresh_token 발급됨 — Secrets 교체 필요');
  }

  // 6) 하루 1회 생존 신호. 이게 안 오면 시스템이 죽은 것입니다.
  const today = kstDate();
  if (
    config.heartbeatHourKst !== null &&
    kstNow().getUTCHours() === config.heartbeatHourKst &&
    state.lastHeartbeatDate !== today &&
    !DRY
  ) {
    await notifier.alert(`정상 동작 중입니다. (최근 확인 ${kstNow().toISOString().slice(0, 16).replace('T', ' ')} KST, 등록 글 ${items.length}건)`);
    state.lastHeartbeatDate = today;
  }

  saveState(state);
}

main().catch(async (err) => {
  console.error('[fatal]', err);
  try { await notifier.alert(`실행 중 오류가 발생했습니다: ${err.message}`); } catch {}
  process.exit(1);
});
