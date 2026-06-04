// src/api/ledger.ts — NURI POS 장부 시스템 API
import { supabase, IS_MOCK } from '../lib/supabase';

export type PaymentMethod = 'ticket' | 'cash' | 'transfer' | 'card' | 'support';
export type EarlyType = 'double' | 'single' | 'none'; // 더블얼리 / 1얼리 / 없음
export interface DiscountPreset { label: string; amount: number } // amount: 원
/** 고정 유형 코드 + 그 외(기타/직접입력)는 자유 텍스트로 저장 */
export type VisitorType = 'new' | 'regular' | 'staff' | 'other';
const VISITOR_KNOWN: Record<string, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };
/** 저장값(코드 또는 커스텀 텍스트) → 표시 라벨 */
export function visitorLabel(v: string | null | undefined): string {
  if (!v) return '';
  return VISITOR_KNOWN[v] ?? v;
}

export interface LedgerBuyin {
  id: string;
  venueId: string;
  sessionDate: string;
  playerName: string;
  entryNo: number;
  paymentMethod: PaymentMethod;
  isUnpaid: boolean;
  buyinAt: string;
  // 분납/할인 (is_split=true 일 때 금액 분해)
  isSplit: boolean;
  cashAmount: number;
  cardAmount: number;
  transferAmount: number;
  ticketCount: number;
  unpaidAmount: number;
  discountLevel: number;
  discountIndex: number;        // 적용 할인 프리셋(0=없음, 1~5)
  earlyOverride: EarlyType | null; // 얼리 수기지정(null=시각 기준 자동판정)
}

export interface LedgerSession {
  venueId: string;
  sessionDate: string;
  buyinAmount: number;          // 현금단가
  cardAmount: number | null;    // 카드단가(미입력 시 현금단가 적용)
  targetEntries: number;
  title?: string;               // 금일 게임 내용
  eventMemo?: string;           // 이벤트 등 비고
  dealers?: string;             // 금일 딜러 명단(줄바꿈 구분, 선택)
  scheduleId?: string | null;   // 연결된 포스터(대회) 일정
  discounts: DiscountPreset[];  // 할인 프리셋(최대 5)
  earlyDoubleMin: number;       // 스타트 후 ~분까지 더블얼리
  earlySingleMin: number;       // 스타트 후 ~분까지 1얼리
  tournamentStart?: string | null; // 토너먼트 스타트 시각(ISO, 없으면 openedAt 기준)
  openedBy?: string | null;     // 담당직원(프로필 id)
  openedAt?: string | null;
  regClosed: boolean;           // 레지(레지스트리) 마감
  regClosedAt?: string | null;
  closed: boolean;              // 정산 마감(읽기전용 스냅샷)
  closedAt?: string | null;
  closeMemo?: string | null;
}

export interface LedgerPlayer {
  id: string;
  venueId: string;
  sessionDate: string;
  name: string;
  visitorType: string | null;   // 코드(new/regular/staff/other) 또는 커스텀 텍스트
  note: string | null;
  sortOrder: number;
}

const today = () => new Date().toLocaleDateString('en-CA'); // 로컬 날짜(YYYY-MM-DD) — UTC 자정 넘김 방지

