import { describe, it, expect } from 'vitest';
import { nextChangeAt, kstMonthDay, cooldownNotice } from './nicknameCooldown';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-24T03:00:00Z'); // KST 9/24 12:00

describe('nextChangeAt — 서버 식(관리자 면제 · 기록 없음=가능 · +30일)의 미러', () => {
  it('기록이 없으면(첫 변경) 바로 가능', () => {
    expect(nextChangeAt(undefined, false, T0)).toBeNull();
    expect(nextChangeAt(null, false, T0)).toBeNull();
  });
  it('30일 안이면 막히고, 막힌 날짜는 기록 + 30일', () => {
    const at = new Date(T0 - 10 * DAY).toISOString();
    expect(nextChangeAt(at, false, T0)).toBe(T0 + 20 * DAY);
  });
  it('30일이 지나면 가능 — 경계 포함', () => {
    expect(nextChangeAt(new Date(T0 - 30 * DAY).toISOString(), false, T0)).toBeNull();
    expect(nextChangeAt(new Date(T0 - 30 * DAY + 1).toISOString(), false, T0)).toBe(T0 + 1);
  });
  it('관리자는 면제', () => {
    expect(nextChangeAt(new Date(T0).toISOString(), true, T0)).toBeNull();
  });
  it('깨진 값은 막지 않는다(서버가 최종 판정)', () => {
    expect(nextChangeAt('not-a-date', false, T0)).toBeNull();
  });
});

describe('kstMonthDay — 로컬이 아니라 KST 날짜', () => {
  it('UTC 15:00 은 KST 다음 날 0시', () => {
    expect(kstMonthDay(Date.parse('2026-10-23T15:00:00Z'))).toBe('10월 24일');
    expect(kstMonthDay(Date.parse('2026-10-23T14:59:59Z'))).toBe('10월 23일');
  });
});

describe('cooldownNotice — 오너 문구', () => {
  it('막힘: 다음 변경 가능 날짜를 붙인다', () => {
    expect(cooldownNotice('닉네임은', Date.parse('2026-10-24T03:00:00Z')))
      .toBe('닉네임은 30일에 한 번 변경할 수 있어요 · 다음 변경 가능: 10월 24일');
  });
  it('가능: 규칙만', () => {
    expect(cooldownNotice('닉네임은', null)).toBe('닉네임은 30일에 한 번 변경할 수 있어요');
  });
});
