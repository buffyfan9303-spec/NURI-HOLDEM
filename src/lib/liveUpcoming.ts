// 라이브 탭 '오늘 곧 시작 · 아직 클락 전' 목록의 단일 판정 (UP-17, 2026-10-08).
//
// 왜 따로 뺐나: 예전엔 LiveGamesTab 안에서 '오늘 날짜 + 승인 + 지금 클락이 안 도는 것' 만 봤다.
//   그런데 games 는 **실행 중인 클락만** 오므로(getRunningClocks), 오늘 일찍 시작해 이미 끝난 대회도
//   '아직 클락 전' 으로 다시 나왔다. 종료 판정은 카드·상세·예약 박스가 쓰는 정본
//   `scheduleStatus`(시작 + 10시간, 서버 _schedule_ended 와 같은 값)를 그대로 쓴다 — 두 벌 계산 금지.
import { scheduleStatus } from './scheduleStatus';

export interface UpcomingScheduleLike {
  id: string;
  approved?: boolean | null;
  date: string;
  startTime?: string | null;
}

export function upcomingToday<T extends UpcomingScheduleLike>(
  schedules: readonly T[],
  liveSchedIds: ReadonlySet<string>,
  today: string,
  now: number = Date.now(),
): T[] {
  return schedules
    .filter((s) => s.approved && s.date === today && !liveSchedIds.has(s.id)
      && scheduleStatus(s.date, s.startTime, now) !== 'ended')
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}
