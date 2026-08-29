import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const KEEP = 300; // 최근 N개 글번호만 보관

const EMPTY = {
  seeded: false,          // 최초 시딩 여부 (첫 실행 알림 폭탄 방지)
  seenIds: [],            // 이미 알림 보낸 글번호
  emptyParseStreak: 0,    // 목록 0건 연속 횟수
  lastRunAt: null,
  lastHeartbeatDate: null,
  kakaoFailStreak: 0,
};

export function loadState() {
  const p = path.resolve(config.statePath);
  if (!fs.existsSync(p)) return { ...EMPTY };
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (err) {
    console.warn(`[state] 읽기 실패, 초기화합니다: ${err.message}`);
    return { ...EMPTY };
  }
}

export function saveState(state) {
  const p = path.resolve(config.statePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const trimmed = {
    ...state,
    // 글번호는 순증가이므로 큰 것부터 KEEP개만 남깁니다.
    seenIds: [...new Set(state.seenIds)]
      .sort((a, b) => Number(b) - Number(a))
      .slice(0, KEEP),
  };
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2) + '\n', 'utf8');
}

export function pickNew(items, state) {
  const seen = new Set(state.seenIds);
  return items.filter((it) => !seen.has(it.id));
}
