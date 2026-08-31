// 감시 대상 및 동작 설정. 사이트가 리뉴얼되면 대부분 이 파일만 고치면 됩니다.
export default {
  site: {
    name: '도덕파크타운',
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

  // 알림 채널. 카카오가 주채널(본인 수신용), 텔레그램이 보조/폴백 겸 입주민 채널 발행용.
  notify: {
    kakao: { enabled: true },
    telegram: {
      enabled: true,
      // 'always'   : 카카오와 항상 동시 발송 (도달 여부 비교용 · 초기 권장)
      // 'fallback' : 카카오 발송이 실패했을 때만 발송
      mode: 'always',

      // 입주민 구독용 텔레그램 채널. TELEGRAM_CHANNEL_ID가 있을 때만 동작합니다.
      // 채널 입장은 검수된 인원에게만 초대 링크를 공유하는 전제라, 본문을 그대로 공개합니다.
      // 입주민 주채널이 네이버 밴드로 바뀌어, 필요 없으면 enabled: false로 끄면 됩니다.
      channel: {
        enabled: true,
        includeBody: true,
      },
    },

    // 입주민 주채널: 네이버 밴드. BAND_ACCESS_TOKEN / BAND_KEY가 있을 때만 동작합니다.
    // 밴드 API는 사진 첨부가 불가능해 텍스트 + 링크로 발행하고, 사진이 있으면
    // "사진 N장은 링크에서 확인" 안내를 덧붙입니다.
    band: {
      enabled: true,
      doPush: true,        // 밴드 멤버에게 새 글 푸시 알림
      includeBody: true,
    },
  },

  // 상세 본문 취득 (로그인 필요). 실패해도 제목+링크 알림은 그대로 나갑니다.
  detail: {
    enabled: true,
    maxBodyChars: 1500,   // 알림에 담을 본문 최대 길이
    // 본문에 첨부된 이미지를 함께 전송할지 여부. 텔레그램(개인·채널)에만 적용됩니다.
    // 카카오 "나에게 보내기"는 텍스트 템플릿만 지원해 이미지를 못 담습니다.
    includeImages: true,
    maxImages: 6,          // 글 하나당 첨부할 최대 이미지 수
    maxImageBytes: 9 * 1024 * 1024, // 텔레그램 업로드 한도(약 10MB) 여유분
  },

  // 하루 1회 "정상 동작 중" 하트비트를 보낼 시각 (KST, 0~23). null이면 끔.
  heartbeatHourKst: 9,

  // 목록 파싱 결과가 0건인 상태가 이 횟수만큼 연속되면 "셀렉터 깨짐" 경보
  emptyParseAlertThreshold: 3,

  statePath: 'state/seen.json',
};
