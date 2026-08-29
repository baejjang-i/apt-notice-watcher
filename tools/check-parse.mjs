// 셀렉터가 살아 있는지 눈으로 확인하는 진단 도구. 알림은 보내지 않습니다.
//   node tools/check-parse.mjs
import config from '../config.js';
import { getHtml } from '../src/http.js';
import { parseNoticeList, applyFilters } from '../src/parse.js';

const html = await getHtml(config.site.listUrl, { label: '메인' });
const all = parseNoticeList(html);
const kept = applyFilters(all);

console.log(`수집 ${all.length}건 / 필터 통과 ${kept.length}건 (include=${config.boards.include})\n`);
for (const it of all) {
  const mark = kept.includes(it) ? '✓' : ' ';
  console.log(`${mark} [${it.id}] board=${it.board.padEnd(3)} ${it.postedAt}  ${it.titleShort}`);
}
if (all.length === 0) {
  console.error('\n❌ 0건입니다. 사이트 개편으로 config.selectors가 깨졌을 가능성이 높습니다.');
  process.exit(1);
}
console.log(`\n샘플 상세 URL:\n  ${kept[0]?.url ?? '(없음)'}`);
