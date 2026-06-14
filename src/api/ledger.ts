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

/** 하루 안에서 메인(1)/사이드(2,3…) 게임을 구분하는 시퀀스. 기존 데이터는 전부 1(메인). */
export const MAIN_GAME_SEQ = 1;

export interface LedgerBuyin {
  id: string;
  venueId: string;
  sessionDate: string;
  gameSeq: number;              // 게임 구분(1=메인, 2+=사이드)
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

/** C2: 마감 시 저장하는 클락 최종 보정 수치(통계 보조 표기용). 장부 바인과 별개 기준. */
export interface ClockSnapshot { entries: number; alive: number; eliminations: number; rebuys: number; earlies: number; addons: number }

export interface LedgerSession {
  venueId: string;
  sessionDate: string;
  gameSeq: number;              // 게임 구분(1=메인, 2+=사이드) — (venue,date,game_seq) = 장부 1개
  buyinAmount: number;          // 현금단가
  cardAmount: number | null;    // 카드단가(미입력 시 현금단가 적용)
  gameType: 'gtd' | 'entry';    // GTD(보장) / 엔트리 게임
  targetEntries: number;        // 기준 엔트리(GTD용 통계 기준)
  maxEntries: number;           // 맥스 엔트리(엔트리 게임용, 0=무제한/미설정)
  isAddon: boolean;             // 애드온 게임 여부
  addonStack: number;           // 애드온 스택(애드온 게임일 때만)
  title?: string;               // 금일 게임 내용
  eventMemo?: string;           // 이벤트 등 비고
  dealers?: string;             // 금일 딜러 명단(줄바꿈 구분, 선택)
  scheduleId?: string | null;   // 연결된 포스터(대회) 일정
  discounts: DiscountPreset[];  // 할인 프리셋(최대 5)
  earlyDoubleMin: number;       // 스타트 후 ~분까지 더블얼리
  earlySingleMin: number;       // 스타트 후 ~분까지 1얼리
  tournamentStart?: string | null; // 토너먼트 스타트 시각(ISO, 없으면 openedAt 기준)
  openedBy?: string | null;     // 담당직원 대표(프로필 id, 하위호환)
  operators?: string[];         // 담당직원 목록(최대 10) — 직원 장부 접근 권한 기준
  openedAt?: string | null;
  regClosed: boolean;           // 레지(레지스트리) 마감
  regClosedAt?: string | null;
  closed: boolean;              // 정산 마감(읽기전용 스냅샷)
  closedAt?: string | null;
  closeMemo?: string | null;
  voucherIssued?: number;       // 매장이용권 발행/시상 장수(당일)
  voucherAccrualPerBin?: number; // 바인 1회당 매장이용권 적립 수(0=off)
  clockSnapshot?: ClockSnapshot | null; // C2: 마감 시 클락 최종 스냅샷(통계 보조)
}

export interface LedgerPlayer {
  id: string;
  venueId: string;
  sessionDate: string;
  gameSeq: number;              // 게임 구분(1=메인, 2+=사이드)
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
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date, gameSeq: r.game_seq ?? MAIN_GAME_SEQ,
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
  // 얼리는 첫 바이인(entryNo=1)에만. 2번째부터는 리바인 — 얼리 아님(리바인 스택).
  if (b.entryNo !== 1) return 'none';
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
  venueId, sessionDate: date, gameSeq: d?.game_seq ?? MAIN_GAME_SEQ,
  buyinAmount: d?.buyin_amount ?? 0,
  cardAmount: d?.card_amount ?? null,
  gameType: (d?.game_type === 'entry' ? 'entry' : 'gtd'),
  targetEntries: d?.target_entries ?? 0,
  maxEntries: d?.max_entries ?? 0,
  isAddon: !!d?.is_addon,
  addonStack: d?.addon_stack ?? 0,
  title: d?.title ?? undefined,
  eventMemo: d?.event_memo ?? undefined,
  dealers: d?.dealers ?? undefined,
  scheduleId: d?.schedule_id ?? null,
  openedBy: d?.opened_by ?? null,
  operators: Array.isArray(d?.operators) ? d.operators : [],
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
  voucherIssued: d?.voucher_issued ?? 0,
  voucherAccrualPerBin: d?.voucher_accrual_per_bin ?? 0,
  clockSnapshot: (d?.clock_snapshot ?? null) as ClockSnapshot | null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPlayer = (r: any): LedgerPlayer => ({
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date, gameSeq: r.game_seq ?? MAIN_GAME_SEQ,
  name: r.name, visitorType: (r.visitor_type ?? null) as VisitorType | null,
  note: r.note ?? null, sortOrder: r.sort_order ?? 0,
});

const emptySession = (venueId: string, date: string, gameSeq = MAIN_GAME_SEQ): LedgerSession => ({
  venueId, sessionDate: date, gameSeq, buyinAmount: 0, cardAmount: null,
  gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0,
  operators: [],
  regClosed: false, closed: false, discounts: [],
  earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null,
  voucherIssued: 0,
  voucherAccrualPerBin: 0,
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

// ── 세션(매장+날짜+게임) ───────────────────────────────────────────────────────
export async function getLedgerSession(venueId: string, date = today(), gameSeq = MAIN_GAME_SEQ): Promise<LedgerSession> {
  if (IS_MOCK) return emptySession(venueId, date, gameSeq);
  const { data } = await supabase.from('ledger_sessions')
    .select('*').eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq).maybeSingle();
  return data ? rowToSession(venueId, date, data) : emptySession(venueId, date, gameSeq);
}

/** 특정 날짜의 게임(메인+사이드) 목록 — game_seq 오름차순(1=메인). 게임 선택기/생성용. */
export interface LedgerGame {
  gameSeq: number;
  title?: string;
  buyinAmount: number;
  openedAt?: string | null;
  regClosed: boolean;
  closed: boolean;
  scheduleId?: string | null;
}
export async function getLedgerGames(venueId: string, date = today()): Promise<LedgerGame[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_sessions')
    .select('game_seq, title, buyin_amount, opened_at, reg_closed, closed, schedule_id')
    .eq('venue_id', venueId).eq('session_date', date)
    .order('game_seq', { ascending: true });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({
    gameSeq: d.game_seq ?? MAIN_GAME_SEQ, title: d.title ?? undefined, buyinAmount: d.buyin_amount ?? 0,
    openedAt: d.opened_at ?? null, regClosed: !!d.reg_closed, closed: !!d.closed, scheduleId: d.schedule_id ?? null,
  }));
}

/** 다음 사이드 게임 번호 — 그 날짜의 max(game_seq)+1 (없으면 메인=1). */
export async function nextGameSeq(venueId: string, date: string): Promise<number> {
  if (IS_MOCK) return MAIN_GAME_SEQ;
  const { data } = await supabase.from('ledger_sessions')
    .select('game_seq').eq('venue_id', venueId).eq('session_date', date)
    .order('game_seq', { ascending: false }).limit(1).maybeSingle();
  const max = (data as { game_seq?: number } | null)?.game_seq ?? 0;
  return Math.max(MAIN_GAME_SEQ, max + 1);
}

export interface LedgerSessionListItem {
  sessionDate: string;
  gameSeq: number;
  title?: string;
  openedAt?: string | null;
  regClosed: boolean;
  closed: boolean;
  buyinAmount: number;
  operators: string[];
}

/** 매장의 게임(세션) 목록 — 최신 날짜순(같은 날은 game_seq 오름차순). 장부 진입 시 리스트업 용. */
export async function getLedgerSessionList(venueId: string, limit = 90): Promise<LedgerSessionListItem[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_sessions')
    .select('session_date, game_seq, title, opened_at, reg_closed, closed, buyin_amount, operators')
    .eq('venue_id', venueId).order('session_date', { ascending: false }).order('game_seq', { ascending: true }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({
    sessionDate: d.session_date, gameSeq: d.game_seq ?? MAIN_GAME_SEQ, title: d.title ?? undefined,
    openedAt: d.opened_at ?? null, regClosed: !!d.reg_closed, closed: !!d.closed,
    buyinAmount: d.buyin_amount ?? 0,
    operators: Array.isArray(d.operators) ? d.operators : [],
  }));
}

/** 포스터(스케줄)와 연결된 장부 매핑 — scheduleId → sessionDate. 게임관리 '장부' 바로가기용. */
export async function getLedgerScheduleLinks(venueId: string): Promise<Record<string, string>> {
  if (IS_MOCK) return {};
  const { data } = await supabase.from('ledger_sessions')
    .select('schedule_id, session_date')
    .eq('venue_id', venueId).not('schedule_id', 'is', null)
    .order('session_date', { ascending: false }).limit(200);
  const map: Record<string, string> = {};
  for (const d of (data ?? []) as { schedule_id: string; session_date: string }[]) {
    if (!map[d.schedule_id]) map[d.schedule_id] = d.session_date; // 같은 포스터에 여럿이면 최신 장부
  }
  return map;
}

/** 포스터(스케줄) 하나에 연결된 장부 전체 — 멀티데이/사이드 운영 대응(최신순). */
export interface ScheduleLedgerItem { date: string; gameSeq: number; title: string | null; closed: boolean }
export async function getScheduleLedgers(venueId: string, scheduleId: string): Promise<ScheduleLedgerItem[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('ledger_sessions')
    .select('session_date, game_seq, title, closed')
    .eq('venue_id', venueId).eq('schedule_id', scheduleId)
    .order('session_date', { ascending: false }).order('game_seq', { ascending: true }).limit(30);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({ date: d.session_date, gameSeq: d.game_seq ?? MAIN_GAME_SEQ, title: d.title ?? null, closed: !!d.closed }));
}

/** 장부 시작 알림 — 담당 직원(본인 제외)에게 "장부가 시작됐어요" 알림(서버 RPC, 권한 검증). */
export async function notifyLedgerOpen(venueId: string, title: string, operatorIds: string[]): Promise<void> {
  if (IS_MOCK || operatorIds.length === 0) return;
  await supabase.rpc('notify_ledger_open', { p_venue_id: venueId, p_title: title, p_operator_ids: operatorIds });
}

/** 게임관리 운영 현황판 — 연결 장부의 바인 수·매출(만)·마감·순위입력 여부(scheduleId 키). */
export interface PosterOpsSummary {
  date: string;
  closed: boolean;
  buyinCount: number;
  revenueMan: number;   // 실수금 합(만원 환산) — 통계와 동일한 buyinFinance 규칙(DB 금액은 원 단위)
  hasRankings: boolean; // 그 날짜에 순위 입력이 1건이라도 있는지
}
export async function getPosterOpsSummaries(venueId: string): Promise<Record<string, PosterOpsSummary>> {
  if (IS_MOCK) return {};
  const { data: ss } = await supabase.from('ledger_sessions')
    .select('schedule_id, session_date, game_seq, closed, buyin_amount, card_amount, discounts')
    .eq('venue_id', venueId).not('schedule_id', 'is', null)
    .order('session_date', { ascending: false }).limit(100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (ss ?? []) as any[];
  if (!sessions.length) return {};
  const gkey = (d: string, g: number) => `${d}#${g}`;
  const byKey = new Map(sessions.map((s) => [gkey(s.session_date as string, s.game_seq ?? MAIN_GAME_SEQ), s]));
  const dates = [...new Set(sessions.map((s) => s.session_date as string))];
  const [bRes, rRes] = await Promise.all([
    supabase.from('ledger_buyins').select('*').eq('venue_id', venueId).in('session_date', dates),
    supabase.from('venue_rankings').select('ranking_date').eq('venue_id', venueId).in('ranking_date', dates),
  ]);
  const rankedDates = new Set(((rRes.data ?? []) as { ranking_date: string }[]).map((r) => r.ranking_date));
  // (날짜,게임)별 바인 집계(매출은 그 게임 단가 기준 buyinFinance)
  const agg = new Map<string, { cnt: number; rev: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (bRes.data ?? []) as any[]) {
    const b = rowToBuyin(row);
    const k = gkey(row.session_date as string, row.game_seq ?? MAIN_GAME_SEQ);
    const s = byKey.get(k);
    if (!s) continue;
    const fin = buyinFinance(b, { buyinAmount: s.buyin_amount ?? 0, cardAmount: s.card_amount ?? null, discounts: s.discounts ?? [] });
    const cur = agg.get(k) ?? { cnt: 0, rev: 0 };
    cur.cnt += 1;
    cur.rev += fin.paid;
    agg.set(k, cur);
  }
  const out: Record<string, PosterOpsSummary> = {};
  for (const s of sessions) {
    if (out[s.schedule_id]) continue; // 최신 장부 우선
    const a = agg.get(gkey(s.session_date as string, s.game_seq ?? MAIN_GAME_SEQ)) ?? { cnt: 0, rev: 0 };
    out[s.schedule_id] = {
      date: s.session_date, closed: !!s.closed,
      buyinCount: a.cnt, revenueMan: Math.round(a.rev / WON_PER_MAN),
      hasRankings: rankedDates.has(s.session_date),
    };
  }
  return out;
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
    venue_id: s.venueId, session_date: s.sessionDate, game_seq: s.gameSeq ?? MAIN_GAME_SEQ,
    buyin_amount: s.buyinAmount, card_amount: s.cardAmount,
    target_entries: s.targetEntries, title: s.title ?? null,
    game_type: s.gameType ?? 'gtd', max_entries: s.maxEntries ?? 0, is_addon: !!s.isAddon, addon_stack: s.addonStack ?? 0,
    operators: (s.operators ?? []) as unknown as object,
    event_memo: s.eventMemo ?? null, dealers: s.dealers ?? null, schedule_id: s.scheduleId ?? null,
    discounts: (s.discounts ?? []) as unknown as object,
    early_double_min: s.earlyDoubleMin ?? 0, early_single_min: s.earlySingleMin ?? 0, tournament_start: s.tournamentStart ?? null,
    voucher_issued: s.voucherIssued ?? 0,
    voucher_accrual_per_bin: s.voucherAccrualPerBin ?? 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date,game_seq' });
  if (error) throw error;
}

/** 장부 입장(세션 오픈) — 담당직원/오픈시각 기록 + 편집 필드 저장. closed=false 로 리셋. */
export async function openLedgerSession(s: LedgerSession, operatorId?: string | null): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ledger_sessions').upsert({
    venue_id: s.venueId, session_date: s.sessionDate, game_seq: s.gameSeq ?? MAIN_GAME_SEQ,
    buyin_amount: s.buyinAmount, card_amount: s.cardAmount,
    target_entries: s.targetEntries, title: s.title ?? null,
    game_type: s.gameType ?? 'gtd', max_entries: s.maxEntries ?? 0, is_addon: !!s.isAddon, addon_stack: s.addonStack ?? 0,
    operators: (s.operators ?? []) as unknown as object,
    event_memo: s.eventMemo ?? null, dealers: s.dealers ?? null, schedule_id: s.scheduleId ?? null,
    discounts: (s.discounts ?? []) as unknown as object,
    early_double_min: s.earlyDoubleMin ?? 0, early_single_min: s.earlySingleMin ?? 0, tournament_start: s.tournamentStart ?? null,
    voucher_issued: s.voucherIssued ?? 0,
    voucher_accrual_per_bin: s.voucherAccrualPerBin ?? 0,
    opened_by: operatorId ?? user?.id ?? null, opened_at: new Date().toISOString(),
    reg_closed: false, reg_closed_at: null,
    closed: false, closed_at: null, close_memo: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date,game_seq' });
  if (error) throw error;
}

/** 레지(레지스트리) 마감 — 신규 등록/엔트리 중단(정산 마감과 별개) */
export async function setRegistrationClosed(venueId: string, date: string, closed: boolean, gameSeq = MAIN_GAME_SEQ): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ reg_closed: closed, reg_closed_at: closed ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq);
  if (error) throw error;
}

