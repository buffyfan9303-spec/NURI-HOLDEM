// src/components/features/HandGtoModal.tsx
// 게시판 핸드(내 홀카드 2장) → 프리플랍 오픈 기준 조회.
//
// ── 2026-09-11: 전략의 단일 소스를 차트로 통일 ────────────────────────────────
// 종전에는 이 화면만 src/lib/preflop.ts 의 Chen 공식 근사를 썼다. GTO 탭의 프리플랍 레인지 차트는
// src/lib/ranges.data.ts 를 쓰는데, 같은 스팟에서 두 소스가 **정면으로 충돌했다**:
//   6맥스 LJ(UTG) 오픈 100bb — 차트는 77·ATo 를 100% 오픈이라 하고, Chen 계산은 폴드라고 했다.
// 같은 앱이 같은 상황에 반대로 답하면 둘 다 못 믿게 된다. 그래서 이 화면도 차트를 읽는다.
//
// 대신 차트는 **100bb 한 벌**만 있다. 다른 스택을 물으면 값을 만들어 내지 않고
// '현재 데이터 미지원' 이라고 말한 뒤 숏스택 도구(푸시·폴드 차트)로 보낸다 —
// 없는 데이터를 근사로 채우는 것이 이 화면이 원래 하던 일이었고, 그게 충돌의 원인이었다.
import { useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { cardsToLabel, RANK_PCT } from '../../lib/preflop';
import { buildFreq } from '../../lib/ranges';
import { RANGE_SCENARIOS } from '../../lib/ranges.data';
import SourceBadge from './tools/SourceBadge';

/** 차트가 덮는 스택 — ranges.data 는 100bb 한 벌뿐이다(파일 상단 주석). */
const CHART_BB = 100;
const STACK_TABS: { bb: number; label: string }[] = [
  { bb: 12, label: '12bb' },
  { bb: 20, label: '20bb' },
  { bb: 40, label: '40bb' },
  { bb: CHART_BB, label: '100bb' },
];

/** 6맥스 오픈(RFI) 스팟 — 차트 id 그대로. 표시 순서 = 자리 순서. */
const RFI6 = ['rfi_lj', 'rfi_hj', 'rfi_co', 'rfi_btn', 'rfi_sb'] as const;

export default function HandGtoModal({ hero, onClose }: { hero: string[]; onClose: () => void }) {
  const [bb, setBb] = useState<number>(CHART_BB);
  const label = hero.length >= 2 ? cardsToLabel(hero[0], hero[1]) : null;
  // 핸드 강도 순위(169핸드 중 상위 N%) — 전략 권장이 아니라 **정렬용 지표**다. 그대로 둔다.
  const pctRank = label ? Math.round((RANK_PCT.get(label) ?? 1) * 100) : 0;

  /** 각 포지션에서 이 핸드의 오픈 빈도(0~1). 차트에 없으면 0(=폴드). */
  const rows = useMemo(() => {
    if (!label) return [];
    return RFI6.map((id) => {
      const scen = RANGE_SCENARIOS.find((s) => s.id === id);
      const open = scen?.actions.find((a) => a.key === 'raise');
      const freq = open ? (buildFreq(open.spec).get(label) ?? 0) : 0;
      return { id, label: scen?.label ?? id, freq };
    });
  }, [label]);

  const supported = bb === CHART_BB;

  return (
    <Modal open onClose={onClose} title="프리플랍 오픈 기준" maxWidth="sm" dragToClose>
      {!label ? (
        <p className="p-6 text-center text-sm text-ink-muted">내 홀카드 2장이 있어야 조회할 수 있어요.<br />핸드를 첨부한 글에서 사용하세요.</p>
      ) : (
        <div className="space-y-3 p-4">
          {/* 핸드 + 강도 */}
          <div className="rounded-card border border-accent-400/30 bg-accent-300/[0.05] p-3 text-center">
            <p className="text-2xs text-ink-muted">내 핸드</p>
            <p className="text-3xl font-extrabold leading-none text-accent-300">{label}</p>
            <p className="mt-1 text-xs text-ink-secondary">169핸드 중 <b className="text-ink-primary">상위 {pctRank}%</b> 강도</p>
          </div>

          {/* 스택 */}
          <div className="flex items-center gap-1">
            {STACK_TABS.map((st) => {
              const on = st.bb === bb;
              return (
                <button key={st.bb} type="button" onClick={() => setBb(st.bb)}
                  className={['h-8 flex-1 rounded-input border text-xs font-bold transition-colors',
                    on ? 'border-accent-300 bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-muted'].join(' ')}>
                  {st.label}
                </button>
              );
            })}
          </div>

          {supported ? (
            <>
              <div>
                <p className="mb-1 flex items-center justify-between gap-2 text-2xs font-bold text-ink-secondary">
                  <span>포지션별 오픈 기준 · 6맥스</span>
                  <SourceBadge kind="chart" note="100bb" />
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {rows.map((r) => {
                    // 차트의 빈도를 그대로 읽는다 — 100%/부분/0 세 단계. 임의 보정 없음.
                    const lab = r.freq >= 1 ? '오픈' : r.freq > 0 ? `${Math.round(r.freq * 100)}%` : '폴드';
                    const cls = r.freq >= 1 ? 'bg-accent-300 text-white'
                      : r.freq > 0 ? 'bg-accent-300/25 text-accent-300'
                        : 'bg-surface-high text-ink-muted/70';
                    return (
                      <div key={r.id} className="text-center">
                        <p className="truncate text-2xs font-bold text-ink-secondary">{r.label}</p>
                        <p className={['mt-0.5 rounded-input py-1.5 text-2xs font-extrabold tabular-nums', cls].join(' ')}>{lab}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-2xs leading-relaxed text-ink-muted">
                ※ GTO 탭의 <b className="text-accent-300">프리플랍 레인지 차트</b>와 **같은 표**를 읽습니다(둘이 다른 답을 내지 않습니다).
                멀티웨이·림프 상황은 이 표가 다루지 않습니다.
              </p>
            </>
          ) : (
            // 없는 데이터를 근사로 만들어 내지 않는다 — 그게 충돌의 원인이었다.
            <div className="rounded-input border border-amber-500/40 bg-amber-500/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                <Icon name="info" size={13} className="shrink-0" aria-hidden />현재 데이터 미지원
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-secondary break-keep">
                이 앱의 프리플랍 차트는 <b>100bb 한 벌</b>입니다. {bb}bb 기준 표는 없습니다.
                숏스택(≤20bb)은 GTO 탭의 <b className="text-accent-300">푸시 · 폴드 차트</b>를 쓰세요 — 그쪽은 스택별 자체 Nash 데이터가 있습니다.
              </p>
              <button type="button"
                onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('nuri:open-tool', { detail: 'pushfold' })); }}
                className="btn-primary mt-2 min-h-[36px] px-3 text-xs">푸시 · 폴드 차트 열기</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
