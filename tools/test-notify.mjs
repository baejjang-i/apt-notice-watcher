// 알림이 실제로 도착하는지 확인하는 도구.
// 카카오톡·텔레그램·(설정 시) 네이버 밴드에 테스트 메시지를 보냅니다.
//   node tools/test-notify.mjs
import { notify } from '../src/notify/index.js';

const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
const res = await notify({
  kakaoText: `[테스트] 공지알리미 연결 확인\n${now} KST\n\n이 메시지가 카카오톡에 보이면 정상입니다.`,
  fullText: `🔔 공지알리미 연결 테스트\n\n발송 시각: ${now} KST\n\n` +
    `이 메시지가 도착했다면 텔레그램 채널은 정상입니다.\n` +
    `카카오톡에도 같은 내용이 왔는지 확인해 주세요.`,
  bandText: `🔔 공지알리미 연결 테스트\n\n발송 시각: ${now} KST\n\n` +
    `이 글이 밴드에 올라왔다면 자동 발행이 정상 동작하는 것입니다.\n` +
    `(테스트 글이므로 삭제하셔도 됩니다)`,
  linkUrl: 'http://www.doduck.co.kr/',
});

console.log(`카카오:        ${res.kakao}`);
console.log(`텔레그램(개인): ${res.telegram}`);
console.log(`텔레그램(채널): ${res.channel}`);
console.log(`네이버 밴드:    ${res.band}`);
if (res.errors.length) {
  console.log('\n오류:');
  for (const e of res.errors) console.log('  - ' + e);
}
