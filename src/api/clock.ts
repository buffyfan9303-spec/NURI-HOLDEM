// src/api/clock.ts — 토너먼트 클락(블라인드 타이머) API
import { supabase, IS_MOCK } from '../lib/supabase';
import { earlyTypeOf, type EarlyType, type LedgerBuyin } from './ledger';

/** 얼리 판정에 필요한 세션 정보 */
export interface EarlyWindow { earlyDoubleMin?: number; earlySingleMin?: number; tournamentStart?: string | null; openedAt?: string | null }

// ── 타입 ──────────────────────────────────────────────────────────────────────
export interface ClockLevel {
  kind: 'level' | 'break';
  sb: number;
  bb: number;
  ante: number;
  minutes: number;
  label?: string; // 브레이크 라벨(예: "BREAK 8Min.")
}
export interface ClockPrizeRow { place: string; amount: number }

export interface ClockConfig {
  title: string;
  startStack: number;     // 스타팅 스택(칩)
  rebuyStack: number;     // 리바인 스택
  addonStack: number;     // 애드온 스택
  isAddon: boolean;       // 애드온 게임 여부(라이브에 ADD-ON 표시)
  earlyBonus: number;     // 1얼리 보너스 칩
  doubleEarlyBonus: number; // 더블얼리 보너스 칩
  regCloseLevel: number;  // 등록 마감 레벨(이 레벨 시작 시 마감)
  maxLevel: number;       // 최대 레벨(블라인드 자동 생성 기준)
  earlyDoubleLevel: number; // ~레벨 N까지 도착 = 더블얼리
  earlySingleLevel: number; // ~레벨 M까지 도착 = 1얼리
  earlyDoubleMin: number; // (파생) 레벨→누적분 환산값 = 더블얼리 마지노 분
  earlySingleMin: number; // (파생) 레벨→누적분 환산값 = 1얼리 마지노 분
  mysteryBounty: number;  // 미스터리 바운티 금액(표시용)
  prizes: ClockPrizeRow[];
  levels: ClockLevel[];
}

export interface ClockPreset {
  id: string;
  venueId: string;
  name: string;
  config: ClockConfig;
}

export interface ClockLiveStats {
  entries: number; rebuys: number; earlies: number; addons: number;
  alive: number; eliminations: number; totalStack: number; avgStack: number;
  buyInAmount?: number | null; // 바인 금액(원) — 연동 장부 세션값. 라이브 보드 표시용(공개).
}

export interface ClockState {
  venueId: string;
  gameSeq: number;            // 게임 구분(1=메인, 2+=사이드) — (venue,game_seq)=클락 1개
  sessionDate: string | null; // 연결된 장부(없으면 standalone)
  title: string;
  config: ClockConfig;
  currentIndex: number;       // levels 배열 인덱스(브레이크 포함)
  running: boolean;
  endsAt: string | null;      // 진행 중일 때 현재 레벨 종료 시각(ISO)
  remainingMs: number;        // 일시정지 중 남은 ms
  adjEntries: number;         // 수기 보정(장부 자동값에 가산)
  adjRebuys: number;
  adjEarlies: number;
  adjAddons: number;
  eliminations: number;       // 아웃된 인원
  liveStats?: ClockLiveStats | null; // 라이브 보드용 통계 스냅샷(파생값 저장 → 보드에서 ledger 없이 표시)
}

export const PRESET_LIMIT = 50;

// ── 기본 구조(프리셋 없을 때) ───────────────────────────────────────────────────
// 로티아레나 파이널롤백 기반 기본 블라인드 템플릿(SB/BB) — 자동 생성 기준
const BASE_BLINDS: [number, number][] = [
  [100, 200], [200, 300], [200, 400], [300, 500], [300, 600], [400, 800], [500, 1000], [600, 1200],
  [1000, 1500], [1000, 2000], [1500, 2500], [1500, 3000], [2000, 3000], [2000, 4000], [2500, 5000], [3000, 6000],
  [4000, 8000], [5000, 10000], [6000, 12000], [10000, 15000], [10000, 20000],
  [15000, 30000], [20000, 40000], [30000, 60000], [40000, 80000], [50000, 100000],
];

