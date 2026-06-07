import { useState } from 'react';
import { CalcCard } from './calcUi';

// 숏스택 푸시·폴드 참고 차트. Chen 점수로 169핸드를 순위화하고, 스택(BB)별 셔브 비율을 적용.
// (정밀 Nash가 아닌 학습용 근사 — 라벨에 명시)
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const VAL: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
function chenPoints(v: number): number { if (v === 14) return 10; if (v === 13) return 8; if (v === 12) return 7; if (v === 11) return 6; return v / 2; }
function chenScore(hi: number, lo: number, suited: boolean, pair: boolean): number {
  if (pair) return Math.max(chenPoints(hi) * 2, 5);
  let s = chenPoints(hi);
  if (suited) s += 2;
  const gap = hi - lo - 1;
  s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1;
  return Math.round(s);
}
type H = { label: string; score: number };
const GRID: H[][] = (() => {
  const g: H[][] = [];
  for (let i = 0; i < 13; i++) {
    const row: H[] = [];
    for (let j = 0; j < 13; j++) {
      const ri = RANKS[i], rj = RANKS[j], vi = VAL[ri], vj = VAL[rj];
      if (i === j) row.push({ label: ri + rj, score: chenScore(vi, vj, false, true) });
      else if (i < j) row.push({ label: ri + rj + 's', score: chenScore(vi, vj, true, false) });
      else row.push({ label: rj + ri + 'o', score: chenScore(vj, vi, false, false) });
    }
    g.push(row);
  }
  return g;
})();
const RANK_PCT = (() => {
  const f = GRID.flat().slice().sort((a, b) => b.score - a.score);
  const m = new Map<string, number>();
  f.forEach((h, i) => m.set(h.label, i / f.length));
  return m;
})();

const STACKS = [
  { bb: 5, pct: 0.45 },
  { bb: 8, pct: 0.34 },
  { bb: 10, pct: 0.27 },
  { bb: 12, pct: 0.22 },
  { bb: 15, pct: 0.16 },
  { bb: 20, pct: 0.11 },
] as const;

export default function PushFoldChart() {
  const [bb, setBb] = useState(10);
  const pct = STACKS.find((s) => s.bb === bb)!.pct;
  const shoveCount = GRID.flat().filter((h) => (RANK_PCT.get(h.label) ?? 1) < pct).length;

  return (
    <CalcCard title="푸시 · 폴드 차트" desc="숏스택 올인(셔브) 참고 레인지 — 스택(BB)별 근사">
      <div className="flex flex-wrap gap-1">
        {STACKS.map((s) => {
          const on = s.bb === bb;
          return (
            <button
              key={s.bb}
              type="button"
              onClick={() => setBb(s.bb)}
              className={[
                'h-7 px-3 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                on ? 'bg-emerald-500 border-emerald-500 text-ink-inverse' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
              ].join(' ')}
            >
              {s.bb}BB
            </button>
          );
        })}
      </div>

      <div className="mx-auto w-full max-w-[400px]">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {GRID.map((row, i) =>
            row.map((h, j) => {
              const shove = (RANK_PCT.get(h.label) ?? 1) < pct;
              return (
                <div
                  key={`${i}-${j}`}
                  title={h.label}
                  className={[
                    'aspect-square flex items-center justify-center rounded-[3px] text-[8px] font-bold leading-none tabular-nums',
                    shove ? 'bg-emerald-500 text-ink-inverse' : 'bg-surface-high text-ink-muted/60',
                  ].join(' ')}
                >
                  {h.label}
                </div>
              );
            }),
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 text-2xs">
        <span className="inline-flex items-center gap-1 text-ink-secondary"><span className="inline-block w-3 h-3 rounded-[3px] bg-emerald-500" />올인(셔브)</span>
        <span className="inline-flex items-center gap-1 text-ink-secondary"><span className="inline-block w-3 h-3 rounded-[3px] bg-surface-high border border-border-default" />폴드</span>
        <span className="text-ink-muted">셔브 {shoveCount}콤보 (~{Math.round((shoveCount / 169) * 100)}%)</span>
      </div>
      <p className="text-[10px] text-ink-muted text-center leading-relaxed">참고용 근사 차트입니다. 포지션·상대 콜 레인지·앤티에 따라 조정하세요.</p>
    </CalcCard>
  );
}
