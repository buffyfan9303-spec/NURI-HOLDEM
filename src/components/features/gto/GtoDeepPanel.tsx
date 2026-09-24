// src/components/features/gto/GtoDeepPanel.tsx
// GTO 핸드 분석 — 인라인 패널. 도구 탭에서 다른 계산기와 동일한 카드형 UI로 표시된다.
// 공유 링크(#gto=) 진입 시에는 GtoDeepModal 이 이 패널을 모달로 감싸 재사용한다.
import { CHIP_HIT, TEXT_HIT } from './chip';
import { useEffect, useState } from 'react';
import Modal from '../../atoms/Modal';
import { useToast } from '../../atoms/Toast';
import CardGridPicker, { SUIT_COLOR, SUIT_LABEL } from './CardGridPicker';
import { CalcCard } from '../tools/calcUi';
import SourceBadge from '../tools/SourceBadge';
import { ACTION_COLORS, ACTION_TEXT_COLORS } from '../../../lib/ranges.data';
import { EQUITY_BANDS, EQUITY_BAND_TEXT } from './equityBands';
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
          <div key={s.key} style={{ width: `${s.v * 100}%`, background: s.color }} className="transition-[width] duration-[var(--dur-panel)]" />
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
// color = 차트/틴트용 고정 fill(도메인 스냅샷) · textColor = 글자용 대비 보정색. 둘을 섞지 않는다.
interface StreetRec { label: string; color: string; textColor: string; note: string; }

