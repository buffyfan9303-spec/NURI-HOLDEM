// src/api/clock.ts — 토너먼트 클락(블라인드 타이머) API
import { supabase, IS_MOCK } from '../lib/supabase';
import { mustAffect } from './_mustAffect';
import { earlyTypeOf, ledgerCounts, type EarlyType, type LedgerBuyin } from './ledger';

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
  /** 클램프 전 얼리 카운트(장부 몫 + adjEarlies). 표시는 언제나 `earlies`(0 하한)를 쓴다.
   *  리모컨 delta 합성(applyRemoteStatDelta)이 `Math.max(0, …)` 에서 잃어버린 정보를 되찾기 위한 기준값.
   *  낡은 스냅샷에는 없을 수 있어 optional 이다(없으면 `earlies` 로 떨어진다 = 예전 동작). */
  earliesRaw?: number;
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

/** 이 클락에 **진행 이력**이 있는가 — [시작]이 통째로 덮어쓰기(upsert) 전에 물어야 할 판정.
 *
 *  ⚠ 왜 `running` 만 보면 안 되는가: 딜러가 브레이크·정산·사고로 **일시정지**해 두면 `running === false` 다.
 *    레벨 7 · 엔트리 30 · 탈락 12 인 대회도 멈춰 있으면 running 은 false 라,
 *    [시작] 가드가 `existing?.running` 만 보던 동안 **경고 한 번 없이 0 으로 덮어썼다.**
 *    되돌릴 수 없는 손실이라 판정을 여기 한 곳에 모은다(화면이 둘 이상이다).
 *
 *  판정 규칙: `emptyClockState` 가 만드는 '갓 만든 클락' 과 **한 곳이라도 다르면** 진행 이력으로 본다.
 *    - remainingMs 는 첫 레벨 전체 분과 비교한다(레벨 0 에서 3분만 흘러도 잡힌다).
 *    - config 가 비어 있으면 emptyClockState 와 같은 기본값 20분을 쓴다.
 */
export function clockHasProgress(s: ClockState | null | undefined): boolean {
  if (!s) return false;
  const fullMs = (s.config?.levels?.[0]?.minutes ?? 20) * 60_000;
  return s.running
    || s.endsAt !== null
    || s.currentIndex > 0
    || s.eliminations > 0
    || s.adjEntries !== 0 || s.adjRebuys !== 0 || s.adjEarlies !== 0 || s.adjAddons !== 0
    || s.remainingMs < fullMs;
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
  expectEndsAt?: string,
): Promise<number> {
  if (IS_MOCK) return 1;
  let q = supabase.from('clock_states').update({
    current_index: patch.currentIndex,
    remaining_ms: patch.remainingMs,
    ends_at: patch.endsAt,
    ...(patch.running !== undefined && { running: patch.running }),
    updated_at: new Date().toISOString(),
  }).eq('venue_id', venueId).eq('game_seq', gameSeq);
  // CAS — '내가 읽은 레벨 경계가 아직 그대로일 때만' 쓴다(2026-09-17).
  //   부분 업데이트로 좁혀도 남는 구멍이 하나 있었다: 다른 기기에서 [정지]를 누르면 그 순간
  //   ends_at 이 null 이 되는데, realtime 이 이 기기에 닿기 전 1초 틱이 먼저 돌면 **멈춘 클락의
  //   레벨을 한 칸 올려 버린다**(전진 조건은 낡은 스냅샷으로 판단되기 때문이다).
  //   읽은 경계를 그대로 조건에 걸면, 누가 먼저 움직였을 때 이 쓰기는 0행 = 아무 일도 안 한다.
  //   ends_at 은 레벨이 바뀔 때마다 새 절대시각이 되므로 사실상 버전 토큰으로 쓸 수 있다.
  //   ⚠ null 은 조건으로 걸지 않는다(PostgREST 는 .is() 가 필요하고, 백업 전진자는 항상 값이 있는
  //     경계에서만 쓴다). expectEndsAt 을 안 주면 예전 동작 그대로다.
  if (expectEndsAt) q = q.eq('ends_at', expectEndsAt);
  // C2(2026-09-25): **반영 행 수**를 돌려준다. 0 = 누가 먼저 움직였다(정지·레벨 이동·종료) — CAS 가 막은 것이다.
  //   예전엔 void 라 호출부가 '썼다' 고 믿고 낙관값(한 칸 올린 레벨)을 화면에 그대로 뒀다. 0 이면 재조회해 서버 진실로 돌아간다.
  const { data, error } = await q.select();
  if (error) throw error;
  return data?.length ?? 0;
}

