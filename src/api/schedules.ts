// src/api/schedules.ts
import { supabase, IS_MOCK } from '../lib/supabase';
import type { DiscountType } from '../lib/promotionLabel';

export type { DiscountType };

/** 조회수만 바뀐 갱신을 걸러내기 위한 행 지문(뷰카운트 제외). 모듈 수명 = 탭 수명. */
const rowSig = new Map<string, string>();

/** 일정(포스터/게임) 변경 실시간 구독 — 다른 기기/사용자의 등록·수정·삭제를 자동 반영.
 *
 * ⚠ 팬아웃 증폭 차단(2026-09-10 용량 점검, 동접 100 기준 BLOCKER):
 *   포스터 상세를 한 번 열 때마다 bump_schedule_view 가 schedules 행을 UPDATE 한다.
 *   schedules 는 realtime 퍼블리케이션에 있으므로 그 UPDATE 가 **구독 중인 모든 접속자**에게
 *   방송되고, 예전엔 그때마다 전원이 schedules 를 통째로 다시 받았다.
 *   동접 100에서 초당 몇 번의 조회만으로 '전원 전량 재조회' 루프가 돌아 egress 가 폭주한다.
 *   → 들어온 행에서 view_count 를 뺀 지문이 이전과 같으면 **다시 받지 않는다**.
 *     (처음 보는 포스터는 한 번은 받는다 — 안전한 쪽으로 틀린다. 그 뒤 같은 포스터의 조회수
 *      증가는 전부 무료다. 진짜 수정·등록·삭제는 지문이 달라지므로 반드시 통과한다.)
 */
