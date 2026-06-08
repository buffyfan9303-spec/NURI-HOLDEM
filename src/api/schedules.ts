// src/api/schedules.ts
import { supabase, IS_MOCK } from '../lib/supabase';

/** 일정(포스터/게임) 변경 실시간 구독 — 다른 기기/사용자의 등록·수정·삭제를 자동 반영 */
export function subscribeSchedules(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel('schedules_all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export type TournamentFormat = 'MTT' | 'SNG' | 'PKO' | 'Bounty' | 'Mix';
export interface SeatVoucher  { label: string; count: number; }
export interface BuyInInfo    { amount: number; rebuy?: number; rebuyLimit?: number; addon?: number; }
export interface SideEvent    { name: string; startBefore: string; buyIn?: number; note?: string; }
export interface RankingPrize { rank: string; amount: number; unit?: string; }
export interface Promotion    { badge?: string; title: string; detail?: string; }

export interface Schedule {
  id: string; title: string; venueId: string; pubName: string; region: string; address?: string;
  date: string; startTime: string; duration: string; format: TournamentFormat;
  guaranteed: boolean; prizePool?: number; prizePercent?: number; regCloseTime?: string;
  isCompetition?: boolean; // '대회/이벤트' 분류 — 필터 [대회]용 (Task 3)
  blinds?: string;         // 블라인드 구조(선택) — 직접 입력
  buyIn: BuyInInfo; seats?: SeatVoucher[];
  structure?: { startingChips?: number; rebuyStack?: number; blindLevelMinutes?: number; lateRegLevels?: number; levels?: { sb: number; bb: number; ante: number; minutes: number; isBreak?: boolean }[] };
  description?: string;
  sideEvents?: SideEvent[]; rankingPrizes?: RankingPrize[];
  partners?: string[]; promotions?: Promotion[]; paymentMethods?: string[]; rules?: string[];
  posterUrl?: string; posterColor?: string;
  displayOrder: number; isPremium: boolean; ownerId: string;
  unreadQnaCount: number; approved: boolean;
}

export interface ReorderPayload { items: { id: string; displayOrder: number }[]; }

// 'HH:MM:SS' / 'HH:MM' → 'HH:MM' — DB time 컬럼의 초를 떼어 화면 표기 정리
function hhmm(t?: string | null): string {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : (t ?? '');
}

// ── DB row → Schedule ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSchedule(r: any): Schedule {
  return {
    id: r.id, title: r.title, venueId: r.venue_id, pubName: r.pub_name,
    region: r.region, address: r.address,
    date: r.date, startTime: hhmm(r.start_time), duration: r.duration ?? '',
    format: r.format, guaranteed: r.guaranteed, prizePool: r.prize_pool,
    prizePercent: r.prize_percent ?? undefined,
    isCompetition: r.is_competition ?? false,
    blinds: r.blinds ?? undefined,
    regCloseTime: r.reg_close_time,
    buyIn: r.buy_in, seats: r.seats, structure: r.structure,
    description: r.description,
    sideEvents: r.side_events, rankingPrizes: r.ranking_prizes,
    partners: r.partners, promotions: r.promotions,
    paymentMethods: r.payment_methods, rules: r.rules,
    posterUrl: r.poster_url, posterColor: r.poster_color,
    displayOrder: r.display_order, isPremium: r.is_premium,
    ownerId: r.owner_id, unreadQnaCount: r.unread_qna_count, approved: r.approved,
  };
}

// ── 전체 조회 ─────────────────────────────────────────────────────────────────
export async function getSchedules(): Promise<Schedule[]> {
  if (IS_MOCK) {
    const { MOCK_SCHEDULES } = await import('../mock/data');
    return MOCK_SCHEDULES;
  }
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .order('is_premium', { ascending: false })
    .order('display_order');
  if (error) throw error;
  return (data ?? []).map(rowToSchedule);
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────
export async function getScheduleById(id: string): Promise<Schedule | null> {
  if (IS_MOCK) {
    const { MOCK_SCHEDULES } = await import('../mock/data');
    return MOCK_SCHEDULES.find((s) => s.id === id) ?? null;
  }
  const { data, error } = await supabase.from('schedules').select('*').eq('id', id).single();
  if (error) return null;
  return rowToSchedule(data);
}

// ── 업주: 포스터 등록 ─────────────────────────────────────────────────────────
export async function createSchedule(
  payload: Omit<Schedule, 'id' | 'unreadQnaCount' | 'approved'> & { approved?: boolean },
): Promise<Schedule> {
  if (IS_MOCK) throw new Error('Mock mode');
  const { data, error } = await supabase.from('schedules').insert({
    title: payload.title, venue_id: payload.venueId || null, pub_name: payload.pubName,
    region: payload.region, address: payload.address,
    date: payload.date, start_time: payload.startTime, duration: payload.duration,
    format: payload.format, guaranteed: payload.guaranteed, prize_pool: payload.prizePool,
    prize_percent: payload.prizePercent ?? null,
    is_competition: payload.isCompetition ?? false,
    blinds: payload.blinds ?? null,
    reg_close_time: payload.regCloseTime,
    buy_in: payload.buyIn, structure: payload.structure,
    description: payload.description, payment_methods: payload.paymentMethods,
    partners: payload.partners,
    ranking_prizes: payload.rankingPrizes, promotions: payload.promotions,
    poster_url: payload.posterUrl, poster_color: payload.posterColor,
    display_order: payload.displayOrder, is_premium: payload.isPremium,
    owner_id: payload.ownerId, approved: payload.approved ?? false,
  }).select().single();
  if (error) throw error;
  return rowToSchedule(data);
}

// ── 업주: 포스터 수정 ─────────────────────────────────────────────────────────
export async function updateSchedule(id: string, patch: Partial<Schedule>): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('schedules').update({
    ...(patch.title         !== undefined && { title:           patch.title }),
    ...(patch.date          !== undefined && { date:            patch.date }),
    ...(patch.startTime     !== undefined && { start_time:      patch.startTime }),
    ...(patch.duration      !== undefined && { duration:        patch.duration }),
    ...(patch.regCloseTime  !== undefined && { reg_close_time:  patch.regCloseTime }),
    ...(patch.format        !== undefined && { format:          patch.format }),
    ...(patch.guaranteed    !== undefined && { guaranteed:      patch.guaranteed }),
    ...(patch.isCompetition !== undefined && { is_competition:  patch.isCompetition }),
    ...(patch.prizePool     !== undefined && { prize_pool:      patch.prizePool }),
    ...(patch.prizePercent  !== undefined && { prize_percent:   patch.prizePercent }),
    ...(patch.blinds        !== undefined && { blinds:          patch.blinds }),
    ...(patch.structure     !== undefined && { structure:       patch.structure }),
    ...(patch.buyIn         !== undefined && { buy_in:          patch.buyIn }),
    ...(patch.region        !== undefined && { region:          patch.region }),
    ...(patch.seats         !== undefined && { seats:           patch.seats }),
    ...(patch.posterUrl     !== undefined && { poster_url:      patch.posterUrl }),
    ...(patch.posterColor   !== undefined && { poster_color:    patch.posterColor }),
    ...(patch.description   !== undefined && { description:     patch.description }),
    ...(patch.paymentMethods!== undefined && { payment_methods: patch.paymentMethods }),
    ...(patch.partners      !== undefined && { partners:        patch.partners }),
    ...(patch.rankingPrizes !== undefined && { ranking_prizes:  patch.rankingPrizes }),
    ...(patch.promotions    !== undefined && { promotions:      patch.promotions }),
    ...(patch.isPremium     !== undefined && { is_premium:      patch.isPremium }),
    ...(patch.displayOrder  !== undefined && { display_order:   patch.displayOrder }),
    ...(patch.approved      !== undefined && { approved:        patch.approved }),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ── 업주: 포스터 삭제 ─────────────────────────────────────────────────────────
export async function deleteSchedule(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('schedules').delete().eq('id', id);
  if (error) throw error;
}

// ── 관리자: 노출 순서 일괄 변경 ───────────────────────────────────────────────
export async function reorderSchedules(payload: ReorderPayload): Promise<void> {
  if (IS_MOCK) return;
  // 행별 UPDATE — upsert 는 INSERT 경로(RLS·NOT NULL)까지 걸려 관리자 순서변경이 막혀
  // '저장 실패' 가 나므로, 존재하는 행을 개별 update 한다(reorderVenues 와 동일 방식).
  const results = await Promise.all(
    payload.items.map(({ id, displayOrder }) =>
      supabase.from('schedules')
        .update({ display_order: displayOrder, updated_at: new Date().toISOString() })
        .eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// ── 관리자: 프리미엄 토글 ─────────────────────────────────────────────────────
export async function togglePremium(id: string, isPremium: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('schedules').update({
    is_premium: isPremium, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ── 관리자: 대회 분류 토글 — [대회] 필터 노출 여부 ────────────────────────────
export async function toggleCompetition(id: string, isCompetition: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('schedules').update({
    is_competition: isCompetition, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}