// ── 자동 전진 / 표시 보정 ──────────────────────────────────────────────────────
// 왜 여기(api)에 두는가: 레벨을 실제로 DB에 전진시키는 주체가 '클락 화면을 열고 있는 운영자' 하나뿐이었다.
// 업주가 장부 섹션으로 옮기면 클락 섹션은 display:none 으로 마운트만 남아 재렌더가 멈추고 전진도 멈춘다 —
// 손님이 보는 TV·홈 라이브 카드가 00:00 에 얼어붙던 원인. 책임을 둘로 쪼개 규칙을 한 곳에 고정한다.
//   · effectiveLevel : 표시 보정(읽기 전용). 낡은 행에서도 '지금 진짜 레벨'을 계산. 아무것도 쓰지 않는다.
//   · levelCatchUp   : 실제 전진 패치(쓰기). 쓰기 권한(can_access_ledger) 있는 운영자 화면만 호출한다.
// 같은 while 보정이 이미 MultiClockOverview·ClockRemoteBar 에 복붙돼 있어 3벌째가 되기 전에 단일소스로 뺀다.

// ── 진행 중 블라인드 구조 수정 (C10, 오너 2026-09-25) ────────────────────────────
// 왜: 예전엔 진행 중에 구조를 고치려면 [설정] → [이 설정으로 다시 시작] 뿐이었고, 그건 레벨·경과·엔트리·탈락을 **통째로 0** 으로
//   덮는다(clockHasProgress 경고가 뜨는 바로 그 경로). 대회장에서 "레벨 몇 개 더 붙여 주세요"·"다음 레벨 블라인드 오타"를
//   고칠 방법이 없었다. 이제 config.levels 만 바꾼다 — 행의 진행 필드(currentIndex·endsAt·remainingMs·adj*·eliminations)는 그대로다.
// 규칙(오너 결정):
//   · 이미 **지난 레벨**(실효 인덱스 앞)은 한 글자도 못 바꾼다 — 경과 시간·얼리 판정·총 진행 시간이 거기에 걸려 있다.
//   · **현재 레벨**은 블라인드·앤티·라벨만 고칠 수 있다. 길이(분)는 여기서 안 바꾼다 — 남은 시간은 [Min/Sec ±] 로 조정한다.
//   · **아직 안 온 레벨**은 블라인드·앤티·시간 수정·삭제 자유, 뒤에 레벨·브레이크 추가 자유.
//   · 마지막 레벨까지 끝난(finished) 클락은 기존 레벨이 전부 '지난 레벨'이다. 뒤에 덧붙이면 **첫 새 레벨에서 일시정지** 상태로
//     이어진다(운영자가 [계속하기] 로 재개) — 자동으로 돌리지 않는다(손님 화면에서 갑자기 시간이 흐르지 않게).
// 저장은 기존 clock_states.config 한 칸이다(스키마 변경 없음). TV·리모컨·장부 리모컨·라이브 탭은 realtime/재조회로 새 config 를 읽는다.

/** 진행 중 구조 편집에서 **잠긴 앞부분의 길이** — 이 인덱스 미만은 지난 레벨(수정 불가). finished 면 전 레벨 길이. */
export function liveLockedCount(s: Pick<ClockState, 'config' | 'running' | 'currentIndex' | 'endsAt' | 'remainingMs'>, nowMs = Date.now()): { passed: number; current: number | null } {
  const lv = s.config?.levels ?? [];
  const phase = clockPhase(s, nowMs);
  if (phase === 'finished') return { passed: lv.length, current: null };
  if (phase === 'idle') return { passed: 0, current: null };           // 시작 전 — 전부 자유(현재 레벨도 아직 안 흘렀다)
  const idx = effectiveLevel(s, nowMs).index;
  return { passed: idx, current: idx };
}

const sameLevel = (a: ClockLevel, b: ClockLevel) =>
  a.kind === b.kind && a.sb === b.sb && a.bb === b.bb && a.ante === b.ante && a.minutes === b.minutes && (a.label ?? '') === (b.label ?? '');

export type LiveStructureResult = { ok: true; patch: Partial<ClockState>; resumed: boolean } | { ok: false; error: string };

