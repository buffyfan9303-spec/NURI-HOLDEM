// src/components/features/ICMCalculator.tsx
import { useMemo, useState } from 'react';

/**
 * ICM(Independent Chip Model) 계산기 — Malmuth-Harville 모델.
 * 각 플레이어의 칩 스택과 상금 구조를 입력하면 기대 상금(에퀴티)을 계산한다.
 * 플레이어 수는 계산량 때문에 최대 10명(MAX_PLAYERS)으로 제한.
 * 서브게임을 '남은 플레이어 비트마스크'로 메모이제이션 — 자리(상금 인덱스)는
 * n − popcount(mask) 로 유일하게 정해지므로 키는 mask 하나면 충분하다.
 * (10명 기준 2^10=1,024 상태 — 순열 N! 재계산 대비 키 입력마다 3.6M 경로를 해소.)
 */
function icmEquity(stacks: number[], prizes: number[]): number[] {
  const n = stacks.length;
  const result = new Array(n).fill(0);
  if (prizes.length === 0 || n === 0) return result;
  if (stacks.reduce((a, b) => a + b, 0) <= 0) return result;

  const memo = new Map<number, Float64Array>();
  const solve = (mask: number): Float64Array => {
    const cached = memo.get(mask);
    if (cached) return cached;
    const res = new Float64Array(n);
    // 남은 플레이어 인덱스·스택 합, 이번 자리(상금 인덱스) 산출
    const idx: number[] = [];
    let sum = 0;
    for (let k = 0; k < n; k++) if (mask & (1 << k)) { idx.push(k); sum += stacks[k]; }
    const prize = prizes[n - idx.length] ?? 0;
    // 1명만 남으면 다음 상금 차지
    if (idx.length === 1) { res[idx[0]] = prize; memo.set(mask, res); return res; }
    if (sum <= 0) { memo.set(mask, res); return res; }
    for (const i of idx) {
      const pFirst = stacks[i] / sum;
      if (pFirst <= 0) continue;
      res[i] += pFirst * prize;
      // i 가 이번 자리로 빠진 뒤 나머지가 남은 상금을 두고 경쟁
      const sub = solve(mask & ~(1 << i));
      for (const k of idx) if (k !== i) res[k] += pFirst * sub[k];
    }
    memo.set(mask, res);
    return res;
  };

  const full = solve((1 << n) - 1);
  for (let i = 0; i < n; i++) result[i] = full[i];
  return result;
}

const MAX_PLAYERS = 10;

