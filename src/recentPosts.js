import * as cheerio from 'cheerio';
import config from '../config.js';
import { pageContentScope } from './detail.js';
import { parseGoViewArgs, buildViewUrl } from './parse.js';

/*
 * page_kind=rpost 는 전 게시판(공지사항·민원게시판·선거관리위원회·계약서 등) 통합
 * "최근게시글" 목록입니다. 로그인이 필요하고, 표 구조는 다음과 같습니다.
 *
 *   table.bv2_list > tr
 *     td[0] 번호(이 목록 전용 일련번호, 사용 안 함)
 *     td[1] 분류  <span class="board_kindname2">[생활지원센터-공지사항]</span>
 *     td[2] 제목  <a href="javascript:go_view_hn(...)">제목</a>
 *     td[3] 작성자
 *     td[4] 작성일  (YYYY/MM/DD)
 *     td[5] 조회수
 *
 * go_view_hn 인자 형식은 메인 페이지 공지 위젯과 동일해 parse.js의 파서를 재사용합니다.
 */
export function parseRecentPosts(html) {
  const $ = cheerio.load(html);
  const scope = pageContentScope($);
  const table = scope.find('table.bv2_list').first();
  if (table.length === 0) return [];

  const items = [];
  table.find('tr').each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.children('td');
    if (tds.length < 6) return; // 헤더(th) 행 등은 건너뜀

    const link = $(tds[2]).find('a').first();
    if (link.length === 0) return;

    const args = parseGoViewArgs(link.attr('href') || '');
    if (!args || !args.code) return;

    items.push({
      id: args.code,
      titleShort: link.text().replace(/\s+/g, ' ').trim(),
      boardLabel: $(tds[1]).find('.board_kindname2').first().text().trim(),
      postedAt: $(tds[4]).text().trim(),
      url: buildViewUrl(args),
      board: args.midId,
      args,
    });
  });
  return items;
}

// 설정한 라벨(예: '생활지원센터-공지사항')을 포함한 게시판을 제외합니다.
// 그 게시판은 기존 공지 알림 파이프라인이 이미 담당합니다.
export function excludeConfiguredBoards(items) {
  const patterns = config.allPosts?.excludeBoardLabelIncludes ?? [];
  if (patterns.length === 0) return items;
  return items.filter((it) => !patterns.some((p) => it.boardLabel.includes(p)));
}