export function subscribeSchedules(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`schedules_all_${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, (payload) => {
      const n = payload.new as Record<string, unknown> | null;
      if (payload.eventType === 'UPDATE' && n && typeof n.id === 'string') {
        const rest: Record<string, unknown> = { ...n };
        delete rest.view_count;
        const sig = JSON.stringify(rest);
        if (rowSig.get(n.id) === sig) return; // 조회수만 올랐다 — 목록은 그대로다
        rowSig.set(n.id, sig);
      }
      onChange();
    })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export type TournamentFormat = 'MTT' | 'SNG' | 'PKO' | 'Bounty' | 'Mix';
export interface SeatVoucher  { label: string; count: number; }
export interface BuyInInfo    { amount: number; rebuy?: number; rebuyLimit?: number; addon?: number; addonStack?: number; startStack?: number; rebuyStack?: number; gameType?: string; }
export interface SideEvent    { name: string; startBefore: string; buyIn?: number; note?: string; }
export interface RankingPrize { rank: string; amount: number; unit?: string; }
/** 포스터의 이벤트·프로모션 한 줄.
 *  `discountWon` 이 있으면 **참가비 할인 이벤트**로, 장부가 그대로 가져다 쓸 수 있다(오너 지시 2026-09-06).
 *  · discountWon — 할인액(원). 0/undefined = 그냥 안내 문구(종전 동작 그대로).
 *  · level       — 자동 적용 기준 레벨(N레벨까지). 0/undefined = 수기 선택 전용.
 *  · discountType — 할인유형(오너 지시 2026-09-06). 고르면 태그·내용·장부 라벨을 lib/promotionLabel 이 만든다.
 *                   undefined = 유형 개념이 없던 기존 데이터 → 'custom' 과 같게 다뤄 자동 생성 없음(하위호환).
 *  세 값은 장부의 DiscountPreset{label, amount, level} 과 1:1 로 대응한다(src/api/ledger.ts). */
export interface Promotion    { badge?: string; title: string; detail?: string; discountWon?: number; level?: number; discountType?: DiscountType; }

export interface Schedule {
  id: string; title: string; venueId: string; pubName: string; region: string; address?: string;
  date: string; startTime: string; duration: string; format: TournamentFormat;
  guaranteed: boolean; prizePool?: number; prizePercent?: number; regCloseTime?: string;
  isCompetition?: boolean; // '대회/이벤트' 분류 — 필터 [대회]용 (Task 3)
  /** 대회 등급 축(Phase 14 보류 해제) — 데일리/새틀라이트/시리즈, null=일반 */
  grade?: 'daily' | 'satellite' | 'series' | null;
  blinds?: string;         // 블라인드 구조(선택) — 직접 입력
  buyIn: BuyInInfo; seats?: SeatVoucher[];
  structure?: { startingChips?: number; rebuyStack?: number; blindLevelMinutes?: number; lateRegLevels?: number; levels?: { sb: number; bb: number; ante: number; minutes: number; isBreak?: boolean }[] };
  description?: string;
  sideEvents?: SideEvent[]; rankingPrizes?: RankingPrize[];
  partners?: string[]; promotions?: Promotion[]; paymentMethods?: string[]; rules?: string[];
  posterUrl?: string; posterColor?: string;
  displayOrder: number; isPremium: boolean; ownerId: string;
  unreadQnaCount: number; approved: boolean;
  /** 반려 시각 — null/undefined = 반려된 적 없음. 관리자만 세울 수 있다(trg_prevent_self_approve, 20260911o).
   *  마이그레이션 전 서버에서는 컬럼이 없어 항상 null 이다 — 화면은 종전과 똑같이 동작한다. */
  rejectedAt?: string | null;
  /** 반려 사유 원문 — 업주에게 그대로 보인다 */
  rejectReason?: string | null;
  /** 포스터 상세 조회수(성과 지표) — 승인된 포스터만 집계 */
  viewCount?: number;
  /** 부스트 만료 시각 — 있고 미래면 isPremium과 동일하게 상단 고정 */
  premiumUntil?: string | null;
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
    grade: r.grade ?? null,
    blinds: r.blinds ?? undefined,
    regCloseTime: r.reg_close_time,
    buyIn: r.buy_in, seats: r.seats, structure: r.structure,
    description: r.description,
    sideEvents: r.side_events, rankingPrizes: r.ranking_prizes,
    partners: r.partners, promotions: r.promotions,
    paymentMethods: r.payment_methods, rules: r.rules,
    posterUrl: r.poster_url, posterColor: r.poster_color,
    displayOrder: r.display_order,
    // 부스트(기간제)가 살아있으면 무기한 프리미엄과 동일 취급 — 뱃지·상단 고정 모두 그대로 작동
    isPremium: r.is_premium || (r.premium_until != null && new Date(r.premium_until) > new Date()),
    premiumUntil: r.premium_until ?? null,
    ownerId: r.owner_id, unreadQnaCount: r.unread_qna_count, approved: r.approved,
    viewCount: r.view_count ?? 0,
    // 마이그레이션(20260911o) 전 서버에는 컬럼이 없다 → undefined → null = '반려된 적 없음'.
    rejectedAt: r.rejected_at ?? null,
    rejectReason: r.reject_reason ?? null,
  };
}

/** 주간 퍼널(최근 7일 KST): 포스터 조회 합→예약→매장 체크인 — 업주 성과 최소 지표 */
export interface WeeklyFunnel { views: number; reservations: number; checkins: number; tournaments: number }
export async function getVenueWeeklyFunnel(venueId: string): Promise<WeeklyFunnel | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('venue_weekly_funnel', { p_venue_id: venueId });
  if (error || !data || !data.length) return null;
  const r = data[0];
  return { views: r.views ?? 0, reservations: r.reservations ?? 0, checkins: r.checkins ?? 0, tournaments: r.tournaments ?? 0 };
}

/** 포스터 조회 +1 — 상세를 연 세션당 1회(호출측 가드). 실패해도 무시(장식 지표) */
export async function bumpScheduleView(id: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.rpc('bump_schedule_view', { p_id: id });
}

// ── 전체 조회 ─────────────────────────────────────────────────────────────────
export async function getSchedules(): Promise<Schedule[]> {
  if (IS_MOCK) {
    const { MOCK_SCHEDULES } = await import('../mock/data');
    return MOCK_SCHEDULES;
  }
  // ⚠ 잘림 순서 고정 + 상한(2026-09-10 용량 점검): 예전엔 limit 이 없어 PostgREST max_rows=1000 에
  //   걸리는 순간 **날짜와 무관하게 display_order 순으로** 조용히 잘렸다 — 오늘 열리는 대회가
  //   목록에서 사라질 수 있는 모양이고 에러도 안 난다.
  //   날짜 내림차순 + 800(상한 1000보다 낮게)이면 잘려도 **가장 오래된 것부터** 잘린다.
  //   기간 필터는 걸지 않는다 — '지난 대회' 아카이브가 이 같은 목록을 쓰므로 기능이 사라진다.
  //   표시 순서는 아래 클라이언트 정렬(부스트 → display_order)이 그대로 결정한다.
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .order('date', { ascending: false })
    .limit(800);
  if (error) throw error;
  // 부스트(premium_until)는 DB 정렬에 안 잡히므로 매핑 후 한 번 더 정렬
  return (data ?? []).map(rowToSchedule)
    .sort((a, b) => Number(b.isPremium) - Number(a.isPremium) || a.displayOrder - b.displayOrder);
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────
// 알림·내 예약이 가리키는 대회가 메모리 목록에 없을 때 쓴다(권한은 목록과 같은 RLS 를 그대로 탄다 —
// schedules_select: approved OR 본인 포스터 OR admin. 즉 목록보다 넓게 노출될 수 없다).
// ⚠ null 은 '없음/볼 권한 없음' 만 뜻한다. 조회 **실패**(오프라인·5xx)는 throw 로 드러낸다 —
//   실패를 null 로 뭉개면 살아 있는 포스터가 '내려간 포스터' 로 안내된다(F09).
export async function getScheduleById(id: string): Promise<Schedule | null> {
  if (IS_MOCK) {
    const { MOCK_SCHEDULES } = await import('../mock/data');
    return MOCK_SCHEDULES.find((s) => s.id === id) ?? null;
  }
  const { data, error } = await supabase.from('schedules').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToSchedule(data) : null;
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
    grade: payload.grade ?? null,
    blinds: payload.blinds ?? null,
    reg_close_time: payload.regCloseTime,
    buy_in: payload.buyIn, structure: payload.structure,
    description: payload.description, payment_methods: payload.paymentMethods,
    partners: payload.partners,
    // ⚠ seats(시상/시드권)가 insert에서 빠져 있어 '신규 등록'한 포스터만 시상이 저장되지 않았다
    //   (수정 시엔 updateSchedule이 저장 → 등록 후 수정해야 나타나는 기이한 동작).
    seats: payload.seats ?? null,
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
    ...(patch.grade         !== undefined && { grade:            patch.grade }),
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

// ── 관리자: 포스터 반려 — 삭제가 아니라 상태로 남긴다(20260911o) ─────────────
// approved 도 함께 내린다: 대기열 기준이 approved 이고, 이미 승인된 포스터를 사유와 함께 내리는
// 경우까지 한 문장으로 끝난다(BEFORE 트리거는 approved=true 인 행의 반려를 무효로 만든다).
// rejected_at 을 세우면 trg_notify_schedule_rejected 가 업주에게 알림(+푸시)을 보낸다.
// ⚠ CI 에 supabase db push 가 없어 **앱이 먼저, DB 가 나중** 배포된다. 그 창에서 컬럼이 없으면
//   PGRST204(스키마 캐시)·42703(서버)이 나는데, 반려 자체가 막히면 관리자가 큐를 못 비운다 →
//   종전 동작(하드 삭제)으로 폴백하고 'deleted' 를 돌려 호출측이 사실대로 안내하게 한다.
export async function rejectSchedule(id: string, reason: string): Promise<'rejected' | 'deleted'> {
  if (IS_MOCK) return 'rejected';
  const now = new Date().toISOString();
  const { error } = await supabase.from('schedules').update({
    approved: false, rejected_at: now, reject_reason: reason.trim() || null, updated_at: now,
  }).eq('id', id);
  if (!error) return 'rejected';
  if (error.code !== 'PGRST204' && error.code !== '42703') throw error;
  await deleteSchedule(id);
  return 'deleted';
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

// ── 관리자: 포스터 부스트(N일 상단 고정 / 0 = 해제) ──────────────────────────────
export async function boostSchedule(id: string, days: number): Promise<void> {
  if (IS_MOCK) return;
  const until = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  const { error } = await supabase.from('schedules').update({
    premium_until: until, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
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