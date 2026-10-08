// 장부 손님 유형 맵 — 통계 '유형 제외' 필터가 쓰는 한 벌(SP13, 2026-10-08).
//
// 왜 (게임#이름) 키인가: 명단(ledger_players)은 게임마다 따로다. 예전엔 메인 명단만 읽고 이름만 키로 써서
//   사이드 전용 손님은 'none', 메인과 동명인 사이드 손님은 메인 쪽 유형으로 분류됐다 → '직원 제외' 뒤 매출·바인 합계가 틀렸다.
import type { LedgerPlayer } from '../api/ledger';

export type PlayerTypeCode = 'new' | 'regular' | 'staff' | 'other' | 'none';

export const playerTypeKey = (gameSeq: number, name: string) => `${gameSeq}#${name}`;

export function playerTypeCode(vt: string | null | undefined): PlayerTypeCode {
  return (vt === 'new' || vt === 'regular' || vt === 'staff' || vt === 'other') ? vt : (vt && vt.trim() ? 'other' : 'none');
}

export function playerTypeMap(players: Pick<LedgerPlayer, 'gameSeq' | 'name' | 'visitorType'>[]): Map<string, PlayerTypeCode> {
  const m = new Map<string, PlayerTypeCode>();
  for (const p of players) m.set(playerTypeKey(p.gameSeq, p.name), playerTypeCode(p.visitorType));
  return m;
}