export function defaultClockConfig(): ClockConfig {
  return {
    title: '데일리 토너먼트',
    startStack: 50000, rebuyStack: 70000, addonStack: 0, isAddon: false,
    earlyBonus: 5000, doubleEarlyBonus: 10000,
    regCloseLevel: 12, maxLevel: 18,
    earlyDoubleLevel: 1, earlySingleLevel: 4, earlyDoubleMin: 20, earlySingleMin: 80,
    mysteryBounty: 0,
    prizes: [
      { place: '1위', amount: 400 }, { place: '2위', amount: 200 }, { place: '3위', amount: 100 },
      { place: '4위', amount: 80 }, { place: '5위', amount: 60 }, { place: '6위', amount: 50 },
    ],
    levels: generateBlinds(12, 18, 20, 20),
  };
}

/** 전체 '레벨'(브레이크 제외) 개수 */
export function countLevels(levels: ClockLevel[]): number {
  return levels.reduce((n, l) => n + (l.kind === 'level' ? 1 : 0), 0);
}

/** 블라인드 구조에서 '레벨 N 종료'까지의 누적 경과분(브레이크 포함 — 실제 경과 시각 기준). */
export function cumulativeMinutesThroughLevel(levels: ClockLevel[], levelNo: number): number {
  if (levelNo <= 0) return 0;
  let mins = 0, count = 0;
  for (const l of levels) {
    mins += l.minutes || 0;
    if (l.kind === 'level') { count++; if (count >= levelNo) return mins; }
  }
  return mins;
}

/** 스타트 후 경과분 → '그때 진행 중이던 레벨 번호'(1-based, 브레이크 구간은 직전 레벨 번호를 유지).
 *  오너 규칙(#21): 5시 스타트·20분 듀레이션이면 5시 20분 '전'에 온 손님은 1레벨이다.
 *  ⚠ 경계는 반열림 [누적시작, 누적끝) — 정확히 20분에 온 손님은 2레벨이다(레벨2가 그 순간 시작하므로).
 *  경과가 음수면 0(스타트 전), 구조를 다 소진하면 마지막 레벨 번호. */
export function levelNoAtMinutes(levels: ClockLevel[], mins: number): number {
  if (!levels.length || !(mins >= 0)) return 0;
  let acc = 0, no = 0;
  for (const l of levels) {
    if (l.kind === 'level') no++;
    acc += l.minutes || 0;
    if (mins < acc) return Math.max(1, no);
  }
  return Math.max(1, no);
}

/** 지금 진행 중인 레벨 번호(1-based) — 낡은 행이어도 effectiveLevel 보정을 거쳐 '진짜 지금'을 준다.
 *  왜 여기 있나: 장부(바인 시점 얼리·할인 확정)와 클락이 같은 레벨 번호를 봐야 한다.
 *  각자 인라인으로 세면 브레이크 한 칸 차이로 얼리가 갈린다. */
export function currentLevelNo(
  s: Pick<ClockState, 'config' | 'running' | 'currentIndex' | 'endsAt' | 'remainingMs'>, nowMs = Date.now(),
): number {
  const lv = s.config?.levels ?? [];
  if (!lv.length) return 0;
  const { index } = effectiveLevel(s, nowMs);
  let no = 0;
  for (let i = 0; i <= index && i < lv.length; i++) if (lv[i].kind === 'level') no++;
  return Math.max(1, no);
}

/** 레벨 번호 → 얼리 유형. null = 이 게임은 얼리를 안 쓴다(자동판정에 맡김). */
export function earlyTypeAtLevel(
  cfg: Pick<ClockConfig, 'earlyDoubleLevel' | 'earlySingleLevel'>, levelNo: number,
): EarlyType | null {
  const d = cfg.earlyDoubleLevel ?? 0, sg = cfg.earlySingleLevel ?? 0;
  if (d <= 0 && sg <= 0) return null;
  if (levelNo <= 0) return null;
  if (d > 0 && levelNo <= d) return 'double';
  if (sg > 0 && levelNo <= sg) return 'single';
  return 'none';
}

