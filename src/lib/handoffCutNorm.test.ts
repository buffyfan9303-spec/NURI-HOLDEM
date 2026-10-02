// 2026-10-03 L-3 — tab-handoff-gate 의 '한 프레임 컷' 판정이 프레임 간격에 따라 달라지던 것을 정규화한다(e2e/_cutNorm.ts).
// 실제 빌드 증거(예전 컷 결함 빌드 9433f190 FAIL · main PASS · 프레임을 하나씩 건너뛴 합성 PASS)는 보고의 실행 기록이고,
// 여기서는 같은 성질을 합성 프레임열로 못 박는다.
// 음성 대조: normalizedCut 의 `onset === undefined` 분기를 정규화 쪽으로 돌리면 ③이, stepScale 의 상한 분기를 지우면 ④가,
//            정규화 자체를 지우고 원값만 쓰면 ②가, `f.t + FRAME_MS >= onset` 조건을 지우면 ⑤가 빨개진다.
import { describe, it, expect } from 'vitest';
import { normalizedCut, stepScale, FRAME_MS } from '../../e2e/_cutNorm';

type F = { t: number; v: number };
const d = (a: F, b: F) => Math.abs(b.v - a.v);
/** 누적값 v 의 프레임열 — 간격 gap(ms)로 만든다 */
const seq = (vs: number[], gap: number, t0 = 0): F[] => vs.map((v, i) => ({ t: t0 + (i + 1) * gap, v }));
const PRE: F = { t: -200, v: 0 };
// 로컬 16.7ms 에서 본 페이드 — 걸음 0.5·1.5·2.5·4·4·2·1(최대 4, 보고서 L-3 의 3.9 와 같은 모양), 누적 값으로 적는다
const FADE = [0.5, 2, 4.5, 8.5, 12.5, 14.5, 15.5];
const THIN = [FADE[1], FADE[3], FADE[5]]; // 같은 페이드를 하나 건너뛰어 찍은 것(≈34ms) — 걸음 6.5·6.0

describe('tab-handoff 컷 정규화', () => {
  it('① 로컬 간격(16.7ms): 정규화는 값을 바꾸지 않는다(최대 걸음 4)', () => {
    expect(normalizedCut(PRE, seq(FADE, FRAME_MS), d, 0)).toBeCloseTo(4, 5);
  });

  it('② 같은 페이드를 건너뛰어 찍으면(≈34ms) 원값은 6 을 넘지만 정규화하면 6 이하 — 기준 6 은 그대로', () => {
    const post = seq(THIN, 2 * FRAME_MS);
    const raw = Math.max(d(post[0], post[1]), d(post[1], post[2]));
    expect(raw).toBeGreaterThan(6);
    expect(normalizedCut(PRE, post, d, 0)).toBeLessThanOrEqual(6);
  });

  it('③ 떠나는 판이 안 섰으면(onset 없음 = 즉시 교체) 원값 그대로 — 첫 쌍이 가까워도 나누지 않는다', () => {
    expect(normalizedCut({ t: 0, v: 0 }, [{ t: 2 * FRAME_MS, v: 11 }], d)).toBe(11);
    expect(normalizedCut(PRE, [{ t: 150, v: 12 }, { t: 166, v: 12.5 }], d)).toBe(12);
  });

  it('④ 50ms 넘게 멈췄다 튄 점프(120ms 간격에 12)는 러너 속도로 보지 않고 그대로 센다', () => {
    const post: F[] = [{ t: 17, v: 1 }, { t: 33, v: 2 }, { t: 153, v: 14 }];
    expect(normalizedCut(PRE, post, d, 0)).toBeGreaterThan(6);
  });

  it('⑤ 전환이 시작되기 전의 변화(첫 방문 때 늦게 도착한 목록 — 로컬 ④#0 의 6.2)는 컷이 아니다. 시작 뒤의 컷은 잡는다', () => {
    const late: F = { t: 659, v: 6.2 };          // onset(770ms) 보다 110ms 앞
    const fade = [{ t: 784, v: 6.3 }, { t: 800, v: 7 }, { t: 817, v: 9 }];
    expect(normalizedCut(PRE, [late, ...fade], d, 770)).toBeLessThan(3);
    expect(normalizedCut(PRE, [late, ...fade], d)).toBeGreaterThan(6); // onset 을 모르면(= 옛 판정) 6.2 가 컷으로 읽힌다
    // 시작 뒤에 한 번에 12 가 바뀌면 여전히 컷
    expect(normalizedCut(PRE, [late, { t: 784, v: 18.2 }], d, 770)).toBeGreaterThan(6);
  });

  it('⑥ 간격은 정지 화면의 대기가 아니라 onset 부터 잰다 — 시작 직후 한 프레임(17ms) 안의 12 는 그대로 12', () => {
    expect(normalizedCut({ t: 0, v: 0 }, [{ t: 787, v: 12 }], d, 775)).toBe(12);
  });

  it('배율 규칙 — 1프레임 미만은 1, 2프레임은 2, 3프레임 초과는 1', () => {
    expect(stepScale(8)).toBe(1);
    expect(stepScale(2 * FRAME_MS)).toBeCloseTo(2, 5);
    expect(stepScale(3 * FRAME_MS)).toBeCloseTo(3, 5);
    expect(stepScale(3 * FRAME_MS + 1)).toBe(1);
  });
});
