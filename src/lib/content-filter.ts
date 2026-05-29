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

const BLOCKED_PATTERNS: FilterPattern[] = [
  // A. 현금화·환전
  {
    id: 'cash_out',
    label: '현금화·환전',
    pattern: /현금화|현금\s*교환|칩\s*환전|환전\s*칩|gp\s*환전|환전\s*gp|GP환전|환전GP|시드\s*현금|현금\s*시드/i,
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