// src/components/features/tools/StartingHandRankPanel.tsx
// 스타팅 핸드 순위 — 오너 요청 2026-09-23 "규칙 · 대회 쪽에 핸드 순위 신설"(= 프리플랍 두 장 169개의 강한 순서).
// 기존 '홀덤 족보'(HandRankPanel, 5장 족보 순서)와 다른 도구다 — 그쪽은 그대로 둔다.
//
// 값은 startingHandRank.data.ts 가 단일 출처(생성기 scripts/gen-nash/starting-hand-exact.mjs — 보드 전수 정확값, 2026-09-25).
// 기준: 무작위 한 손(헤즈업) 상대 프리플랍 올인 승률. 실전 판단(포지션·스택·상대 레인지)은 레인지 차트 몫이라 화면에 그 한계를 적는다.
//
// 격자 칸 크기: 13×13 은 320px 에서 칸당 약 20px 이라 44px 터치 계약을 만족할 수 없다 — RangeMatrix13(프리플랍 레인지 차트)과
// 같은 선례를 따른다: 격자는 '훑어보기 + 대략 탭', **정확한 선택은 아래 목록**(행 높이 44px·검색)이 1급 경로다.
// 목록 행을 누르면 격자의 같은 칸에 링이 켜지고, 격자 칸을 누르면 격자 바로 아래 상세가 뜬다.
import { CHIP_HIT } from '../gto/chip';
import { useMemo, useState } from 'react';
import Icon from '../../atoms/Icon';
import { comboCount, gridName } from '../../../lib/ranges';
import { STARTING_HAND_EQUITY } from './startingHandRank.data';

interface Row {
  hand: string; rank: number; eq: number; kind: string; combos: number;
  /** 이 핸드까지 누적한 콤보가 전체 1326콤보에서 차지하는 비율(%) — "상위 몇 %" */
  topPct: number;
}

const kindOf = (h: string) => (h.length === 2 ? '페어' : h.endsWith('s') ? '수딧' : '오프수트');

const ROWS: Row[] = (() => {
  let cum = 0;
  return STARTING_HAND_EQUITY.map(([hand, eq], i) => {
    const combos = comboCount(hand);
    cum += combos;
    return { hand, rank: i + 1, eq, kind: kindOf(hand), combos, topPct: (cum / 1326) * 100 };
  });
})();
const BY_HAND = new Map(ROWS.map((r) => [r.hand, r]));

// 순위 색 단계 — 진할수록 강하다. 글자색은 바탕 진하기에 맞춰 흰색/본문색으로 갈린다.
const TIERS = [
  { max: 10, cell: 'bg-accent-300 text-white', label: '1~10' },
  { max: 25, cell: 'bg-accent-300/75 text-white', label: '11~25' },
  { max: 50, cell: 'bg-accent-300/50 text-ink-primary', label: '26~50' },
  { max: 85, cell: 'bg-accent-300/30 text-ink-primary', label: '51~85' },
  { max: 120, cell: 'bg-accent-300/15 text-ink-primary', label: '86~120' },
  { max: 169, cell: 'bg-surface-high text-ink-muted', label: '121~169' },
] as const;
const tierOf = (rank: number) => TIERS.find((t) => rank <= t.max) ?? TIERS[TIERS.length - 1];

const LIMITS = [20, 50, 169] as const;

/** 검색어 정규화 — 'a k s' · 'aks' · '10' 모두 받는다. */
const norm = (s: string) => s.toUpperCase().replace(/10/g, 'T').replace(/\s+/g, '');