/** earlyDoubleLevel/earlySingleLevel(레벨) → earlyDoubleMin/earlySingleMin(분, 파생) 재계산.
 *  블라인드 길이가 바뀌면 이 함수로 다시 환산해 저장한다. */
export function withDerivedEarly(cfg: ClockConfig): ClockConfig {
  const total = countLevels(cfg.levels);
  const dLv = Math.max(0, Math.min(cfg.earlyDoubleLevel ?? 0, total));
  const sLv = Math.max(0, Math.min(cfg.earlySingleLevel ?? 0, total));
  return {
    ...cfg,
    earlyDoubleLevel: dLv,
    earlySingleLevel: sLv,
    earlyDoubleMin: dLv > 0 ? cumulativeMinutesThroughLevel(cfg.levels, dLv) : 0,
    earlySingleMin: sLv > 0 ? cumulativeMinutesThroughLevel(cfg.levels, sLv) : 0,
  };
}

/** 등록마감·최대레벨 기준 블라인드 구조 자동 생성. 레지 마감 후에는 레벨 시간만 단축(postDur 적용). */
export function generateBlinds(regCloseLevel: number, maxLevel: number, preDur = 20, postDur = 20): ClockLevel[] {
  const round1k = (v: number) => (v < 2000 ? Math.round(v / 100) * 100 : v < 10000 ? Math.round(v / 500) * 500 : Math.round(v / 1000) * 1000);
  const out: ClockLevel[] = [];
  const max = Math.max(1, Math.min(60, maxLevel || 18));
  let prev: [number, number] = BASE_BLINDS[BASE_BLINDS.length - 1];
  for (let n = 1; n <= max; n++) {
    const b: [number, number] = BASE_BLINDS[n - 1] ?? [round1k(prev[0] * 1.4), round1k(prev[1] * 1.4)];
    prev = b;
    const post = regCloseLevel > 0 && n > regCloseLevel;
    out.push({ kind: 'level', sb: b[0], bb: b[1], ante: b[1], minutes: post ? postDur : preDur });
    if (n % 5 === 0 && n < max) out.push({ kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK 8Min.' });
  }
  return out;
}

export function emptyClockState(venueId: string, config = defaultClockConfig(), gameSeq = 1): ClockState {
  const first = config.levels[0];
  return {
    venueId, gameSeq, sessionDate: null, title: config.title, config,
    currentIndex: 0, running: false, endsAt: null,
    remainingMs: (first?.minutes ?? 20) * 60_000,
    adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
  };
}

// ── 레벨 이동 / 되돌리기 ───────────────────────────────────────────────────────
// 왜 여기(api)에 두는가: 레벨을 움직이는 화면이 둘(클락 하단 Level ＋－, 장부 클락 리모컨 ‹ ›)인데
// 각자 인라인으로 계산하다 보니 경계 가드가 한쪽에만 있고(‹ 쪽 누락) 되돌리기는 양쪽 다 없었다.
// 두 화면이 같은 함수를 쓰게 해 규칙을 한 곳에 고정한다.

/** 레벨 이동 직전 스냅샷 — '이동 전 DB 행'을 그대로 복원하기 위한 최소 4필드.
 *  왜 파생 remaining 이 아니라 raw 인가: TV(?display=)·리모컨·클락 화면이 모두 이 4필드로만
 *  화면을 계산하므로, 이 값만 되돌리면 세 화면이 동시에 정확히 복원된다. */
export interface ClockLevelSnapshot { currentIndex: number; remainingMs: number; endsAt: string | null; running: boolean }

export function levelSnapshot(s: Pick<ClockState, 'currentIndex' | 'remainingMs' | 'endsAt' | 'running'>): ClockLevelSnapshot {
  return { currentIndex: s.currentIndex, remainingMs: s.remainingMs, endsAt: s.endsAt, running: s.running };
}

/** 레벨 이동 패치 — 이동한 레벨의 전체 분으로 타이머를 다시 채운다(기존 동작 유지).
 *  fromIndex 는 '실효 인덱스'를 넘긴다(리모컨은 endsAt 경과분만큼 전진시킨 값을 쓴다).
 *  왜 null 을 반환하나: 기존 코드는 clamp 만 해서 첫 레벨에서 －, 마지막 레벨에서 ＋ 를 누르면
 *  레벨은 그대로인 채 현재 레벨 타이머만 통째로 리셋됐다 — 레벨 번호가 안 바뀌어 사고를 인지조차 못 한다. */
export function levelMovePatch(
  s: Pick<ClockState, 'config' | 'running'>, fromIndex: number, delta: number, nowMs = Date.now(),
): Partial<ClockState> | null {
  const lv = s.config?.levels ?? [];
  if (!lv.length) return null;
  const to = Math.max(0, Math.min(lv.length - 1, fromIndex + delta));
  if (to === fromIndex) return null;
  const ms = (lv[to].minutes || 0) * 60_000;
  return { currentIndex: to, remainingMs: ms, endsAt: s.running ? new Date(nowMs + ms).toISOString() : null };
}

/** 되돌리기 패치 — 이동 직전 스냅샷을 그대로 복원.
 *  왜 endsAt(절대시각)을 그대로 쓰나: 진행 중이던 클락은 오조작을 알아채는 그 몇 초 동안에도
 *  실제로 흘렀어야 한다. 남은 시간을 되감으면 없던 시간이 생겨 오히려 두 번째 오염이 된다. */
export function levelUndoPatch(snap: ClockLevelSnapshot): Partial<ClockState> {
  return { currentIndex: snap.currentIndex, remainingMs: snap.remainingMs, endsAt: snap.endsAt, running: snap.running };
}

/** 레벨 4필드만 갱신 — '백업 전진자' 전용 부분 업데이트.
 *
 *  왜 saveClockState(전 행 upsert)를 쓰면 안 되나: 백업 경로는 '아무도 보고 있지 않은 기기'가
 *  레벨 경계마다 자동으로 쓰는 자리다. 낡은 스냅샷으로 전 행을 덮으면 다른 기기가 방금 찍은
 *  아웃(eliminations)이나 보정값(adj*)이 조용히 되돌아간다. 사람이 버튼을 눌렀을 때만 나던 위험이
 *  자동화되면 노출 빈도가 질적으로 달라진다.
 *  레벨 전진에 필요한 건 이 4필드뿐이고, 이 값들은 levelCatchUp 이 'DB행 + 절대시각'만으로 정하므로
 *  누가 먼저 쓰든 결과가 같다(멱등) — 그래서 부분 업데이트로 좁히면 경합 표면이 사실상 사라진다.
 *  UPDATE 라 행이 없으면 아무 일도 안 하는 것도 의도다(백업은 새 클락을 만들지 않는다). */
export async function saveClockLevel(
  venueId: string, gameSeq: number,
  patch: Pick<ClockState, 'currentIndex' | 'remainingMs' | 'endsAt'> & Partial<Pick<ClockState, 'running'>>,
): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_states').update({
    current_index: patch.currentIndex,
    remaining_ms: patch.remainingMs,
    ends_at: patch.endsAt,
    ...(patch.running !== undefined && { running: patch.running }),
    updated_at: new Date().toISOString(),
  }).eq('venue_id', venueId).eq('game_seq', gameSeq);
  if (error) throw error;
}

