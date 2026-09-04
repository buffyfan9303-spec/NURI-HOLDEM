// src/api/rankings.ts — 매장 일일 손님 순위
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { makeSearchCache } from '../lib/searchCache';

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

// ── 순위표 표시 이름 (오너 #14) ───────────────────────────────────────────────
// 예전 규칙: 실명이 있으면 **실명을 앞에** 두고 닉네임을 마스킹해 뒤에 붙였다('홍길동(나*리)').
//   매장이 순위를 입력할 때 적은 실명이 그대로 공개면에 떴다는 뜻이다.
// 새 규칙: **기본은 닉네임**. 실명은 본인이 프로필에서 '실명'을 고른 경우에만 쓴다.
//   개인정보보호법상 실명 공개는 사전·명시적 선택이어야 하므로 기본값이 실명일 수 없다.
//   판정은 서버(profiles.ranking_name_pref)가 하고, 화면은 그 결과 집합만 받는다
//   — 클라이언트가 '이 사람은 실명 써도 되겠지'를 추측하면 그게 곧 개인정보 유출이다.
//
// optIns: `getVenueRealNameOptIns()` 가 준 **소문자 닉네임 집합**. 넘기지 않으면(=아직 로딩 중,
//   조회 실패, 비회원 목록) 전원 닉네임 — '모르면 덜 공개한다'가 안전한 기본값이다.
export type RealNameOptIns = ReadonlySet<string>;
const wantsRealName = (nickname: string, optIns?: RealNameOptIns): boolean =>
  !!optIns && optIns.has(nickname.trim().toLowerCase());

// 표시 분리: 메인(닉네임 — 실명 선택자만 실명) + 서브(실명 선택자의 마스킹 닉네임).
// 닉네임이 비어 있는 과거 행(실명만 입력)은 실명을 마스킹해 쓴다 — 빈 칸으로 두면 누구인지 사라진다.
export function rankDisplay(
  e: { nickname: string; realName?: string },
  optIns?: RealNameOptIns,
): { main: string; sub: string } {
  const nick = (e.nickname ?? '').trim();
  const rn = (e.realName ?? '').trim();
  if (!nick) return { main: rn ? maskRealName(rn) : '', sub: '' };
  if (rn && wantsRealName(nick, optIns)) return { main: rn, sub: maskRealName(nick) };
  return { main: nick, sub: '' };
}

// 공개 표시 문자열 — rankDisplay 와 같은 규칙을 한 줄 문자열로. 규칙을 두 번 쓰지 않는다.
export function rankingLabel(e: RankingEntry, optIns?: RealNameOptIns): string {
  const { main, sub } = rankDisplay(e, optIns);
  return sub ? `${main}(${sub})` : main;
}

/**
 * 이 매장 순위표에서 **실명 표시를 본인이 고른** 닉네임 집합(소문자 키).
 *
 * 서버 집계인 이유: 누적 순위표는 닉네임이 수백 개까지 늘어난다. 닉네임 배열을 올려 보내면
 *   요청 크기가 참가자 수에 선형이 되고, 화면이 목록을 자르는 순간 가려진 사람의 표기가
 *   조용히 틀린다. venue_id 하나로 서버가 집계하면 호출 1회로 끝난다
 *   (venue_rating_summary 를 서버 집계로 옮긴 것과 같은 이유).
 * 실패하면 빈 집합 — 즉 전원 닉네임 표시로 안전하게 떨어진다.
 */
async function rawVenueRealNameOptIns(venueId: string): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('venue_ranking_real_name_optins', { p_venue_id: venueId });
  if (error) return []; // RPC 미배포·권한 등 어떤 실패든 '실명 없음'으로 수렴
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => String(r.nickname_key ?? '').trim().toLowerCase()).filter(Boolean);
}
// 한 매장 페이지 안에서 순위 패널과 시즌 선두 배너가 같은 답을 필요로 한다 → in-flight 합치기 + 60s LRU.
// (자동완성 캐시와 같은 도구를 쓴다 — 캐시 규칙이 두 개면 언젠가 한쪽만 고쳐진다.)
const cachedVenueRealNameOptIns = makeSearchCache(rawVenueRealNameOptIns, (s) => s.trim().toLowerCase(), { ttlMs: 60_000, max: 10 });

