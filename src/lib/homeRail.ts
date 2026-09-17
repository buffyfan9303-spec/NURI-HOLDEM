// src/lib/homeRail.ts — 홈 '추천 대회' 레일의 **순서와 한 줄 사실**(순수 함수, 네트워크 0).
//
// 왜 (2026-09-17 오너: "추천 대회를 강화하고 apislive 와 달라 보이게"):
//   apislive.com 을 375px 로 직접 봤다. 그쪽 카드도 `LIVE 16/58 PLAYERS · Lv11 6K/12K · REG ~ Lv13` 를 적는다 —
//   **클락 실측은 차별점이 아니라 기본기**다. 저쪽이 원리적으로 못 적는 것은 **'너와 이 매장'** 이다:
//   장부·체크인이 없으니 방문 횟수를 모르고, 예약이 없으니 네가 오늘 어디 가는지 모른다.
//   그래서 추천의 근거를 **부스트 → 내 예약 → 가 본 매장 → 지금 뛰는 판 → 시작 순**으로 두고,
//   카드마다 그 근거를 **한 줄로 말한다**("내 예약 · 오늘", "3번 가 본 매장", "지금 12명 · Lv 8").
//   추천이 왜 추천인지 말하지 않는 레일은 정렬된 목록일 뿐이다.
//
// 쓰는 데이터는 전부 App 이 **이미 받아 둔 것**이다(부팅 예산 게이트 — 새 조회 0):
//   liveClocks(getRunningClocks) · myVisitedVenues(recentVenue 의 원본 배열) · myTodayRes(getMyReservations).
//
// ⚠ 등록 마감 계산은 여기 없다 — 그건 lib/regStatus.msToRegClose **하나**뿐이다(F2 · regStatus.contract.test).
//   여기서는 매칭(matchClockScheduleDetailed)과 실효 레벨(effectiveLevel)만 빌려 쓴다.
import type { ClockState } from '../api/clock';
import type { Schedule } from '../api/schedules';
import { effectiveLevel, levelNumberAt } from './clockLevel';
import { matchClockScheduleDetailed } from './regStatus';
import { compareByStartThenBoost } from './scheduleSort';

/** 진행 중 클락에서 홈이 말할 두 수 — 생존 인원과 레벨 번호(브레이크 제외). */
export interface LiveFact { alive: number; levelNo: number }

/** scheduleId → LiveFact. 클락이 없는 대회는 맵에 없다. 같은 포스터에 클락이 둘이면 메인(gameSeq 작은 쪽)이 이긴다
 *  — buildRegInfoMap 과 같은 결정 규칙(어느 클락이 이기는지가 응답 순서에 달리면 같은 데이터에 다른 화면이 된다). */
export function buildLiveFactMap(clocks: readonly ClockState[], schedules: readonly Schedule[], nowMs = Date.now()): Map<string, LiveFact> {
  const map = new Map<string, LiveFact>();
  const seq = new Map<string, number>();
  for (const g of clocks) {
    const m = matchClockScheduleDetailed(g, schedules as Schedule[]);
    if (!m) continue;
    const prev = seq.get(m.schedule.id);
    if (prev != null && g.gameSeq >= prev) continue;
    // LiveGamesTab 과 같은 폴백: 스냅샷이 없으면 보정 엔트리 − 탈락(음수 방지).
    const alive = g.liveStats?.alive ?? Math.max(0, g.adjEntries - g.eliminations);
    const levelNo = levelNumberAt(g.config?.levels ?? [], effectiveLevel(g, nowMs).index);
    seq.set(m.schedule.id, g.gameSeq);
    map.set(m.schedule.id, { alive, levelNo });
  }
  return map;
}

export interface RailContext {
  /** 'YYYY-MM-DD'(로컬) — 오늘 이전은 뺀다. */
  today: string;
  /** venueId → 방문 횟수(my_visited_venues). 비로그인이면 빈 맵. */
  visitsByVenue: ReadonlyMap<string, number>;
  /** 내가 오늘 예약한 scheduleId 들. */
  reservedIds: ReadonlySet<string>;
  live: ReadonlyMap<string, LiveFact>;
  /** 끝난 대회 판정 — scheduleStatus(date, startTime) === 'ended'. 주입받아 시계 의존을 밖으로 뺀다. */
  isEnded: (s: Schedule) => boolean;
}

