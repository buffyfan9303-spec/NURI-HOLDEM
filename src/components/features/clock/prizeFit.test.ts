// 프라이즈 2단 규격 판정 — 순수 계산이 **잘림을 구조적으로 막는지** 잠근다 (오너 지시 #13, 2026-09-15).
//
// 왜 이 테스트가 필요한가: 규격을 잘못 고르면 TV 에서 금액이 **잘린다**. 그런데 잘림은 렌더해야 보이고
//   장이 10장이면 마지막 장은 몇 분 뒤에야 화면에 온다 — 사람이 발견하기 가장 어려운 부류다.
//   그래서 판정을 순수 계산으로 뽑아 여기서 전 구간을 단언한다.
//
// ⚠ 처음 쟀을 때 **첫 장(등수 2자리)만** 보고 규격을 정했다가 마지막 장(200등, 3자리)에서 넘쳤다.
//   최악은 `가장 긴 등수 × 가장 긴 금액` 이고, 아래 200등 케이스가 그것을 잠근다.
// ⚠ 2026-09-15 기준 운영에 실상금이 없다(schedules approved=0 · clock_states 프라이즈 최댓값 400).
//   **오픈 후 실제 상금이 들어오면 이 판정이 처음으로 진짜 시험받는다.**
//
// 음성 대조: prizeFit.ts 의 PRIZE_SPECS 순서를 한 단계 어긋나게 하거나 PRIZE_COL_CQ 를 키우면
//   '넘치지 않는다' 단언이 실패한다.
// 실행: npx vitest run src/components/features/clock/prizeFit.test.ts
import { describe, it, expect } from 'vitest';
import {
  PRIZE_COL_CQ, PRIZE_GUTTER_CQ, PRIZE_LEFT_ROWS, PRIZE_ONE_COL_MAX, PRIZES_PER_PAGE, PRIZE_SPECS,
  fitsTwoColumns, pickPrizeLayout, placeWidthFactor, prizePlaceText, prizeRowCq, prizeWorst,
} from './prizeFit';

const table = (places: number, amount: number) =>
  Array.from({ length: places }, (_, i) => ({ place: String(i + 1), amount }));

/** 고른 배치가 실제로 가로 예산 안에 있는가 — 2단이면 두 단, 1단이면 한 단. */
function overflowCq(prizes: { place: string; amount: number }[]): number {
  const { spec, twoCol, worst } = pickPrizeLayout(prizes);
  const lead = prizeRowCq(spec, worst.leadPlaceFactor, worst.amountChars, true);
  const normal = prizeRowCq(spec, worst.placeFactor, worst.amountChars, false);
  const need = twoCol ? Math.max(lead, normal) + normal + PRIZE_GUTTER_CQ : Math.max(lead, normal);
  return Math.round((need - PRIZE_COL_CQ) * 1000) / 1000;
}