export const WON_PER_MAN = 10000;
/** 원 → 만원 표시 문자열 (예: 310000 → "31", 77000 → "7.7") */
export function wonToMan(won: number): string {
  return (won / WON_PER_MAN).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** 카드 결제에 적용할 단가(카드단가 미설정 시 현금단가) */
export function cardUnit(s: { buyinAmount: number; cardAmount: number | null }): number {
  return s.cardAmount && s.cardAmount > 0 ? s.cardAmount : s.buyinAmount;
}

export interface BuyinFinance { paid: number; unpaid: number; entry: number; ticketPaid: number; ticketUnpaid: number; support: number }

/** 바인 1건의 매출/미수/엔트리(할인 반영). 엔트리 = (단가 - 할인)/단가. */
export function buyinFinance(b: LedgerBuyin, s: { buyinAmount: number; cardAmount: number | null; discounts?: DiscountPreset[] }): BuyinFinance {
  const entryUnit = s.buyinAmount;
  const z: BuyinFinance = { paid: 0, unpaid: 0, entry: 0, ticketPaid: 0, ticketUnpaid: 0, support: 0 };
  if (b.isSplit) {
    const paid = b.cashAmount + b.cardAmount + b.transferAmount;
    const total = paid + b.unpaidAmount;
    return { ...z, paid, unpaid: b.unpaidAmount, entry: entryUnit > 0 ? total / entryUnit : (total > 0 ? 1 : 0) };
  }
  const disc = (s.discounts && b.discountIndex > 0 && s.discounts[b.discountIndex - 1]) ? s.discounts[b.discountIndex - 1].amount : 0;
  const entry = entryUnit > 0 ? Math.max(0, entryUnit - disc) / entryUnit : 1;
  if (b.paymentMethod === 'support') return { ...z, entry, support: 1 };
  if (b.paymentMethod === 'ticket') return { ...z, entry, ticketPaid: b.isUnpaid ? 0 : 1, ticketUnpaid: b.isUnpaid ? 1 : 0 };
  const payUnit = b.paymentMethod === 'card' ? cardUnit(s) : s.buyinAmount;
  const effPay = Math.max(0, payUnit - disc);
  return b.isUnpaid ? { ...z, entry, unpaid: effPay } : { ...z, entry, paid: effPay };
}

/** 할인 적용 후 표시용 금액(원). */
export function discountAmountOf(s: { discounts?: DiscountPreset[] }, idx: number): number {
  return (s.discounts && idx > 0 && s.discounts[idx - 1]) ? s.discounts[idx - 1].amount : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToBuyin = (r: any): LedgerBuyin => ({
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date,
  playerName: r.player_name, entryNo: r.entry_no,
  paymentMethod: r.payment_method as PaymentMethod, isUnpaid: !!r.is_unpaid,
  buyinAt: r.buyin_at,
  isSplit: !!r.is_split,
  cashAmount: r.cash_amount ?? 0, cardAmount: r.card_amount ?? 0, transferAmount: r.transfer_amount ?? 0,
  ticketCount: r.ticket_count ?? 0, unpaidAmount: r.unpaid_amount ?? 0, discountLevel: r.discount_level ?? 0,
  discountIndex: r.discount_index ?? 0,
  earlyOverride: (r.early_override ?? null) as EarlyType | null,
});

/** 바인 1건의 얼리 유형 — 수기지정 우선, 없으면 (바인시각 − 스타트) 경과분으로 자동판정 */
export function earlyTypeOf(
  b: LedgerBuyin,
  s: { earlyDoubleMin?: number; earlySingleMin?: number; tournamentStart?: string | null; openedAt?: string | null },
): EarlyType {
  if (b.earlyOverride === 'double' || b.earlyOverride === 'single' || b.earlyOverride === 'none') return b.earlyOverride;
  const dMin = s.earlyDoubleMin ?? 0, sMin = s.earlySingleMin ?? 0;
  const start = s.tournamentStart || s.openedAt;
  if (!start || (dMin <= 0 && sMin <= 0)) return 'none';
  const mins = (new Date(b.buyinAt).getTime() - new Date(start).getTime()) / 60_000;
  if (mins < 0) return 'none';
  if (dMin > 0 && mins <= dMin) return 'double';
  if (sMin > 0 && mins <= sMin) return 'single';
  return 'none';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToSession = (venueId: string, date: string, d: any): LedgerSession => ({
  venueId, sessionDate: date,
  buyinAmount: d?.buyin_amount ?? 0,
  cardAmount: d?.card_amount ?? null,
  targetEntries: d?.target_entries ?? 0,
  title: d?.title ?? undefined,
  eventMemo: d?.event_memo ?? undefined,
  dealers: d?.dealers ?? undefined,
  scheduleId: d?.schedule_id ?? null,
  openedBy: d?.opened_by ?? null,
  openedAt: d?.opened_at ?? null,
  regClosed: !!d?.reg_closed,
  regClosedAt: d?.reg_closed_at ?? null,
  closed: !!d?.closed,
  closedAt: d?.closed_at ?? null,
  closeMemo: d?.close_memo ?? null,
  discounts: Array.isArray(d?.discounts) ? d.discounts : [],
  earlyDoubleMin: d?.early_double_min ?? 0,
  earlySingleMin: d?.early_single_min ?? 0,
  tournamentStart: d?.tournament_start ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPlayer = (r: any): LedgerPlayer => ({
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date,
  name: r.name, visitorType: (r.visitor_type ?? null) as VisitorType | null,
  note: r.note ?? null, sortOrder: r.sort_order ?? 0,
});

const emptySession = (venueId: string, date: string): LedgerSession => ({
  venueId, sessionDate: date, buyinAmount: 0, cardAmount: null, targetEntries: 0, regClosed: false, closed: false, discounts: [],
  earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null,
});

// ── 권한 ──────────────────────────────────────────────────────────────────────
export async function canAccessLedger(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('can_access_ledger', { p_venue_id: venueId });
  if (error) return false;
  return !!data;
}
export async function canManagePos(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('can_manage_pos', { p_venue_id: venueId });
  if (error) return false;
  return !!data;
}

// ── 세션(매장+날짜) ───────────────────────────────────────────────────────────
export async function getLedgerSession(venueId: string, date = today()): Promise<LedgerSession> {
  if (IS_MOCK) return emptySession(venueId, date);
  const { data } = await supabase.from('ledger_sessions')
    .select('*').eq('venue_id', venueId).eq('session_date', date).maybeSingle();
  return data ? rowToSession(venueId, date, data) : emptySession(venueId, date);
}

export interface LedgerSessionListItem {
  sessionDate: string;
  title?: string;
  openedAt?: string | null;
  regClosed: boolean;
  closed: boolean;
  buyinAmount: number;
}

/** 매장의 게임(세션) 목록 — 최신 날짜순. 장부 진입 시 리스트업 용. */
export async function getLedgerSessionList(venueId: string, limit = 90): Promise<LedgerSessionListItem[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_sessions')
    .select('session_date, title, opened_at, reg_closed, closed, buyin_amount')
    .eq('venue_id', venueId).order('session_date', { ascending: false }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({
    sessionDate: d.session_date, title: d.title ?? undefined,
    openedAt: d.opened_at ?? null, regClosed: !!d.reg_closed, closed: !!d.closed,
    buyinAmount: d.buyin_amount ?? 0,
  }));
}

/** 직전(가장 최근) 세션 설정 — 다음 게임 열 때 단가/게임명/딜러 등을 바로 이어쓰기 위함 */
export async function getLastLedgerSettings(venueId: string, beforeDate: string): Promise<Partial<LedgerSession> | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('ledger_sessions')
    .select('buyin_amount, card_amount, target_entries, title, dealers, event_memo, discounts')
    .eq('venue_id', venueId).lt('session_date', beforeDate)
    .order('session_date', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    buyinAmount: data.buyin_amount ?? 0,
    cardAmount: data.card_amount ?? null,
    targetEntries: data.target_entries ?? 0,
    title: data.title ?? undefined,
    dealers: data.dealers ?? undefined,
    eventMemo: data.event_memo ?? undefined,
    discounts: Array.isArray(data.discounts) ? data.discounts as DiscountPreset[] : [],
  };
}

/** 게임 프리셋 — 과거 세션에서 게임명 기준으로 중복 제거한 최근 설정 묶음(클릭 시 자동입력용). */
export interface LedgerPreset {
  title: string;
  buyinAmount: number;
  cardAmount: number | null;
  targetEntries: number;
  dealers?: string;
  eventMemo?: string;
  discounts: DiscountPreset[];
}
export async function getLedgerPresets(venueId: string, limit = 8): Promise<LedgerPreset[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('ledger_sessions')
    .select('session_date, title, buyin_amount, card_amount, target_entries, dealers, event_memo, discounts')
    .eq('venue_id', venueId).not('title', 'is', null)
    .order('session_date', { ascending: false }).limit(50);
  const seen = new Set<string>();
  const out: LedgerPreset[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (data ?? []) as any[]) {
    const t = String(d.title ?? '').trim();
    if (!t || (d.buyin_amount ?? 0) <= 0) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: t,
      buyinAmount: d.buyin_amount ?? 0,
      cardAmount: d.card_amount ?? null,
      targetEntries: d.target_entries ?? 0,
      dealers: d.dealers ?? undefined,
      eventMemo: d.event_memo ?? undefined,
      discounts: Array.isArray(d.discounts) ? (d.discounts as DiscountPreset[]) : [],
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 세션 편집 저장(단가/게임내용/이벤트/딜러/기준엔트리). 마감/담당직원 필드는 건드리지 않음. */
export async function saveLedgerSession(s: LedgerSession): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions').upsert({
    venue_id: s.venueId, session_date: s.sessionDate,
    buyin_amount: s.buyinAmount, card_amount: s.cardAmount,
    target_entries: s.targetEntries, title: s.title ?? null,
    event_memo: s.eventMemo ?? null, dealers: s.dealers ?? null, schedule_id: s.scheduleId ?? null,
    discounts: (s.discounts ?? []) as unknown as object,
    early_double_min: s.earlyDoubleMin ?? 0, early_single_min: s.earlySingleMin ?? 0, tournament_start: s.tournamentStart ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date' });
  if (error) throw error;
}

/** 장부 입장(세션 오픈) — 담당직원/오픈시각 기록 + 편집 필드 저장. closed=false 로 리셋. */
export async function openLedgerSession(s: LedgerSession, operatorId?: string | null): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ledger_sessions').upsert({
    venue_id: s.venueId, session_date: s.sessionDate,
    buyin_amount: s.buyinAmount, card_amount: s.cardAmount,
    target_entries: s.targetEntries, title: s.title ?? null,
    event_memo: s.eventMemo ?? null, dealers: s.dealers ?? null, schedule_id: s.scheduleId ?? null,
    discounts: (s.discounts ?? []) as unknown as object,
    early_double_min: s.earlyDoubleMin ?? 0, early_single_min: s.earlySingleMin ?? 0, tournament_start: s.tournamentStart ?? null,
    opened_by: operatorId ?? user?.id ?? null, opened_at: new Date().toISOString(),
    reg_closed: false, reg_closed_at: null,
    closed: false, closed_at: null, close_memo: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date' });
  if (error) throw error;
}

/** 레지(레지스트리) 마감 — 신규 등록/엔트리 중단(정산 마감과 별개) */
export async function setRegistrationClosed(venueId: string, date: string, closed: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ reg_closed: closed, reg_closed_at: closed ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date);
  if (error) throw error;
}

/** 장부 정산 마감 — 읽기전용 스냅샷 + 마감 메모 */
export async function closeLedgerSession(venueId: string, date: string, memo: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ closed: true, closed_at: new Date().toISOString(), close_memo: memo || null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date);
  if (error) throw error;
}

/** 마감 해제(업주 전용 — UI에서 권한 게이트) */
export async function reopenLedgerSession(venueId: string, date: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ closed: false, closed_at: null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date);
  if (error) throw error;
}

// ── 명단(roster) ──────────────────────────────────────────────────────────────
export async function getLedgerPlayers(venueId: string, date = today()): Promise<LedgerPlayer[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_players')
    .select('*').eq('venue_id', venueId).eq('session_date', date)
    .order('sort_order').order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToPlayer);
}

