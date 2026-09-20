// 🔴 2026-09-20 (R1-A) — 일정 구독과 복귀 재조회가 **홈·캘린더를 포함**한다.
//
// 왜 소스 계약인가: 웹소켓이 실제로 붙었는지는 이 저장소의 E2E 하네스에서 결정적으로 재현하기
// 어렵다(운영 Realtime 에 의존). 그래서 '어떤 탭에서 구독을 열기로 했나' 라는 **결정**을 여기서 잠그고,
// 실제 재조회 동작은 `e2e/home-calendar-refresh.spec.ts` 가 브라우저에서 잰다. 둘이 짝이다.
//
// 배경: 홈(HomeTab 의 오늘·내일 목록)과 캘린더(CalendarPanel)는 같은 `schedules` 를 그리는데
// 구독 조건에서 빠져 있었다. 손님이 그 탭을 열어 둔 채로는 승인된 포스터가 안 나타났다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('일정 구독·복귀 재조회가 홈·캘린더를 포함한다', () => {
  const cond = /const wantScheduleRealtime =([\s\S]*?);/.exec(src)?.[1] ?? '';

  it('wantScheduleRealtime 조건이 실제로 있다(이름이 바뀌면 아래가 공짜로 통과한다)', () => {
    expect(cond, 'wantScheduleRealtime 을 못 찾았다 — 이 계약이 통째로 빈 검사가 됐다').not.toBe('');
  });

  it.each(['home', 'browse', 'live', 'calendar', 'my-store', 'admin'])(
    "구독 조건에 '%s' 탭이 있다", (tab) => {
      expect(cond, `일정을 그리는 '${tab}' 탭이 구독 조건에서 빠졌다 — 그 탭에서는 실시간 갱신이 통째로 죽는다`)
        .toContain(`'${tab}'`);
    },
  );

  it('복귀 재조회(useVisibilityRefresh)의 home 분기가 일정을 다시 읽는다', () => {
    const home = /case 'home':([\s\S]*?)break;/.exec(src)?.[1] ?? '';
    expect(home, "case 'home' 을 못 찾았다").not.toBe('');
    expect(home, "복귀 시 home 이 배너만 갱신하고 일정은 안 읽는다").toMatch(/reloadSchedules\(\)/);
  });

  it('복귀 재조회에 calendar 분기가 있고 일정을 다시 읽는다', () => {
    const cal = /case 'calendar':([\s\S]*?)break;/.exec(src)?.[1] ?? '';
    expect(cal, "case 'calendar' 가 아예 없다 — default 로 빠져 아무것도 안 한다").not.toBe('');
    expect(cal, "calendar 복귀가 일정을 안 읽는다").toMatch(/reloadSchedules\(\)/);
  });

  it('이벤트 폭주 방지(700ms 디바운스)는 그대로 있다 — 구독을 넓히면서 이건 지켜야 한다', () => {
    expect(src, '디바운스가 사라졌다 — 탭 두 개를 더 붙였으니 더더욱 필요하다')
      .toMatch(/setTimeout\(reloadSchedules,\s*700\)/);
  });
});
