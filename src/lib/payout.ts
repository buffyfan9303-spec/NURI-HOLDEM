// 상금 분배 계산 — MoreCalcs.tsx PayoutCalc 의 계산부. 화면과 떼어 둔 이유: 입력 상한·잔액 보정·역전 가드를
// 렌더 없이 검사하기 위해서다(payout.test.ts).
//
// 🔴 2026-09-25 전수 스윕(design-reviewer FULL-ERROR-SWEEP-B): 참가 인원·시상 인원에 **상한이 없어**
//   200,000명 → 20,001행(808ms), 4,294,967,296 → 30초 멈춤 뒤 `RangeError: Invalid array length` 로
//   ErrorBoundary 가 GTO 탭 전체를 '이 영역을 불러오지 못했습니다' 로 바꿨다. 여기서 인원을 잘라 그 경로를 막는다.
//   상한 10,000 — 국내 라이브 대회 최대 규모(수백 명)의 10배 여유. 시상 인원은 참가 인원을 넘지 못한다(2026-09-19 감사).

export type PayoutStyle = 'topheavy' | 'flat' | 'satellite';
/** 참가 인원 상한 — NumIn 의 max 와 계산 모두 이 하나를 본다. */
export const PAYOUT_MAX_ENTRIES = 10_000;
/** 화면 밖 값(음수·NaN·소수·상한 초과)을 정수 [0, PAYOUT_MAX_ENTRIES] 로 접는다. */
export const clampEntries = (n: number): number => (Number.isFinite(n) ? Math.min(PAYOUT_MAX_ENTRIES, Math.max(0, Math.floor(n))) : 0);

export function computePayout(input: { pool: number; entries: number; placesIn: number; style: PayoutStyle; presetPct?: readonly number[] | null }): { places: number; amounts: number[]; entries: number } {
  const pool = Number.isFinite(input.pool) ? Math.max(0, input.pool) : 0;
  const entries = clampEntries(input.entries);
  const placesIn = clampEntries(input.placesIn);
  const preset = input.presetPct && input.presetPct.length ? input.presetPct : null;
  const autoPct = input.style === 'flat' ? 0.18 : input.style === 'satellite' ? 0.15 : 0.10;
  // 시상 인원(수동 입력)은 참가 인원을 넘을 수 없다(places ≤ entries) — 참가 0 이어도 표는 1행(빈 표를 그리지 않는다).
  const places = preset ? preset.length : Math.max(1, Math.min(entries, placesIn > 0 ? placesIn : Math.round(entries * autoPct)));

  let amounts: number[];
  if (preset) {
    // 프리셋: 고정 %표 그대로 1000 단위 반올림, 잔액은 1위에 보정.
    amounts = preset.map((p) => Math.max(0, Math.round((p / 100) * pool / 1000) * 1000));
    const used = amounts.reduce((a, b) => a + b, 0);
    if (amounts.length) amounts[0] += pool - used;
  } else if (input.style === 'satellite') {
    // 세틀라이트: 상위 시상자 동일 금액(시트). 반올림 잔액은 1위에 보정.
    const each = Math.max(0, Math.floor(pool / places / 1000) * 1000);
    amounts = Array.from({ length: places }, () => each);
    if (amounts.length) amounts[0] += pool - each * places;
  } else {
    // 탑헤비(가파름)=1.15 / 뱅크롤(완만)=0.55 지수 곡선.
    const exp = input.style === 'flat' ? 0.55 : 1.15;
    const weights = Array.from({ length: places }, (_, i) => 1 / Math.pow(i + 1, exp));
    const wSum = weights.reduce((a, b) => a + b, 0);
    amounts = weights.map((w) => Math.max(0, Math.round((w / wSum) * pool / 1000) * 1000));
    const used = amounts.reduce((a, b) => a + b, 0);
    if (amounts.length) amounts[0] += pool - used;
  }
  // 가드: 잔액 보정이 음수면 flat 곡선에서 1위<2위 역전 가능 — 2위에서 차액을 옮겨 1위≥2위 유지(합계 불변).
  if (amounts.length > 1 && amounts[0] < amounts[1]) {
    const d = Math.ceil((amounts[1] - amounts[0]) / 2 / 1000) * 1000;
    amounts[0] += d;
    amounts[1] -= d;
  }
  return { places, amounts, entries };
}
