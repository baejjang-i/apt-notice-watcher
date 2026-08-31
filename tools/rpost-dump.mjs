// 최근게시글(rpost) 페이지 구조 조사용 1회성 진단 도구.
//   node tools/rpost-dump.mjs
import { login, debugScopeHtml } from '../src/detail.js';
import { getHtml } from '../src/http.js';

const url = 'http://www.doduck.co.kr/d_c/sub/page.php?page_kind=rpost';
await login(url);
console.log('로그인 성공.\n');
const html = await getHtml(url, { label: 'rpost' });
console.log('전체 길이:', html.length);
console.log('\n--- 스코프 HTML (앞 6000자) ---');
console.log(debugScopeHtml(html, 6000));
