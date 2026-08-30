// 감시 대상 및 동작 설정. 사이트가 리뉴얼되면 대부분 이 파일만 고치면 됩니다.
export default {
  site: {
    name: '두덕 생활지원센터',
    base: 'http://www.doduck.co.kr',
    // 로그인 없이 신규 글을 감지하는 페이지 (메인)
    listUrl: 'http://www.doduck.co.kr/',
    loginUrl: 'http://www.doduck.co.kr/contents/member/login_check.php',
    encoding: 'euc-kr',
    // WAF(se-cu.com)가 비브라우저 UA를 302로 차단하므로 반드시 필요
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },

  // 메인 페이지에서 공지 위젯을 집어내는 셀렉터
  selectors: {
    noticeWidget: 'div.mb_tboard_slist',
    row: 'tr',
    titleLink: 'td.td_subject a',
    date: 'td.td_date',
  },

  // 어떤 게시판 글을 알림 대상으로 볼지. 메인 공지 위젯에는 여러 게시판이 섞여 나옵니다.
  // mid_id 18 = 생활지원센터 공지사항 (사용자가 지정한 게시판)
  // mid_id 4  = 선거관리위원회 공지사항
  boards: {
    include: ['18'],        // 알림 받을 mid_id 목록
    // include: ['18', '4'], // 선거관리위원회 공지도 받으려면 이렇게
  },

  // 제목에 아래 단어가 포함된 것만 알림. 비워두면 전체 알림.
  keywords: [],

  // 알림 채널. 카카오가 주채널, 텔레그램이 보조/폴백.
  notify: {
    kakao: { enabled: true },
    telegram: {
      enabled: true,
      // 'always'   : 카카오와 항상 동시 발송 (도달 여부 비교용 · 초기 권장)
      // 'fallback' : 카카오 발송이 실패했을 때만 발송
      mode: 'always',

      // 입주민 구독용 텔레그램 채널. TELEGRAM_CHANNEL_ID가 있을 때만 동작합니다.
      channel: {
        enabled: true,
        // 공지 본문은 로그인해야 볼 수 있는 회원 전용 내용이라
        // 채널에는 기본적으로 제목·날짜·링크만 보냅니다.
        includeBody: false,
      },
    },
  },

  // 상세 본문 취득 (로그인 필요). 실패해도 제목+링크 알림은 그대로 나갑니다.
  detail: {
    enabled: true,
    maxBodyChars: 700,   // 알림에 담을 본문 최대 길이
  },

  // 하루 1회 "정상 동작 중" 하트비트를 보낼 시각 (KST, 0~23). null이면 끔.
  heartbeatHourKst: 9,

  // 목록 파싱 결과가 0건인 상태가 이 횟수만큼 연속되면 "셀렉터 깨짐" 경보
  emptyParseAlertThreshold: 3,

  statePath: 'state/seen.json',
};
