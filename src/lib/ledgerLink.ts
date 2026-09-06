// 포스터 ↔ 장부 링크의 대상 표현 — 날짜만으로는 같은 날 메인/사이드를 구분할 수 없다(F01).
// 장부 정본 키는 (venueId, session_date, game_seq) 이므로 링크도 (날짜, 게임) 을 함께 들고 다닌다.

/** 연결 장부 링크 대상. null 은 '이 포스터로 새 장부'. */
export interface LedgerLinkTarget { date: string; gameSeq: number }

/** 게임 번호 → 라벨. 장부 GameSwitcher·클락과 같은 어휘(1=메인, 2+=사이드N). */
export function ledgerGameLabel(gameSeq: number): string {
  return gameSeq <= 1 ? '메인' : `사이드${gameSeq - 1}`;
}

/** (날짜, 게임) 키 — 저장소 관행 `${date}#${gameSeq}`(LedgerStatsPanel·NuriPosLedger·TournamentClock 과 동일). */
export function gameKey(date: string, gameSeq: number): string { return `${date}#${gameSeq}`; }
