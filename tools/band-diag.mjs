// 네이버 밴드 연결 진단: 토큰이 유효한지, 토큰 주인이 가입한 밴드와 band_key를 보여줍니다.
//   BAND_ACCESS_TOKEN=<토큰> node tools/band-diag.mjs
import { listBands } from '../src/notify/band.js';

const bands = await listBands();
if (bands.length === 0) {
  console.log('토큰은 유효하지만 가입된 밴드가 없습니다. 밴드를 먼저 만들거나 가입하세요.');
} else {
  console.log('가입된 밴드 목록 (BAND_KEY로 등록할 값):\n');
  for (const b of bands) {
    console.log(`  ${b.band_key}   ${b.name}  (멤버 ${b.member_count}명)`);
  }
}
if (process.env.BAND_KEY) {
  const hit = bands.find((b) => b.band_key === process.env.BAND_KEY);
  console.log(`\n현재 BAND_KEY: ${hit ? `✓ "${hit.name}" 과 일치` : '✗ 목록에 없음 — 값을 확인하세요'}`);
}
