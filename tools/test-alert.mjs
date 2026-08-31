// 운영 경보(alert)가 실제로 관리자 전용 봇으로 가는지 확인하는 도구.
// 공지 알림 봇("도파타 알리미")에는 아무것도 보내지 않습니다.
//   node tools/test-alert.mjs
import { alert } from '../src/notify/index.js';

const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
const res = await alert(
  `[테스트] 관리자 봇 연결 확인\n${now} KST\n\n` +
  `이 메시지가 관리자 전용 텔레그램 봇으로 왔다면 정상입니다.\n` +
  `공지 알림 봇("도파타 알리미")으로 왔다면 TELEGRAM_ADMIN_BOT_TOKEN/` +
  `TELEGRAM_ADMIN_CHAT_ID 등록을 다시 확인해야 합니다.`
);

console.log(`카카오:   ${res.kakao}`);
console.log(`텔레그램: ${res.telegram}`);
