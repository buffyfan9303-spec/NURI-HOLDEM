// W4 PL0 — 돈 단위 정규형(원 KRW).
// §13-B 진단: 단계마다 단위가 뒤바뀐다 — 포스터 바이인=원, 장부 현금단가=만원(manVal/parseMan),
// 포스터 GTD=만원 입력→원 저장(×10,000), 클락 프라이즈=원, 순위 입력 프라이즈=만원.
// 그 경계에서 '1/10,000 오기록' 실사고가 반복됐다(TournamentClock·VenueManageTab 방어 주석이 흔적).
// 규칙: 저장·전파(프리셋·상속)는 항상 원. 표시 단위 환산은 각 어댑터의 마지막 한 줄에서만.
export const manToWon = (man: number): number => Math.round(man * 10_000);
export const wonToMan = (won: number): number => won / 10_000;

/** 프리셋 GTD 상금 읽기 — 신형 prizeAmountWon(원) 우선, 구형 prizeAmount(만원) 폴백.
 *  기존 라이브 프리셋 데이터를 마이그레이션 없이 무손상 통과시키는 유일한 읽기 경로. */
export function presetPrizeWon(d: { prizeAmountWon?: number; prizeAmount?: number }): number {
  if (d.prizeAmountWon != null) return d.prizeAmountWon;
  return d.prizeAmount != null ? manToWon(d.prizeAmount) : 0;
}

/** 티켓 단위 T 의 가치(원). **1T = 1만원**(오너 결정 2026-09-05). api/rankings TICKET_MAN·서버 parse_prize_man 과 같은 값.
 *  장부 분납의 ticketCount(T) 환산도 이 상수를 쓴다 — 순위·장부·이용권이 한 단위로 묶인다. */
export const TICKET_WON = 10_000;

/** 순위별 상금 항목 읽기 — 신형 amountWon(원) 우선, 구형 amount+unit 폴백(unit 기본 '만원').
 *  unit 'T' 는 티켓 T 수(1T = 1만원) → T × TICKET_WON. */
export function rankingPrizeWon(e: { amountWon?: number; amount?: number; unit?: string }): number {
  if (e.amountWon != null) return e.amountWon;
  if (e.amount == null) return 0;
  if (e.unit === 'T') return Math.round(e.amount * TICKET_WON);
  return e.unit === '원' ? e.amount : manToWon(e.amount);
}