/** 진행 중 클락에 새 블라인드 구조를 적용하는 **패치**(쓰기는 호출부의 바뀐 칸 저장기가 한다). 규칙 위반이면 이유를 돌려준다. */
export function liveStructurePatch(
  s: ClockState, levels: ClockLevel[], nowMs = Date.now(),
): LiveStructureResult {
  const old = s.config?.levels ?? [];
  const { passed, current } = liveLockedCount(s, nowMs);
  for (const l of levels) {
    const bad = !Number.isFinite(l.minutes) || l.minutes <= 0
      || (l.kind === 'level' && (!(l.sb >= 0) || !(l.bb > 0) || !(l.ante >= 0)));
    if (bad) return { ok: false, error: '레벨마다 시간(분)은 0보다 커야 하고, 블라인드(BB)는 0보다 커야 합니다' };
  }
  if (levels.length < passed || levels.length === 0) return { ok: false, error: '이미 지난 레벨은 지울 수 없습니다' };
  for (let i = 0; i < passed; i++) {
    if (!sameLevel(old[i], levels[i])) return { ok: false, error: `이미 지난 ${old[i]?.kind === 'break' ? '브레이크' : `레벨 ${levelNumberAt(old, i)}`} 은(는) 수정할 수 없습니다` };
  }
  if (current !== null) {
    const o = old[current], n = levels[current];
    if (!n) return { ok: false, error: '진행 중인 레벨은 지울 수 없습니다' };
    if (o.kind !== n.kind || o.minutes !== n.minutes) {
      return { ok: false, error: '진행 중인 레벨의 길이·종류는 여기서 바꿀 수 없습니다 — 남은 시간은 Min/Sec ± 로 조정하세요' };
    }
  }
  if (levels.length === old.length && levels.every((l, i) => sameLevel(l, old[i]))) return { ok: false, error: '바뀐 내용이 없습니다' };
  const config = withDerivedEarly({ ...s.config, levels, maxLevel: Math.max(s.config?.maxLevel ?? 0, countLevels(levels)) });
  // 끝난 대회에 덧붙였다 — 첫 새 레벨에서 **일시정지**로 이어 둔다.
  if (passed === old.length && old.length > 0) {
    if (levels.length <= old.length) return { ok: false, error: '끝난 대회를 이어 가려면 뒤에 레벨을 하나 이상 추가하세요' };
    const first = levels[old.length];
    return { ok: true, resumed: true, patch: { config, currentIndex: old.length, running: false, endsAt: null, remainingMs: first.minutes * 60_000 } };
  }
  // 시작 전(idle)인데 1레벨 길이를 바꿨다 — 남은 시간도 새 길이로 맞춰야 계속 '시작 전'으로 읽힌다(clockPhase 의 만액 규칙).
  if (passed === 0 && current === null && !s.running && s.currentIndex === 0 && levels[0].minutes !== old[0]?.minutes) {
    return { ok: true, resumed: false, patch: { config, remainingMs: levels[0].minutes * 60_000 } };
  }
  return { ok: true, resumed: false, patch: { config } };
}

// ── 사이드 게임 날짜 ───────────────────────────────────────────────────────────
/** 사이드 클락·사이드 장부를 **어느 날짜 장부에** 붙일까 (C8, 2026-09-25).
 *  예전엔 `new Date().toLocaleDateString('en-CA')`(기기 로컬 오늘)라 ① 해외·시계 오설정 기기에서 하루가 어긋나고
 *  ② 자정을 넘긴 대회(어제 연 장부)에서 사이드만 **오늘 날짜**로 갈라졌다 — 바인요청은 ledger_business_date(어제 열린 장부 우선)로
 *  어제 장부에 붙는데 사이드 클락은 오늘 장부를 찾아 '메인 장부가 없습니다'로 막혔다.
 *  우선순위: 지금 보고 있는 클락의 장부 날짜 → 메인 클락의 장부 날짜 → KST 오늘. */
export function sideGameDate(
  cur: { sessionDate: string | null } | null | undefined,
  main: { sessionDate: string | null } | null | undefined,
  nowMs = Date.now(),
): string {
  return cur?.sessionDate ?? main?.sessionDate ?? kstToday(nowMs);
}

// effectiveLevel 은 순수 계산이라 lib/clockLevel.ts 로 내렸다 — 그래야
// App → lib/regStatus → api/clock → api/ledger 정적 사슬이 끊겨 업주용 장부 청크가
// 첫 화면 임계 경로에서 빠진다(그 파일 상단 주석 참고). 여기서 **재수출**하므로
// `from '../api/clock'` 로 쓰던 기존 임포트는 한 줄도 바꿀 필요가 없다.
import { effectiveLevel, clockExhausted, clockPhase, levelNumberAt } from '../lib/clockLevel';
import { kstToday } from '../lib/kst';
export { effectiveLevel, fieldCounts, type ClockEffective } from '../lib/clockLevel';

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
  if (id) { await mustAffect(supabase.from('clock_presets').update(row).eq('id', id)); return; }
  const { error } = await supabase.from('clock_presets').insert(row);
  if (error) throw error;
}

