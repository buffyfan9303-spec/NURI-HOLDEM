// 13×13 레인지 매트릭스 — 혼합 빈도를 셀 세로 채움으로 표현하는 공용 렌더러.
// (형식 자체는 수십 년 된 업계 표준 표기: 대각=페어, 우상=수딧, 좌하=오프수트.
//  색·채움 방식은 앱 토큰 기반 독자 설계 — 2026-09-26 아우라 팔레트: 공격=바이올렛, 콜=틸, 4벳=푸시아, 테마별 hex(src/lib/rangeColors.ts).)
// 모바일에서 169셀은 셀당 ~26px라 셀 안 글자만으론 부족 — 셀 탭 → 하단 상세가 1급 UX다.
import { useMemo, useState } from 'react';
import { comboCount, gridName, rangeComboPct, type FreqMap } from '../../../lib/ranges';
import { toneOfKey, type ActionTone } from '../../../lib/rangeColors';
import { pickCellText, useRangeTheme, type CellSegment } from './cellText';

export interface MatrixAction {
  key: string;
  label: string;
  /** 색 톤 — 생략하면 key 로 정한다(toneOfKey). 실제 hex 는 테마별 RANGE_FILL 에서 읽는다. */
  tone?: ActionTone;
  /** @deprecated 2026-09-26 채움색은 테마별 토큰(rangeColors.ts)에서 온다 — 호출부가 넘겨도 쓰지 않는다. 호출부 정리 뒤 제거. */
  color?: string;
  freq: FreqMap;
}

export default function RangeMatrix13({ actions, foldLabel = '폴드', initialSel }: {
  actions: MatrixAction[]; foldLabel?: string;
  /** 처음부터 선택(링 강조 + 하단 상세)해 둘 핸드 — 오답 노트 '차트에서 보기' 진입용 */
  initialSel?: string | null;
}) {
  const [sel, setSel] = useState<string | null>(initialSel ?? null);
  // 🔴 2026-09-25: 글자색은 채움 비율이 아니라 **칸 배경 명도**로 고른다(cellText.ts). 지면색은 테마 토큰에서 읽는다.
  // 2026-09-26: 채움색도 테마별이다(다크=흰 글자 보장, 라이트=검은 글자 보장 — rangeColors.ts).
  const { surface, fill } = useRangeTheme();
  const colorOf = (a: Pick<MatrixAction, 'key' | 'tone'>): string => fill[a.tone ?? toneOfKey(a.key)];

  // 셀별 액션 빈도 합성(최대 1로 클램프) — 배경은 아래→위 스택 채움
  const cellStyle = (name: string): { bg?: string; text: string } => {
    let acc = 0;
    const stops: string[] = [];
    const segs: CellSegment[] = [];
    for (const a of actions) {
      const f = a.freq.get(name) ?? 0;
      if (f <= 0) continue;
      const from = acc, to = Math.min(1, acc + f);
      const color = colorOf(a);
      stops.push(`${color} ${from * 100}% ${to * 100}%`);
      segs.push({ color, from, to });
      acc = to;
      if (acc >= 1) break;
    }
    if (!stops.length) return { text: '' };
    // 남은 부분은 폴드 칸과 같은 지면(--surface-high) — transparent 면 카드색(surface-low)이 비쳐 cellText 의 지면 가정과 어긋난다(2026-09-26 실측 #0E1322).
    if (acc < 1) stops.push(`rgb(var(--surface-high)) ${acc * 100}% 100%`);
    return { bg: `linear-gradient(to top, ${stops.join(', ')})`, text: pickCellText(segs, surface).color };
  };

  const summary = useMemo(() => actions.map((a) => ({ ...a, color: fill[a.tone ?? toneOfKey(a.key)], pct: rangeComboPct(a.freq) })), [actions, fill]);
  const totalPct = summary.reduce((s, a) => s + a.pct, 0);

  return (
    <div className="space-y-2">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {Array.from({ length: 13 }, (_, i) =>
            Array.from({ length: 13 }, (_, j) => {
              const name = gridName(i, j);
              const { bg, text } = cellStyle(name);
              const on = sel === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSel(on ? null : name)}
                  aria-label={`${name} 상세`}
                  style={bg ? { background: bg, color: text } : undefined}
                  className={[
                    'relative aspect-square flex items-center justify-center rounded-[3px] text-[10px] font-bold leading-none tracking-tighter',
                    // 폴드 칸: 지면색 그대로(비어 있음) + ink-muted **불투명** — /50 은 1.98(라이트)/2.27(다크) 였다(2026-09-26). 지금은 4.76/4.93.
                    bg ? '' : 'bg-surface-high text-ink-muted',
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

      {/* 범례 + 콤보 가중 요약 (셀 수 %가 아니라 1326콤보 기준 — 실제 빈도 감각)
          ⚠ 2026-09-19 오너: "100% 폴드인데 모든 핸드가 4bet 2.몇%" — 이 줄의 **레인지 전체** 비율(vs3벳 4벳 1.9~2.2%)을
          방금 누른 핸드의 값으로 읽었다(실측: 72o 상세는 '폴드 100%', 셀 색 없음, 데이터도 0). 숫자는 맞고 **무엇의 %인지**가 없었다.
          '전체' 라벨을 붙여 아래 핸드 상세('이 핸드')와 구별한다 — 값·형식('라벨 xx.x%')은 그대로다(e2e tools.spec 이 그 형식을 본다). */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" title="레인지 전체(1326콤보)에서 각 액션이 차지하는 비율 — 특정 핸드의 빈도가 아닙니다">
        <span className="text-2xs font-semibold text-ink-muted">전체 레인지 기준</span>
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
        const rows = actions.map((a) => ({ label: a.label, color: colorOf(a), f: a.freq.get(sel) ?? 0 })).filter((r) => r.f > 0);
        const foldF = Math.max(0, 1 - rows.reduce((s, r) => s + r.f, 0));
        return (
          <div className="rounded-input border border-border-default bg-surface-high px-3 py-2 animate-fade-in">
            <div className="flex items-baseline justify-between">
              <b className="text-sm text-ink-primary">{sel} <span className="text-2xs font-semibold text-ink-muted">이 핸드</span></b>
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
