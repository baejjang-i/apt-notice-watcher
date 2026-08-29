// 카카오 refresh_token 발급 도구
//   1) node tools/kakao-token.mjs          → 인가 URL 출력
//   2) 브라우저에서 동의 후, 리다이렉트된 주소의 code= 값 복사
//   3) node tools/kakao-token.mjs <code>   → refresh_token 출력
const KEY = process.env.KAKAO_REST_API_KEY;
const REDIRECT = process.env.KAKAO_REDIRECT_URI || 'https://localhost';
if (!KEY) { console.error('KAKAO_REST_API_KEY 환경변수를 먼저 설정하세요.'); process.exit(1); }

const code = process.argv[2];
if (!code) {
  const url = `https://kauth.kakao.com/oauth/authorize?client_id=${KEY}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=talk_message`;
  console.log('아래 주소를 브라우저에서 열고 동의하세요:\n');
  console.log(url);
  console.log('\n동의 후 이동한 주소에서 code= 뒤의 값을 복사해 다시 실행하세요:');
  console.log('  node tools/kakao-token.mjs <code>');
  process.exit(0);
}

const form = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: KEY,
  redirect_uri: REDIRECT,
  code,
});
if (process.env.KAKAO_CLIENT_SECRET) form.set('client_secret', process.env.KAKAO_CLIENT_SECRET);

const res = await fetch('https://kauth.kakao.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form.toString(),
});
const json = await res.json();
if (!json.refresh_token) { console.error('발급 실패:', json); process.exit(1); }

console.log('발급 성공. 아래 값을 GitHub Secrets에 등록하세요.\n');
console.log('KAKAO_REFRESH_TOKEN =');
console.log(json.refresh_token);
console.log(`\n(refresh_token 유효기간 ${json.refresh_token_expires_in}초 ≈ ${Math.round(json.refresh_token_expires_in / 86400)}일)`);
