import { useState } from 'react';
import { CalcCard } from './calcUi';

// 스타팅핸드(프리플랍) 레인지 가이드 — 6맥스 기준 오픈레이즈 참고 차트.
// 169핸드를 Chen 공식으로 점수화해 순위를 매기고, 포지션별 상위 % 기준으로 색을 칠한다.
// (정밀 솔버 레인지가 아닌 '참고용 기본 레인지'. 라벨에 명시한다.)

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const VAL: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

function chenPoints(v: number): number {
  if (v === 14) return 10;
  if (v === 13) return 8;
  if (v === 12) return 7;
  if (v === 11) return 6;
  return v / 2;
}
function chenScore(hi: number, lo: number, suited: boolean, pair: boolean): number {
  if (pair) return Math.max(chenPoints(hi) * 2, 5);
  let s = chenPoints(hi);
  if (suited) s += 2;
  const gap = hi - lo - 1;
  s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1; // 양쪽 모두 Q 미만 연결 보너스
  return Math.round(s);
}

type Hand = { label: string; score: number };
function buildGrid(): Hand[][] {
  const grid: Hand[][] = [];
  for (let i = 0; i < 13; i++) {
    const row: Hand[] = [];
    for (let j = 0; j < 13; j++) {
      const ri = RANKS[i], rj = RANKS[j], vi = VAL[ri], vj = VAL[rj];
      if (i === j) row.push({ label: ri + rj, score: chenScore(vi, vj, false, true) });
      else if (i < j) row.push({ label: ri + rj + 's', score: chenScore(vi, vj, true, false) }); // 위쪽 삼각=수딧
      else row.push({ label: rj + ri + 'o', score: chenScore(vj, vi, false, false) });           // 아래쪽 삼각=오프수트
    }
    grid.push(row);
  }
  return grid;
}
const GRID = buildGrid();
const RANK_PCT = (() => {
  const flat = GRID.flat().slice().sort((a, b) => b.score - a.score);
  const m = new Map<string, number>();
  flat.forEach((h, idx) => m.set(h.label, idx / flat.length));
  return m;
})();

type Pos = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB';
const POSITIONS: { id: Pos; label: string; pct: number }[] = [
  { id: 'UTG', label: 'UTG', pct: 0.14 },
  { id: 'MP', label: 'MP', pct: 0.19 },
  { id: 'CO', label: 'CO', pct: 0.28 },
  { id: 'BTN', label: 'BTN', pct: 0.46 },
  { id: 'SB', label: 'SB', pct: 0.42 },
];

function action(label: string, pct: number): 'raise' | 'mix' | 'fold' {
  const p = RANK_PCT.get(label) ?? 1;
  if (p < pct) return 'raise';
  if (p < pct + 0.08) return 'mix';
  return 'fold';
}

export default function RangeGuide() {
  const [pos, setPos] = useState<Pos>('BTN');
  const pct = POSITIONS.find((p) => p.id === pos)!.pct;
  const openCount = GRID.flat().filter((h) => action(h.label, pct) !== 'fold').length;

  return (
    <CalcCard title="스타팅핸드 가이드" desc="포지션별 프리플랍 오픈레이즈 참고 레인지 (6맥스 기준)">
      {/* 포지션 선택 */}
      <div className="flex flex-wrap gap-1">
        {POSITIONS.map((p) => {
          const on = p.id === pos;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPos(p.id)}
              className={[
                'h-7 px-3 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                on ? 'bg-gold-300 border-gold-300 text-ink-inverse' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
              ].join(' ')}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 13x13 핸드 매트릭스 */}
      <div className="mx-auto w-full max-w-[400px]">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {GRID.map((row, i) =>
            row.map((h, j) => {
              const a = action(h.label, pct);
              return (
                <div
                  key={`${i}-${j}`}
                  title={h.label}
                  className={[
                    'aspect-square flex items-center justify-center rounded-[3px] text-[8px] font-bold leading-none tabular-nums',
                    a === 'raise' ? 'bg-gold-300 text-ink-inverse' : a === 'mix' ? 'bg-gold-300/25 text-gold-300' : 'bg-surface-high text-ink-muted/60',
                  ].join(' ')}
                >
                  {h.label}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* 범례 + 요약 */}
      <div className="flex items-center justify-center gap-3">
        <Legend cls="bg-gold-300" label="레이즈" />
        <Legend cls="bg-gold-300/25" label="혼합" />
        <Legend cls="bg-surface-high border border-border-default" label="폴드" />
        <span className="text-2xs text-ink-muted">오픈 {openCount}콤보 (~{Math.round((openCount / 169) * 100)}%)</span>
      </div>
      <p className="text-[10px] text-ink-muted text-center leading-relaxed">※ 참고용 기본 레인지입니다. 상대 성향·스택·테이블 상황에 따라 조정하세요.</p>
    </CalcCard>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-ink-secondary">
      <span className={`inline-block w-3 h-3 rounded-[3px] ${cls}`} />
      {label}
    </span>
  );
}
