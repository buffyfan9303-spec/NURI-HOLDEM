// 13×13 레인지 매트릭스 — 혼합 빈도를 셀 세로 채움으로 표현하는 공용 렌더러.
// (형식 자체는 수십 년 된 업계 표준 표기: 대각=페어, 우상=수딧, 좌하=오프수트.
//  색·채움 방식은 앱 토큰 기반 독자 설계 — 공격=인디고, 콜=에메랄드, 4벳=바이올렛.)
// 모바일에서 169셀은 셀당 ~26px라 셀 안 글자만으론 부족 — 셀 탭 → 하단 상세가 1급 UX다.
import { useMemo, useState } from 'react';
import { comboCount, gridName, rangeComboPct, type FreqMap } from '../../../lib/ranges';

export interface MatrixAction {
  key: string;
  label: string;
  /** CSS 색 — 셀 채움·범례 공용 */
  color: string;
  freq: FreqMap;
}

export default function RangeMatrix13({ actions, foldLabel = '폴드' }: { actions: MatrixAction[]; foldLabel?: string }) {
  const [sel, setSel] = useState<string | null>(null);

  // 셀별 액션 빈도 합성(최대 1로 클램프) — 배경은 아래→위 스택 채움
  const cellStyle = (name: string): { bg?: string; total: number } => {
    let acc = 0;
    const stops: string[] = [];
    for (const a of actions) {
      const f = a.freq.get(name) ?? 0;
      if (f <= 0) continue;
      const from = acc, to = Math.min(1, acc + f);
      stops.push(`${a.color} ${from * 100}% ${to * 100}%`);
      acc = to;
      if (acc >= 1) break;
    }
    if (!stops.length) return { total: 0 };
    if (acc < 1) stops.push(`transparent ${acc * 100}% 100%`);
    return { bg: `linear-gradient(to top, ${stops.join(', ')})`, total: acc };
  };

  const summary = useMemo(() => actions.map((a) => ({ ...a, pct: rangeComboPct(a.freq) })), [actions]);
  const totalPct = summary.reduce((s, a) => s + a.pct, 0);

  return (
    <div className="space-y-2">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {Array.from({ length: 13 }, (_, i) =>
            Array.from({ length: 13 }, (_, j) => {
              const name = gridName(i, j);
              const { bg, total } = cellStyle(name);
              const on = sel === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSel(on ? null : name)}
                  aria-label={`${name} 상세`}
                  style={bg ? { background: bg } : undefined}
                  className={[
                    'relative aspect-square flex items-center justify-center rounded-[3px] text-[10px] font-bold leading-none tracking-tighter',
                    bg ? '' : 'bg-surface-high',
                    total > 0.45 ? 'text-white' : total > 0 ? 'text-ink-primary' : 'text-ink-muted/50',
                    on ? 'ring-2 ring-ink-primary z-10' : '',
                  ].join(' ')}
                >
                  {name}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* 범례 + 콤보 가중 요약 (셀 수 %가 아니라 1326콤보 기준 — 실제 빈도 감각) */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {summary.map((a) => (
          <span key={a.key} className="inline-flex items-center gap-1 text-2xs text-ink-secondary">
            <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: a.color }} />
            {a.label} <b className="tabular-nums text-ink-primary">{a.pct.toFixed(1)}%</b>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-2xs text-ink-muted">
          <span className="inline-block h-3 w-3 rounded-[3px] border border-border-default bg-surface-high" />
          {foldLabel} <b className="tabular-nums">{Math.max(0, 100 - totalPct).toFixed(1)}%</b>
        </span>
      </div>

      {/* 셀 상세 — 탭한 핸드의 빈도·콤보 수. 모바일에서 유일하게 판독 보장되는 층. */}
      {sel && (() => {
        const rows = actions.map((a) => ({ label: a.label, color: a.color, f: a.freq.get(sel) ?? 0 })).filter((r) => r.f > 0);
        const foldF = Math.max(0, 1 - rows.reduce((s, r) => s + r.f, 0));
        return (
          <div className="rounded-input border border-border-default bg-surface-high px-3 py-2 animate-fade-in">
            <div className="flex items-baseline justify-between">
              <b className="text-sm text-ink-primary">{sel}</b>
              <span className="text-2xs tabular-nums text-ink-muted">{comboCount(sel)}콤보</span>
            </div>
            <div className="mt-1 space-y-1">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-2xs font-bold text-ink-secondary">{r.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-base">
                    <div className="h-full rounded-full" style={{ width: `${r.f * 100}%`, background: r.color }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-2xs font-bold tabular-nums text-ink-primary">{Math.round(r.f * 100)}%</span>
                </div>
              ))}
              {foldF > 0.001 && (
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-2xs font-bold text-ink-muted">{foldLabel}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-base">
                    <div className="h-full rounded-full bg-border-strong" style={{ width: `${foldF * 100}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-2xs font-bold tabular-nums text-ink-muted">{Math.round(foldF * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
