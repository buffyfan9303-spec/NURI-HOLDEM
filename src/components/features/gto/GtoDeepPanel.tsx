// src/components/features/gto/GtoDeepPanel.tsx
// GTO 핸드 분석 — 인라인 패널. 도구 탭에서 다른 계산기와 동일한 카드형 UI로 표시된다.
// 공유 링크(#gto=) 진입 시에는 GtoDeepModal 이 이 패널을 모달로 감싸 재사용한다.
import { useEffect, useState } from 'react';
import { useBackClose } from '../../../lib/backstack';
import { useToast } from '../../atoms/Toast';
import CardGridPicker, { SUIT_COLOR, SUIT_LABEL } from './CardGridPicker';
import { CalcCard } from '../tools/calcUi';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { EQUITY_BANDS } from './equityBands';
import { writeSnap } from '../../../lib/snapshot';
import { useDeepGto, type CardTarget, type DeepGtoInit } from './useDeepGto';
import { canonicalizeHand } from './useGtoCalculator';
import { equityAsync } from './equityClient';
import { encodeSpot } from './gtoShare';
import type { Card, ActionFrequency } from './gto.types';

function comboIdOf(cards: readonly (Card | null)[]): string | null {
  if (!cards[0] || !cards[1]) return null;
  const suited = cards[0].suit === cards[1].suit ? 'suited' : 'offsuit';
  return canonicalizeHand([cards[0].rank, cards[1].rank], suited)?.id ?? null;
}

function CardSlot({ card, active, onClick }: { card: Card | null; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-12 w-9 flex-col items-center justify-center rounded-input border transition-colors',
        card
          ? 'border-border-strong bg-surface-high'
          : active
            ? 'border-dashed border-accent-300 bg-accent-300/5'
            : 'border-dashed border-border-default bg-surface-low/40',
      ].join(' ')}
    >
      {card ? (
        <>
          <span className={['text-base font-bold leading-none', SUIT_COLOR[card.suit]].join(' ')}>{card.rank}</span>
          <span className={['text-2xs leading-none', SUIT_COLOR[card.suit]].join(' ')}>{SUIT_LABEL[card.suit]}</span>
        </>
      ) : (
        <span className="text-xs text-ink-muted/40">+</span>
      )}
    </button>
  );
}

function Section({
  title, target, cards, current, onSelectTarget, onRemove,
}: {
  title: string;
  target: CardTarget;
  cards: readonly (Card | null)[];
  current: CardTarget;
  onSelectTarget: (t: CardTarget) => void;
  onRemove: (t: CardTarget, i: number) => void;
}) {
  const active = current === target;
  const nextEmpty = cards.findIndex((c) => c === null);
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelectTarget(target)}
        className={['mb-1 block text-2xs font-bold uppercase tracking-wider transition-colors', active ? 'text-accent-300' : 'text-ink-muted'].join(' ')}
      >
        {title}
      </button>
      <div className="flex gap-1">
        {cards.map((c, i) => (
          <CardSlot
            key={i}
            card={c}
            active={active && i === nextEmpty}
            onClick={() => (c ? onRemove(target, i) : onSelectTarget(target))}
          />
        ))}
      </div>
    </div>
  );
}

