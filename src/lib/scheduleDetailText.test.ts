// KW-3(2026-09-30) — 일정 상세·카드 표시 계층. 입력은 운영 시드 12건(d0e20929-5eed-…)의 실제 모양이다.
import { describe, it, expect } from 'vitest';
import { startChips, reentryText, reentrySummary, chipShort, reentryPriceWon, breakText } from './scheduleDetailText';
import { titleWithoutGtd } from '../components/features/ScheduleCard';

const s = (buyIn: Record<string, unknown>, structure?: Record<string, unknown>) =>
  ({ buyIn: { amount: 0, ...buyIn }, structure }) as Parameters<typeof reentryText>[0];

describe('W-17 스타팅 칩 — 폼은 buy_in 에 저장한다', () => {
  it('buy_in.startStack 만 있어도 읽는다(폼 신규 포스터)', () => expect(startChips(s({ startStack: 50000 }, { levels: [] }))).toBe(50000));
  it('structure 만 있는 옛 포스터도 그대로', () => expect(startChips(s({}, { startingChips: 30000 }))).toBe(30000));
  it('둘 다 없으면 undefined(→ 현장 안내)', () => expect(startChips(s({}))).toBeUndefined());
});

describe('리엔트리 = 스택(오너 2026-09-30) · W-23 미입력 단정 금지', () => {
  it('부스터데이: 스택 50,000 · 한도 미입력이면 한도 문구 없음', () =>
    expect(reentryText(s({ amount: 100000, rebuy: 100000, rebuyStack: 50000 }))).toBe('50,000'));
  it('한도가 있으면 · 최대 N회', () => expect(reentryText(s({ rebuyStack: 70000, rebuyLimit: 3 }))).toBe('70,000 · 최대 3회'));
  it('계단 스택 → 화살표', () => expect(reentryText(s({ rebuyStack: 50000, rebuyStacks: [70000, 80000] }))).toBe('70,000 → 80,000'));
  it('연속 같은 값은 한 번만', () => expect(reentryText(s({ rebuyStacks: [70000, 70000, 80000] }))).toBe('70,000 → 80,000'));
  it('계단 + 한도', () => expect(reentryText(s({ rebuyStacks: [70000, 80000], rebuyLimit: 2 }))).toBe('70,000 → 80,000 · 최대 2회'));
  it('빈 배열이면 단일값으로', () => expect(reentryText(s({ rebuyStack: 60000, rebuyStacks: [] }))).toBe('60,000'));
  it('빈 배열 + 단일값 없음 → 현장 안내', () => expect(reentryText(s({ rebuyStacks: [] }))).toBe('현장 안내'));
  it('루나(리바인 표기 없음) → 현장 안내, 프리즈아웃 아님', () => expect(reentryText(s({ amount: 30000 }))).toBe('현장 안내'));
  it('업주가 게임 종류에 프리즈아웃이라 적었을 때만 프리즈아웃', () =>
    expect(reentryText(s({ amount: 30000, gameType: '프리즈아웃' }))).toBe('프리즈아웃'));
  it('어떤 입력에도 무제한을 지어내지 않는다', () => {
    for (const b of [{ rebuy: 100000 }, { rebuy: 100000, rebuyStack: 70000 }, {}]) expect(reentryText(s(b))).not.toMatch(/무제한/);
  });
});

describe('요약 칸 — 한 줄에 들어가는 길이만(3개 이상은 첫 → 마지막 + 단계 수), 한도는 보조 줄', () => {
  it('2단계 이하는 전부', () => expect(reentrySummary(s({ rebuyStacks: [70000, 80000] }))).toEqual({ value: '70K → 80K', sub: undefined }));
  it('3단계 이상은 첫 → 마지막 + 단계 수(중복은 먼저 접는다)', () =>
    expect(reentrySummary(s({ rebuyStacks: [70000, 70000, 80000, 90000, 100000] }))).toEqual({ value: '70K → 100K', sub: '4단계' }));
  it('한도는 값이 아니라 보조 줄로', () => {
    expect(reentrySummary(s({ rebuyStacks: [70000, 80000, 90000, 100000], rebuyLimit: 3 }))).toEqual({ value: '70K → 100K', sub: '4단계 · 최대 3회' });
    expect(reentrySummary(s({ rebuyStack: 70000, rebuyLimit: 3 }))).toEqual({ value: '70,000', sub: '최대 3회' });
  });
  it('화살표 값은 값이 바뀌지 않을 때만 K/M — 320 에서 넘치던 백만 단위', () => {
    expect(reentrySummary(s({ rebuyStacks: [1000000, 1500000] })).value).toBe('1M → 1.5M');
    expect(reentrySummary(s({ rebuyStacks: [72555, 100000] })).value).toBe('72,555 → 100K');
    expect(reentrySummary(s({ rebuyStack: 1000000 })).value).toBe('1,000,000');
  });
  it('chipShort 는 반올림하지 않는다', () => {
    expect([999, 1000, 1500, 12345, 12350, 1250000, 1234567].map(chipShort)).toEqual(['999', '1K', '1.5K', '12,345', '12.35K', '1.25M', '1,234,567']);
  });
  it('스택이 없으면 종전 문구', () => expect(reentrySummary(s({ amount: 30000 }))).toEqual({ value: '현장 안내' }));
  it('전체 계단은 reentryText(게임 정보 행)가 그대로', () =>
    expect(reentryText(s({ rebuyStacks: [70000, 80000, 90000, 100000], rebuyLimit: 3 }))).toBe('70,000 → 80,000 → 90,000 → 100,000 · 최대 3회'));
});

describe('리엔트리 가격은 없애지 않는다 — 참가비와 다를 때만', () => {
  it('같으면 null', () => expect(reentryPriceWon(s({ amount: 100000, rebuy: 100000 }))).toBeNull());
  it('다르면 값', () => expect(reentryPriceWon(s({ amount: 100000, rebuy: 70000 }))).toBe(70000));
});

describe('W-15 브레이크 원문', () => {
  it('원문에 시간이 있으면 원문 그대로', () => {
    expect(breakText('DINNER BREAK 20MIN 100 Chips Remove', 20)).toBe('DINNER BREAK 20MIN 100 Chips Remove');
    expect(breakText('BREAK TIME 8MINS / 100칩 레이스', 8)).toBe('BREAK TIME 8MINS / 100칩 레이스');
  });
  it("원문에 시간이 없으면 분을 붙인다('100칩'의 10 에 속지 않는다)", () => expect(breakText('100칩 레이스', 10)).toBe('100칩 레이스 · 10분'));
  it('원문 없으면 종전 문구', () => expect(breakText(undefined, 8)).toBe('BREAK · 8분'));
});

describe('W-24 카드 제목 GTD 떼기 — 뜻이 끊기면 원문', () => {
  it('퀸 2,410만 GTD → 원문', () => expect(titleWithoutGtd('퀸 2,410만 GTD', true)).toBe('퀸 2,410만 GTD'));
  it('3만에 1200GTD → 원문', () => expect(titleWithoutGtd('3만에 1200GTD', true)).toBe('3만에 1200GTD'));
  it('위클리 1000만GTD → 위클리(오너 2026-09-18 규칙 유지)', () => expect(titleWithoutGtd('위클리 1000만GTD', true)).toBe('위클리'));
  it('금액 칸이 없으면 떼지 않는다', () => expect(titleWithoutGtd('위클리 1000만GTD', false)).toBe('위클리 1000만GTD'));
});