export default function StartingHandRankPanel() {
  const [sel, setSel] = useState<string | null>(null);
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(20);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = norm(q);
    if (!needle) return ROWS.slice(0, limit);
    return ROWS.filter((r) => r.hand.toUpperCase().startsWith(needle) || r.kind.includes(q.trim()));
  }, [q, limit]);

  const selRow = sel ? BY_HAND.get(sel) : undefined;
  const searching = q.trim().length > 0;

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-ink-muted">
        <b className="font-semibold text-ink-secondary">무작위 한 손 상대 올인 승률 기준 — 실전 포지션·스택에 따라 달라짐.</b>{' '}
        두 장만 들고 상대 한 명(아무 두 장)과 보드 5장을 끝까지 봤을 때 이길 확률이며, 비기면 절반으로 셉니다.
      </p>

      {/* 13×13 격자 — 대각선 페어, 위 수딧, 아래 오프수트 */}
      <div className="mx-auto w-full max-w-[420px]" data-testid="startrank-grid">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {Array.from({ length: 13 }, (_, i) =>
            Array.from({ length: 13 }, (_, j) => {
              const name = gridName(i, j);
              const r = BY_HAND.get(name);
              if (!r) return <span key={name} />;
              const on = sel === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSel(on ? null : name)}
                  aria-pressed={on}
                  aria-label={`${name} ${r.rank}위 승률 ${r.eq.toFixed(1)}%`}
                  className={[
                    'relative aspect-square flex items-center justify-center rounded-[3px] text-[10px] font-bold leading-none tracking-tighter whitespace-nowrap',
                    tierOf(r.rank).cell,
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

      {/* 범례 — 순위 구간 */}
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1" role="list" aria-label="색 구간(순위)">
        <span role="listitem" className="text-2xs font-semibold text-ink-muted">순위</span>
        {TIERS.map((t) => (
          <span key={t.label} role="listitem" className="inline-flex items-center gap-1 text-2xs text-ink-secondary">
            <span className={`inline-block h-3 w-3 rounded-[3px] ${t.cell}`} aria-hidden />
            {t.label}
          </span>
        ))}
      </div>

      {/* 칸 상세 — 모바일에서 격자 글자만으로는 값이 안 읽히므로 여기가 판독 층이다. */}
      {selRow && (
        <div className="rounded-input border border-border-default bg-surface-high px-3 py-2 animate-fade-in" aria-live="polite" data-testid="startrank-detail">
          <div className="flex items-baseline justify-between gap-2">
            <b className="text-sm text-ink-primary">
              {selRow.hand} <span className="text-2xs font-semibold text-ink-muted">{selRow.kind} · {selRow.combos}콤보</span>
            </b>
            <span className="shrink-0 text-2xs tabular-nums text-ink-muted">169개 중 <b className="text-ink-primary">{selRow.rank}위</b></span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-2xs text-ink-secondary">승률 <b className="text-sm tabular-nums text-ink-primary">{selRow.eq.toFixed(2)}%</b></span>
            <span className="text-2xs tabular-nums text-ink-muted">여기까지가 전체 두 장의 상위 {selRow.topPct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* 순위 목록 — 정확한 선택의 1급 경로(행 44px) */}
      <section className="space-y-2" aria-labelledby="startrank-list">
        <div className="flex items-center justify-between gap-2">
          <h3 id="startrank-list" className="text-sm font-bold text-ink-primary">순위 목록</h3>
          <div className="flex gap-1" role="group" aria-label="보여 줄 개수">
            {LIMITS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={!searching && limit === n}
                onClick={() => setLimit(n)}
                disabled={searching}
                className={[
                  // 보이는 32px · 누르는 44px(CHIP_HIT — gto/chip.ts)
                  CHIP_HIT, 'inline-flex h-[32px] shrink-0 items-center whitespace-nowrap rounded-input border px-2.5 text-2xs font-semibold transition-colors disabled:opacity-40',
                  !searching && limit === n ? 'border-accent-300 bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-secondary',
                ].join(' ')}
              >
                {n === 169 ? '전체' : `상위 ${n}`}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="핸드 검색 · AK · 77 · 수딧"
            className="input w-full pl-9 text-sm"
            aria-label="핸드 검색"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {list.length === 0 ? (
          <p className="py-4 text-center text-2xs text-ink-muted">맞는 핸드가 없습니다. 예: AK · T9s · 22</p>
        ) : (
          <ol className="rounded-aura border card-aura divide-y divide-border-subtle" aria-label="스타팅 핸드 순위 — 강한 순서" data-testid="startrank-list">
            {list.map((r) => {
              const on = sel === r.hand;
              return (
                <li key={r.hand}>
                  <button
                    type="button"
                    onClick={() => setSel(on ? null : r.hand)}
                    aria-pressed={on}
                    className={['flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left', on ? 'bg-accent-300/10' : ''].join(' ')}
                  >
                    <span className="w-8 shrink-0 text-2xs font-bold tabular-nums text-ink-muted">{r.rank}</span>
                    <span className={`inline-flex h-6 w-10 shrink-0 items-center justify-center rounded-[4px] text-xs font-bold ${tierOf(r.rank).cell}`}>{r.hand}</span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary">{r.kind}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-ink-primary">{r.eq.toFixed(1)}%</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
