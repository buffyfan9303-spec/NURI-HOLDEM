import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planRepeatDates } from './posterRepeatRetry';

const k = { venueId: 'v1', ownerId: 'u1', title: '데일리', startTime: '19:00' };
const row = (date: string) => ({ venueId: 'v1', ownerId: 'u1', title: '데일리', startTime: '19:00', date });

describe('H03-07 반복 등록 재시도 — 날짜별 정확히 1건', () => {
  it('부분 성공 뒤 재시도는 실패 날짜만 보낸다', () => {
    const r = planRepeatDates(['2026-10-08', '2026-10-15', '2026-10-22'], ['2026-10-08', '2026-10-22'], ['2026-10-15'], [], k);
    expect(r.send).toEqual(['2026-10-15']);
  });
  it('응답만 잃고 서버에 저장된 실패 날짜는 다시 보내지 않는다', () => {
    const r = planRepeatDates(['2026-10-08', '2026-10-15'], ['2026-10-08'], ['2026-10-15'], [row('2026-10-15')], k);
    expect(r).toEqual({ send: [], landed: ['2026-10-15'] });
  });
  it('첫 시도는 서버의 같은 행이 있어도 막지 않는다(의도적 중복 개설)', () => {
    expect(planRepeatDates(['2026-10-08'], [], [], [row('2026-10-08')], k).send).toEqual(['2026-10-08']);
  });
  it('폼 제목에 앞뒤 공백이 있어도 서버가 trim 해 저장한 행을 같은 날짜로 본다', () => {
    const r = planRepeatDates(['2026-10-08', '2026-10-15', '2026-10-22'], ['2026-10-08', '2026-10-22'], ['2026-10-15'],
      [row('2026-10-15')], { ...k, title: ' 데일리 ' });
    expect(r).toEqual({ send: [], landed: ['2026-10-15'] });
  });
});

describe('H03-07·R12-02 배선 계약', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const form = readFileSync('src/components/features/PosterFormModal.tsx', 'utf8');
  const tab = readFileSync('src/components/features/MyPostersTab.tsx', 'utf8');
  const vm = readFileSync('src/components/features/VenueManageTab.tsx', 'utf8');
  it('App 은 남은 날짜만 createSchedule 로 보내고 저장/실패 날짜를 돌려준다', () => {
    expect(app).toMatch(/planRepeatDates\(allDates, data\.repeatSaved, data\.repeatRetry/);
    expect(app).toMatch(/return \{ ok: failedDates\.length === 0, saved: ok, total, savedDates, failedDates \}/);
  });
  it('폼은 더블 클릭을 ref 로 막고 지난 결과를 다음 제출에 싣는다', () => {
    expect(form).toMatch(/if \(busyRef\.current\) return;/);
    expect(form).toMatch(/repeatSaved: done\.saved, repeatRetry: done\.failed/);
  });
  it('게임 목록 조회 실패는 빈 상태가 아니라 오류·재시도', () => {
    expect(tab).toMatch(/myPosters\.length === 0 && loadError \? \(\s*\/\/[^\n]*\n\s*<LoadErrorCard error=\{loadError\}/);
    expect(vm).toMatch(/<MyPostersTabM schedules=\{schedules\} loadError=\{schedulesError\} onRetry=\{onRetrySchedules\}/);
    expect(app).toMatch(/schedulesError=\{schedulesError\}\s*onRetrySchedules=\{retrySchedulesCb\}\s*onOpenSchedule=\{handleScheduleSelect\}/);
  });
});
