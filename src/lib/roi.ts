// src/lib/roi.ts — 개인 ROI 순수 계산. **개인 비공개 기록 전용**(공개 랭킹·경쟁에 잇지 않는다).
//
// 공식(불변):
//   invested = buyIn + rebuy + addon · net = amount(기존 행 호환 — 참가비를 뺀 순결과) · result = net + invested
//   ROI = invested > 0 ? net / invested × 100 : null(계산 불가)
//   ITM = events > 0 ? moneyIn / events × 100 : null · events = invested > 0 인 행 · moneyIn = result > 0
//
// 왜 참가비가 적힌 행만 세나: 분모(참가비) 없는 행의 금액이 분자에 섞이면 ROI 가 거짓이 된다.
//   옛 행(참가비 없이 +/- 만 적은 것)은 카드의 수입/지출/손익에는 그대로 들어가고, ROI 지표에서만 빠진다.
// 왜 순수 함수인가: 0원 분모·음수·재진입/애드온·삭제 후 재계산을 화면 없이 vitest 로 못 박기 위해서다.

export interface RoiRow {
  entryDate: string;   // 'YYYY-MM-DD'
  amount: number;      // 순결과(net). 음수 = 마이너스
  buyIn: number;
  rebuy: number;
  addon: number;
  venueName: string;
  gameName: string;
}

type Invest = Pick<RoiRow, 'buyIn' | 'rebuy' | 'addon'>;
export const investedOf = (r: Invest): number => r.buyIn + r.rebuy + r.addon;
export const resultOf = (r: Invest & Pick<RoiRow, 'amount'>): number => r.amount + investedOf(r);
/** 금액도 참가비도 없는 행 = 기타 일정(메모만). 예전엔 amount===0 만 봤는데, 본전(순결과 0·참가비 있음)이 일정으로 오인된다. */
export const isMemoEntry = (r: Invest & Pick<RoiRow, 'amount'>): boolean => r.amount === 0 && investedOf(r) === 0;

/** ROI 를 보여 주는 최소 기록 수 — 한두 판의 % 는 사람을 속인다. */
export const ROI_MIN_EVENTS = 3;

export interface RoiFilter { monthPrefix?: string; venue?: string; game?: string }
/** 기간(YYYY-MM 접두)·매장·게임 문자열 일치 필터. 빈 값은 '전체'. */
export function filterRoiRows<T extends RoiRow>(rows: T[], f: RoiFilter = {}): T[] {
  return rows.filter((r) =>
    (!f.monthPrefix || r.entryDate.startsWith(f.monthPrefix)) &&
    (!f.venue || r.venueName === f.venue) &&
    (!f.game || r.gameName === f.game));
}

export interface RoiMonth { month: string; events: number; invested: number; net: number }
export interface RoiStats {
  events: number;
  invested: number;
  /** 기록한 결과 금액 합(= net + invested) */
  resultSum: number;
  net: number;
  roi: number | null;
  itm: number | null;
  moneyIn: number;
  avgBuyIn: number | null;
  bestResult: number | null;
  /** 월별 추세 — 오래된 달부터 */
  months: RoiMonth[];
}

export function roiStats(rows: RoiRow[]): RoiStats {
  const played = rows.filter((r) => investedOf(r) > 0);
  const events = played.length;
  const invested = played.reduce((a, r) => a + investedOf(r), 0);
  const net = played.reduce((a, r) => a + r.amount, 0);
  const moneyIn = played.filter((r) => resultOf(r) > 0).length;
  const byMonth = new Map<string, RoiMonth>();
  for (const r of played) {
    const month = r.entryDate.slice(0, 7);
    const m = byMonth.get(month) ?? { month, events: 0, invested: 0, net: 0 };
    m.events += 1; m.invested += investedOf(r); m.net += r.amount;
    byMonth.set(month, m);
  }
  return {
    events, invested, net, moneyIn,
    resultSum: net + invested,
    roi: invested > 0 ? (net / invested) * 100 : null,
    itm: events > 0 ? (moneyIn / events) * 100 : null,
    avgBuyIn: events > 0 ? invested / events : null,
    bestResult: events > 0 ? Math.max(...played.map(resultOf)) : null,
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/** 데이터 부족 안내 — 정직하게. 충분하면 null. */
export function roiNotice(s: Pick<RoiStats, 'events'>): string | null {
  if (s.events === 0) return '참가비를 적으면 ROI·ITM 이 계산돼요';
  if (s.events < ROI_MIN_EVENTS) return `기록 ${ROI_MIN_EVENTS}건부터 ROI 를 보여드려요 (지금 ${s.events}건)`;
  return null;
}

// ── insert 하위호환 ──────────────────────────────────────────────────────────
// 마이그레이션(20260909b)이 운영에 적용되기 전에 클라이언트가 먼저 배포될 수 있다.
// 그래서 ① 새 필드가 기본값(0·'')이면 payload 에 넣지 않고(옛 스키마 그대로 통과),
//        ② 값을 넣었는데 서버가 '그 컬럼 없음' 으로 거절하면 새 필드를 빼고 한 번 더 시도한다(degraded).

export const ROI_COLUMNS = ['buy_in', 'rebuy', 'addon', 'venue_name', 'game_name'] as const;
// type 리터럴이어야 Record<string, unknown> 파라미터에 그대로 들어간다(interface 는 암묵 인덱스 시그니처가 없다).
export type BankrollInsertPayload = {
  user_id: string; entry_date: string; amount: number; memo: string;
  buy_in?: number; rebuy?: number; addon?: number; venue_name?: string; game_name?: string;
}

export function bankrollInsertPayload(userId: string, e: RoiRow & { memo: string }): BankrollInsertPayload {
  const p: BankrollInsertPayload = { user_id: userId, entry_date: e.entryDate, amount: Math.trunc(e.amount), memo: e.memo.trim() };
  if (e.buyIn > 0) p.buy_in = Math.trunc(e.buyIn);
  if (e.rebuy > 0) p.rebuy = Math.trunc(e.rebuy);
  if (e.addon > 0) p.addon = Math.trunc(e.addon);
  if (e.venueName.trim()) p.venue_name = e.venueName.trim();
  if (e.gameName.trim()) p.game_name = e.gameName.trim();
  return p;
}

export const hasRoiColumns = (p: Record<string, unknown>): boolean => ROI_COLUMNS.some((k) => k in p);
export function stripRoiColumns<T extends Record<string, unknown>>(p: T): Omit<T, typeof ROI_COLUMNS[number]> {
  const q = { ...p };
  for (const k of ROI_COLUMNS) delete q[k];
  return q;
}

/** PostgREST 가 '그 컬럼 없음' 으로 거절한 경우 — 스키마 캐시(PGRST204) 또는 Postgres 42703. 다른 400 은 진짜 오류다. */
export function isMissingColumnError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (code === 'PGRST204' || code === '42703') return true;
  return typeof message === 'string' && /could not find the '.+' column|column .+ does not exist/i.test(message);
}

/** insert 한 번 → 컬럼 부재면 새 필드를 빼고 한 번 더. degraded=true 면 참가비 등은 저장되지 않았다(화면이 알려야 한다). */
export async function insertWithRoiFallback<E>(
  payload: BankrollInsertPayload,
  insert: (p: Record<string, unknown>) => Promise<{ error: E | null }>,
): Promise<{ error: E | null; degraded: boolean }> {
  const first = await insert(payload);
  if (!first.error || !hasRoiColumns(payload) || !isMissingColumnError(first.error)) return { error: first.error, degraded: false };
  const second = await insert(stripRoiColumns(payload));
  return { error: second.error, degraded: !second.error };
}