export async function deleteClockPreset(id: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('clock_presets').delete().eq('id', id));
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
  // C3(2026-09-25): running=true 여도 마지막 레벨까지 소진한 클락은 **끝난 대회**다 — 라이브 목록·홈 레일·배지에서 뺀다.
  //   종료를 쓰는 주체가 없으면 running 이 영영 true 로 남는다(실측: 9/17 부터 running 인 더미 클락이 '진행 중 1게임').
  //   판정은 clockPhase 와 같은 clockExhausted 하나다 — 목록과 배지가 다른 규칙을 쓰면 숫자가 갈린다.
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToState(r)).filter((s) => !clockExhausted(s, now));
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

/** 통계 전용 부분 업데이트 — `live_stats` 컬럼만 쓴다(제어 필드는 절대 건드리지 않는다).
 *
 *  왜 필요한가(C01, 2026-09-12 재현): 통계 재계산 effect(TournamentClock, 장부 변동 400ms 디바운스)는
 *  자기 클로저의 낡은 `state` 를 들고 `setTimeout` 뒤에 saveClockState(전 행 upsert)를 불렀다.
 *  그 400ms 사이 사람이 STOP 을 눌러 정본이 이미 바뀌어도, deps 가 derivedKey 뿐이라 타이머가
 *  취소되지 않고 그대로 발사돼 낡은 running:true 로 방금 쓴 정지를 덮었다 — 두 writer가 역순으로 도착하면
 *  나중에 도착한(하지만 더 먼저 계산된) 통계 write 가 이긴다.
 *  이 함수는 `live_stats` 딱 하나만 UPDATE 하므로, 어떤 순서로 도착해도 `running`·`currentIndex`·
 *  `endsAt`·`eliminations` 를 덮어쓸 수 없다 — 경합 자체가 성립하지 않는다. */
export async function saveClockLiveStats(venueId: string, gameSeq: number, liveStats: ClockLiveStats | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_states').update({
    live_stats: (liveStats ?? null) as unknown as object,
    updated_at: new Date().toISOString(),
  }).eq('venue_id', venueId).eq('game_seq', gameSeq);
  if (error) throw error;
}

/** 이 기기가 **바꾼 칸만** 행 조각으로 만든다(CLOCK-TAP-LAG · critical-reviewer F3, 2026-09-24).
 *
 *  왜 전 행 upsert 를 버리나: saveClockState 는 이 기기가 들고 있는 사본 **전체**를 다시 쓴다. 리모컨·장부 리모컨 바·PC 가
 *  같은 행을 쓰는데, 한쪽의 [아웃] 이 다른 쪽의 낡은 사본(탈락 0·옛 레벨·옛 ends_at)으로 되돌아갔다.
 *  base(서버가 마지막으로 받아 준 값) 대비 달라진 칸만 보내면 남이 바꾼 칸은 건드리지 않는다.
 *  ⚠ 같은 칸을 두 기기가 동시에 ±1 하면 여전히 마지막 writer 가 이긴다(절대값 쓰기) — 원자 증감은 서버 RPC 몫이다. */
export function clockPatchRow(base: ClockState, next: ClockState): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (col: string, a: unknown, b: unknown) => { if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) row[col] = b ?? null; };
  put('session_date', base.sessionDate, next.sessionDate);
  put('title', base.title, next.title);
  put('config', base.config, next.config);
  put('current_index', base.currentIndex, next.currentIndex);
  put('running', base.running, next.running);
  put('ends_at', base.endsAt, next.endsAt);
  put('remaining_ms', base.remainingMs, next.remainingMs);
  put('adj_entries', base.adjEntries, next.adjEntries);
  put('adj_rebuys', base.adjRebuys, next.adjRebuys);
  put('adj_earlies', base.adjEarlies, next.adjEarlies);
  put('adj_addons', base.adjAddons, next.adjAddons);
  put('eliminations', base.eliminations, next.eliminations);
  put('live_stats', base.liveStats, next.liveStats);
  return row;
}

/** 진행 중 클락의 **바뀐 칸만** UPDATE — 조작(±·시작/정지·레벨) 전용. 행을 새로 만들지 않는다(시작은 saveClockState).
 *  0행(다른 기기가 종료했거나 권한 없음)은 성공이 아니다 — 호출부가 화면을 되돌린다. */