function preflopRec(eq: number): StreetRec {
  const p = Math.round(eq * 100);
  if (eq >= 0.60) return { label: '레이즈 (밸류)', color: EQUITY_BANDS.dominant, textColor: EQUITY_BAND_TEXT.dominant, note: `에퀴티 ${p}%. 가치 레이즈로 밸류를 키웁니다.` };
  if (eq >= 0.52) return { label: '레이즈/콜 혼합', color: EQUITY_BANDS.strong, textColor: EQUITY_BAND_TEXT.strong, note: `에퀴티 ${p}%. 레이즈와 콜을 섞어 균형을 잡습니다.` };
  if (eq >= 0.44) return { label: '콜', color: EQUITY_BANDS.playable, textColor: EQUITY_BAND_TEXT.playable, note: `에퀴티 ${p}%. 콜로 포트에 참여할 만합니다.` };
  if (eq >= 0.36) return { label: '콜/폴드 경계', color: EQUITY_BANDS.marginal, textColor: EQUITY_BAND_TEXT.marginal, note: `에퀴티 ${p}%. 포지션·오즈가 좋을 때만 콜.` };
  return { label: '폴드', color: EQUITY_BANDS.weak, textColor: EQUITY_BAND_TEXT.weak, note: `에퀴티 ${p}%. 폴드가 정석입니다.` };
}
function postRec(eq: number): StreetRec {
  const p = Math.round(eq * 100);
  if (eq >= 0.62) return { label: '벳/레이즈 (밸류)', color: EQUITY_BANDS.dominant, textColor: EQUITY_BAND_TEXT.dominant, note: `에퀴티 ${p}%. 밸류 벳으로 강하게 압박합니다.` };
  if (eq >= 0.50) return { label: '벳 또는 체크-콜', color: EQUITY_BANDS.strong, textColor: EQUITY_BAND_TEXT.strong, note: `에퀴티 ${p}%. 상황에 따라 벳/체크-콜.` };
  if (eq >= 0.40) return { label: '체크-콜', color: EQUITY_BANDS.playable, textColor: EQUITY_BAND_TEXT.playable, note: `에퀴티 ${p}%. 포트 컨트롤 위주로 콜.` };
  if (eq >= 0.30) return { label: '체크 (회피)', color: EQUITY_BANDS.marginal, textColor: EQUITY_BAND_TEXT.marginal, note: `에퀴티 ${p}%. 큰 베팅엔 폴드를 고려.` };
  return { label: '체크-폴드', color: EQUITY_BANDS.weak, textColor: EQUITY_BAND_TEXT.weak, note: `에퀴티 ${p}%. 공격받으면 포기합니다.` };
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
  type ActionRow = { key: string; eq: number | null; rec: (eq: number) => { label: string; color: string; textColor: string; note: string } };
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
      // (2026-09-11) AI 해설 제거 — 이 시트는 이 앱에서 **버튼 없이 자동으로** 외부 모델을 부르던 자리였다.
      //   남는 것은 위 표(에퀴티 기반 규칙 계산)뿐이고, 그건 원래 이 화면의 본체였다.
    });
    return () => { alive = false; };
  }, [open, hero, villain, board]);

  if (!open) return null;
  // 셸은 Modal 원자(MODAL-03) — 손으로 짠 시트는 aria-modal 만 선언하고 포커스 이동·트랩·복원이 없었고,
  // ESC 도 안 들어서 도구 전체화면(page Modal)이 대신 닫혔다. 원자가 뒤로가기·ESC(최상단 한 겹)·44px 닫기까지 준다.
  return (
    <Modal open onClose={onClose} title="스트리트별 권장 액션" variant="sheet" maxWidth="md">
        <div className="space-y-2 px-4 py-3">
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
                      <span className="text-sm font-extrabold" style={{ color: r.textColor }}>{r.label}</span>
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
          <p className="pt-1 text-2xs text-ink-muted">에퀴티 임계값으로 뽑은 <b>휴리스틱 참고</b>입니다 — 솔버 계산이 아니고 EV 손실도 계산하지 않습니다.</p>
        </div>
    </Modal>
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
  const villainRangeCombos = Math.round(deep.villainRange.combos.reduce((s, c) => s + c.weight, 0));
  // 계산 중에도 결과 카드는 세운다 — 단 에퀴티·참고 액션 두 섹션이 **함께** '계산 중' 이다(감사 2026-09-19: 예전엔 액션만 가짜 34/33/33 확정).
  const showResult = deep.heroComplete && (rangeMode || deep.villainComplete) && (deep.calculating || (deep.result && deep.normalizedAction));

  const na = deep.normalizedAction;
  // 권장 액션 배지 — 액션 축이므로 ACTION_COLORS(빈도바와 동일 색)만 쓴다.
  // 계산 중에는 배지도 없다 — 입력을 바꾸면 새 값이 올 때까지 이전 핸드의 값이 남는데, 그걸 지금 핸드의 권장으로 읽는다.
  const recommended = na && !deep.calculating
    ? [{ label: '레이즈', v: na.raise, color: ACTION_COLORS.raise, textColor: ACTION_TEXT_COLORS.raise }, { label: '콜', v: na.call, color: ACTION_COLORS.call, textColor: ACTION_TEXT_COLORS.call }, { label: '폴드', v: na.fold, color: ACTION_COLORS.fold, textColor: ACTION_TEXT_COLORS.fold }]
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
              // h-7(29.8px)는 tap-y-44 오버행(±6px)을 더해도 41.75px로 44px에 못 미친다(2026-09-20 실측 확정).
              // 2026-09-24 G3: 보이는 32px + CHIP_HIT(gto/chip.ts — 테두리가 있어도 46px).
              className={[
                CHIP_HIT, 'h-[32px] rounded-input px-3 text-2xs font-semibold transition-colors',
                deep.villainMode === m ? 'bg-accent-300 text-white' : 'border border-border-default bg-surface-high text-ink-secondary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-end justify-center gap-3">
          {/* Hero·Villain 은 같은 폭(7rem) 상자 — Hero 는 오른쪽, Villain 은 왼쪽에 붙여 'vs' 를 축으로 대칭(2026-09-23).
              Villain 상자는 두 모드가 같은 폭이라 슬롯↔select 교체에도 Hero 가 움직이지 않는다(전: 52px 흔들림).
              7rem = 119px ≥ 라벨만 든 select 필요폭 116px. 11rem 상자는 특정 핸드에서 카드가 왼쪽에 붙어 윗줄 중심이
              −29~−53px 치우쳤고 320 에선 select 가 139px 로 줄어 옵션이 잘렸다(design-reviewer 실측).
              좁은 폭에선 Hero 상자만 줄어든다(최소 = 카드 두 장 폭) — select 는 줄지 않아 잘리지 않는다. */}
          <div className="flex w-[7rem] shrink justify-end">
            <Section title="Hero" target="hero" cards={deep.hero} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
          </div>
          <span className="pb-4 text-2xs font-bold text-ink-muted">vs</span>
          <div className="w-[7rem] shrink-0">
          {deep.villainMode === 'hand' ? (
            <Section title="Villain" target="villain" cards={deep.villain} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
          ) : (
            <div>
              <p className="mb-1 whitespace-nowrap text-2xs font-bold uppercase tracking-wider text-ink-muted">Villain · {villainRangeCombos}콤보</p>
              {/* 🔴 2026-09-21 오너: 프리셋 칩 6개가 wrap 되며 'BB 수비콜' 하나만 둘째 줄에 고아로 떨어졌다
                  ("선택 부분 클릭하면 리스트업 되서 거기서 고를 수 있게"). 칩 구름 대신 **네이티브 select** —
                  종전의 표시 상자(라벨 · N콤보)가 그대로 선택 상자가 되고, 누르면 OS 목록(모바일은 바텀시트/휠)이
                  뜬다. wrap 고아 문제가 구조적으로 사라지고 새 드롭다운 코드도 0 이다.
                  옵션 글은 라벨만 — 콤보 수까지 실으면 'BB 수비콜 · 444콤보' 가 360 에서 잘렸다(2026-09-23). 콤보 수는 위 캡션으로. */}
              <select
                value={deep.villainRange.id}
                onChange={(e) => deep.selectVillainRange(e.target.value)}
                aria-label="Villain 레인지 프리셋"
                className="input h-12 w-full text-xs font-bold"
              >
                {deep.villainRanges.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          </div>
        </div>
        <div className="flex justify-center">
          <Section title="Board (선택)" target="board" cards={deep.board} current={deep.currentTarget} onSelectTarget={deep.setTarget} onRemove={deep.removeAt} />
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => deep.applyBoardPreset([])}
            className={`${TEXT_HIT} rounded-input border border-border-default bg-surface-high px-3 py-1.5 text-2xs font-semibold text-ink-muted transition-colors hover:text-danger-light`}
          >
            보드 초기화
          </button>
        </div>
      </CalcCard>

      {/* 카드 선택 그리드 — 🔴 슬롯 **바로 밑**이어야 한다.
          2026-09-19 오너: "보드를 선택할 수 없어". 고장이 아니라 **닿을 수 없었다** —
          실측(390×844): 보드 슬롯이 y284 에서 끝나는데 그리드는 결과 카드 뒤 **y883**,
          보이는 영역(785) 밖이었다. 슬롯을 눌러도 화면에서는 아무 일도 일어나지 않는다.
          짝이 되는 도구(HandBoardPicker)는 처음부터 '슬롯 → 그리드 → 결과' 였다 —
          같은 앱에서 카드를 고르는 방법이 둘이면 그게 버그다. 순서를 그쪽에 맞춘다. */}
      <CalcCard>
        <div className="flex items-center justify-between">
          {/* data-testid: Section() 의 카드 슬롯 제목 버튼("Hero"/"Villain")과 텍스트가 같아 e2e에서 구분이 안 된다 */}
          <div data-testid="gto-target-tabs" className="flex gap-1">
            {TARGET_TABS.filter(({ t }) => !(rangeMode && t === 'villain')).map(({ t, label }) => (
              <button
                key={t}
                type="button"
                onClick={() => deep.setTarget(t)}
                // 위 빌런 모드 토글과 같은 기준 — 보이는 32px + CHIP_HIT(누르는 46px 이상). 2026-09-24 알약 통일.
                className={[
                  CHIP_HIT, 'h-[32px] rounded-input px-2.5 text-2xs font-semibold transition-colors',
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

      {/* 결과 */}
      {/* 등장 애니메이션 없음 — 모드 토글마다 opacity .45 + blur(3px) 로 다시 떠서 '번쩍' 으로 보였다(오너 신고 2026-09-23). */}
      {showResult ? (
        <CalcCard>
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
              // 결과와 **같은 높이**(막대 h-5 + 한 줄). 예전 스피너 한 줄은 카드를 406→157px 로 접었다가 되펴 화면이 튀었다.
              <>
                <div className="h-5 rounded-input bg-surface-high" />
                <div className="mt-1 flex items-center gap-2 text-2xs text-ink-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />
                  에퀴티 계산 중...
                </div>
              </>
            ) : (
              <>
                <div className="flex h-5 overflow-hidden rounded-input bg-surface-high">
                  <div style={{ width: `${deep.equity.hero * 100}%` }} className="bg-accent-300 transition-[width] duration-[var(--dur-panel)]" />
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
            {/* 에퀴티 섹션과 같은 조건 — 계산 전에는 숫자를 그리지 않는다(자리표시자 34/33/33 이 '권장 레이즈' 로 나가던 자리). */}
            {deep.normalizedAction && !deep.calculating ? (
              <>
                <MixBar action={deep.normalizedAction} />
              </>
            ) : (
              // MixBar 와 같은 모양(막대 h-7 + 범례 한 줄) — 숫자는 없다(계산 전 숫자 금지 계약은 그대로).
              <div className="space-y-1.5">
                <div className="h-7 rounded-input bg-surface-high" />
                <div data-testid="gto-action-pending" className="flex items-center gap-2 text-2xs text-ink-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />
                  참고 액션 계산 중...
                </div>
              </div>
            )}
            {/* 출처 배지·고지는 숫자가 아니라 늘 같다 — 계산 중에도 두어 높이를 지킨다. */}
            <div className="mt-1.5 flex"><SourceBadge kind="heuristic" /></div>
            <p className="mt-1 text-2xs text-ink-muted">※ 에퀴티·팟오즈 기반 근사(솔버 아님). 실제 GTO 솔버 값과 다를 수 있습니다.</p>
          </div>

          {(() => {
            // 계산 중에도 칸은 선다(값은 대시) — 이 격자가 통째로 빠졌다 붙으며 카드가 튀던 자리.
            const eq = deep.equity && !deep.calculating ? deep.equity : null;
            const tie = eq ? (eq.tie ?? 0) : 0;
            const win = eq ? Math.max(0, eq.hero - tie / 2) : 0;
            const lose = eq ? Math.max(0, eq.villain - tie / 2) : 0;
            const cells = [
              // 숫자는 '글자'라 fill 스냅샷 hex 를 쓰면 안 된다(라이트 실측 승 2.02 · 무 2.27 · 패 3.33:1).
              { k: '승', v: win, color: 'var(--gto-txt-playable)' },
              { k: '무', v: tie, color: 'var(--gto-txt-tie)' },
              { k: '패', v: lose, color: 'var(--gto-txt-dominant)' },
            ];
            return (
              <div>
                <p className="mb-1 text-2xs font-semibold text-ink-secondary">승률 (승 / 무 / 패)</p>
                <div className="grid grid-cols-3 gap-2">
                  {cells.map((c) => (
                    <div key={c.k} className="rounded-input border border-border-subtle bg-surface-high px-2 py-1.5 text-center">
                      <p className="text-2xs text-ink-muted">{c.k}</p>
                      <p className="text-base font-extrabold tabular-nums leading-tight" style={{ color: c.color }}>
                        {eq ? `${(c.v * 100).toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {recommended ? (
            <div
              className="flex items-center justify-center gap-2 rounded-input border py-2"
              style={{ borderColor: `${recommended.color}66`, background: `${recommended.color}14` }}
            >
              <span className="text-2xs text-ink-muted">권장 액션</span>
              <span className="text-sm font-extrabold" style={{ color: recommended.textColor }}>
                {recommended.label} {Math.round(recommended.v * 100)}%
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-input border border-border-subtle py-2">
              <span className="text-2xs text-ink-muted">권장 액션</span>
              <span className="text-sm font-extrabold text-ink-muted">—</span>
            </div>
          )}

          {/* 액션 시트·공유는 특정 핸드(hand) 모드 전용 — 공유 해시가 hand 조합만 인코딩.
              레인지 모드에선 숨기지 않고 **비활성**으로 둔다 — 줄이 빠졌다 붙으면 모드를 바꿀 때마다 카드 높이가 54px 변했다. */}
          <div className="flex gap-2">
            <button type="button" disabled={rangeMode} title={rangeMode ? '특정 핸드 모드에서 사용할 수 있습니다' : undefined} onClick={() => setSheetOpen(true)} className="btn-ghost inline-flex flex-1 items-center justify-center gap-2 py-2.5 disabled:opacity-40">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>
              스트리트별 액션
            </button>
            <button type="button" disabled={rangeMode} onClick={shareSpot} aria-label="공유 링크 생성" className="btn-ghost inline-flex items-center justify-center gap-1.5 px-4 py-2.5 disabled:opacity-40">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
              공유
            </button>
          </div>
        </CalcCard>
      ) : (
        <p className="rounded-aura border card-aura px-3 py-4 text-center text-2xs leading-relaxed text-ink-muted">
          {rangeMode
            ? '그리드에서 Hero 2장을 고르면 레인지 상대 에퀴티·참고 액션 표시. (보드는 선택)'
            : '그리드에서 Hero·Villain 2장씩 고르면 에퀴티·참고 액션 표시. (보드는 선택)'}
        </p>
      )}

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
