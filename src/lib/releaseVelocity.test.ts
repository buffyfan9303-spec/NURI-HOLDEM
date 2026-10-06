// releaseVelocity — 손 뗀 시각까지 넣어야 '멈췄다 놓기' 가 속도 0 이 된다(PR #189 검토 P3-1, 2026-10-06).
// 음성 대조: spring.ts 의 releaseAt 한 줄(샘플 덧붙이기)을 빼면 '멈췄다 놓기' 가 500px/s 로 나와 실패한다.
import { describe, expect, it } from 'vitest';
import { releaseVelocity, project } from './spring';

// 60px 를 15px × 4 단계(30ms 간격)로 끈 샘플 — 0ms 에 0, 30ms 마다 +15
const pull60 = [0, 1, 2, 3, 4].map((i) => ({ t: 1000 + i * 30, y: i * 15 }));

describe('releaseVelocity', () => {
  it('움직이다 바로 놓으면 그 속도(≈500px/s)', () => {
    const v = releaseVelocity(pull60, 1120 + 4);
    expect(v).toBeGreaterThan(400);
    expect(60 + project(v)).toBeGreaterThan(120); // Modal/EventList 의 닫힘 판정 — 던지기
  });
  it('250ms 멈췄다 놓으면 0 — 제자리로 돌아갈 판정', () => {
    const v = releaseVelocity(pull60, 1120 + 250);
    expect(v).toBe(0);
    expect(60 + project(v)).toBeLessThanOrEqual(120);
  });
  it('releaseAt 이 없거나 마지막 샘플보다 이르면 종전과 같다', () => {
    expect(releaseVelocity(pull60)).toBe(releaseVelocity(pull60, 1000));
    expect(releaseVelocity(pull60)).toBe(500);
  });
  it('입력 배열을 바꾸지 않는다', () => {
    const s = pull60.map((p) => ({ ...p }));
    releaseVelocity(s, 2000);
    expect(s).toEqual(pull60);
  });
});