export async function addLedgerPlayer(input: {
  venueId: string; sessionDate: string; name: string;
  visitorType?: string | null; sortOrder?: number;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ledger_players').insert({
    venue_id: input.venueId, session_date: input.sessionDate, name: input.name,
    visitor_type: input.visitorType ?? null, sort_order: input.sortOrder ?? 0,
    created_by: user?.id ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('이미 추가된 플레이어입니다');
    throw error;
  }
}

export async function updateLedgerPlayer(id: string, patch: {
  visitorType?: string | null; note?: string | null; sortOrder?: number; name?: string;
}): Promise<void> {
  if (IS_MOCK) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = {};
  if (patch.visitorType !== undefined) p.visitor_type = patch.visitorType;
  if (patch.note !== undefined) p.note = patch.note;
  if (patch.sortOrder !== undefined) p.sort_order = patch.sortOrder;
  if (patch.name !== undefined) p.name = patch.name;
  const { error } = await supabase.from('ledger_players').update(p).eq('id', id);
  if (error) throw error;
}

export async function removeLedgerPlayer(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_players').delete().eq('id', id);
  if (error) throw error;
}

// ── 바이인(셀) ────────────────────────────────────────────────────────────────
export async function getLedgerBuyins(venueId: string, date = today()): Promise<LedgerBuyin[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_buyins')
    .select('*').eq('venue_id', venueId).eq('session_date', date)
    .order('player_name').order('entry_no');
  if (error) throw error;
  return (data ?? []).map(rowToBuyin);
}