// ── 자동 전진 / 표시 보정 ──────────────────────────────────────────────────────
// 왜 여기(api)에 두는가: 레벨을 실제로 DB에 전진시키는 주체가 '클락 화면을 열고 있는 운영자' 하나뿐이었다.
// 업주가 장부 섹션으로 옮기면 클락 섹션은 display:none 으로 마운트만 남아 재렌더가 멈추고 전진도 멈춘다 —
// 손님이 보는 TV·홈 라이브 카드가 00:00 에 얼어붙던 원인. 책임을 둘로 쪼개 규칙을 한 곳에 고정한다.
//   · effectiveLevel : 표시 보정(읽기 전용). 낡은 행에서도 '지금 진짜 레벨'을 계산. 아무것도 쓰지 않는다.
//   · levelCatchUp   : 실제 전진 패치(쓰기). 쓰기 권한(can_access_ledger) 있는 운영자 화면만 호출한다.
// 같은 while 보정이 이미 MultiClockOverview·ClockRemoteBar 에 복붙돼 있어 3벌째가 되기 전에 단일소스로 뺀다.

// effectiveLevel 은 순수 계산이라 lib/clockLevel.ts 로 내렸다 — 그래야
// App → lib/regStatus → api/clock → api/ledger 정적 사슬이 끊겨 업주용 장부 청크가
// 첫 화면 임계 경로에서 빠진다(그 파일 상단 주석 참고). 여기서 **재수출**하므로
// `from '../api/clock'` 로 쓰던 기존 임포트는 한 줄도 바꿀 필요가 없다.
import { effectiveLevel } from '../lib/clockLevel';
export { effectiveLevel, type ClockEffective } from '../lib/clockLevel';