export async function getVenueRealNameOptIns(venueId: string): Promise<Set<string>> {
  return new Set(await cachedVenueRealNameOptIns(venueId));
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

/**
 * (매장, 날짜) 여러 쌍의 순위를 한 번에 — 목록 화면의 N+1 제거용.
 *
 * 왜 필요한가: '지난 대회' 위젯이 5개 항목마다 getVenueRankings 를 따로 불러 요청 5건을 쐈다.
 *   venue_rankings 가 0행이어도 5건이 나가는 구조적 오버헤드였고, 의존성이 배열 참조라
 *   실시간 갱신·창 복귀·당겨서 새로고침마다 다시 5건이 반복됐다.
 * 반환 키는 `${venueId}|${date}` — 호출부가 항목마다 O(1) 로 찾아 쓴다.
 */
export async function getRankingsBulk(
  pairs: { venueId: string; date: string }[],
): Promise<Record<string, RankingEntry[]>> {
  const out: Record<string, RankingEntry[]> = {};
  if (IS_MOCK || pairs.length === 0) return out;
  const venueIds = [...new Set(pairs.map((p) => p.venueId))];
  const dates = [...new Set(pairs.map((p) => p.date))];
  // 교차곱이라 요청한 조합보다 넓게 잡힐 수 있다 — 아래에서 요청한 쌍만 남긴다.
  const { data, error } = await supabase
    .from('venue_rankings').select('*')
    .in('venue_id', venueIds).in('ranking_date', dates)
    .order('position', { ascending: true });
  if (error) throw error;
  const want = new Set(pairs.map((p) => `${p.venueId}|${p.date}`));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const key = `${r.venue_id}|${r.ranking_date}`;
    if (!want.has(key)) continue;
    (out[key] ??= []).push(rowToEntry(r));
  }
  return out;
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

/** 티켓 1장의 가치(만원). 오너 규칙(2026-09-05) "1T 는 10만원" — 서버 parse_prize_man 과 같은 상수. */
export const TICKET_MAN = 10;

/** "1T" · "2 t" 처럼 **정수+T** 만 티켓 표기로 인정한다. 장수를 돌려주고, 아니면 0. */
export function parsePrizeTickets(prize?: string | null): number {
  if (!prize) return 0;
  const m = String(prize).replace(/,/g, '').match(/^\s*(\d*\.?\d+)\s*[tT]\s*$/);
  return m ? parseFloat(m[1]) : 0;
}

// 프라이즈 텍스트 → 만원 숫자(만원 단위 입력 기준, 콤마/단위 제거 후 첫 숫자).
// "nT"(티켓) 는 n × 10만 — 서버 parse_prize_man(20260905e) 과 정확히 같은 규칙이라
// 머니인 포인트·시즌 합산이 화면과 어긋나지 않는다.
export function parsePrizeMan(prize?: string | null): number {
  if (!prize) return 0;
  const t = parsePrizeTickets(prize);
  if (t > 0) return Math.round(t * TICKET_MAN);
  const m = String(prize).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
}

/**
 * 상금 표시 문자열. 티켓 상금은 매장 설정에 따라 "1T"(기본) 또는 "10만" 으로 보인다
 * (오너: "머니인이나 순위 같은 데는 1T 로 표기하되 ... 매장이 선택할 수 있게").
 * 숫자 상금은 언제나 "N만". cfg 가 없는 화면(내 정보·리그처럼 여러 매장이 섞이는 곳)은 티켓 표기.
 */
export function formatPrize(prize: string | null | undefined, cfg?: Pick<VenuePageConfig, 'ticketPrizeDisplay'> | null): string {
  if (!prize) return '';
  const t = parsePrizeTickets(prize);
  if (t > 0) {
    const n = Number.isInteger(t) ? String(t) : t.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return cfg?.ticketPrizeDisplay === 'won' ? `${Math.round(t * TICKET_MAN)}만` : `${n}T`;
  }
  const man = parsePrizeMan(prize);
  return man > 0 ? `${man.toLocaleString()}만` : String(prize);
}

// ── 프라이즈 단위 오입력 감지 ────────────────────────────────────────────────
// 왜 필요한가: prize 는 '만원 단위' 자유 텍스트인데 순위 입력칸엔 단위 표기가 없었다.
//   1등 100만원을 '1000000'(원)으로 치면 그 한 줄이 매장 프라이즈 보드와
//   전국 통합 랭킹(global_ranking_totals)을 1만 배로 오염시키고, 되돌리려면
//   그 날짜 순위를 통째로 다시 입력해야 한다.
// 왜 차단이 아니라 경고인가: 1,000만원 프라이즈는 실제로 존재해서 막으면 정상 입력을 잃는다.
//   1억(10,000만) 이상만 '사실상 불가'로 보고 저장 직전에 한 번 되묻는다.
export const PRIZE_SUSPECT_MAN = 1_000;      // 1,000만원 — 원 단위 오입력 의심(경고만)
export const PRIZE_IMPOSSIBLE_MAN = 10_000;  // 1억 — 펍 단일 입상금으로 사실상 불가(저장 전 재확인)

export type PrizeUnitRisk = 'ok' | 'suspect' | 'impossible';
/** 프라이즈 입력값의 단위 오입력 위험도 — 입력칸 경고와 저장 전 확인이 같은 기준을 쓰도록 단일화 */
export function prizeUnitRisk(prize?: string | null): PrizeUnitRisk {
  const man = parsePrizeMan(prize);
  if (man >= PRIZE_IMPOSSIBLE_MAN) return 'impossible';
  if (man >= PRIZE_SUSPECT_MAN) return 'suspect';
  return 'ok';
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
  buyin_count: '장부 바인 횟수 누적 · 가장 많이 참여한 플레이어',
  visit_count: 'QR 출석 체크인 누적 · 가장 자주 출석한 플레이어(체크인 기록 없으면 장부 방문일 기준)',
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
  clockTheme?: import('../components/features/clock/clockTheme').ClockTheme; // TV 송출 클락 테마 v1
  /** 순위·머니인에서 티켓 상금을 어떻게 보일지 — 'ticket'(기본, "1T") | 'won'("10만").
   *  가치는 어느 쪽이든 1T = 10만(TICKET_MAN). 장부는 항상 만원 가치라 이 설정과 무관하다. */
  ticketPrizeDisplay?: 'ticket' | 'won';
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

/**
 * 매장 페이지 설정 조회. **'설정 없음'(행 없음/NULL)은 null, 조회 실패는 throw.**
 *
 * ⚠ 예전에는 실패도 null 로 삼켰다. 그런데 set_venue_page_config 는 page_config **전체를 교체**하는
 *   RPC 라, 저장 직전 최신을 다시 읽어 병합하는 모든 화면(매장 페이지 탭 순서·매장 랭킹·클락 테마)이
 *   `const latest = (await getVenuePageConfig(id)) ?? {}` 형태로 이 함수를 쓴다.
 *   즉 **읽기가 한 번 실패하면 latest 가 {} 가 되어, 저장 버튼 한 번에 탭 순서·랭킹 보드·칭호·
 *   기준 점수·커스텀 보드·클락 테마·배경이 통째로 지워지고 성공 토스트까지 떴다**(실측 재현).
 *   실패를 던지면 그 병합들이 전부 자기 try/catch 로 떨어져 '저장 실패' 를 띄우고 아무것도 안 쓴다.
 *   읽기 전용 호출부(매장 페이지·클락 패널 마운트)는 이미 .catch 로 감싸고 있어 영향이 없다.
 *   행이 없을 때 에러가 되지 않도록 single() → maybeSingle() 로 바꾼다(설정 없음 ≠ 실패).
 */
export async function getVenuePageConfig(venueId: string): Promise<VenuePageConfig | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.from('venues').select('page_config').eq('id', venueId).maybeSingle();
  if (error) throw error;
  return (data?.page_config as VenuePageConfig) ?? null;
}

/**
 * TV 송출(ClockDisplay) keep-last 캐시 전용 — 위 함수와 실패 정책은 같고(throw),
 * '행이 반드시 있어야 한다'는 전제(single)만 다르다. 송출 화면은 실패 시 직전 테마를 유지한다.
 */
export async function fetchVenuePageConfig(venueId: string): Promise<VenuePageConfig | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.from('venues').select('page_config').eq('id', venueId).single();
  if (error) throw error;
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
  const user = await currentUser();
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

/**
 * 전 매장 통합 랭킹(커뮤니티 랭킹) — 닉네임별 머니인 점수·횟수·프라이즈 점수.
 *
 * moneyinPoints 가 머니인 보드의 정렬 기준이다(오너 #6): 100만원(10T)당 1점.
 *   계산은 서버 `public.moneyin_points()` 한 곳에만 있다 — 여기서 재계산하면 규칙이 둘로 갈린다.
 * moneyinCount(입상 횟수)는 없애지 않고 보조 정보로 계속 내려준다.
 */
export interface GlobalRankingTotal {
  nickname: string; moneyinCount: number; moneyinPoints: number; prizePoints: number; bestPosition: number; venues: number;
}
export async function getGlobalRankingTotals(): Promise<GlobalRankingTotal[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('global_ranking_totals');
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    nickname: String(r.nickname), moneyinCount: Number(r.moneyin_count) || 0,
    moneyinPoints: Number(r.moneyin_points) || 0,
    prizePoints: Number(r.prize_points) || 0, bestPosition: Number(r.best_position) || 0, venues: Number(r.venues) || 0,
  }));
}