/** 장부 정산 마감 — 읽기전용 스냅샷 + 마감 메모 */
export async function closeLedgerSession(venueId: string, date: string, memo: string, gameSeq = MAIN_GAME_SEQ, clockSnapshot?: ClockSnapshot | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ closed: true, closed_at: new Date().toISOString(), close_memo: memo || null, clock_snapshot: clockSnapshot ?? null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq);
  if (error) throw error;
}

/** 마감 해제(업주 전용 — UI에서 권한 게이트) */
export async function reopenLedgerSession(venueId: string, date: string, gameSeq = MAIN_GAME_SEQ): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ closed: false, closed_at: null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq);
  if (error) throw error;
}

/** 장부(세션) 통째 삭제 — 바인·명단·세션 일괄 제거. POS 관리 권한 필요(SECURITY DEFINER RPC). */
export async function deleteLedgerSession(venueId: string, date: string, gameSeq = MAIN_GAME_SEQ): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('delete_ledger_session', { p_venue_id: venueId, p_date: date, p_game_seq: gameSeq });
  if (error) throw error;
}

// ── 명단(roster) ──────────────────────────────────────────────────────────────
export async function getLedgerPlayers(venueId: string, date = today(), gameSeq = MAIN_GAME_SEQ): Promise<LedgerPlayer[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_players')
    .select('*').eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq)
    .order('sort_order').order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToPlayer);
}

