import * as cheerio from 'cheerio';
import config from '../config.js';

// common.js의 실제 시그니처:
// go_view_hn(hibasic_code, write_url, d_mode, write_id, hi_grage, hi_level,
//            mem_pow, page_kind, code, page, mid_id, tiny_id, fid, bcate, s_notlogin)
const ARG = {
  hibasicCode: 0, writeUrl: 1, pageKind: 7, code: 8, midId: 10, tinyId: 11,
};

export function parseGoViewArgs(href = '') {
  const m = href.match(/go_view_hn\(([^)]*)\)/);
  if (!m) return null;
  const args = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  if (args.length < 12) return null;
  return {
    hibasicCode: args[ARG.hibasicCode],
    writeUrl: args[ARG.writeUrl],
    pageKind: args[ARG.pageKind],
    code: args[ARG.code],
    midId: args[ARG.midId],
    tinyId: args[ARG.tinyId],
  };
}

export function buildViewUrl(a) {
  const q = new URLSearchParams({
    hibasic_code: a.hibasicCode,
    d_mode: 'view',
    code: a.code,
    page: '',
    page_kind: a.pageKind,
    mid_id: a.midId,
    tiny_id: a.tinyId,
    fid: '',
    bcate: '',
  });
  return `${config.site.base}${a.writeUrl}?${q}`;
}

// 메인 페이지의 공지 위젯에서 글 목록을 뽑습니다.
// 메인 제목은 잘려 나오므로(예: "...신청사 이전 안..") 전문은 detail.js가 가져옵니다.
export function parseNoticeList(html) {
  const $ = cheerio.load(html);
  const widget = $(config.selectors.noticeWidget).first();
  if (widget.length === 0) return [];

  const items = [];
  widget.find(config.selectors.row).each((_, tr) => {
    const $tr = $(tr);
    const link = $tr.find(config.selectors.titleLink).first();
    if (link.length === 0) return;

    const args = parseGoViewArgs(link.attr('href') || '');
    if (!args || !args.code) return;

    items.push({
      id: args.code,                                  // 전역 순증가 글번호
      titleShort: link.text().trim(),                 // 잘린 제목
      postedAt: $tr.find(config.selectors.date).first().text().trim(),
      url: buildViewUrl(args),
      board: args.midId,
      args,
    });
  });
  return items;
}

// 설정한 게시판/키워드에 해당하는 글만 남깁니다.
export function applyFilters(items) {
  const { include } = config.boards;
  const keywords = config.keywords ?? [];
  return items.filter((it) => {
    if (include?.length && !include.includes(it.board)) return false;
    if (keywords.length) {
      const t = it.titleShort.replace(/\.+$/, '');
      if (!keywords.some((k) => t.includes(k))) return false;
    }
    return true;
  });
}