// ── 주간 베스트(이번 주 머니인 킹 TOP3) — 메인 상단 롤링 위젯용 ─────────────────
// 주초라 이번 주 기록이 아직 없으면 지난주 킹으로 폴백(라벨용 isLastWeek 플래그).
//
// 2026-08-29(오너 #6): 예전엔 여기서 venue_rankings 를 통째로 받아 클라이언트가 행 수를 셌다.
//   그러면 '머니인 킹'이 금액과 무관한 횟수 1위가 되어 주간리그·머니인 탭의 새 규칙과 어긋나고,
//   같은 규칙이 서버·클라이언트 두 곳에 생긴다. 집계를 weekly_moneyin_kings RPC 로 옮겨
//   moneyin_points() 단일 정의를 그대로 쓰게 했다(전량 전송도 함께 사라진다).
// 2026-08-30(오너 #15): 닉네임 옆에 '그 주에 가장 점수를 많이 딴 매장'을 괄호로 붙인다.
//   집계는 weekly_moneyin_kings 안에서 같은 CTE 로 한다 — 매장을 따로 조회하면 왕복이 2회가 되고
//   두 응답의 주간 창이 갈릴 수 있다. 같은 쿼리에서 뽑으면 '이 점수를 어디서 벌었나'가 정의상 일치한다.
//   승인·활성 매장이 하나도 없으면 undefined — 화면은 괄호를 아예 그리지 않는다(빈 괄호 금지).
export interface WeeklyKing { nickname: string; moneyinCount: number; moneyinPoints: number; bestPosition: number; topVenue?: string }
export interface WeeklyKings { kings: WeeklyKing[]; isLastWeek: boolean }