/** 자동 전진 결과. advanced=한 번에 넘어간 레벨 수(2 이상이면 '밀렸다가 따라잡은' 보정),
 *  finished=마지막 레벨까지 소진해 토너가 끝난 경우. */
export interface ClockCatchUp { patch: Partial<ClockState>; advanced: number; toIndex: number; finished: boolean }

/** 경과 시각 기준 자동 전진 패치(전진할 게 없으면 null).
 *  ★ 왜 now+레벨전체분 이 아니라 'endsAt 에 레벨 길이를 누적' 하는가:
 *    이 계산은 여러 기기(운영자 PC 클락 화면 + 폰 장부 리모컨)가 동시에 돌 수 있다.
 *    결과가 DB 행과 절대시각만으로 정해지면 누가 먼저 쓰든 값이 똑같아 경합이 사고로 번지지 않는다.
 *    now 기준으로 타이머를 다시 채우면 쓰는 시점마다 값이 달라져 서로를 덮어쓰고 진행 시간이 늘어난다.
 *    (기존 advance() 가 바로 그 방식이라, 재진입할 때마다 밀린 시간이 통째로 증발했다.) */
export function levelCatchUp(
  s: Pick<ClockState, 'config' | 'running' | 'currentIndex' | 'endsAt' | 'remainingMs'>, nowMs = Date.now(),
): ClockCatchUp | null {
  const lv = s.config?.levels ?? [];
  if (!s.running || !lv.length) return null;
  const last = lv.length - 1;
  let idx = Math.max(0, Math.min(s.currentIndex, last));
  let end = s.endsAt ? new Date(s.endsAt).getTime() : nowMs + s.remainingMs;
  if (!Number.isFinite(end) || nowMs < end) return null;
  let advanced = 0;
  // minutes=0 인 레벨이 섞여도 idx 가 매 회 증가하므로 루프는 levels 길이로 유한하다.
  while (nowMs >= end && idx < last) { idx++; end += (lv[idx].minutes || 0) * 60_000; advanced++; }
  if (nowMs >= end) {
    // 마지막 레벨까지 소진 = 토너 종료. 여기서 멈추지 않으면 무한 전진이 된다.
    return { patch: { currentIndex: last, running: false, remainingMs: 0, endsAt: null }, advanced, toIndex: last, finished: true };
  }
  return { patch: { currentIndex: idx, remainingMs: end - nowMs, endsAt: new Date(end).toISOString() }, advanced, toIndex: idx, finished: false };
}

// ── 매퍼 ──────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToState(r: any): ClockState {
  return {
    venueId: r.venue_id, gameSeq: r.game_seq ?? 1, sessionDate: r.session_date ?? null,
    title: r.title ?? '', config: (r.config ?? {}) as ClockConfig,
    currentIndex: r.current_index ?? 0, running: !!r.running,
    endsAt: r.ends_at ?? null, remainingMs: Number(r.remaining_ms ?? 0),
    adjEntries: r.adj_entries ?? 0, adjRebuys: r.adj_rebuys ?? 0,
    adjEarlies: r.adj_earlies ?? 0, adjAddons: r.adj_addons ?? 0,
    eliminations: r.eliminations ?? 0,
    liveStats: (r.live_stats ?? null) as ClockLiveStats | null,
  };
}

// ── 프리셋 ────────────────────────────────────────────────────────────────────
export async function getClockPresets(venueId: string): Promise<ClockPreset[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('clock_presets')
    .select('*').eq('venue_id', venueId).order('updated_at', { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, name: r.name, config: r.config as ClockConfig }));
}

