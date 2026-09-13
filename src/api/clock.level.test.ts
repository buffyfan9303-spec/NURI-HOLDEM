// 클락 자동 전진 / 표시 보정 테스트 — 2026-07 'TV 00:00 얼음' 사건.
//
// 왜 값으로 못 박나: 레벨 전진은 화면이 안 보일 때 일어나므로 눈으로 검증할 수 없고,
//   여러 기기(클락 화면 + 장부 리모컨)가 동시에 계산해도 같은 값이 나와야 한다는 성질(멱등)이
//   코드만 봐선 드러나지 않는다. 이 성질이 깨지면 두 기기가 서로를 덮어쓰며 시간이 늘어난다.
//
// 실행: npx vitest run src/api/clock.level.test.ts
import { describe, it, expect } from 'vitest';
import { defaultClockConfig, effectiveLevel, levelCatchUp, levelMovePatch, type ClockLevel, type ClockState } from './clock';

const L = (minutes: number, kind: 'level' | 'break' = 'level'): ClockLevel => ({ kind, sb: 100, bb: 200, ante: 200, minutes });
// L1 20분 · L2 20분 · BREAK 8분 · L3 20분 (총 68분)
const LEVELS = [L(20), L(20), L(8, 'break'), L(20)];
const T0 = Date.parse('2026-07-26T12:00:00.000Z');
const MIN = 60_000;

function st(over: Partial<ClockState> = {}): ClockState {
  return {
    venueId: 'v', gameSeq: 1, sessionDate: null, title: 't',
    config: { ...defaultClockConfig(), levels: LEVELS },
    currentIndex: 0, running: true,
    endsAt: new Date(T0 + 20 * MIN).toISOString(), remainingMs: 20 * MIN,
    adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
    ...over,
  };
}

describe('levelCatchUp · 경과 전진', () => {
  it('경계 전이면 아무것도 하지 않는다', () => {
    expect(levelCatchUp(st(), T0 + 10 * MIN)).toBeNull();
  });

  it('일시정지 중엔 전진하지 않는다', () => {
    expect(levelCatchUp(st({ running: false, endsAt: null }), T0 + 999 * MIN)).toBeNull();
  });

  it('1레벨 경과 · endsAt 은 절대시각으로 누적된다(now 로 리셋하지 않는다)', () => {
    const cu = levelCatchUp(st(), T0 + 20 * MIN + 1000)!;
    expect(cu.advanced).toBe(1);
    expect(cu.toIndex).toBe(1);
    expect(cu.finished).toBe(false);
    expect(Date.parse(cu.patch.endsAt as string)).toBe(T0 + 40 * MIN); // ← 20분 전체가 아니라 스케줄 유지
    expect(cu.patch.remainingMs).toBe(20 * MIN - 1000);
  });

  it('3레벨이 밀려 있으면 한 번에 따라잡는다(브레이크 포함)', () => {
    const cu = levelCatchUp(st(), T0 + 50 * MIN)!;
    expect(cu.advanced).toBe(3);
    expect(cu.toIndex).toBe(3);
    expect(Date.parse(cu.patch.endsAt as string)).toBe(T0 + 68 * MIN);
    expect(cu.patch.remainingMs).toBe(18 * MIN);
  });

  it('멱등 · 계산 시각이 달라도 같은 행이면 endsAt/인덱스가 같다(기기 경합 안전)', () => {
    const a = levelCatchUp(st(), T0 + 50 * MIN)!;
    const b = levelCatchUp(st(), T0 + 50 * MIN + 700)!; // 다른 기기가 0.7초 늦게 계산
    expect(a.patch.endsAt).toBe(b.patch.endsAt);
    expect(a.patch.currentIndex).toBe(b.patch.currentIndex);
  });

  it('마지막 레벨을 넘기면 종료 처리하고 더 전진하지 않는다(무한 전진 금지)', () => {
    const cu = levelCatchUp(st(), T0 + 70 * MIN)!;
    expect(cu.finished).toBe(true);
    expect(cu.patch).toMatchObject({ currentIndex: 3, running: false, remainingMs: 0, endsAt: null });
    // 이미 마지막 레벨에서 시간이 지난 행도 종료로만 수렴한다
    const again = levelCatchUp(st({ currentIndex: 3, endsAt: new Date(T0 + 68 * MIN).toISOString() }), T0 + 999 * MIN)!;
    expect(again.finished).toBe(true);
    expect(again.patch.currentIndex).toBe(3);
  });

  it('minutes=0 레벨이 섞여도 루프가 끝난다', () => {
    const s = st({ config: { ...defaultClockConfig(), levels: [L(20), L(0), L(0), L(20)] } });
    const cu = levelCatchUp(s, T0 + 21 * MIN)!;
    expect(cu.toIndex).toBe(3);
  });
});