/** 기간 통계용 — 날짜 범위의 세션 + 바인 일괄 조회 */
export async function getLedgerRange(venueId: string, from: string, to: string): Promise<{ sessions: LedgerSession[]; buyins: LedgerBuyin[] }> {
  if (IS_MOCK) return { sessions: [], buyins: [] };
  const [sRes, bRes] = await Promise.all([
    supabase.from('ledger_sessions').select('*').eq('venue_id', venueId).gte('session_date', from).lte('session_date', to),
    supabase.from('ledger_buyins').select('*').eq('venue_id', venueId).gte('session_date', from).lte('session_date', to),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (sRes.data ?? []).map((d: any) => rowToSession(venueId, d.session_date, d));
  const buyins = (bRes.data ?? []).map(rowToBuyin);
  return { sessions, buyins };
}

/** 셀 결제 입력/수정 — (매장,날짜,플레이어,회차) 충돌 시 갱신. buyin_at = NOW.
 *  티켓/가게지원은 항상 완납 처리(미수 불가). */
export async function upsertBuyin(input: {
  venueId: string; sessionDate: string; playerName: string; entryNo: number;
  paymentMethod: PaymentMethod; isUnpaid: boolean; discountIndex?: number; earlyOverride?: EarlyType | null;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  // 가게지원은 항상 완납. 티켓은 미수(가불) 허용.
  const unpaid = input.paymentMethod === 'support' ? false : input.isUnpaid;
  const { error } = await supabase.from('ledger_buyins').upsert({
    venue_id: input.venueId, session_date: input.sessionDate,
    player_name: input.playerName, entry_no: input.entryNo,
    payment_method: input.paymentMethod, is_unpaid: unpaid,
    is_split: false, cash_amount: 0, card_amount: 0, transfer_amount: 0,
    ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: input.discountIndex ?? 0,
    early_override: input.earlyOverride ?? null,
    buyin_at: new Date().toISOString(), created_by: user?.id ?? null,
  }, { onConflict: 'venue_id,session_date,player_name,entry_no' });
  if (error) throw error;
}

/** 기존 바인의 얼리 유형만 수기 변경(자동=null) */
export async function setBuyinEarly(buyinId: string, override: EarlyType | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_buyins').update({ early_override: override }).eq('id', buyinId);
  if (error) throw error;
}

/** 분납/할인 상세 입력 — 현금/카드/이체 금액 + 미수금액 + 티켓장수 + 레벨할인 */
export async function upsertBuyinSplit(input: {
  venueId: string; sessionDate: string; playerName: string; entryNo: number;
  cashAmount: number; cardAmount: number; transferAmount: number;
  ticketCount: number; unpaidAmount: number; discountLevel: number;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  // 대표 결제수단(셀 표기/정렬용): 금액이 큰 수단. 전부 0이고 티켓만이면 ticket.
  const primary: PaymentMethod =
    input.ticketCount > 0 && (input.cashAmount + input.cardAmount + input.transferAmount) === 0 ? 'ticket'
    : input.cardAmount >= input.cashAmount && input.cardAmount >= input.transferAmount && input.cardAmount > 0 ? 'card'
    : input.transferAmount > input.cashAmount && input.transferAmount > 0 ? 'transfer'
    : 'cash';
  const { error } = await supabase.from('ledger_buyins').upsert({
    venue_id: input.venueId, session_date: input.sessionDate,
    player_name: input.playerName, entry_no: input.entryNo,
    payment_method: primary, is_unpaid: input.unpaidAmount > 0,
    is_split: true,
    cash_amount: input.cashAmount, card_amount: input.cardAmount, transfer_amount: input.transferAmount,
    ticket_count: input.ticketCount, unpaid_amount: input.unpaidAmount, discount_level: input.discountLevel, discount_index: 0,
    buyin_at: new Date().toISOString(), created_by: user?.id ?? null,
  }, { onConflict: 'venue_id,session_date,player_name,entry_no' });
  if (error) throw error;
}

/** 바이인 취소(삭제) — 업주 설정 비밀번호 필요 */
export async function cancelBuyin(id: string, password: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('cancel_ledger_buyin', { p_id: id, p_password: password });
  if (error) throw error;
}

// ── 실시간 동기화 (바이인 + 명단) ─────────────────────────────────────────────
export function subscribeLedger(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`ledger:${venueId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_buyins', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_players', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 취소 비밀번호 ─────────────────────────────────────────────────────────────
export async function posHasPassword(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.rpc('pos_has_password', { p_venue_id: venueId });
  return !!data;
}
export async function setPosCancelPassword(venueId: string, password: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_pos_cancel_password', { p_venue_id: venueId, p_password: password });
  if (error) throw error;
}

// ── 직원 장부 권한 ────────────────────────────────────────────────────────────
export async function getLedgerAccessUserIds(venueId: string): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_access').select('user_id').eq('venue_id', venueId);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.user_id);
}
export async function grantLedgerAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('grant_ledger_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
}
export async function revokeLedgerAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_ledger_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
}
