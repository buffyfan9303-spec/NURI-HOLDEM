import { useState } from 'react';
import { CalcCard } from './calcUi';
import { GRID, POSITIONS, action, openPct, type Pos } from '../../../lib/preflop';

// 스타팅핸드(프리플랍) 레인지 가이드 — 공용 lib/preflop(Chen 점수 기반 참고 레인지) 사용.

export default function RangeGuide() {
  const [pos, setPos] = useState<Pos>('BTN');
  const [size, setSize] = useState<'6' | '9'>('6');
  const [act, setAct] = useState<'open' | '3bet'>('open');
  const pct = openPct(pos, size, act);
  const actionLabel = act === '3bet' ? '3벳' : '오픈';
  const openCount = GRID.flat().filter((h) => action(h.label, pct) !== 'fold').length;

  return (
    <CalcCard title="스타팅핸드 가이드" desc="포지션·테이블·액션별 프리플랍 참고 레인지">
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

      {/* 테이블 크기 · 액션 토글 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
          {(['6', '9'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSize(s)}
              className={['h-6 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', size === s ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted'].join(' ')}>
              {s}맥스
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
          {([{ id: 'open', label: '오픈레이즈' }, { id: '3bet', label: '3벳' }] as const).map((a) => (
            <button key={a.id} type="button" onClick={() => setAct(a.id)}
              className={['h-6 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', act === a.id ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted'].join(' ')}>
              {a.label}
            </button>
          ))}
        </div>
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
        <Legend cls="bg-gold-300" label={actionLabel} />
        <Legend cls="bg-gold-300/25" label="혼합" />
        <Legend cls="bg-surface-high border border-border-default" label="폴드" />
        <span className="text-2xs text-ink-muted">{actionLabel} {openCount}콤보 (~{Math.round((openCount / 169) * 100)}%)</span>
      </div>
      <p className="text-[10px] text-ink-muted text-center leading-relaxed">※ 참고용 근사 레인지입니다(6·9맥스 / 오픈·3벳). 상대 성향·스택에 따라 조정하세요.</p>
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