describe('effectiveLevel · 표시 보정(쓰기 없음)', () => {
  it('안 밀렸으면 그대로', () => {
    const e = effectiveLevel(st(), T0 + 5 * MIN);
    expect(e).toMatchObject({ index: 0, drifted: false });
    expect(e.remainingMs).toBe(15 * MIN);
  });

  it('밀렸으면 실효 레벨과 실제 잔여시간을 돌려준다. 00:00 에 얼지 않는다', () => {
    const e = effectiveLevel(st(), T0 + 50 * MIN);
    expect(e).toMatchObject({ index: 3, drifted: true });
    expect(e.remainingMs).toBe(18 * MIN);
  });

  it('마지막 레벨에서 멈추고 잔여는 0 으로 클램프된다', () => {
    const e = effectiveLevel(st(), T0 + 999 * MIN);
    expect(e.index).toBe(3);
    expect(e.remainingMs).toBe(0);
  });

  it('일시정지면 저장된 remainingMs 를 그대로 쓴다', () => {
    const e = effectiveLevel(st({ running: false, endsAt: null, currentIndex: 1, remainingMs: 7 * MIN }), T0 + 999 * MIN);
    expect(e).toMatchObject({ index: 1, remainingMs: 7 * MIN, drifted: false });
  });
});

// ── 리모컨 계약 — STOP·레벨 이동은 effectiveLevel 의 인덱스를 써야 한다(C03, 2026-09-12) ──
//
// 재현: ClockRemote 의 표시는 effectiveLevel(state) 인데, STOP 은 remainingMs 만 패치하고
//   currentIndex 는 raw state.currentIndex 그대로 두었고, moveLevel 도 raw state.currentIndex 를
//   levelMovePatch 에 넘겼다. levelMovePatch 의 계약(위 주석, api/clock.ts:209)은 스스로
//   "fromIndex 는 실효 인덱스를 넘긴다"고 적어 뒀는데 호출부가 그 계약을 어긴 것이다.
//   드리프트(endsAt 경과, 아직 아무도 DB를 전진시키지 못한 상태)에서 이 어긋남이 실제 사고로 번진다.
describe('리모컨 계약 · effectiveLevel 인덱스로 커밋해야 한다(C03)', () => {
  it('드리프트 상태에서 raw currentIndex 로 레벨 이동하면 엉뚱한 레벨을 기준으로 움직인다', () => {
    // 1레벨(idx0)에서 시작해 50분 지남 → 실효 레벨은 idx3(레벨3), raw currentIndex 는 여전히 0
    const s = st({ currentIndex: 0, endsAt: new Date(T0 + 20 * MIN).toISOString() });
    const eff = effectiveLevel(s, T0 + 50 * MIN);
    expect(eff.index).toBe(3); // 드리프트 확정(사전 조건)

    // '이전 레벨' 버튼(delta=-1) — raw(0)는 이미 첫 레벨이라 착각해 아무 일도 안 하지만,
    // 실제로는 3레벨을 뛰고 있으므로 '이전'을 누르면 브레이크(idx2)로 가야 정상이다.
    const buggy = levelMovePatch(s, s.currentIndex, -1, T0 + 50 * MIN); // 옛 호출부: raw
    const fixed = levelMovePatch(s, eff.index, -1, T0 + 50 * MIN);      // 새 호출부: 실효

    expect(buggy).toBeNull();              // 사고: 첫 레벨로 오판해 버튼이 죽은 것처럼 보인다
    expect(fixed?.currentIndex).toBe(2);   // 실효 레벨(3) 기준 '이전' = 브레이크(2) — 정상 동작
  });

  it('STOP 은 같은 now·같은 실효 인덱스로 currentIndex·remainingMs 를 함께 커밋해야 정합이 맞는다', () => {
    const s = st({ currentIndex: 0, endsAt: new Date(T0 + 20 * MIN).toISOString() });
    const nowMs = T0 + 50 * MIN;
    const eff = effectiveLevel(s, nowMs);

    // 고친 계약: STOP 패치는 { currentIndex: eff.index, remainingMs: eff.remainingMs, running:false, endsAt:null }
    const fixedPatch = { currentIndex: eff.index, remainingMs: eff.remainingMs, running: false, endsAt: null };
    const lvAtFixed = LEVELS[fixedPatch.currentIndex];
    expect(fixedPatch.remainingMs).toBeLessThanOrEqual(lvAtFixed.minutes * MIN); // 정합: 그 레벨 전체 길이를 넘지 않는다

    // 옛 버그: currentIndex 는 그대로 두고 remainingMs 만 patch(실효 잔여시간을 씀)
    const buggyPatch = { currentIndex: s.currentIndex, remainingMs: eff.remainingMs, running: false, endsAt: null };
    const lvAtBuggy = LEVELS[buggyPatch.currentIndex];
    // 레벨0(20분)에 레벨3의 잔여시간(18분)을 넣는 자체는 20분보다 작아 겉보기엔 통과하지만,
    // '레벨1인데 실제로는 3레벨을 뛰던 시간'이라는 불일치가 핵심 — 인덱스가 실효 레벨과 다르다는 것 자체가 결함.
    expect(buggyPatch.currentIndex).not.toBe(eff.index);
    expect(fixedPatch.currentIndex).toBe(eff.index);
    void lvAtBuggy;
  });

  it('브레이크 구간에서 드리프트해도 실효 인덱스를 넘기면 브레이크 레벨을 기준으로 이동한다', () => {
    // L1(20) L2(20) BREAK(8) L3(20) — 41분 경과면 실효 인덱스는 BREAK(idx2)
    const s = st({ currentIndex: 0, endsAt: new Date(T0 + 20 * MIN).toISOString() });
    const nowMs = T0 + 41 * MIN;
    const eff = effectiveLevel(s, nowMs);
    expect(eff.index).toBe(2); // 브레이크

    const fixed = levelMovePatch(s, eff.index, +1, nowMs)!;
    expect(fixed.currentIndex).toBe(3); // 브레이크 다음 = 레벨3
  });

  it('마지막 레벨에서는 실효 인덱스를 넘겨도 더 전진하지 않는다(clamp 유지)', () => {
    const s = st({ currentIndex: 3, running: false, endsAt: null, remainingMs: 5 * MIN });
    const eff = effectiveLevel(s, T0);
    expect(eff.index).toBe(3);
    expect(levelMovePatch(s, eff.index, +1, T0)).toBeNull();
  });

  it('일시정지 중엔 드리프트가 없으므로 raw·실효 인덱스가 항상 같다(회귀 없음 확인)', () => {
    const s = st({ running: false, endsAt: null, currentIndex: 2, remainingMs: 3 * MIN });
    const eff = effectiveLevel(s, T0 + 999 * MIN);
    expect(eff.index).toBe(s.currentIndex);
  });
});
