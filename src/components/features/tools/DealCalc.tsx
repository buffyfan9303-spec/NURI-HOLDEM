// src/components/features/tools/DealCalc.tsx
// GKR-5 — 딜 계산기. 파이널에서 딜을 논의할 때 ICM 딜(순위 확률 기반)과
// 칩찹(스택 비례 단순 분배)을 한 표에서 비교한다. 결과 먼저 원칙 — 데모 값으로 진입 즉시 표가 보인다.
// icmEquity 는 src/lib/icm.ts 단일 소스 — 예전엔 ICMCalculator 와 이 파일에 두 벌로 복제돼
// 있었다(한쪽만 고치면 두 화면 숫자가 갈린다). §28: 상금 단위는 중립 숫자.
import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import { icmEquity } from '../../../lib/icm';

const MAX_PLAYERS = 9;
const MAX_PRIZES = 9;

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export default function DealCalc() {
  // 결과 먼저 — 3명(50만/30만/20만 칩) + 상금 3자리 데모로 진입 즉시 표가 보인다.
  const [stacks, setStacks] = useState<number[]>([500000, 300000, 200000]);
  const [prizes, setPrizes] = useState<number[]>([500, 300, 200]);

  const setStack = (i: number, v: number) => setStacks((p) => p.map((x, k) => (k === i ? v : x)));
  const setPrize = (i: number, v: number) => setPrizes((p) => p.map((x, k) => (k === i ? v : x)));

  const { icm, chop, totalStack } = useMemo(() => {
    const s = stacks.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const p = prizes.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const totalStack = s.reduce((a, b) => a + b, 0);
    // ICM 은 상위 n개 상금만 배분하므로, 칩찹도 같은 풀(상위 n개 합)을 나눠야 두 열의 합이 같다.
    const pool = p.slice(0, s.length).reduce((a, b) => a + b, 0);
    const icm = icmEquity(s, p);
    const chop = s.map((v) => (totalStack > 0 ? (v / totalStack) * pool : 0));
    return { icm, chop, totalStack };
  }, [stacks, prizes]);

  return (
    <CalcCard desc="남은 스택과 남은 상금을 입력하면 ICM 딜과 칩찹 분배액을 비교합니다.">
      {/* 남은 상금 — 단위 중립 숫자(§28). 1위부터 순서대로 입력 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-2xs font-semibold text-ink-secondary">남은 상금 (1위부터)</span>
          <div className="inline-flex items-center gap-1.5">
            <button type="button" aria-label="상금 자리 줄이기" onClick={() => setPrizes((p) => p.slice(0, -1))} disabled={prizes.length <= 1}
              className="inline-flex h-6 w-6 items-center justify-center rounded-input border border-border-default bg-surface-high text-base font-bold leading-none text-ink-secondary disabled:opacity-30">−</button>
            <span className="min-w-[2.75rem] text-center text-2xs font-bold tabular-nums text-ink-primary">{prizes.length}자리</span>
            <button type="button" aria-label="상금 자리 늘리기" onClick={() => setPrizes((p) => [...p, 0])} disabled={prizes.length >= MAX_PRIZES}
              className="inline-flex h-6 w-6 items-center justify-center rounded-input border border-accent-400/50 bg-accent-300/10 text-base font-bold leading-none text-accent-300 disabled:opacity-30">+</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {prizes.map((v, i) => (
            <label key={i} className="block">
              <span className="mb-0.5 block text-2xs text-ink-muted">{i + 1}위</span>
              <input type="number" inputMode="numeric" min={0} value={v === 0 ? '' : v}
                onChange={(e) => setPrize(i, e.target.value === '' ? 0 : (parseInt(e.target.value, 10) || 0))}
                className="input w-full text-sm tabular-nums" placeholder="상금" />
            </label>
          ))}
        </div>
        {prizes.length > stacks.length && (
          <p className="mt-1 text-2xs text-ink-muted">남은 인원({stacks.length}명)보다 많은 상금 자리는 상위 {stacks.length}개만 분배에 반영됩니다.</p>
        )}
      </div>

      {/* 남은 인원 스택 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-2xs font-semibold text-ink-secondary">남은 인원 스택 (칩)</span>
          <div className="inline-flex items-center gap-1.5">
            <button type="button" aria-label="플레이어 줄이기" onClick={() => setStacks((p) => p.slice(0, -1))} disabled={stacks.length <= 2}
              className="inline-flex h-6 w-6 items-center justify-center rounded-input border border-border-default bg-surface-high text-base font-bold leading-none text-ink-secondary disabled:opacity-30">−</button>
            <span className="min-w-[2.75rem] text-center text-2xs font-bold tabular-nums text-ink-primary">{stacks.length}/{MAX_PLAYERS}명</span>
            <button type="button" aria-label="플레이어 늘리기" onClick={() => setStacks((p) => [...p, 100000])} disabled={stacks.length >= MAX_PLAYERS}
              className="inline-flex h-6 w-6 items-center justify-center rounded-input border border-accent-400/50 bg-accent-300/10 text-base font-bold leading-none text-accent-300 disabled:opacity-30">+</button>
          </div>
        </div>
        <ul className="space-y-1.5">
          {stacks.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-2xs font-bold tabular-nums text-ink-muted">P{i + 1}</span>
              <input type="number" inputMode="numeric" min={0} value={v === 0 ? '' : v}
                onChange={(e) => setStack(i, e.target.value === '' ? 0 : (parseInt(e.target.value, 10) || 0))}
                className="input flex-1 text-sm tabular-nums" placeholder="스택" />
              <span className="w-14 shrink-0 text-right text-2xs tabular-nums text-ink-muted">
                {totalStack > 0 ? `${((v / totalStack) * 100).toFixed(1)}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 비교 표 — 스택 | ICM 딜 | 칩찹 | 차이 */}
      <div className="overflow-x-auto rounded-input border border-border-subtle bg-surface-high/60">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border-subtle text-2xs text-ink-muted">
              <th scope="col" className="px-2 py-1.5 text-left font-semibold">플레이어</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">스택</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">ICM 딜</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">칩찹</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {stacks.map((v, i) => {
              const diff = (icm[i] ?? 0) - (chop[i] ?? 0);
              return (
                <tr key={i}>
                  <td className="px-2 py-1.5 font-bold text-ink-secondary">P{i + 1}</td>
                  <td className="px-2 py-1.5 text-right text-ink-secondary">{fmt(v)}</td>
                  <td className="px-2 py-1.5 text-right font-extrabold text-accent-300">{fmt(icm[i] ?? 0)}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-ink-primary">{fmt(chop[i] ?? 0)}</td>
                  <td className={`px-2 py-1.5 text-right font-bold ${diff > 0.5 ? 'text-emerald-400' : diff < -0.5 ? 'text-danger-light' : 'text-ink-muted'}`}>
                    {diff > 0.5 ? `+${fmt(diff)}` : diff < -0.5 ? `−${fmt(-diff)}` : '0'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-2xs text-ink-muted">ICM 딜은 순위 확률 기반, 칩찹은 스택 비례 단순 분배입니다.</p>
      <p className="text-2xs text-ink-muted">차이(+)는 칩찹보다 ICM 딜이 유리한 플레이어 — 보통 숏스택이 ICM 딜에서 더 받습니다.</p>
    </CalcCard>
  );
}
