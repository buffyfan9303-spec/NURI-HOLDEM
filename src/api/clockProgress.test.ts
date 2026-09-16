// clockHasProgress — [시작]이 진행 중인 대회를 덮어쓰기 전에 묻는 판정.
//
// 왜 테스트가 필요한가: 이건 **되돌릴 수 없는 데이터 소실**을 막는 유일한 가드다.
// 예전 가드는 `existing?.running` 뿐이어서 **일시정지된 대회**(running=false)를 못 잡았고,
// [시작]이 레벨·엔트리·탈락을 통째로 0 으로 만들었다.
//
// ⚠ 음성 대조가 핵심이다: '갓 만든 클락' 은 반드시 false 여야 한다.
//    전부 true 를 돌려주는 고장난 판정기도 "일시정지 대회를 잡는다" 는 테스트는 통과한다.
import { describe, it, expect } from 'vitest';
import { clockHasProgress, emptyClockState, defaultClockConfig, type ClockState } from './clock';

const VENUE = '00000000-0000-0000-0000-000000000001';
const fresh = (): ClockState => emptyClockState(VENUE, defaultClockConfig(), 1);

describe('clockHasProgress', () => {
  // ── 음성 대조 — 여기서 true 가 나오면 [시작]이 항상 경고를 띄워 쓸모없어진다 ──
  it('갓 만든 클락은 진행 이력이 없다', () => {
    expect(clockHasProgress(fresh())).toBe(false);
  });

  it('클락이 아예 없으면(null/undefined) 진행 이력이 없다', () => {
    expect(clockHasProgress(null)).toBe(false);
    expect(clockHasProgress(undefined)).toBe(false);
  });

  // ── 양성: 예전 가드도 잡던 것 ──
  it('진행 중이면 잡는다', () => {
    expect(clockHasProgress({ ...fresh(), running: true })).toBe(true);
  });

  // ── 양성: 예전 가드가 **놓치던 것들** (running=false 인데 진행 이력이 있다) ──
  it('일시정지된 대회 — 레벨이 올라가 있으면 잡는다', () => {
    expect(clockHasProgress({ ...fresh(), running: false, currentIndex: 6 })).toBe(true);
  });

  it('일시정지된 대회 — 탈락자가 있으면 잡는다', () => {
    expect(clockHasProgress({ ...fresh(), running: false, eliminations: 12 })).toBe(true);
  });

  it('일시정지된 대회 — 수기 보정(엔트리·리바이·얼리·애드온)이 있으면 잡는다', () => {
    for (const k of ['adjEntries', 'adjRebuys', 'adjEarlies', 'adjAddons'] as const) {
      expect(clockHasProgress({ ...fresh(), running: false, [k]: 3 })).toBe(true);
      // 음수 보정도 진행 이력이다(0 이 아니면 누군가 손댔다)
      expect(clockHasProgress({ ...fresh(), running: false, [k]: -1 })).toBe(true);
    }
  });

  it('레벨 0 에서 몇 분만 흘러도 잡는다 — 시간만 줄어든 경우', () => {
    const s = fresh();
    expect(clockHasProgress({ ...s, remainingMs: s.remainingMs - 60_000 })).toBe(true);
  });

  it('endsAt 이 남아 있으면 잡는다 — 정지 직후 잔여 상태', () => {
    expect(clockHasProgress({ ...fresh(), running: false, endsAt: '2026-09-17T12:00:00.000Z' })).toBe(true);
  });

  // ── 경계: config 가 비어도 터지지 않고, 기본 20분을 기준으로 판정한다 ──
  it('config.levels 가 비어 있으면 기본 20분을 기준으로 본다', () => {
    const s = { ...fresh(), config: { ...defaultClockConfig(), levels: [] } };
    expect(clockHasProgress({ ...s, remainingMs: 20 * 60_000 })).toBe(false);
    expect(clockHasProgress({ ...s, remainingMs: 19 * 60_000 })).toBe(true);
  });

  // ── 첫 레벨 길이가 기본과 다른 프리셋에서도 음성 대조가 성립해야 한다 ──
  it('첫 레벨이 30분인 프리셋에서도 갓 만든 클락은 false', () => {
    const cfg = defaultClockConfig();
    const long = { ...cfg, levels: cfg.levels.map((l, i) => (i === 0 ? { ...l, minutes: 30 } : l)) };
    const s = emptyClockState(VENUE, long, 1);
    expect(s.remainingMs).toBe(30 * 60_000);
    expect(clockHasProgress(s)).toBe(false);
    expect(clockHasProgress({ ...s, remainingMs: 29 * 60_000 })).toBe(true);
  });
});