async function moneyinKingsBetween(fromStr: string, toStr: string | null, limit: number): Promise<WeeklyKing[]> {
  const { data, error } = await supabase.rpc('weekly_moneyin_kings', {
    p_from: fromStr, p_to: toStr, p_limit: limit,
  });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    nickname: String(r.nickname ?? ''),
    moneyinCount: Number(r.moneyin_count) || 0,
    moneyinPoints: Number(r.moneyin_points) || 0,
    bestPosition: Number(r.best_position) || 0,
    topVenue: String(r.top_venue ?? '').trim() || undefined,
  }));
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

// ── 순위 입력 자동완성 · 회원 대조 ────────────────────────────────────────────
// 왜 여기 있나: 이 두 함수는 '순위 행의 주인이 누구인가'를 정하는 도구다. 그 답이
//   이용권 전송 대상(user_id)을 결정하므로, 화면이 임의로 추측하지 않도록 API 경계에
//   둔다. 예전엔 지급 직전에 find_user_for_transfer(부분일치)로 다시 찾았고,
//   동명이인·유사닉이면 지급이 통째로 보류되거나 엉뚱한 사람에게 나갈 수 있었다.
export interface RankMember {
  id: string;
  nickname: string;
  /** 표시용 실명(업주·운영자에게만 반환) */
  realName: string;
  /** 본인인증(CI) 보유 — 매장이용권 지급 가능 조건과 동일한 판정 */
  verified: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toMember = (r: any): RankMember => ({
  id: r.id, nickname: r.nickname ?? '', realName: r.real_name ?? '', verified: r.verified === true,
});

async function rawSearchRankingMembers(q: string): Promise<RankMember[]> {
  if (IS_MOCK || !q.trim()) return [];
  const { data, error } = await supabase.rpc('search_ranking_members', { p_q: q.trim() });
  if (error) return [];
  return (data ?? []).map(toMember);
}
/** 자동완성 후보(부분일치) — 이용권 검색과 같은 in-flight+20s LRU 로 중복 호출 흡수 */
export const searchRankingMembers = makeSearchCache(rawSearchRankingMembers, (s) => s.trim().toLowerCase());

/** 순위 행 이름 → 회원 후보(정확 일치). 키는 trim+소문자.
 *  0개 = 비회원 · 1개 = 회원 확정 · 2개 이상 = 동명이인(업주가 직접 골라야 함) */
export async function resolveRankingMembers(names: string[]): Promise<Map<string, RankMember[]>> {
  const out = new Map<string, RankMember[]>();
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (IS_MOCK || clean.length === 0) return out;
  for (const n of clean) out.set(n.toLowerCase(), []); // 조회했는데 없음 = 비회원(미조회와 구분)
  const { data, error } = await supabase.rpc('resolve_ranking_members', { p_names: clean });
  if (error) return out;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const key = String(r.q ?? '').trim().toLowerCase();
    const arr = out.get(key);
    if (arr) arr.push(toMember(r));
  }
  return out;
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
  if (error.code === 'PGRST202') throw new Error('게임(이벤트)별 저장은 DB 업데이트 후 가능합니다. 운영자에게 문의하세요');
  throw error;
}
