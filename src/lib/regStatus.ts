// UX-1(W1-6): '지금 등록 되나?' — 라이브 클락의 레지 판정을 browse 카드·상세로 승격하는 단일 소스.
// 기존에는 이 판정이 LiveGamesTab 내부에만 갇혀 있어, 정작 대회를 '고르는' 화면에서는
// 서버가 답을 알면서도 유저에게 "매장에 확인해 주세요"라고 말하고 있었다(§15.2 #6).
import { effectiveLevel, type ClockState } from '../api/clock';
import type { Schedule } from '../api/schedules';

/** 라이브 클락 → 연결 포스터 매칭(공개 데이터만): 같은 매장·같은 날짜의 스케줄(여럿이면 제목 일치 우선). */
export function matchClockSchedule(g: ClockState, schedules: Schedule[]): Schedule | null {
  if (!g.sessionDate) return null;
  const sameDay = schedules.filter((s) => s.venueId === g.venueId && s.date === g.sessionDate);
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];
  const t = (g.title || g.config?.title || '').trim();
  return sameDay.find((s) => (s.title ?? '').trim() === t) ?? sameDay[0];
}

/** 레지 마감까지 남은 ms — null=마감 레벨 도달 불가(판정 불가) · 0=이미 마감 · 양수=남은 시간.
 *  index/remaining 은 반드시 '실효' 값(effectiveLevel)이어야 한다 — DB current_index 는 낡을 수 있다. */
export function msToRegClose(s: ClockState, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? []; const target = s.config?.regCloseLevel ?? 0;
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
}

/** scheduleId → RegInfo. 클락이 없는 대회는 맵에 없다(추정 배지 폴백은 소비처 책임). */
export function buildRegInfoMap(clocks: ClockState[], schedules: Schedule[], nowMs = Date.now()): Map<string, RegInfo> {
  const map = new Map<string, RegInfo>();
  for (const g of clocks) {
    const s = matchClockSchedule(g, schedules);
    if (!s) continue;
    const eff = effectiveLevel(g, nowMs);
    map.set(s.id, { msLeft: msToRegClose(g, eff.index, eff.remainingMs), running: g.running });
  }
  return map;
}