export default function ICMCalculator() {
  const [stacks, setStacks] = useState<number[]>([5000, 3000, 2000]);
  const [prizes, setPrizes] = useState<number[]>([40, 24, 15, 10, 7, 4]);

  const equities = useMemo(() => {
    const s = stacks.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    if (s.reduce((a, b) => a + b, 0) <= 0) return stacks.map(() => 0);
    return icmEquity(s, prizes.map((v) => (Number.isFinite(v) ? v : 0)));
  }, [stacks, prizes]);
  // 실제 지급되는 상금 합계(= 기대값 합). 상금 자리가 인원보다 많아도 % 가 100%로 합산되도록 분모로 사용.
  const awarded = equities.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  // 상금 입력 단위 안내 — 합계가 100±1 이면 % 구조로, 아니면 금액 그대로 해석된다는 캡션.
  const prizeSum = prizes.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const looksPct = Math.abs(prizeSum - 100) <= 1;

  const setStack = (i: number, v: number) => setStacks((p) => p.map((x, k) => (k === i ? v : x)));
  const setPrize = (i: number, v: number) => setPrizes((p) => p.map((x, k) => (k === i ? v : x)));
  // 버블 프리셋 — 4명 남고 3자리 시상(전형적 버블 상황)을 한 번에 입력.
  const applyBubble = () => { setStacks([40, 30, 20, 10]); setPrizes([50, 30, 20]); };

  return (
    <div className="space-y-3 rounded-card border border-border-default bg-surface-low p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink-primary">ICM 계산기</p>
          <p className="text-2xs text-ink-muted mt-0.5">스택과 상금을 입력하면 각 플레이어의 기대 상금(ICM)을 계산합니다.</p>
        </div>
        <button type="button" onClick={applyBubble}
          className="shrink-0 rounded-input border border-accent-400/50 bg-accent-300/10 px-2 py-1 text-2xs font-bold text-accent-300 leading-none">
          버블: 4명 · 3자리 시상
        </button>
      </div>

      {/* 상금 구조 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-2xs font-semibold text-ink-secondary">상금 구조</span>
          <div className="inline-flex items-center gap-1.5">
            <button type="button" aria-label="상금 자리 줄이기" onClick={() => setPrizes((p) => p.slice(0, -1))} disabled={prizes.length <= 2}
              className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-border-default bg-surface-high text-base font-bold text-ink-secondary leading-none disabled:opacity-30">−</button>
            <span className="min-w-[2.75rem] text-center text-2xs font-bold text-ink-primary tabular-nums">{prizes.length}명</span>
            <button type="button" aria-label="상금 자리 늘리기" onClick={() => setPrizes((p) => [...p, 0])} disabled={prizes.length >= 20}
              className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-accent-400/50 bg-accent-300/10 text-base font-bold text-accent-300 leading-none disabled:opacity-30">+</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {prizes.map((v, i) => (
            <label key={i} className="block">
              <span className="block text-2xs text-ink-muted mb-0.5">{i + 1}위</span>
              <input type="number" inputMode="decimal" value={v === 0 ? '' : v}
                onChange={(e) => setPrize(i, e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                className="input w-full text-sm tabular-nums" />
            </label>
          ))}
        </div>
        <p className="mt-1 text-2xs text-ink-muted">
          {looksPct ? '합계 ≈100 — % 상금 구조로 입력됨(결과도 % 단위)' : '합계가 100이 아니므로 금액 단위 그대로 계산됩니다'}
        </p>
      </div>

      {/* 스택 + 결과 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-2xs font-semibold text-ink-secondary">플레이어 스택</span>
          <div className="inline-flex items-center gap-1.5">
            <button type="button" aria-label="플레이어 줄이기"
              onClick={() => setStacks((p) => p.slice(0, -1))}
              disabled={stacks.length <= 2}
              className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-border-default bg-surface-high text-base font-bold text-ink-secondary leading-none disabled:opacity-30">−</button>
            <span className="min-w-[2.75rem] text-center text-2xs font-bold text-ink-primary tabular-nums">{stacks.length}/{MAX_PLAYERS}명</span>
            <button type="button" aria-label="플레이어 늘리기" onClick={() => setStacks((p) => [...p, 1000])} disabled={stacks.length >= MAX_PLAYERS}
              className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-accent-400/50 bg-accent-300/10 text-base font-bold text-accent-300 leading-none disabled:opacity-30">+</button>
          </div>
        </div>
        <ul className="space-y-1.5">
          {stacks.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-2xs font-bold text-ink-muted tabular-nums">P{i + 1}</span>
              <input type="number" inputMode="numeric" value={v === 0 ? '' : v}
                onChange={(e) => setStack(i, e.target.value === '' ? 0 : (parseInt(e.target.value, 10) || 0))}
                className="input flex-1 text-sm tabular-nums" placeholder="스택" />
              <span className="w-24 shrink-0 text-right text-sm font-extrabold text-accent-300 tabular-nums">
                {equities[i] !== undefined ? equities[i].toFixed(2) : '0'}
                {awarded > 0 && (
                  <span className="ml-1 text-2xs font-normal text-ink-muted">
                    ({((equities[i] / awarded) * 100 || 0).toFixed(1)}%)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-2xs text-ink-muted">
        칩 2배 ≠ 상금 2배 — 칩이 쌓일수록 칩 1개의 상금 가치는 줄어듭니다(ICM의 핵심).
      </p>
      <p className="text-2xs text-ink-muted">
        Malmuth-Harville 모델 기준 추정치입니다. 실제 딜·체급에 따라 차이가 있을 수 있습니다.
      </p>
    </div>
  );
}
