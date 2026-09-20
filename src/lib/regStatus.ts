// UX-1(W1-6): '지금 등록 되나?' — 라이브 클락의 레지 판정을 browse 카드·상세로 승격하는 단일 소스.
// 기존에는 이 판정이 LiveGamesTab 내부에만 갇혀 있어, 정작 대회를 '고르는' 화면에서는
// 서버가 답을 알면서도 유저에게 "매장에 확인해 주세요"라고 말하고 있었다(§15.2 #6).
// ⚠ effectiveLevel 은 **반드시 lib/clockLevel 에서** 가져온다.
//   '../api/clock' 에서 가져오면 그 모듈이 api/ledger 를 물고 있어 업주 전용 장부 청크가
//   첫 화면 임계 경로로 딸려 온다(실측으로 잡은 회귀). ClockState 는 타입이라 안전하다.
import { effectiveLevel } from './clockLevel';
import type { ClockState } from '../api/clock';
import type { Schedule } from '../api/schedules';

/**
 * 매칭의 **확신도**. 소비처가 '이게 확실한 연결인가' 를 알아야 결정적으로 승자를 고를 수 있다.
 *  · `title`    — 제목이 정확히 일치했다(가장 강하다)
 *  · `only`     — 그날 그 매장에 포스터가 하나뿐이라 그것으로 봤다
 *  · `fallback` — 여럿인데 제목이 안 맞아 첫 번째를 골랐다(약하다)
 */
export type ClockMatchQuality = 'title' | 'only' | 'fallback';

/** 매칭 결과 + 확신도. `matchClockSchedule` 은 이 함수의 얇은 껍데기다. */
export function matchClockScheduleDetailed(
  g: ClockState, schedules: Schedule[],
): { schedule: Schedule; quality: ClockMatchQuality } | null {
  if (!g.sessionDate) return null;
  const sameDay = schedules.filter((s) => s.venueId === g.venueId && s.date === g.sessionDate);
  if (sameDay.length === 0) return null;
  // ⚠ 제목 검사를 **개수보다 먼저** 한다. 예전에는 `sameDay.length === 1` 조기 반환이 위에 있어
  //   포스터가 하나뿐인 것처럼 보이는 호출(상세 패널이 1건짜리 스텁을 넘긴다)에서 **제목 비교가 아예 실행되지 않았다**.
  const t = (g.title || g.config?.title || '').trim();
  // 🔴 2026-09-20 (R1-D) — 제목이 **같은 날 두 번 이상** 나오면 `find` 는 그냥 배열의 첫 번째를 고른다.
  //   그런데 종전에는 그 결과에 `quality: 'title'`(가장 높은 확신도) 를 붙였다. 소비처는 그 라벨을 보고
  //   '이 포스터가 맞다' 로 취급하므로, 동명 대회가 2개인 날에는 **틀린 포스터를 사실처럼** 열 수 있었다.
  //   고른 값은 그대로 두고(다른 매칭 규칙을 새로 만들지 않는다) **라벨만 정직하게** 낮춘다 —
  //   `fallback` 은 '확신 없음' 이라는 뜻이고 소비처가 이미 그렇게 다룬다.
  const titled = t ? sameDay.filter((s) => (s.title ?? '').trim() === t) : [];
  if (titled.length === 1) return { schedule: titled[0], quality: 'title' };
  if (titled.length > 1) return { schedule: titled[0], quality: 'fallback' };
  if (sameDay.length === 1) return { schedule: sameDay[0], quality: 'only' };
  return { schedule: sameDay[0], quality: 'fallback' };
}

/** 라이브 클락 → 연결 포스터 매칭(공개 데이터만): 같은 매장·같은 날짜의 스케줄(여럿이면 제목 일치 우선). */
export function matchClockSchedule(g: ClockState, schedules: Schedule[]): Schedule | null {
  return matchClockScheduleDetailed(g, schedules)?.schedule ?? null;
}

/** 레지 마감까지 남은 ms — null=마감 레벨 도달 불가(판정 불가) · 0=이미 마감 · 양수=남은 시간.
 *  index/remaining 은 반드시 '실효' 값(effectiveLevel)이어야 한다 — DB current_index 는 낡을 수 있다. */