export async function saveClockPatch(base: ClockState, next: ClockState): Promise<void> {
  if (IS_MOCK) return;
  const row = clockPatchRow(base, next);
  if (Object.keys(row).length === 0) return;
  await mustAffect(
    supabase.from('clock_states').update({ ...row, updated_at: new Date().toISOString() })
      .eq('venue_id', next.venueId).eq('game_seq', next.gameSeq ?? 1),
    '클락을 찾지 못했습니다. 이미 종료됐거나 권한이 없습니다',
  );
}

/** 연타 합치기 + 순서 보장 저장기 (오너 2026-09-24 CLOCK-TAP-LAG).
 *
 *  왜 필요한가(e2e/clock-tap-latency 실측 · 왕복 300ms · 탭 간격 250ms · CPU 4×):
 *   ① 탭마다 저장이 **병렬로** 나갔다 — 도착 순서가 뒤섞이면 옛 값이 마지막에 이긴다.
 *   ② 저장마다 realtime 에코 → 재조회(GET)가 **앞선 탭까지만 반영된** 행을 돌려줘 화면이 9→10→9→10 으로 되돌아갔고,
 *      그 되돌아간 값 위에 다음 탭이 얹혀 **탭이 사라졌다**(20회 → +11). 오너가 본 "버벅버벅" 이 이것이다.
 *  그래서: 한 번에 **한 요청만** 날리고, 날아가는 동안 들어온 탭은 **마지막 값 하나로 합친다**(키별).
 *  save 는 (보낼 값, 서버가 마지막으로 받아 준 값) 을 받는다 — 둘의 차이만 쓰면 남이 바꾼 칸을 덮지 않는다.
 *  `busy` 동안 호출부는 재조회 결과를 화면에 쓰지 않는다 — 이 기기가 곧 그 칸의 마지막 writer 다.
 *  실패하면 그 키의 **마지막으로 서버가 받아 준 값**(없으면 연타 시작 직전 값)을 돌려준다. */
export interface CoalescingSaver<T> {
  push(next: T, prev: T): void;
  readonly busy: boolean;
}
export function createCoalescingSaver<T>(
  keyOf: (s: T) => string,
  save: (next: T, base: T) => Promise<void>,
  on: { error: (e: unknown, rollback: T) => void; idle: () => void },
): CoalescingSaver<T> {
  const pending = new Map<string, T>();
  const base = new Map<string, T>();
  let inflight = false;
  const pump = async () => {
    inflight = true;
    while (pending.size > 0) {
      const [k, s] = pending.entries().next().value as [string, T];
      pending.delete(k);
      try {
        await save(s, base.get(k) as T);
        base.set(k, s);
      } catch (e) {
        pending.delete(k);   // 실패한 값 위에 쌓인 탭은 보내지 않는다 — 화면을 서버 기준으로 되돌린다
        on.error(e, base.get(k) as T);
      }
    }
    inflight = false;
    base.clear();
    on.idle();
  };
  return {
    push(next, prev) {
      const k = keyOf(next);
      if (!base.has(k)) base.set(k, prev);
      pending.set(k, next);
      if (!inflight) void pump();
    },
    get busy() { return inflight || pending.size > 0; },
  };
}