function MixBar({ action }: { action: Required<ActionFrequency> }) {
  // 액션 빈도바 — '액션 축'이므로 ACTION_COLORS 만 쓴다(에퀴티 강도 축과 분리, 검증 #01).
  const segs = [
    { key: 'raise', label: '레이즈', v: action.raise, color: ACTION_COLORS.raise },
    { key: 'call', label: '콜', v: action.call, color: ACTION_COLORS.call },
    { key: 'fold', label: '폴드', v: action.fold, color: ACTION_COLORS.fold },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex h-7 w-full overflow-hidden rounded-input bg-surface-high">
        {segs.map((s) => (s.v > 0 ? (
          <div key={s.key} style={{ width: `${s.v * 100}%`, background: s.color }} className="transition-[width] duration-500" />
        ) : null))}
      </div>
      <div className="flex items-center justify-between">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-2xs text-ink-secondary">{s.label}</span>
            <span className="text-2xs font-bold tabular-nums text-ink-primary">{Math.round(s.v * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 스트릿별 권장 액션 (에퀴티 기반 휴리스틱) — 색은 EQUITY_BANDS(강도 축) 5밴드 1:1.
interface StreetRec { label: string; color: string; note: string; }

function preflopRec(eq: number): StreetRec {
  const p = Math.round(eq * 100);
  if (eq >= 0.60) return { label: '레이즈 (밸류)', color: EQUITY_BANDS.dominant, note: `에퀴티 ${p}% — 가치 레이즈로 밸류를 키웁니다.` };
  if (eq >= 0.52) return { label: '레이즈/콜 혼합', color: EQUITY_BANDS.strong, note: `에퀴티 ${p}% — 레이즈와 콜을 섞어 균형을 잡습니다.` };
  if (eq >= 0.44) return { label: '콜', color: EQUITY_BANDS.playable, note: `에퀴티 ${p}% — 콜로 포트에 참여할 만합니다.` };
  if (eq >= 0.36) return { label: '콜/폴드 경계', color: EQUITY_BANDS.marginal, note: `에퀴티 ${p}% — 포지션·오즈가 좋을 때만 콜.` };
  return { label: '폴드', color: EQUITY_BANDS.weak, note: `에퀴티 ${p}% — 폴드가 정석입니다.` };
}
function postRec(eq: number): StreetRec {
  const p = Math.round(eq * 100);
  if (eq >= 0.62) return { label: '벳/레이즈 (밸류)', color: EQUITY_BANDS.dominant, note: `에퀴티 ${p}% — 밸류 벳으로 강하게 압박합니다.` };
  if (eq >= 0.50) return { label: '벳 또는 체크-콜', color: EQUITY_BANDS.strong, note: `에퀴티 ${p}% — 상황에 따라 벳/체크-콜.` };
  if (eq >= 0.40) return { label: '체크-콜', color: EQUITY_BANDS.playable, note: `에퀴티 ${p}% — 포트 컨트롤 위주로 콜.` };
  if (eq >= 0.30) return { label: '체크 (회피)', color: EQUITY_BANDS.marginal, note: `에퀴티 ${p}% — 큰 베팅엔 폴드를 고려.` };
  return { label: '체크-폴드', color: EQUITY_BANDS.weak, note: `에퀴티 ${p}% — 공격받으면 포기합니다.` };
}

/** AI 액션 해설 — 비포/플랍/턴/리버 4개 스트릿 권장 액션 */
function DeepActionSheet({
  open, onClose, hero, villain, board,
}: {
  open: boolean;
  onClose: () => void;
  hero: readonly (Card | null)[];
  villain: readonly (Card | null)[];
  board: readonly (Card | null)[];
}) {
  // [DS] MO-9C: 시트 열림 시 3000회 × 4스트릿 동기 계산이 useMemo(렌더 중) 롱태스크였다
  // → 워커 비동기로 전환(열리는 프레임이 더는 멈추지 않는다). 결과·표시는 동일.
  type ActionRow = { key: string; eq: number | null; rec: (eq: number) => { label: string; color: string; note: string } };
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  useEffect(() => {
    if (!open) { setRows(null); return; }
    const h = hero.filter((c): c is Card => c !== null);
    const v = villain.filter((c): c is Card => c !== null);
    if (h.length < 2 || v.length < 2) { setRows(null); return; }
    const b = board.filter((c): c is Card => c !== null);
    let alive = true;
    const eqAt = (n: number): Promise<number | null> =>
      n > 0 && b.length < n
        ? Promise.resolve(null)
        : equityAsync([h[0], h[1]], [v[0], v[1]], b.slice(0, n), 3000).then((r) => r.hero);
    Promise.all([eqAt(0), eqAt(3), eqAt(4), eqAt(5)]).then(([e0, e3, e4, e5]) => {
      if (!alive) return;
      setRows([
        { key: '비포 (프리플랍) 액션', eq: e0, rec: preflopRec },
        { key: '플랍 액션',            eq: e3, rec: postRec },
        { key: '턴 액션',             eq: e4, rec: postRec },
        { key: '리버 액션',           eq: e5, rec: postRec },
      ]);
    });
    return () => { alive = false; };
  }, [open, hero, villain, board]);

  useBackClose(open, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="AI 액션 해설">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex max-h-[75vh] w-full max-w-md flex-col rounded-t-dialog bg-surface-mid shadow-dialog animate-slide-up">
        <div className="flex justify-center pt-2 pb-1"><div className="h-1 w-10 rounded-full bg-border-strong" /></div>
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
          <h3 className="text-sm font-bold text-accent-300">AI 액션 해설</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-input text-ink-secondary hover:bg-surface-high hover:text-ink-primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {!rows ? (
            <p className="py-6 text-center text-2xs text-ink-muted">Hero / Villain 카드를 모두 입력하세요.</p>
          ) : (
            rows.map(({ key, eq, rec }) => {
              const r = eq === null ? null : rec(eq);
              return (
                <div key={key} className="rounded-input border border-border-default bg-surface-low p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold text-ink-secondary">{key}</span>
                    {r ? (
                      <span className="text-sm font-extrabold" style={{ color: r.color }}>{r.label}</span>
                    ) : (
                      <span className="text-2xs text-ink-muted">보드 미입력</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                    {r ? r.note : '해당 스트릿 보드 카드를 입력하면 권장 액션이 표시됩니다.'}
                  </p>
                </div>
              );
            })
          )}
          <p className="pt-1 text-2xs text-ink-muted">학습용 참고 설명입니다. 실제 솔버 값과 차이가 있을 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}

export default function GtoDeepPanel({ initialState }: { initialState?: DeepGtoInit }) {
  const deep = useDeepGto(initialState);
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  // 마지막 입력 영속(Phase 12-2) — 재진입 시 ToolsPanel 이 이 스냅샷을 initialState 로 복원한다.
  // '만드는' 도구가 아니라 '고치는' 도구가 되도록: 사용자는 항상 직전(또는 데모) 결과에서 시작한다.
  useEffect(() => {
    writeSnap('tool:gto', {
      hero: deep.hero.filter(Boolean),
      villain: deep.villain.filter(Boolean),
      board: deep.board.filter(Boolean),
    });
  }, [deep.hero, deep.villain, deep.board]);

  const heroId = comboIdOf(deep.hero);
  const rangeMode = deep.villainMode === 'range';
  // 레인지 모드에선 빌런 슬롯 대신 선택 레인지 이름을 표시
  const villainId = rangeMode ? deep.villainRange.label : deep.villainComboId;
  const showResult = deep.heroComplete && (rangeMode || deep.villainComplete) && deep.result && deep.normalizedAction;

  const na = deep.normalizedAction;
  // 권장 액션 배지 — 액션 축이므로 ACTION_COLORS(빈도바와 동일 색)만 쓴다.
  const recommended = na
    ? [{ label: '레이즈', v: na.raise, color: ACTION_COLORS.raise }, { label: '콜', v: na.call, color: ACTION_COLORS.call }, { label: '폴드', v: na.fold, color: ACTION_COLORS.fold }]
        .reduce((a, b) => (b.v > a.v ? b : a))
    : null;

  const shareSpot = async () => {
    const code = encodeSpot(deep.hero, deep.villain, deep.board);
    const url = `${window.location.origin}${window.location.pathname}#gto=${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'NURI HOLDEM GTO', text: '내 핸드 분석을 확인해보세요', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.show('공유 링크를 복사했습니다', 'success');
    } catch { /* 사용자 취소 등은 무시 */ }
  };

  const TARGET_TABS: { t: CardTarget; label: string }[] = [
    { t: 'hero', label: 'Hero' },
    { t: 'villain', label: 'Villain' },
    { t: 'board', label: 'Board' },
  ];

  return (
    <div className="space-y-3">
      {/* 카드 입력 — 공통 CalcCard 로 다른 계산기와 같은 카드 문법 */}
      <CalcCard>
        {/* 빌런 입력 모드 토글 — 특정 핸드 / 레인지 프리셋 */}
        <div className="flex justify-center gap-1">
          {([['hand', '특정 핸드'], ['range', '레인지 프리셋']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => deep.setVillainMode(m)}
              className={[
                'h-7 rounded-input px-3 text-2xs font-semibold transition-colors',
                deep.villainMode === m ? 'bg-accent-300 text-white' : 'border border-border-default bg-surface-high text-ink-secondary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-end justify-center gap-3">
          <Section title="Hero" target="hero" cards={deep.hero} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
          <span className="pb-4 text-2xs font-bold text-ink-muted">vs</span>
          {deep.villainMode === 'hand' ? (
            <Section title="Villain" target="villain" cards={deep.villain} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
          ) : (
            <div>
              <p className="mb-1 text-2xs font-bold uppercase tracking-wider text-ink-muted">Villain</p>
              <div className="flex h-12 items-center rounded-input border border-border-strong bg-surface-high px-3">
                <span className="text-xs font-bold text-ink-primary">{deep.villainRange.label}</span>
                <span className="ml-1.5 text-2xs tabular-nums text-ink-muted">
                  {Math.round(deep.villainRange.combos.reduce((s, c) => s + c.weight, 0))}콤보
                </span>
              </div>
            </div>
          )}
        </div>
        {deep.villainMode === 'range' && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {deep.villainRanges.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => deep.selectVillainRange(r.id)}
                className={[
                  'rounded-badge border px-2 py-1 text-2xs font-bold transition-colors',
                  deep.villainRange.id === r.id
                    ? 'border-accent-400/60 bg-accent-300/15 text-accent-300'
                    : 'border-border-default bg-surface-high text-ink-secondary hover:text-accent-300',
                ].join(' ')}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-center">
          <Section title="Board (선택)" target="board" cards={deep.board} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => deep.applyBoardPreset([])}
            className="rounded-input border border-border-default bg-surface-high px-3 py-1.5 text-2xs font-semibold text-ink-muted transition-colors hover:text-danger-light"
          >
            보드 초기화
          </button>
        </div>
      </CalcCard>

      {/* 결과 */}
      {showResult && deep.result && deep.normalizedAction ? (
        <CalcCard className="animate-fade-in">
          <p className="text-center text-sm">
            <b className="text-accent-300">{heroId}</b>
            <span className="mx-2 text-ink-muted">vs</span>
            <b className="text-ink-primary">{villainId}</b>
          </p>

          <div>
            <p className="mb-1 text-2xs font-semibold text-ink-secondary">
              에퀴티 (Hero vs Villain){deep.board.some((c) => c !== null) ? ' · 보드 반영' : ' · 프리플랍'} · 실시간 계산
            </p>
            {deep.calculating || !deep.equity ? (
              <div className="flex h-5 items-center gap-2 text-2xs text-ink-muted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />
                에퀴티 계산 중...
              </div>
            ) : (
              <>
                <div className="flex h-5 overflow-hidden rounded-input bg-surface-high">
                  <div style={{ width: `${deep.equity.hero * 100}%` }} className="bg-accent-300 transition-[width] duration-500" />
                </div>
                <div className="mt-1 flex justify-between text-2xs">
                  <span className="font-bold text-accent-300">Hero {Math.round(deep.equity.hero * 100)}%</span>
                  <span className="text-ink-secondary">Villain {Math.round(deep.equity.villain * 100)}%</span>
                </div>
              </>
            )}
          </div>

          <div>
            <p className="mb-1 text-2xs font-semibold text-ink-secondary">참고 액션 가이드</p>
            <MixBar action={deep.normalizedAction} />
            <p className="mt-1.5 text-2xs text-ink-muted">※ 에퀴티·팟오즈 기반 근사(솔버 아님) — 실제 GTO 솔버 값과 다를 수 있습니다.</p>
          </div>

          {deep.equity && !deep.calculating && (() => {
            const tie = deep.equity.tie ?? 0;
            const win = Math.max(0, deep.equity.hero - tie / 2);
            const lose = Math.max(0, deep.equity.villain - tie / 2);
            const cells = [
              { k: '승', v: win, color: '#22C55E' },
              { k: '무', v: tie, color: '#94A3B8' },
              { k: '패', v: lose, color: '#EF4444' },
            ];
            return (
              <div>
                <p className="mb-1 text-2xs font-semibold text-ink-secondary">승률 (승 / 무 / 패)</p>
                <div className="grid grid-cols-3 gap-2">
                  {cells.map((c) => (
                    <div key={c.k} className="rounded-input border border-border-subtle bg-surface-high px-2 py-1.5 text-center">
                      <p className="text-2xs text-ink-muted">{c.k}</p>
                      <p className="text-base font-extrabold tabular-nums leading-tight" style={{ color: c.color }}>
                        {(c.v * 100).toFixed(1)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {recommended && (
            <div
              className="flex items-center justify-center gap-2 rounded-input border py-2"
              style={{ borderColor: `${recommended.color}66`, background: `${recommended.color}14` }}
            >
              <span className="text-2xs text-ink-muted">권장 액션</span>
              <span className="text-sm font-extrabold" style={{ color: recommended.color }}>
                {recommended.label} {Math.round(recommended.v * 100)}%
              </span>
            </div>
          )}

          {/* AI 해설·공유는 특정 핸드(hand) 모드 전용 — 공유 해시가 hand 조합만 인코딩 */}
          {!rangeMode && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setSheetOpen(true)} className="btn-ghost inline-flex flex-1 items-center justify-center gap-2 py-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
              AI 해설
            </button>
            <button type="button" onClick={shareSpot} aria-label="공유 링크 생성" className="btn-ghost inline-flex items-center justify-center gap-1.5 px-4 py-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
              공유
            </button>
          </div>
          )}
        </CalcCard>
      ) : (
        <p className="rounded-card border border-border-default bg-surface-low px-3 py-4 text-center text-2xs leading-relaxed text-ink-muted">
          {rangeMode
            ? '아래 그리드에서 Hero 2장을 선택하면 선택한 레인지 상대 실시간 에퀴티와 참고 액션이 표시됩니다. (보드는 선택)'
            : '아래 그리드에서 Hero 2장과 Villain 2장을 선택하면 실시간 에퀴티와 참고 액션이 표시됩니다. (보드는 선택)'}
        </p>
      )}

      {/* 카드 선택 그리드 */}
      <CalcCard>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {TARGET_TABS.filter(({ t }) => !(rangeMode && t === 'villain')).map(({ t, label }) => (
              <button
                key={t}
                type="button"
                onClick={() => deep.setTarget(t)}
                className={[
                  'h-7 rounded-input px-2.5 text-2xs font-semibold transition-colors',
                  deep.currentTarget === t ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-secondary border border-border-default',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={deep.clearAll} className="text-2xs font-semibold text-ink-muted hover:text-danger-light">초기화</button>
        </div>
        <CardGridPicker usedIds={deep.usedIds} onPick={deep.placeCard} />
      </CalcCard>

      <DeepActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        hero={deep.hero}
        villain={deep.villain}
        board={deep.board}
      />
    </div>
  );
}
