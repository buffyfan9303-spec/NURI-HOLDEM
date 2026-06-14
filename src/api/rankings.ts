// src/api/rankings.ts — 매장 일일 손님 순위
import { supabase, IS_MOCK } from '../lib/supabase';

/** 매장 순위 변경 실시간 구독 — 순위 입력/수정 시 공개 표시에 자동 반영 */
export function subscribeRankings(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`rankings:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_rankings', filter: `venue_id=eq.${venueId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export interface RankingEntry {
  position: number;
  nickname: string;
  realName: string;
  prize?: string;
  /** 같은 날 여러 게임(메인/사이드) 구분 — ''=기본. DB 마이그레이션 전 데이터는 항상 '' */
  eventName?: string;
}

// 실명 마스킹: 홍길동 → 홍*동, 나리 → 나*, 남궁민수 → 남**수
export function maskRealName(name: string): string {
  const n = (name ?? '').trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`;
}

// 공개 표시 문자열: 실명(마스킹닉네임) — 실명 앞 전체, 닉네임 뒤 마스킹. 예: 누리홀덤(나*리). 실명 없으면 닉네임만.
export function rankingLabel(e: RankingEntry): string {
  const rn = (e.realName ?? '').trim();
  if (!rn) return e.nickname;
  return `${rn}(${maskRealName(e.nickname)})`;
}

// 표시 분리: 메인(실명 또는 닉네임) + 서브(마스킹닉네임 — 실명 있을 때만). 실명 앞·닉네임 뒤 구조.
export function rankDisplay(e: { nickname: string; realName?: string }): { main: string; sub: string } {
  const rn = (e.realName ?? '').trim();
  return rn ? { main: rn, sub: maskRealName(e.nickname) } : { main: e.nickname, sub: '' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): RankingEntry {
  return { position: r.position, nickname: r.nickname, realName: r.real_name ?? '', prize: r.prize ?? undefined, eventName: r.event_name ?? '' };
}

export async function getLatestRankingDate(venueId: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase
    .from('venue_rankings').select('ranking_date')
    .eq('venue_id', venueId).order('ranking_date', { ascending: false }).limit(1);
  if (error) throw error;
  return data && data.length ? (data[0] as { ranking_date: string }).ranking_date : null;
}

export async function getVenueRankings(
  venueId: string,
  date?: string,
): Promise<{ date: string | null; entries: RankingEntry[] }> {
  if (IS_MOCK) return { date: null, entries: [] };
  const d = date ?? (await getLatestRankingDate(venueId));
  if (!d) return { date: null, entries: [] };
  const { data, error } = await supabase
    .from('venue_rankings').select('*')
    .eq('venue_id', venueId).eq('ranking_date', d)
    .order('position', { ascending: true });
  if (error) throw error;
  return { date: d, entries: (data ?? []).map(rowToEntry) };
}

// ── 매장 커뮤니티 누적 순위 ────────────────────────────────────────────────────
// 머니인 순위 = 순위(등수) 점수 누적, 프라이즈 순위 = 누적 프라이즈 금액(만원)
export interface RankingTotal {
  nickname: string;
  realName: string;
  moneyPoints: number; // 머니인(순위점수) 누적
  prizeMan: number;    // 프라이즈 누적(만원)
  appearances: number; // 등록 횟수
  bestPosition: number;
}

// 등수별 순위점수 — save_venue_rankings(회원 활동점수)와 동일 차등
export function placementPoints(position: number): number {
  switch (position) {
    case 1: return 10; case 2: return 7; case 3: return 5;
    case 4: return 3;  case 5: return 2; default: return 1;
  }
}

// 프라이즈 텍스트 → 만원 숫자(만원 단위 입력 기준, 콤마/단위 제거 후 첫 숫자)
export function parsePrizeMan(prize?: string | null): number {
  if (!prize) return 0;
  const m = String(prize).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
}

export async function getVenueRankingTotals(venueId: string, cfg?: VenuePageConfig | null): Promise<RankingTotal[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('venue_rankings').select('nickname, real_name, position, prize, ranking_date')
    .eq('venue_id', venueId);
  if (error) throw error;
  const map = new Map<string, RankingTotal & { _lastDate: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const nick = String(r.nickname ?? '').trim();
    if (!nick) continue;
    const key = nick.toLowerCase();
    const cur = map.get(key) ?? {
      nickname: nick, realName: '', moneyPoints: 0, prizeMan: 0, appearances: 0, bestPosition: 9999, _lastDate: '',
    };
    cur.moneyPoints += cfg ? placementPointsOf(r.position, cfg) : placementPoints(r.position);
    cur.prizeMan += parsePrizeMan(r.prize);
    cur.appearances += 1;
    cur.bestPosition = Math.min(cur.bestPosition, r.position);
    const d = String(r.ranking_date ?? '');
    if (r.real_name && d >= cur._lastDate) { cur.realName = r.real_name; cur._lastDate = d; }
    map.set(key, cur);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return [...map.values()].map(({ _lastDate, ...rest }) => rest);
}

// ── 매장 페이지 구성(업주 설정) — venues.page_config jsonb ─────────────────────
export type RankMetric = 'score' | 'prize' | 'moneyin_count' | 'moneyin_rate' | 'buyin_count' | 'visit_count';
export const RANK_METRIC_LABEL: Record<RankMetric, string> = {
  score: '매장 포인트', prize: '프라이즈 점수', moneyin_count: '머니인 횟수', moneyin_rate: '머니인 비율',
  buyin_count: '바인왕(참여)', visit_count: '출석왕(방문)',
};
export const RANK_METRIC_DESC: Record<RankMetric, string> = {
  score: '등수 점수(설정 가능) + 수동 지급 포인트 합산',
  prize: '순위 등록 시 입력한 프라이즈 점수 누적',
  moneyin_count: '순위(입상) 등록 횟수',
  moneyin_rate: '머니인 횟수 ÷ 바인 횟수 (장부 기준, 5바인 이상만 표시)',
  buyin_count: '장부 바인 횟수 누적 — 가장 많이 참여한 플레이어',
  visit_count: 'QR 출석 체크인 누적 — 가장 자주 출석한 플레이어(체크인 기록 없으면 장부 방문일 기준)',
};

// 업주가 직접 만드는 커스텀 랭킹 보드(웹 데이터에 없는 랭킹 — 명단·점수 직접 입력)
// period: 'all'=누적(기본) / 'month'=매월 1일 자동 리셋 / 'season'=시즌 시작일부터(리셋 버튼으로 갱신)
export interface CustomBoard { key: string; name: string; unit?: string; period?: 'all' | 'month' | 'season'; seasonStart?: string }

export const BOARD_PERIOD_LABEL: Record<NonNullable<CustomBoard['period']>, string> = {
  all: '누적', month: '월간(매월 리셋)', season: '시즌',
};

/** 보드 집계 시작일(YYYY-MM-DD) — null이면 전체 누적 */
export function boardPeriodStart(board?: CustomBoard | null): string | null {
  if (!board) return null;
  if (board.period === 'month') {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA');
  }
  if (board.period === 'season') return board.seasonStart ?? null;
  return null;
}
/** 보드 id — 기본 6종(RankMetric) 또는 'custom:<key>' */
export type RankBoardId = RankMetric | string;

export interface VenuePageConfig {
  tabOrder?: string[];                    // 매장 페이지 탭 순서(키 배열)
  rankMetrics?: RankBoardId[];            // 순위 탭 보드(1~2개), 미설정 시 ['score','prize']
  rankTitles?: Record<string, string>;    // '1'|'2'|'3' → 커스텀 칭호 (예: 로티아레나 포식자)
  placementPoints?: number[];             // 1등부터의 점수 매핑(그 외 등수 = 마지막 값 또는 1)
  customBoards?: CustomBoard[];           // 커스텀 보드 정의(최대 3)
  notifyStaff?: boolean;                  // 직원 호출/공지 알림 수신
}

export const isCustomBoard = (id: string): boolean => id.startsWith('custom:');
export const customKeyOf = (id: string): string => id.slice('custom:'.length);

/** 보드 라벨 — 기본 6종은 고정 라벨, 커스텀은 업주가 정한 이름 */
export function boardLabel(id: RankBoardId, cfg?: VenuePageConfig | null): string {
  if (isCustomBoard(id)) return cfg?.customBoards?.find((b) => b.key === customKeyOf(id))?.name ?? '커스텀 랭킹';
  return RANK_METRIC_LABEL[id as RankMetric] ?? id;
}
export function boardDesc(id: RankBoardId, cfg?: VenuePageConfig | null): string {
  if (isCustomBoard(id)) {
    const b = cfg?.customBoards?.find((x) => x.key === customKeyOf(id));
    return `업주가 직접 입력하는 랭킹${b?.unit ? ` (단위: ${b.unit})` : ''}`;
  }
  return RANK_METRIC_DESC[id as RankMetric] ?? '';
}
export function boardUnit(id: RankBoardId, cfg?: VenuePageConfig | null): string {
  if (isCustomBoard(id)) return cfg?.customBoards?.find((b) => b.key === customKeyOf(id))?.unit?.trim() || '점';
  if (id === 'moneyin_count' || id === 'buyin_count' || id === 'visit_count') return '회';
  if (id === 'moneyin_rate') return '%';
  return '점';
}

export const DEFAULT_PLACEMENT_POINTS = [10, 7, 5, 3, 2];

/** 설정 기반 등수 점수 — config 미설정 시 기존 placementPoints와 동일 */
export function placementPointsOf(position: number, cfg?: VenuePageConfig | null): number {
  const arr = cfg?.placementPoints && cfg.placementPoints.length > 0 ? cfg.placementPoints : DEFAULT_PLACEMENT_POINTS;
  if (position >= 1 && position <= arr.length) return arr[position - 1] ?? 1;
  return 1;
}

export async function getVenuePageConfig(venueId: string): Promise<VenuePageConfig | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.from('venues').select('page_config').eq('id', venueId).single();
  if (error) return null;
  return (data?.page_config as VenuePageConfig) ?? null;
}

export async function setVenuePageConfig(venueId: string, config: VenuePageConfig): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_venue_page_config', { p_venue_id: venueId, p_config: config });
  if (error) throw error;
}

// ── 수동 포인트(지급/차감) — venue_score_entries ───────────────────────────────
// boardKey: null = 기본 '매장 포인트' 보드 합산 / 'c…' = 커스텀 보드 전용 항목
export interface ScoreEntry { id: string; name: string; points: number; reason: string | null; entryDate: string; boardKey: string | null; }

export async function getScoreEntries(venueId: string, limit = 300): Promise<ScoreEntry[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_score_entries')
    .select('id, name, points, reason, entry_date, board_key')
    .eq('venue_id', venueId).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, points: r.points, reason: r.reason ?? null, entryDate: r.entry_date, boardKey: r.board_key ?? null }));
}

export async function addScoreEntry(venueId: string, input: { name: string; points: number; reason?: string; entryDate?: string; boardKey?: string | null }): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('venue_score_entries').insert({
    venue_id: venueId, name: input.name.trim(), points: input.points,
    reason: input.reason?.trim() || null, ...(input.entryDate ? { entry_date: input.entryDate } : {}),
    board_key: input.boardKey ?? null,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function deleteScoreEntry(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venue_score_entries').delete().eq('id', id);
  if (error) throw error;
}

/** 머니인 비율용 — 이름별 바인 횟수(장부 집계, 금액 없음) */
export async function getVenueBuyinCounts(venueId: string): Promise<Map<string, number>> {
  if (IS_MOCK) return new Map();
  const { data, error } = await supabase.rpc('venue_buyin_counts', { p_venue_id: venueId });
  if (error) return new Map();
  const m = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) m.set(String(r.name).toLowerCase(), Number(r.buyin_count) || 0);
  return m;
}

/** 바인왕/출석왕 보드용 — 이름별 바인·방문(고유 일자) 횟수(장부 집계, 금액 없음) */
export interface PlayerCounts { name: string; buyins: number; visits: number }
export async function getVenuePlayerCounts(venueId: string): Promise<PlayerCounts[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('venue_player_counts', { p_venue_id: venueId });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ name: String(r.name), buyins: Number(r.buyin_count) || 0, visits: Number(r.visit_count) || 0 }));
}

/** 전 매장 통합 랭킹(커뮤니티 랭킹) — 닉네임별 머니인 횟수·프라이즈 점수 */
export interface GlobalRankingTotal { nickname: string; moneyinCount: number; prizePoints: number; bestPosition: number; venues: number }
export async function getGlobalRankingTotals(): Promise<GlobalRankingTotal[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('global_ranking_totals');
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    nickname: String(r.nickname), moneyinCount: Number(r.moneyin_count) || 0,
    prizePoints: Number(r.prize_points) || 0, bestPosition: Number(r.best_position) || 0, venues: Number(r.venues) || 0,
  }));
}

// ── 주간 베스트(이번 주 머니인 킹 TOP3) — 메인 상단 롤링 위젯용 ─────────────────
// 주초라 이번 주 기록이 아직 없으면 지난주 킹으로 폴백(라벨용 isLastWeek 플래그).
export interface WeeklyKing { nickname: string; moneyinCount: number; bestPosition: number }
export interface WeeklyKings { kings: WeeklyKing[]; isLastWeek: boolean }

async function moneyinKingsBetween(fromStr: string, toStr: string | null, limit: number): Promise<WeeklyKing[]> {
  let q = supabase.from('venue_rankings').select('nickname, position').gte('ranking_date', fromStr);
  if (toStr) q = q.lt('ranking_date', toStr);
  const { data, error } = await q;
  if (error) return [];
  const map = new Map<string, WeeklyKing>();
  for (const r of (data ?? []) as { nickname: string | null; position: number | null }[]) {
    const nick = (r.nickname ?? '').trim();
    if (!nick) continue;
    const key = nick.toLowerCase();
    const cur = map.get(key) ?? { nickname: nick, moneyinCount: 0, bestPosition: 999 };
    cur.moneyinCount += 1;
    if (r.position && r.position < cur.bestPosition) cur.bestPosition = r.position;
    map.set(key, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.moneyinCount - a.moneyinCount || a.bestPosition - b.bestPosition)
    .slice(0, limit);
}

export async function getWeeklyMoneyinKings(limit = 3): Promise<WeeklyKings> {
  if (IS_MOCK) return { kings: [], isLastWeek: false };
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 이번 주 월요일
  const monStr = mon.toLocaleDateString('en-CA');
  const thisWeek = await moneyinKingsBetween(monStr, null, limit);
  if (thisWeek.length > 0) return { kings: thisWeek, isLastWeek: false };
  const lastMon = new Date(mon);
  lastMon.setDate(mon.getDate() - 7);
  const lastWeek = await moneyinKingsBetween(lastMon.toLocaleDateString('en-CA'), monStr, limit);
  return { kings: lastWeek, isLastWeek: true };
}

// ── 내 입상 기록(개인 대시보드) — 닉네임 기준 전 매장 순위 등록 이력 ────────────
export interface MyRankingRow { date: string; venueName: string; position: number; prize: string | null }
export async function getMyRankingHistory(nickname: string, limit = 30): Promise<MyRankingRow[]> {
  if (IS_MOCK || !nickname.trim()) return [];
  const { data, error } = await supabase
    .from('venue_rankings')
    .select('ranking_date, position, prize, venues(name)')
    .ilike('nickname', nickname.trim())
    .order('ranking_date', { ascending: false })
    .limit(limit);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    date: r.ranking_date, position: r.position, prize: r.prize ?? null,
    venueName: r.venues?.name ?? '(매장)',
  }));
}

export async function saveVenueRankings(
  venueId: string,
  date: string,
  entries: { nickname: string; realName: string; prize?: string }[],
  eventName = '',
): Promise<void> {
  if (IS_MOCK) return;
  const payload = entries.map((e) => ({ nickname: e.nickname, realName: e.realName, prize: e.prize ?? '' }));
  const { error } = await supabase.rpc('save_venue_rankings', {
    p_venue_id: venueId, p_date: date, p_entries: payload, p_event: eventName,
  });
  if (!error) return;
  // 구버전 RPC(3-인자) — 이벤트 차원 마이그레이션 전: 기본 게임('')은 기존 방식으로 저장
  if ((error.code === 'PGRST202' || /p_event/.test(error.message ?? '')) && !eventName) {
    const { error: e2 } = await supabase.rpc('save_venue_rankings', { p_venue_id: venueId, p_date: date, p_entries: payload });
    if (e2) throw e2;
    return;
  }
  if (error.code === 'PGRST202') throw new Error('게임(이벤트)별 저장은 DB 업데이트 후 가능합니다 — 운영자에게 문의하세요');
  throw error;
}