export async function saveClockPreset(venueId: string, name: string, config: ClockConfig, id?: string): Promise<void> {
  if (IS_MOCK) return;
  if (!id) {
    const { count } = await supabase.from('clock_presets').select('id', { count: 'exact', head: true }).eq('venue_id', venueId);
    if ((count ?? 0) >= PRESET_LIMIT) throw new Error(`프리셋은 최대 ${PRESET_LIMIT}개까지 저장할 수 있습니다`);
  }
  const row = { venue_id: venueId, name: name.trim() || '무제목', config: config as unknown as object, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from('clock_presets').update(row).eq('id', id)
    : await supabase.from('clock_presets').insert(row);
  if (error) throw error;
}

export async function deleteClockPreset(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_presets').delete().eq('id', id);
  if (error) throw error;
}

// ── 라이브 상태 ───────────────────────────────────────────────────────────────
export async function getClockState(venueId: string, gameSeq = 1): Promise<ClockState | null> {
  if (IS_MOCK) return null;
  // ⚠ error 를 버리면 '조회 실패'가 '클락 없음'이 된다 → 화면이 설정폼으로 바뀌고
  //    운영자가 [시작]을 누르면 진행 중인 대회가 0으로 덮인다. 실패는 실패로 올린다.
  const { data, error } = await supabase.from('clock_states').select('*').eq('venue_id', venueId).eq('game_seq', gameSeq).maybeSingle();
  if (error) throw error;
  return data ? rowToState(data) : null;
}

/** 진행 중(running) 클락 전체 — 라이브 게임 현황 보드용. (공개 읽기 정책 필요, 없으면 접근 가능한 것만) */
export async function getRunningClocks(): Promise<ClockState[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('clock_states').select('*').eq('running', true).order('updated_at', { ascending: false });
  if (error) throw error; // 실패를 빈 배열로 바꾸면 '진행 중인 대회 없음'으로 위장된다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToState(r));
}

/** 이 매장의 모든 게임 클락 상태(진행·정지 포함, 게임당 1개) — 멀티 클락 오버뷰용. */
export async function getVenueClocks(venueId: string): Promise<ClockState[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('clock_states').select('*').eq('venue_id', venueId);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToState(r));
}

export async function saveClockState(s: ClockState): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_states').upsert({
    venue_id: s.venueId, game_seq: s.gameSeq ?? 1, session_date: s.sessionDate, title: s.title,
    config: s.config as unknown as object,
    current_index: s.currentIndex, running: s.running,
    ends_at: s.endsAt, remaining_ms: s.remainingMs,
    adj_entries: s.adjEntries, adj_rebuys: s.adjRebuys, adj_earlies: s.adjEarlies,
    adj_addons: s.adjAddons, eliminations: s.eliminations,
    live_stats: (s.liveStats ?? null) as unknown as object,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,game_seq' });
  if (error) throw error;
}

export async function clearClockState(venueId: string, gameSeq = 1): Promise<void> {
  if (IS_MOCK) return;
  await supabase.from('clock_states').delete().eq('venue_id', venueId).eq('game_seq', gameSeq);
}

