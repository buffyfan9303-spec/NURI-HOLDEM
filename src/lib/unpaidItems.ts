// 마감 뒤 미수 받기 목록의 정본 — 컴포넌트 파일에서 분리(react-refresh: 컴포넌트 파일은 컴포넌트만 export).
import { addonFinance, buyinFinance, hasUnpaid, type LedgerBuyin, type LedgerSession } from '../api/ledger';

export interface UnpaidItem { b: LedgerBuyin; buyinWon: number; addonWon: number }

/** 미수가 남은 행과 그 금액 — 금액은 장부·정산과 같은 정본(buyinFinance·addonFinance)으로만 센다. */
export function unpaidItemsOf(buyins: readonly LedgerBuyin[], sessionOf: (b: LedgerBuyin) => LedgerSession | undefined): UnpaidItem[] {
  const out: UnpaidItem[] = [];
  for (const b of buyins) {
    if (!hasUnpaid(b)) continue;
    const s = sessionOf(b);
    const buyinWon = s ? buyinFinance(b, s).unpaid : (b.isSplit ? b.unpaidAmount : 0);
    out.push({ b, buyinWon, addonWon: addonFinance(b).unpaid });
  }
  return out.sort((x, y) => x.b.gameSeq - y.b.gameSeq || x.b.playerName.localeCompare(y.b.playerName) || x.b.entryNo - y.b.entryNo);
}
