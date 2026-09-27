/**
 * src/lib/content-filter.ts
 *
 * 게임산업진흥에 관한 법률 / 사행행위 등 규제 및 처벌 특례법 준수
 * 커뮤니티, 마켓플레이스, 댓글 등 모든 UGC 제출 전 검사
 *
 * 금지 카테고리:
 *   A. 현금화/환전 — 홀덤 칩·GP를 현금으로 환전하는 행위
 *   B. 불법 도박 연상 — 스포츠토토 환전, 불법 온라인 카지노 유도
 *   C. 대리 게임 — 타인 명의 게임 대행
 *   D. 개인정보 — 계좌번호 패턴 (부분 필터)
 */

// ── 금지 패턴 ────────────────────────────────────────────────────────────────

interface FilterPattern {
  id: string;
  label: string;
  pattern: RegExp;
}

// ── A. 현금화·환전 — 2026-09-27 확장(오너 "'환전' 계열 금칙어") ─────────────────────────────
// 예전엔 '칩/GP 환전'처럼 대상이 붙은 꼴만 막아 "환전 해드립니다 연락주세요" 같은 **대상 없는 권유**가 통과했다(실측).
// 넓히면서 두 가지 오탐을 막는다:
//   ① 부정·경고문 — "환전 안 됩니다", "현금화는 불법입니다", "환전 문의는 사절" 은 운영 공지·매장 안내에 실제로 쓰인다.
//      대상어 뒤에 부정이 바로 오면 통과(NEG), 권유 동사 뒤 같은 어절·다음 어절에 부정이 오면 통과.
//   ② 여행 환전 — "달러 환전했어요", "엔화 환전 어디서" 는 대상이 칩·포인트가 아니고 권유 동사도 아니라 통과.
// 🔴 서버(contains_blocked_ugc · shout_blocked)도 **같은 문자열**을 써야 한다 — PostgreSQL ARE 는 (?!…)·\s·\S 를 지원한다.
//    이 식을 바꾸면 서버 SQL 도 같이 바꿔라(한쪽만 넓히면 화면은 통과시키고 서버가 거절하는 '이유 모를 실패'가 된다).
const NEG = '(?!\\s*(?:은|는|이|가|을|를)?\\s*(?:불가|금지|불법|절대|사절|안\\s*(?:됩|됨|돼|되|해|받)|하지\\s*않|받지\\s*않))';
/** 서버 SQL 과 공유하는 원문(대소문자 무시로 쓴다) */
export const CASH_OUT_SOURCE = [
  `현금화${NEG}`,
  `현금\\s*교환${NEG}`,
  `(?:칩|gp|시드|포인트|게임\\s*머니|머니|코인|상금|현금)\\s*환전${NEG}`,
  '환전\\s*(?:칩|gp)',
  '시드\\s*현금|현금\\s*시드',
  // 대상 없는 권유 — 뒤따르는 부정(같은 어절 또는 다음 어절)이 있으면 통과: "환전 해드리지 않습니다"
  '환전\\s*(?:해\\s*(?:드|줌|줍|줄|준|줘)|합니다|됩니다|돼요|되요|가능|상담|업체|대행|연락|카톡|톡|텔레|원하시|하실\\s*분|구합|받습|받아요|받아\\s*드|문의)'
    + '(?!\\S*\\s*(?:않|못|없|불가|금지|사절|받지))',
].join('|');

const BLOCKED_PATTERNS: FilterPattern[] = [
  // A. 현금화·환전
  {
    id: 'cash_out',
    label: '현금화·환전',
    // eslint-disable-next-line security/detect-non-literal-regexp -- 모듈 상수 원문(CASH_OUT_SOURCE), 사용자 입력이 아니다
    pattern: new RegExp(CASH_OUT_SOURCE, 'i'),
  },
  {
    id: 'chip_deal',
    label: '칩 직거래·매매',
    pattern: /칩\s*(직|판)매|칩\s*구매|칩\s*삽니다|칩\s*팝니다|칩\s*거래|칩\s*살게|칩\s*팔게|게임\s*머니\s*거래/i,
  },
  // B. 불법 도박
  {
    id: 'illegal_gambling',
    label: '불법 도박',
    pattern: /불법\s*카지노|사설\s*도박|토토\s*환전|배팅\s*사이트|먹튀|총판\s*모집|도박\s*사이트/i,
  },
  {
    id: 'proxy_game',
    label: '대리 게임',
    pattern: /대리\s*게임|대리\s*참가|대리\s*플레이|대리\s*바이인|대신\s*플레이|게임\s*대행/i,
  },
  // C. 불법 환전 관련 계좌
  {
    id: 'account_number',
    label: '계좌번호 패턴',
    // 숫자-숫자-숫자 형태 (은행 계좌) — 간단한 휴리스틱
    pattern: /\d{3,6}-\d{2,6}-\d{4,8}/,
  },
];

// ── 경고 패턴 (차단 아님, 운영자 검토 플래그) ────────────────────────────────
const WARN_PATTERNS: FilterPattern[] = [
  {
    id: 'gp_trade_hint',
    label: 'GP 거래 암시',
    pattern: /gp\s*팝니다|gp\s*삽니다|gp\s*구해요|gp\s*구합니다/i,
  },
  {
    id: 'personal_info',
    label: '개인 연락처',
    pattern: /카카오톡\s*id\s*[:：]\s*\S+|오픈\s*채팅\s*링크/i,
  },
];

// ── 공개 API ─────────────────────────────────────────────────────────────────

export interface FilterResult {
  blocked: boolean;
  warned: boolean;
  reason?: string;   // 차단된 경우 사용자에게 표시할 메시지
  warnLabel?: string;
}

/**
 * UGC 텍스트 필터링.
 * blocked = true → 제출 거부
 * warned  = true → 제출은 허용하되 운영자 검토 큐 등록 권장
 */
export function filterContent(text: string): FilterResult {
  for (const p of BLOCKED_PATTERNS) {
    if (p.pattern.test(text)) {
      return {
        blocked: true,
        warned:  false,
        reason:  `${p.label} 관련 표현은 게시할 수 없습니다. (관련 법령: 게임산업진흥에 관한 법률 제32조)`,
      };
    }
  }

  for (const p of WARN_PATTERNS) {
    if (p.pattern.test(text)) {
      return { blocked: false, warned: true, warnLabel: p.label };
    }
  }

  return { blocked: false, warned: false };
}

/**
 * 마켓플레이스 카테고리별 추가 검사.
 * gameMoney 카테고리는 칩·GP 자체 거래가 금지.
 */
export function filterListing(
  title: string,
  description: string,
  category: string,
): FilterResult {
  const combined = `${title} ${description}`;

  // gameMoney 카테고리: 게임 칩·GP 실물 거래 전면 차단
  if (category === 'gameMoney') {
    const moneyPattern = /홀덤\s*칩|포커\s*칩|roti\s*gp|로티\s*gp|게임\s*머니\s*\d+/i;
    if (moneyPattern.test(combined)) {
      return {
        blocked: true,
        warned:  false,
        reason:  '게임 칩·GP 실물 거래는 관련 법령에 따라 등록이 제한됩니다.',
      };
    }
  }

  return filterContent(combined);
}