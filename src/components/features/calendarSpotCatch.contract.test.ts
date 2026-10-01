// 캘린더는 스팟 조회 실패를 빈 목록으로 받는다(리드 결정 2026-10-01). 동작은 e2e/calendar-spot-fail.spec.ts 가 잠근다.
// 실행: npx vitest run src/components/features/calendarSpotCatch.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CAL = readFileSync('src/components/features/CalendarPanel.tsx', 'utf-8');
const API = readFileSync('src/api/spots.ts', 'utf-8');

describe('listMySpots 호출부 — 실패 처리 계약', () => {
  it('CalendarPanel 은 listMySpots 를 .catch 로 빈 목록 처리해 allSettled 에 넣는다', () => {
    expect(CAL).toMatch(/listMySpots\(100\)\.catch\(\(\): SavedSpot\[\] => \[\]\)/);
  });
  it('listMySpots 자체는 여전히 throw 한다(내 스팟 목록이 실패 문구를 보여 주려면)', () => {
    expect(API).toMatch(/if \(error\) throw error;\s*\n\s*return \(data \?\? \[\]\)\.map\(rowToSaved\)/);
  });
  it('옛 주석("listMySpots 가 삼킨다")이 남아 있지 않다', () => {
    expect(CAL).not.toContain('listMySpots 가 삼킨다');
    expect(API).not.toContain('실패는 무시)');
  });
});