/** 추천 근거 점수 — 클수록 앞. 부스트는 업주가 산 노출이라 맨 앞을 유지한다(§6 결정 그대로).
 *  그 다음은 저쪽이 못 아는 것 순: 내 예약 > 가 본 매장 > 지금 뛰는 판. 동점은 시작 순(기존 규칙). */
export function railScore(s: Schedule, ctx: RailContext): number {
  return (s.isPremium ? 8 : 0)
    + (ctx.reservedIds.has(s.id) ? 4 : 0)
    + ((ctx.visitsByVenue.get(s.venueId) ?? 0) > 0 ? 2 : 0)
    + (ctx.live.has(s.id) ? 1 : 0);
}

/** 레일 순서. 같은 포스터의 연속 회차는 첫 장만(도배 방지 — 종전 규칙 유지). */
export function rankRail(schedules: readonly Schedule[], ctx: RailContext, max: number): Schedule[] {
  const seenPoster = new Set<string>();
  return schedules
    .filter((s) => s.approved && s.date >= ctx.today && !ctx.isEnded(s))
    .sort((a, b) => railScore(b, ctx) - railScore(a, ctx) || compareByStartThenBoost(a, b))
    .filter((s) => !s.posterUrl || (!seenPoster.has(s.posterUrl) && (seenPoster.add(s.posterUrl), true)))
    .slice(0, max);
}

/** 카드 한 줄 — 추천 **근거**를 사실로 말한다. 근거가 없으면 빈 문자열(줄 자체는 높이를 예약해 CLS 0).
 *  순서: 지금 뛰는 판(가장 시간에 민감) → 내 예약 → 가 본 매장. 최대 두 조각(164px 카드). */
export function railFact(s: Schedule, ctx: RailContext): string {
  const parts: string[] = [];
  const lf = ctx.live.get(s.id);
  if (lf) parts.push(lf.levelNo > 0 ? `지금 ${lf.alive}명 · Lv ${lf.levelNo}` : `지금 ${lf.alive}명`);
  if (ctx.reservedIds.has(s.id)) parts.push('내 예약');
  const v = ctx.visitsByVenue.get(s.venueId) ?? 0;
  if (v > 0 && parts.length < 2) parts.push(`${v}번 가 본 매장`);
  return parts.slice(0, 2).join(' · ');
}

// ── 오늘 안내 한 줄 — 주어가 '세상'이 아니라 '너'다 ─────────────────────────────
// apislive 헤더는 세상을 설명한다("9월 17일 · 라이브 0 · 예정 24"). 같은 데이터로 누리는 **그 사람**을 말한다
// ("가 본 매장 2곳 · 오늘 3게임 · 내 예약 1건"). 저쪽이 구조적으로 못 쓰는 문장이다(장부·체크인·예약 없음).
export interface TodayLineInput {
  /** 가 본 매장 수(my_visited_venues.length). 비로그인 = 0. */
  visitedCount: number;
  /** 가 본 매장에서 **오늘** 열리는(안 끝난) 대회 수. */
  todayAtVisited: number;
  /** 오늘 내 예약 수. */
  reservedToday: number;
  /** 지금 등록 가능 수 — 클락 응답 전이면 null(없는 숫자를 만들지 않는다). */
  openNow: number | null;
}

/** 이력이 있으면 그 사람 문장, 없으면 '' (호출부가 종전 문구 '오늘 대회 N개 · 지금 등록 가능 M개' 로 떨어진다).
 *  0 인 갈래는 문장에 넣지 않는다("내 예약 0건" 은 없는 게 낫다). 조각은 최대 3개 — 375px 한 줄 상한(실측 계약). */
export function todayLine(i: TodayLineInput): string {
  const parts: string[] = [];
  if (i.visitedCount > 0) parts.push(`가 본 매장 ${i.visitedCount}곳`);
  if (i.todayAtVisited > 0) parts.push(`오늘 ${i.todayAtVisited}게임`);
  if (i.reservedToday > 0) parts.push(`내 예약 ${i.reservedToday}건`);
  if (parts.length === 0) return '';
  if (parts.length < 3 && i.openNow != null && i.openNow > 0) parts.push(`등록 가능 ${i.openNow}개`);
  return parts.slice(0, 3).join(' · ');
}