export function subscribeClock(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`clock:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_states', filter: `venue_id=eq.${venueId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** 라이브 보드용 — 전 매장 clock_states 변경 실시간 구독(레벨 전환·통계 즉시 반영). */
export function subscribeRunningClocks(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`clock:all-live:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_states' }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 장부 → 클락 카운트 자동 산출 ────────────────────────────────────────────────
export interface DerivedCounts { entries: number; rebuys: number; earlies: number; doubleEarlies: number; totalBuyins: number; }

/** 장부 바인 기록에서 엔트리/리바인/얼리 자동 집계. 얼리는 세션 스타트·구간(또는 바인 수기지정)으로 판정. */
export function deriveClockCounts(buyins: LedgerBuyin[], early: EarlyWindow): DerivedCounts {
  const players = new Set<string>();
  let rebuys = 0, earlies = 0, doubleEarlies = 0;
  for (const b of buyins) {
    players.add(b.playerName);
    if (b.entryNo > 1) rebuys++;
    const et = earlyTypeOf(b, early);
    if (et === 'double') { earlies++; doubleEarlies++; }
    else if (et === 'single') earlies++;
  }
  return { entries: players.size, rebuys, earlies, doubleEarlies, totalBuyins: buyins.length };
}

// ── 얼리 '카운트' 산정(#21) ────────────────────────────────────────────────────
// 오너 규칙: "기준이 5천이라 치고 1레벨 얼리가 1만이면 1레벨 바인 3명 → 클락 얼리 6,
//            2레벨 얼리가 5천이고 2레벨 바인 1명 → 총 7."
// 즉 클락의 '얼리'는 **사람 수가 아니라 기준칩 배수의 합**이다. 예전엔 사람 수(=4)를 올려서
// 실물 클락과 숫자가 달랐고, 운영자가 매번 수기 보정(adjEarlies)으로 메우고 있었다.

/** 얼리 카운트 1단위(칩) = 설정된 얼리 보너스 중 가장 작은 값 = 오너가 말한 '기준'.
 *  둘 다 0(얼리 미설정)이면 0 — 이때는 구 동작(1건=1)으로 떨어진다. */
export function earlyUnitChips(cfg: Pick<ClockConfig, 'earlyBonus' | 'doubleEarlyBonus'>): number {
  const pos = [Math.max(0, cfg.earlyBonus ?? 0), Math.max(0, cfg.doubleEarlyBonus ?? 0)].filter((n) => n > 0);
  return pos.length ? Math.min(...pos) : 0;
}

/** 얼리 1건이 올리는 카운트. 더블얼리 보너스가 비어 있으면 1얼리 보너스로 대체(0 증발 방지). */
export function earlyUnitsOf(cfg: Pick<ClockConfig, 'earlyBonus' | 'doubleEarlyBonus'>, t: EarlyType): number {
  if (t === 'none') return 0;
  const unit = earlyUnitChips(cfg);
  if (unit <= 0) return 1; // 보너스 미설정 게임 = 예전처럼 '1건 = 얼리 1'
  const single = Math.max(0, cfg.earlyBonus ?? 0);
  const dbl = Math.max(0, cfg.doubleEarlyBonus ?? 0);
  const chips = t === 'double' ? (dbl > 0 ? dbl : single) : (single > 0 ? single : 0);
  return chips > 0 ? Math.round(chips / unit) : 0;
}

/** 장부 집계 → 클락에 올라갈 얼리 카운트(수기 보정 제외). */
export function earlyUnitTotal(
  d: Pick<DerivedCounts, 'earlies' | 'doubleEarlies'>,
  cfg: Pick<ClockConfig, 'earlyBonus' | 'doubleEarlyBonus'>,
): number {
  const dbl = Math.max(0, d.doubleEarlies);
  const sgl = Math.max(0, d.earlies - d.doubleEarlies);
  return dbl * earlyUnitsOf(cfg, 'double') + sgl * earlyUnitsOf(cfg, 'single');
}

/** 라이브 통계 스냅샷 계산(클락 디스플레이 + 라이브 보드 공통). */
export function computeLiveStats(st: ClockState, derived: DerivedCounts, cfg: ClockConfig): ClockLiveStats {
  const entries = derived.entries + st.adjEntries;
  const rebuys = derived.rebuys + st.adjRebuys;
  // ⚠ 얼리는 인원이 아니라 기준칩 배수의 합(#21). 수기 보정은 그대로 '단위' 가산이다.
  const earlies = Math.max(0, earlyUnitTotal(derived, cfg) + st.adjEarlies);
  const addons = st.adjAddons;
  const alive = Math.max(0, entries - st.eliminations);
  const dEarly = derived.doubleEarlies;
  const sEarly = Math.max(0, (derived.earlies - derived.doubleEarlies) + st.adjEarlies);
  const totalStack = entries * cfg.startStack + rebuys * cfg.rebuyStack + addons * cfg.addonStack
    + dEarly * cfg.doubleEarlyBonus + sEarly * cfg.earlyBonus;
  const avgStack = alive > 0 ? Math.round(totalStack / alive) : 0;
  return { entries, rebuys, earlies, addons, alive, eliminations: st.eliminations, totalStack, avgStack };
}