export async function addLedgerPlayer(input: {
  venueId: string; sessionDate: string; gameSeq?: number; name: string;
  visitorType?: string | null; sortOrder?: number;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ledger_players').insert({
    venue_id: input.venueId, session_date: input.sessionDate, game_seq: input.gameSeq ?? MAIN_GAME_SEQ, name: input.name,
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

/** 플레이어 이름 변경 — 로스터와 해당 세션 바인 기록(player_name 키)을 함께 갱신(오기 수정용) */
export async function renameLedgerPlayer(input: {
  id: string; venueId: string; sessionDate: string; gameSeq?: number; oldName: string; newName: string;
}): Promise<void> {
  if (IS_MOCK) return;
  const newName = input.newName.trim();
  if (!newName || newName === input.oldName) return;
  const gameSeq = input.gameSeq ?? MAIN_GAME_SEQ;
  // 같은 게임에 동일 이름이 이미 있으면 바인 키 충돌 → 차단
  const { data: dup } = await supabase.from('ledger_players')
    .select('id').eq('venue_id', input.venueId).eq('session_date', input.sessionDate).eq('game_seq', gameSeq)
    .eq('name', newName).neq('id', input.id).limit(1);
  if (dup && dup.length > 0) throw new Error('같은 이름의 플레이어가 이미 있습니다');
  const { error: e1 } = await supabase.from('ledger_players').update({ name: newName }).eq('id', input.id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('ledger_buyins').update({ player_name: newName })
    .eq('venue_id', input.venueId).eq('session_date', input.sessionDate).eq('game_seq', gameSeq).eq('player_name', input.oldName);
  if (e2) throw e2;
}

export async function removeLedgerPlayer(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_players').delete().eq('id', id);
  if (error) throw error;
}

// 바인 추가 시 가입계정 연동 — 이름/닉네임으로 누리홀덤 가입자 검색(실명·닉네임·이 매장 방문횟수).
export interface RegisteredPlayer { userId: string; realName: string | null; nickname: string | null; visits: number; }
export async function searchRegisteredPlayers(venueId: string, query: string): Promise<RegisteredPlayer[]> {
  if (IS_MOCK || !query.trim()) return [];
  const { data, error } = await supabase.rpc('search_registered_players', { p_venue_id: venueId, p_query: query.trim() });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ userId: r.user_id, realName: r.real_name ?? null, nickname: r.nickname ?? null, visits: Number(r.visits) || 0 }));
}

