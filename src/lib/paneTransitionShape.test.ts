// S6 회귀 게이트(e2e/mystore-transition-cls.spec.ts)가 쓰는 오르내림 검출기의 합성 대조.
// 리드 요청(2026-09-19): "손으로 검토했다"로 끝내면 다음 사람에게 안 남는다 — 순수 함수라
// 브라우저·리빌드 없이 이 테스트가 더 결정적이다. 세 케이스가 이 함수의 존재 이유 그 자체다.
import { describe, it, expect } from 'vitest';
import { findOscillation, settleAt, OSCILLATION_EPS_PX, type HeightSample } from './paneTransitionShape';

describe('findOscillation', () => {
  it('옛 버그 시계열(906→줄었다가→1022→줄었다가→3229, 실제 오르내림) — 걸린다', () => {
    const heights: HeightSample[] = [
      { t: 0, h: 906 }, { t: 26, h: 700 },   // 빈 판으로 붕괴(감소)
      { t: 52, h: 1022 },                     // 다음 파도로 다시 성장(증가) — 여기서 오르내림 확정
      { t: 90, h: 800 },                      // 또 붕괴
      { t: 114, h: 3229 }, { t: 363, h: 3585 },
    ];
    const r = findOscillation(heights);
    expect(r, '옛 버그 패턴을 오르내림으로 못 잡았다').not.toBeNull();
  });

  it("오늘의 정상 시계열(1082 고정 → 753 한 번 하강, 더 짧은 목적지로 정착) — 안 걸린다", () => {
    // 실측(2026-09-19, e2e/mystore-transition-cls.spec.ts B 진단): 1082.03 고정 → t=1247ms 753.84 로
    // 뚝 떨어지고 그 뒤 안 변함 — 예약이 풀리며 원래 더 짧은 목적지에 정착하는 것뿐, 오르내림이 아니다.
    const heights: HeightSample[] = [
      { t: 3, h: 1082.03 }, { t: 400, h: 1082.03 }, { t: 900, h: 1082.03 },
      { t: 1247, h: 753.84 }, { t: 1600, h: 753.84 },
    ];
    expect(findOscillation(heights)).toBeNull();
  });

  it('성장 꼬리 지터(3381.4→3365.5, −16px) — 24px 임계값 아래라 안 걸린다', () => {
    // 실측(모바일 매장 설정, t=371ms): 3000px대 성장이 끝난 뒤 폰트 메트릭 재계산 등으로 보이는
    // 16px 흔들림 — 1px 임계값으로는 '오르내림'으로 오탐했다. 이 케이스가 24px 로 올린 근거다.
    const heights: HeightSample[] = [
      { t: 0, h: 105 }, { t: 121, h: 540 }, { t: 170, h: 2747 }, { t: 350, h: 3381.40625 },
      { t: 371, h: 3365.46875 },
    ];
    expect(findOscillation(heights)).toBeNull();
  });

  it('같은 16px 지터도 임계값을 1px 로 낮추면 오르내림으로 잡힌다(24px 근거를 반증으로 재확인)', () => {
    const heights: HeightSample[] = [{ t: 0, h: 3381.40625 }, { t: 1, h: 3365.46875 }, { t: 2, h: 3400 }];
    expect(findOscillation(heights, 1)).not.toBeNull();
    expect(findOscillation(heights, OSCILLATION_EPS_PX)).toBeNull();
  });
});

describe('settleAt', () => {
  it('마지막으로 24px 이상 바뀐 시각을 돌려준다(꼬리 지터는 무시)', () => {
    const heights: HeightSample[] = [
      { t: 3, h: 1082.03 }, { t: 1247, h: 753.84 }, { t: 1260, h: 753.84 + 5 }, // 5px 는 지터 취급
    ];
    expect(settleAt(heights)).toBe(1247);
  });
});