export async function clearClockState(venueId: string, gameSeq = 1): Promise<void> {
  if (IS_MOCK) return;
  // C07: error 를 버리면 403/500 이어도 호출부(TournamentClock.endClock)가 성공으로 알고
  // '클락을 종료했습니다' 안내와 설정 화면 이동을 해 버린다 — 실제로는 서버에 그대로 남아 있다.
  // 같은 이유로 RLS 거부(=error 없는 0행)도 성공이 아니다 — TV 에는 클락이 계속 돌고 있다.
  await mustAffect(
    supabase.from('clock_states').delete().eq('venue_id', venueId).eq('game_seq', gameSeq),
    '종료할 클락을 찾지 못했습니다. 이미 종료됐거나 권한이 없습니다',
  );
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
/**
 * ⚠ 여기서 `entries` 는 **고유 플레이어 수**다(총 바이인 수가 아니다).
 *   클락 화면이 부르는 이름을 그대로 둔 것이라 헷갈리기 쉽다 — 총 바이인은 totalBuyins 다.
 *   `rebuys` 는 entryNo > 1 인 기록 수, `totalBuyins` 는 기록 수 전체.
 */
export interface DerivedCounts { entries: number; rebuys: number; earlies: number; doubleEarlies: number; totalBuyins: number; }

/** 장부 바인 기록에서 플레이어/리바인/얼리 자동 집계. 얼리는 세션 스타트·구간(또는 바인 수기지정)으로 판정.
 *
 *  횟수(플레이어·리바인·총 바이인)는 **장부와 같은 함수**(ledgerCounts)를 쓴다(2026-09-11) —
 *  각자 세면 이름 공백 처리 하나만 달라도 클락과 장부가 다른 수를 말하게 된다.
 *  할인·결제수단은 이 수에 영향을 주지 않는다. */
export function deriveClockCounts(buyins: LedgerBuyin[], early: EarlyWindow): DerivedCounts {
  const c = ledgerCounts(buyins);
  let earlies = 0, doubleEarlies = 0;
  for (const b of buyins) {
    const et = earlyTypeOf(b, early);
    if (et === 'double') { earlies++; doubleEarlies++; }
    else if (et === 'single') earlies++;
  }
  return { entries: c.players, rebuys: c.rebuys, earlies, doubleEarlies, totalBuyins: c.totalBuyins };
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

/** 스냅샷에서 얼리의 '자동(장부 파생)' 몫만 되뽑는다 — 표시 '얼리 보정 · 자동 N ±M' 의 N.
 *
 *  ⚠ 왜 `earlies` 로는 안 되나(2026-09-13 재현): `liveStats.earlies` 는 `Math.max(0, …)` 로
 *    **클램프된** 값이라(computeLiveStats) 보정을 되빼는 역산이 성립하지 않는다.
 *    장부 자동 3 · adjEarlies −5 → earlies=0 이라 `0 − (−5) = 5` 가 나왔다(참값 3).
 *    adjEarlies 를 음수로 크게 내리면 '자동'이 통째로 `|adjEarlies|` 로 고정됐다(자동 0 일 때도 5).
 *    클램프 전 값(earliesRaw)에서 빼야 정확히 `earlyUnitTotal` 이 복원된다.
 *  ⚠ `?? ls.earlies` 는 earliesRaw 가 없던 **낡은 스냅샷**용 폴백이다 — 그 경로에서는 구 동작과 같다
 *    (applyRemoteStatDelta 의 같은 폴백과 동일한 취급). */
export function earlyAutoOf(
  ls: Pick<ClockLiveStats, 'earlies' | 'earliesRaw'> | null | undefined,
  adjEarlies: number | null | undefined,
): number {
  return (ls?.earliesRaw ?? ls?.earlies ?? 0) - (adjEarlies ?? 0);
}

/** 얼리 수기 보정의 하한 — 실효 카운트(장부 자동 몫 + 보정)가 0 밑으로 내려가지 않게 한다(#11).
 *
 *  왜 상태 쪽에도 하한이 필요한가: 칩 환산을 클램프하면 화면은 맞지만, 그러면 [−] 를 여러 번
 *  누른 만큼 adjEarlies 가 조용히 내려가 [+] 를 같은 횟수만큼 눌러야 숫자가 움직인다 —
 *  오너가 본 "얼리 표기가 안되고" 가 바로 그것이다. 버튼은 상태를 더 내리지 않아야 한다.
 *
 *  장부 자동 몫은 스냅샷에서 역산한다(earlyAutoOf) — 호출부가 derived/cfg 를 들고 있지 않아도
 *  liveStats 만으로 같은 하한을 쓴다. ls 가 없는 클락(장부 미연동)은 보정이 곧 카운트라 0 이 하한이다.
 *  ⚠ 이미 음수로 저장된 낡은 행은 **그 자리에 멈추기만** 한다(강제로 0 으로 올리지 않는다) —
 *    [−] 를 누른 것이 값을 **올리는** 일이 되면 그것도 거짓말이다. [+] 로 올라오면 그때 복구된다. */
export function clampAdjEarlies(
  ls: Pick<ClockLiveStats, 'earlies' | 'earliesRaw'> | null | undefined,
  currentAdj: number | null | undefined,
  delta: number,
): number {
  return clampAdjCount(earlyAutoOf(ls, currentAdj), currentAdj, delta);
}

/** 수기 보정의 하한 — **모든 카운트 보정에 쓰는 한 규칙**(#11 과 같은 부류).
 *
 *  `auto` 는 장부에서 자동으로 세어진 몫이다. 보정은 그 위에 얹는 값이라
 *  실효 카운트(auto + 보정)가 0 밑으로 내려가면 안 된다 → 보정의 하한은 `-auto`.
 *
 *  ⚠ 왜 화면 클램프만으론 안 되나(#11 실측): 칩 환산만 막으면 숫자는 맞아 보이지만
 *    [−] 를 누른 만큼 보정값이 조용히 내려가, [+] 를 같은 횟수만큼 눌러야 화면이 움직인다.
 *    오너가 본 "표기가 안되고" 가 그것이다. **버튼이 상태를 더 내리지 않아야** 한다.
 *  ⚠ 이미 범위 밖인 낡은 행은 그 자리에 두되(`Math.min(cur, lo)`) 더 내려가지 못하게 하고,
 *    [+] 로는 정상 범위로 올라오게 한다.
 *  ⚠ `-auto` 를 그대로 쓰면 auto 0 에서 `-0` 이 나온다(Object.is 로 보는 단언이 갈린다).
 *
 *  2026-09-17: 얼리에만 있던 이 규칙을 엔트리·리바이·애드온으로 넓혔다.
 *    그쪽은 `Math.max(-9999, …)` 라 [−] 를 계속 누르면 엔트리가 음수가 되고
 *    `totalStack = entries × startStack + …` 이 음수로 떨어졌다 — #11 과 같은 증상, 다른 필드다.
 *    (애드온은 장부 자동 몫이 없어 auto=0 → 하한 0 이다.)
 */
export function clampAdjCount(auto: number, currentAdj: number | null | undefined, delta: number): number {
  const cur = currentAdj ?? 0;
  const a = Math.max(0, auto);
  const lo = a > 0 ? -a : 0;
  return Math.max(Math.min(cur, lo), cur + delta);
}

/** 라이브 통계 스냅샷 계산(클락 디스플레이 + 라이브 보드 공통). */
export function computeLiveStats(st: ClockState, derived: DerivedCounts, cfg: ClockConfig): ClockLiveStats {
  // ⚠ 여기서 Math.max(0, …) 로 자르지 **않는다**(2026-09-17 시도 후 철회).
  //   applyRemoteStatDelta 는 이 스냅샷(canon)에 차분을 엹는다 — 여기서 잘라 버리면
  //   차분의 기준점이 사라져 리모컨과 PC 값이 갈라진다(얼리가 earliesRaw 를
  //   따로 들고 다니는 이유다). 음수는 **쓰기 쪽 하한**(clampAdjCount)으로 막는다 —
  //   그러면 버튼으로 도달 가능한 상태에서 이 값이 애초에 음수가 되지 않는다.
  //   (라이브 실측 2026-09-17: clock_states 1행 · 음수 보정 0건 — 난한 난 행이 없다.)
  const entries = derived.entries + st.adjEntries;
  const rebuys = derived.rebuys + st.adjRebuys;
  // ⚠ 얼리는 인원이 아니라 기준칩 배수의 합(#21). 수기 보정은 그대로 '단위' 가산이다.
  // 클램프 전 값을 함께 남긴다 — 리모컨이 이 스냅샷에 차분을 얹을 때 기준이 된다(아래 applyRemoteStatDelta).
  const earlyAuto = earlyUnitTotal(derived, cfg);
  const earliesRaw = earlyAuto + st.adjEarlies;
  const earlies = Math.max(0, earliesRaw);
  const addons = st.adjAddons;
  const alive = Math.max(0, entries - st.eliminations);
  const dEarly = derived.doubleEarlies;
  const sEarly = Math.max(0, derived.earlies - derived.doubleEarlies);   // 인원만
  // ⚠ adjEarlies 는 **카운트 단위** 보정이지 사람 수가 아니다(위 earlies 줄과 같은 척도).
  //   예전엔 이것을 sEarly(인원)에 섞어 넣고 earlyBonus 를 곱했다 — 기준 단위와 1얼리 보너스가
  //   같은 기본 설정(5,000 / 10,000)에서만 우연히 맞고, 1얼리를 안 쓰는 게임(earlyBonus=0,
  //   더블만 10,000)에서는 보정 칩이 통째로 0 이 되어 사라졌다. 단위 → 칩으로 환산해 따로 더한다.
  // ⚠ #11(2026-09-15): 예전엔 `st.adjEarlies` 를 **그대로** 곱했다 — 카운트만 max(0,…) 로 클램프되고
  //   칩은 클램프되지 않아 둘이 갈렸다. 자동 0 에서 [얼리 −] 1회 → 얼리 0 인데 총 칩 **−5,000**(오너 보고).
  //   실제로 반영된 보정분(= 클램프 뒤 카운트 − 장부 파생분)으로 환산해야 두 값이 같은 것을 말한다.
  const adjChips = (earlies - earlyAuto) * (earlyUnitChips(cfg) || cfg.earlyBonus);
  const totalStack = entries * cfg.startStack + rebuys * cfg.rebuyStack + addons * cfg.addonStack
    + dEarly * cfg.doubleEarlyBonus + sEarly * cfg.earlyBonus + adjChips;
  const avgStack = alive > 0 ? Math.round(totalStack / alive) : 0;
  return { entries, rebuys, earlies, earliesRaw, addons, alive, eliminations: st.eliminations, totalStack, avgStack };
}

/** 리모컨 전용 — 정본 스냅샷에 '상태에서만 오는' 변화분(adj*·eliminations)만 얹는다.
 *
 *  왜 필요한가(2026-09-13 재현): C02 로 리모컨이 장부 연동 클락의 liveStats 를 아예 손대지 않게 했더니,
 *  리모컨으로 누른 탈락·보정이 TV 보드에 **영원히** 반영되지 않았다. ClockDisplay 는 liveStats.alive 를
 *  그대로 읽고(ClockDisplay.tsx: `g?.liveStats ?? ...` — 스냅샷이 있으면 폴백 계산을 쓰지 않는다),
 *  남은 유일한 쓰기 경로인 TournamentClock 의 디바운스 effect 는 deps 가 derivedKey(장부 카운트+바인단가)
 *  뿐이라 eliminations/adj* 변화로는 발사되지 않는다 — PC 를 열어 둬도 갱신되지 않고, 무인 운영이면
 *  PC 자체가 없다(리모컨의 존재 이유가 무인 조작이다).
 *
 *  C02 를 어떻게 지키나: 장부 파생분(entries/rebuys/earlies 의 장부 몫·buyInAmount·totalStack 의 장부 몫)은
 *  정본 값을 **그대로** 두고, prev→next 의 adj*·eliminations **차이만** computeLiveStats 와 같은 식으로
 *  더한다. 차이만 쓰므로 리모컨이 진입 시 1회 읽은 낡은 buyins 는 결과에 전혀 들어가지 않는다.
 *  canon 이 없으면(null) 아직 정본 스냅샷이 없는 것이므로 그대로 null — 없는 기준에 delta 를 얹지 않는다. */
export function applyRemoteStatDelta(
  canon: ClockLiveStats | null | undefined,
  prev: Pick<ClockState, 'adjEntries' | 'adjRebuys' | 'adjEarlies' | 'adjAddons'>,
  next: Pick<ClockState, 'adjEntries' | 'adjRebuys' | 'adjEarlies' | 'adjAddons' | 'eliminations'>,
  cfg: ClockConfig,
): ClockLiveStats | null {
  if (!canon) return null;
  const dEntries = next.adjEntries - prev.adjEntries;
  const dRebuys = next.adjRebuys - prev.adjRebuys;
  const dEarlies = next.adjEarlies - prev.adjEarlies;
  const dAddons = next.adjAddons - prev.adjAddons;
  const entries = canon.entries + dEntries;
  const rebuys = canon.rebuys + dRebuys;
  // ⚠ canon.earlies 는 **이미 클램프된** 값이라 여기에 차분을 얹으면 식이 갈린다(2026-09-13 재현):
  //    장부 얼리 0 · adjEarlies −5 → −3 이면 canon.earlies=0, 차분 +2 → 2. 직접 계산은 max(0, 0−3)=0.
  //    리모컨의 [얼리 −] 는 `Math.max(-9999, …)` 까지 내려가므로 실제로 도달한다.
  //    그래서 클램프 전 값(earliesRaw)을 기준으로 삼는다. 없는 낡은 스냅샷은 예전 동작으로 떨어진다.
  const earliesRaw = (canon.earliesRaw ?? canon.earlies) + dEarlies;
  const earlies = Math.max(0, earliesRaw);
  const addons = canon.addons + dAddons;
  const eliminations = next.eliminations;
  const alive = Math.max(0, entries - eliminations);
  // ⚠ 얼리 보정의 칩 환산은 computeLiveStats 의 adjChips 와 같은 식이어야 한다(단위 → 칩).
  //   #11: 그쪽과 같이 **클램프된** 카운트 차분(earlies − canon.earlies)를 쓴다 — dEarlies 를 그대로
  //   곱하면 0 에서 한 번 더 누른 [얼리 −] 가 카운트를 안 움직이면서 칩만 −5,000 씩 깎았다.
  const totalStack = canon.totalStack + dEntries * cfg.startStack + dRebuys * cfg.rebuyStack
    + dAddons * cfg.addonStack + (earlies - canon.earlies) * (earlyUnitChips(cfg) || cfg.earlyBonus);
  const avgStack = alive > 0 ? Math.round(totalStack / alive) : 0;
  return { ...canon, entries, rebuys, earlies, earliesRaw, addons, alive, eliminations, totalStack, avgStack };
}