// ── 바이인(셀) ────────────────────────────────────────────────────────────────
export async function getLedgerBuyins(venueId: string, date = today(), gameSeq = MAIN_GAME_SEQ): Promise<LedgerBuyin[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_buyins')
    .select('*').eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq)
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

/** 셀 결제 입력/수정 — (매장,날짜,게임,플레이어,회차) 충돌 시 갱신. buyin_at = NOW.
 *  티켓/가게지원은 항상 완납 처리(미수 불가). */
export async function upsertBuyin(input: {
  venueId: string; sessionDate: string; gameSeq?: number; playerName: string; entryNo: number;
  paymentMethod: PaymentMethod; isUnpaid: boolean; discountIndex?: number; earlyOverride?: EarlyType | null;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  // 가게지원은 항상 완납. 티켓은 미수(가불) 허용.
  const unpaid = input.paymentMethod === 'support' ? false : input.isUnpaid;
  const { error } = await supabase.from('ledger_buyins').upsert({
    venue_id: input.venueId, session_date: input.sessionDate, game_seq: input.gameSeq ?? MAIN_GAME_SEQ,
    player_name: input.playerName, entry_no: input.entryNo,
    payment_method: input.paymentMethod, is_unpaid: unpaid,
    is_split: false, cash_amount: 0, card_amount: 0, transfer_amount: 0,
    ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: input.discountIndex ?? 0,
    early_override: input.earlyOverride ?? null,
    buyin_at: new Date().toISOString(), created_by: user?.id ?? null,
  }, { onConflict: 'venue_id,session_date,game_seq,player_name,entry_no' });
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
  venueId: string; sessionDate: string; gameSeq?: number; playerName: string; entryNo: number;
  cashAmount: number; cardAmount: number; transferAmount: number;
  ticketCount: number; unpaidAmount: number; discountLevel: number;
  /** undefined=기존 값 보존(수정), 값/null=바인 시점 확정 기록(신규) */
  earlyOverride?: EarlyType | null;
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
    venue_id: input.venueId, session_date: input.sessionDate, game_seq: input.gameSeq ?? MAIN_GAME_SEQ,
    player_name: input.playerName, entry_no: input.entryNo,
    payment_method: primary, is_unpaid: input.unpaidAmount > 0,
    is_split: true,
    cash_amount: input.cashAmount, card_amount: input.cardAmount, transfer_amount: input.transferAmount,
    ticket_count: input.ticketCount, unpaid_amount: input.unpaidAmount, discount_level: input.discountLevel, discount_index: 0,
    ...(input.earlyOverride !== undefined ? { early_override: input.earlyOverride } : {}),
    buyin_at: new Date().toISOString(), created_by: user?.id ?? null,
  }, { onConflict: 'venue_id,session_date,game_seq,player_name,entry_no' });
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
    .channel(`ledger:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_buyins', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_players', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_sessions', filter: `venue_id=eq.${venueId}` },
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
