/** 칸·요약용 짧은 금액 — 만/억 단위, 소수 한 자리는 **버림**(부풀리지 않는다).
 *  전체 값은 화면의 aria-label·title 과 '전체 누계' 가 말한다(캘린더 2026-09-24).
 *  예: 969,567 → +96.9만 · 1,234,567 → +123만 · -1,500,000 → -150만 · 45,000 → +4.5만 · 5,000 → +5,000 · 0 → 0
 *  ⚠ §28: 부호(+/−)와 금액만 — '수익·손실' 같은 말은 붙이지 않는다(호출부가 라벨을 정한다). */
export function compactWon(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const a = Math.abs(n);
  const cut = (v: number, dp: number) => { const f = 10 ** dp; return String(Math.trunc(v * f) / f); };
  if (a >= 100_000_000) return `${sign}${cut(a / 1e8, a >= 1e9 ? 0 : 1)}억`;
  if (a >= 10_000) return `${sign}${cut(a / 1e4, a >= 1e6 ? 0 : 1)}만`;
  return `${sign}${a.toLocaleString('ko-KR')}`;
}