export function msToRegClose(s: ClockState, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? []; const target = s.config?.regCloseLevel ?? 0;
  // ⚠ F2(2026-09-12): 등록 마감 레벨을 **비워 둔** 대회(`regCloseLevel` 미설정 → 0)를 예전에는
  //   아래 `num >= target` 이 `0 >= 0` 으로 참이 되어 **'이미 마감' 이라고 단언**했다.
  //   그래서 같은 대회를 화면마다 다르게 말했다 — 라이브 탭은 배지 없음(자기 안에 `regLevel > 0` 가드가 있다),
  //   browse 카드는 '등록 마감', 홈 '지금 등록 가능' 에서는 탈락, 상세는 '레지 마감'.
  //   **마감 규칙이 없다는 것은 마감이 아니라 판정 불가다.** null 은 모든 소비처가 이미
  //   '배지 생략 / 추정 폴백' 으로 처리하는 값이라 소비처 수정 없이 올바른 쪽으로 떨어진다.
  if (target <= 0) return null;
  let acc = remaining, num = 0;
  for (let i = 0; i <= index; i++) if (lv[i]?.kind === 'level') num++;
  if (num >= target) return 0;
  for (let i = index + 1; i < lv.length; i++) { if (lv[i].kind === 'level') { num++; if (num >= target) return acc; } acc += lv[i].minutes * 60_000; }
  return null;
}

/** browse 카드·상세가 소비하는 레지 상태 — 추정(scheduleStatus)이 아니라 클락 실측이다. */
export interface RegInfo {
  /** 마감까지 남은 ms — 0=마감, null=마감 레벨 미설정(판정 불가) */
  msLeft: number | null;
  /** 클락이 실제로 돌고 있는가(일시정지면 false) */
  running: boolean;
  /** 이 판정을 만든 클락의 game_seq — 포스터 상세가 '관전 클락' 을 **같은 클락**으로 연다(2026-09-17 연결 감사 B). */
  gameSeq: number;
}

/** 확신도 순위 — 높을수록 강하다. */
const QUALITY_RANK: Record<ClockMatchQuality, number> = { title: 2, only: 1, fallback: 0 };

/**
 * scheduleId → RegInfo. 클락이 없는 대회는 맵에 없다(추정 배지 폴백은 소비처 책임).
 *
 * ⚠ F1(2026-09-12): 예전에는 `map.set(s.id, …)` 이 **충돌 가드 없이 조용히 덮었다.**
 *   메인+사이드 클락이 **동시에 running** 인 날(앱이 `<메인> 사이드N` 으로 제목을 스스로 만드는 정상 형태다)
 *   메인 포스터의 '등록 가능/마감' 배지와 홈 '지금 등록 가능' 목록이 **사이드 클락의 레지 상태**로 결정됐고,
 *   어느 쪽이 이기는지는 `getRunningClocks` 의 `order('updated_at', desc)` 배열 순서에 달려 있었다
 *   — 즉 **같은 데이터에도 결과가 달라졌다.**
 *
 *   그래서 승자를 **결정적 규칙**으로 고른다: 제목 정확 일치 > `gameSeq` 오름차순(메인=1 이 사이드를 이긴다).
 *   ⚠ '애매하면 둘 다 버린다' 는 채택하지 않았다 — 포스터 1장 + 메인/사이드 클락이 **가장 흔한 형태**라
 *   그러면 그 매장에서 라이브 표시가 통째로 사라진다. `gameSeq` 는 `(venue, game_seq)` 가 유일해 항상 승부가 난다.
 */
export function buildRegInfoMap(clocks: ClockState[], schedules: Schedule[], nowMs = Date.now()): Map<string, RegInfo> {
  const map = new Map<string, RegInfo>();
  const won = new Map<string, { rank: number; gameSeq: number }>();
  for (const g of clocks) {
    const m = matchClockScheduleDetailed(g, schedules);
    if (!m) continue;
    const rank = QUALITY_RANK[m.quality];
    const prev = won.get(m.schedule.id);
    // 더 약한 확신도이거나, 같은 확신도인데 gameSeq 가 더 크면(사이드) 진다.
    if (prev && (rank < prev.rank || (rank === prev.rank && g.gameSeq >= prev.gameSeq))) continue;
    const eff = effectiveLevel(g, nowMs);
    won.set(m.schedule.id, { rank, gameSeq: g.gameSeq });
    map.set(m.schedule.id, { msLeft: msToRegClose(g, eff.index, eff.remainingMs), running: g.running, gameSeq: g.gameSeq });
  }
  return map;
}
