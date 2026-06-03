// src/components/features/ICMCalculator.tsx
import { useMemo, useState } from 'react';

/**
 * ICM(Independent Chip Model) 계산기 — Malmuth-Harville 모델.
 * 각 플레이어의 칩 스택과 상금 구조를 입력하면 기대 상금(에퀴티)을 계산한다.
 * 플레이어 수는 계산량(N!) 때문에 최대 9명으로 제한.
 */
function icmEquity(stacks: number[], prizes: number[]): number[] {
  const n = stacks.length;
  const result = new Array(n).fill(0);
  if (prizes.length === 0 || n === 0) return result;
  // 1명만 남으면 다음 상금 차지
  if (n === 1) { result[0] = prizes[0] ?? 0; return result; }

  const total = stacks.reduce((a, b) => a + b, 0);
  if (total <= 0) return result;

  for (let i = 0; i < n; i++) {
    const pFirst = stacks[i] / total;
    if (pFirst <= 0) continue;
    result[i] += pFirst * (prizes[0] ?? 0);
    // i 가 1등으로 빠진 뒤 나머지가 남은 상금을 두고 경쟁
    const subStacks: number[] = [];
    const idxMap: number[] = [];
    for (let k = 0; k < n; k++) if (k !== i) { subStacks.push(stacks[k]); idxMap.push(k); }
    const sub = icmEquity(subStacks, prizes.slice(1));
    for (let k = 0; k < sub.length; k++) result[idxMap[k]] += pFirst * sub[k];
  }
  return result;
}

const MAX_PLAYERS = 10;

export default function ICMCalculator() {
  const [stacks, setStacks] = useState<number[]>([5000, 3000, 2000]);
  const [prizes, setPrizes] = useState<number[]>([50, 30, 20]);

  const equities = useMemo(() => {
    const s = stacks.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    if (s.reduce((a, b) => a + b, 0) <= 0) return stacks.map(() => 0);
    return icmEquity(s, prizes.map((v) => (Number.isFinite(v) ? v : 0)));
  }, [stacks, prizes]);
  const prizeTotal = prizes.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  const setStack = (i: number, v: number) => setStacks((p) => p.map((x, k) => (k === i ? v : x)));
  const setPrize = (i: number, v: number) => setPrizes((p) => p.map((x, k) => (k === i ? v : x)));

  return (
    <div className="space-y-3 rounded-card border border-border-default bg-surface-low p-3">
      <div>
        <p className="text-sm font-bold text-ink-primary">ICM 계산기</p>
        <p className="text-2xs text-ink-muted mt-0.5">스택과 상금을 입력하면 각 플레이어의 기대 상금(ICM)을 계산합니다.</p>
      </div>

      {/* 상금 구조 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-2xs font-semibold text-ink-secondary">상금 구조 (단위 자유: % 또는 금액)</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPrizes((p) => [...p, 0])} disabled={prizes.length >= stacks.length}
              className="text-2xs font-semibold text-gold-300 disabled:opacity-30">+ 상금</button>
            <button type="button" onClick={() => setPrizes((p) => p.slice(0, -1))} disabled={prizes.length <= 1}
              className="text-2xs font-semibold text-ink-muted disabled:opacity-30">− 상금</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {prizes.map((v, i) => (
            <label key={i} className="block">
              <span className="block text-[10px] text-ink-muted mb-0.5">{i + 1}위</span>
              <input type="number" inputMode="decimal" value={v}
                onChange={(e) => setPrize(i, parseFloat(e.target.value) || 0)}
                className="input w-full text-sm tabular-nums" />
            </label>
          ))}
        </div>
      </div>

      {/* 스택 + 결과 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-2xs font-semibold text-ink-secondary">플레이어 스택</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setStacks((p) => [...p, 1000])} disabled={stacks.length >= MAX_PLAYERS}
              className="text-2xs font-semibold text-gold-300 disabled:opacity-30">+ 플레이어</button>
            <button type="button" onClick={() => setStacks((p) => p.slice(0, -1))} disabled={stacks.length <= 2}
              className="text-2xs font-semibold text-ink-muted disabled:opacity-30">− 플레이어</button>
          </div>
        </div>
        <ul className="space-y-1.5">
          {stacks.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-2xs font-bold text-ink-muted tabular-nums">P{i + 1}</span>
              <input type="number" inputMode="numeric" value={v}
                onChange={(e) => setStack(i, parseInt(e.target.value, 10) || 0)}
                className="input flex-1 text-sm tabular-nums" placeholder="스택" />
              <span className="w-24 shrink-0 text-right text-sm font-extrabold text-gold-300 tabular-nums">
                {equities[i] !== undefined ? equities[i].toFixed(2) : '0'}
                {prizeTotal > 0 && (
                  <span className="ml-1 text-2xs font-normal text-ink-muted">
                    ({((equities[i] / prizeTotal) * 100 || 0).toFixed(1)}%)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-ink-muted">
        Malmuth-Harville 모델 기준 추정치입니다. 실제 딜·체급에 따라 차이가 있을 수 있습니다.
      </p>
    </div>
  );
}