describe('프라이즈 2단 규격 — 어떤 상금표에서도 넘치지 않는다', () => {
  // 🔴 리드 조건 ① — 자릿수 4구간 전부
  const BANDS: [number, number, string][] = [
    [7, 1_000_000, '1,000,000'],
    [8, 10_000_000, '10,000,000'],
    [9, 999_999_999, '999,999,999'],
    [10, 1_000_000_000, '1,000,000,000'],
  ];

  it('🔴 자릿수 7·8·9·10 × 등수 규모 전부에서 가로가 넘치지 않는다', () => {
    const log: string[] = [];
    for (const places of [20, 99, 200, 999]) {
      for (const [d, amt, s] of BANDS) {
        const prizes = table(places, amt);
        const L = pickPrizeLayout(prizes);
        const over = overflowCq(prizes);
        log.push(`  최대 ${String(places).padStart(3)}등 · ${d}자리(${s}) → ${L.twoCol ? '2단' : '1단 폴백'} ${L.spec.key.padEnd(7)} 여유 ${(-over).toFixed(2)}cqmin`);
        expect(over, `${places}등 ${d}자리에서 ${over}cqmin 넘쳤다 — TV 에서 금액이 잘린다`).toBeLessThanOrEqual(0);
      }
    }
    console.log('[prize-fit]');
    for (const line of log) console.log(line);
  });

  it('🔴 ≤15줄은 종전 그대로 1단 wide — 픽셀 회귀 0 의 근거', () => {
    // 오늘 한 장에 들어가던 모든 대회가 여기다. 2단으로 바꾸면 글자가 같아도 배치가 변해 화면이 달라진다.
    for (const n of [1, 2, 8, 15]) {
      const L = pickPrizeLayout(table(n, 5_000_000));
      expect(L, `${n}줄이 2단으로 바뀜다 — 회귀다`).toMatchObject({ twoCol: false, spec: { key: 'wide' } });
    }
    // 16줄부터는 오늘 **두 장으로 쪼개지던** 구간이라 픽셀 동일 요구 대상이 아니다 — 여기서 2단이 시작된다.
    expect(pickPrizeLayout(table(16, 5_000_000)).twoCol).toBe(true);
    expect(PRIZE_ONE_COL_MAX).toBe(15);
    // 1단은 열 전체 폭을 쓰므로 15줄 × 10자리 금액에서도 가로가 넘치지 않는다.
    expect(overflowCq(table(15, 1_000_000_000))).toBeLessThanOrEqual(0);
  });

  it('🔴 상용 구간(≤99등 · 7자리)은 축소 0% — wide 2단이다', () => {
    // 이게 (C) 를 고른 이유다. 여기서 wide 가 안 나오면 글자를 키운 의미가 없다.
    expect(pickPrizeLayout(table(20, 1_000_000))).toMatchObject({ twoCol: true, spec: { key: 'wide' } });
    expect(pickPrizeLayout(table(99, 5_000_000))).toMatchObject({ twoCol: true, spec: { key: 'wide' } });
  });

  it('🔴 10자리 + 200등은 1단 20줄로 떨어진다(= 이 변경 이전과 같은 화면)', () => {
    const L = pickPrizeLayout(table(200, 1_000_000_000));
    expect(L.twoCol).toBe(false);
    expect(L.spec.key).toBe('compact');   // 1단 20줄이 세로에 들어가는 유일한 규격
  });

  // 🔴 리드 조건 ③ — 경계값. 콤마 때문에 12자 금액은 존재하지 않는다(11자 → 13자로 건너뛴다).
  it('🔴 경계: 999,999,999(11자)와 1,000,000,000(13자)에서 판정이 갈린다', () => {
    expect((999_999_999).toLocaleString()).toHaveLength(11);
    expect((1_000_000_000).toLocaleString()).toHaveLength(13);
    const lo = pickPrizeLayout(table(200, 999_999_999));
    const hi = pickPrizeLayout(table(200, 1_000_000_000));
    expect(lo.worst.amountChars).toBe(11);
    expect(hi.worst.amountChars).toBe(13);
    expect(lo.twoCol, '9자리 최댓값은 아직 2단에 들어가야 한다').toBe(true);
    expect(hi.twoCol, '10자리 최솟값부터 1단 폴백이어야 한다').toBe(false);
    expect(overflowCq(table(200, 999_999_999))).toBeLessThanOrEqual(0);
  });

  it('🔴 경계: 99등(2자리) → 100등(3자리)에서 등수 폭이 실제로 커진다', () => {
    // 폭이 **같은** 등수들 중 누가 뽑히는지는 중요하지 않다("10등" · "99등" 동일 폭) — 계수를 본다.
    expect(placeWidthFactor(prizeWorst(table(99, 10_000_000)).placeText)).toBe(placeWidthFactor('99등'));
    expect(placeWidthFactor(prizeWorst(table(100, 10_000_000)).placeText)).toBe(placeWidthFactor('100등'));
    expect(placeWidthFactor('100등')).toBeGreaterThan(placeWidthFactor('99등'));
    // 1등 줄에는 최대 등수가 아니라 **1등** 이 들어간다 — 여기가 어긋나면 규격이 괜히 떨어진다.
    expect(prizeWorst(table(200, 10_000_000)).leadPlaceText).toBe('1등');
  });

  it('숫자가 아닌 등수(1st·WINNER)는 글자당 가장 넓은 계수로 보수적으로 잡는다', () => {
    expect(prizePlaceText('1')).toBe('1등');
    expect(prizePlaceText('1st')).toBe('1st');
    // 숫자는 숫자 계수(0.655), 나머지 글자는 가장 넓은 계수(0.864) — "1st" = 0.655 + 0.864×2 = 2.383.
    //   "1등"(1.519) 보다 넓게 잡히므로 보수적이다.
    expect(placeWidthFactor('1st')).toBeCloseTo(2.383, 3);
    expect(placeWidthFactor('1st')).toBeGreaterThan(placeWidthFactor('1등'));
    expect(overflowCq([{ place: 'WINNER', amount: 10_000_000 }, { place: '2nd', amount: 5_000_000 }])).toBeLessThanOrEqual(0);
  });

  it('wide 규격은 오늘 15줄 이하가 쓰던 값 그대로다 — 회귀 0 의 근거', () => {
    expect(PRIZE_SPECS[0]).toEqual({
      key: 'wide', minH: 3.2, gap: 0.45, place: 1.9, amount: 2.1, leadPlace: 2.2, leadAmount: 2.5,
    });
    expect(PRIZE_SPECS[PRIZE_SPECS.length - 1].key).toBe('compact');
  });

  it('규격은 큰 것부터 늘어서 있다 — 순서가 뒤집히면 "가장 큰 규격 고르기"가 거짓말이 된다', () => {
    for (let i = 1; i < PRIZE_SPECS.length; i++) {
      expect(PRIZE_SPECS[i].amount, `${PRIZE_SPECS[i].key} 가 ${PRIZE_SPECS[i - 1].key} 보다 크다`)
        .toBeLessThan(PRIZE_SPECS[i - 1].amount);
      expect(PRIZE_SPECS[i].minH).toBeLessThan(PRIZE_SPECS[i - 1].minH);
    }
  });

  it('한 장은 20줄이고 좌단이 앞의 10줄이다 — 읽는 순서(위→아래, 좌→우)의 근거', () => {
    expect(PRIZES_PER_PAGE).toBe(20);
    expect(PRIZE_LEFT_ROWS).toBe(10);
    expect(PRIZES_PER_PAGE - PRIZE_LEFT_ROWS).toBe(10);
  });

  it('빈 상금표에서도 터지지 않는다', () => {
    expect(() => pickPrizeLayout([])).not.toThrow();
    expect(fitsTwoColumns(PRIZE_SPECS[0], prizeWorst([]))).toBe(true);
  });
});
