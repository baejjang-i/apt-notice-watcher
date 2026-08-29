// 알림이 실제로 도착하는지 확인하는 도구.
// 카카오톡에 알림이 뜨는지 눈으로 확인하는 것이 목적입니다.
//   node tools/test-notify.mjs
import { notify } from '../src/notify/index.js';

const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
const res = await notify({
  kakaoText: `[테스트] 공지알리미 연결 확인\n${now} KST\n\n이 메시지가 카카오톡에 보이면 정상입니다.`,
  fullText: `🔔 공지알리미 연결 테스트\n\n발송 시각: ${now} KST\n\n` +
    `이 메시지가 도착했다면 텔레그램 채널은 정상입니다.\n` +
    `카카오톡에도 같은 내용이 왔는지 확인해 주세요.`,
  linkUrl: 'http://www.doduck.co.kr/',
});

console.log(`카카오:   ${res.kakao}`);
console.log(`텔레그램: ${res.telegram}`);
if (res.errors.length) {
  console.log('\n오류:');
  for (const e of res.errors) console.log('  - ' + e);
}
if (res.kakao === 'sent') {
  console.log('\n카카오 API는 성공을 반환했습니다. 실제로 휴대폰에 알림이 떴는지 확인하세요.');
  console.log('알림이 안 보이면 카카오톡 앱 알림 설정을 확인해야 합니다.');
}
