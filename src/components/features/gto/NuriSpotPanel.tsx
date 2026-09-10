// src/components/features/gto/NuriSpotPanel.tsx — NURI SPOT (누리 스팟)
// 핸드 분석 · 리플레이 · 토론을 한 흐름으로 묶는 화면. 2026-09-11 오너 지시.
//
// ── 왜 이 화면이 생겼나 ──────────────────────────────────────────────────────
// 같은 '한 판 복기' 가 세 군데로 흩어져 있었다:
//   · #tool=gto  → GtoDeepPanel   카드만 받고 포지션·스택·액션은 못 받는다
//   · #tool=replay → HandReviewTool  자유문자 액션으로 재생만 한다(분석 불가)
//   · 게시판     → [[REPLAY:]] 마커  글에서 열면 카드 2장만 분석으로 넘어간다
// 세 화면이 서로의 데이터를 몰라서, 사용자는 같은 판을 세 번 입력했다.
// NURI SPOT 은 **구조화된 SpotReview 하나**(src/lib/spot.ts)를 세 축이 함께 쓴다.
//
// ⚠ 기존 도구는 하나도 지우지 않는다. #tool=gto · #tool=replay 는 그대로 살아 있고
//   이 화면은 그 위에 얹히는 통합 진입점이다(ToolsPanel 의 대표 카드).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../atoms/Icon';
import SegmentedTabs from '../../atoms/SegmentedTabs';
import { useToast } from '../../atoms/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import HandBoardPicker from './HandBoardPicker';
import { useHandBoard } from './useHandBoard';
import { equityAsync } from './equityClient';
import { cardId } from './useDeepGto';
import type { Card } from './gto.types';
import {
  emptySpot, validateSpot, hasBlocker, positionsFor, streetLabel, actionLabel,
  potBb, canonicalSpotKey, BOARD_LEN, ACTION_TYPES,
  type SpotReview, type SpotAction, type SpotActionType, type SpotPosition, type Street,
} from '../../../lib/spot';
import { evaluateSpot, type SpotEvaluation } from '../../../lib/spotEvaluate';
import SpotReport from './SpotReport';
import MySpotList from './MySpotList';

export type SpotTab = 'analyze' | 'mine' | 'talk';

const SNAP_KEY = 'tool:spot';

/** 자주 쓰는 사이징 프리셋(BB) — 직접 입력도 그대로 된다. */
const SIZE_PRESETS: Record<'pre' | 'post', number[]> = {
  pre: [2, 2.2, 2.5, 3, 4],
  post: [1, 2, 3, 5, 8],
};

// ── 입력 단계 ────────────────────────────────────────────────────────────────
// 한 화면에 필드를 다 펼치면 모바일에서 스크롤만 길어진다. 네 묶음으로 나눈다.
const STEPS = [
  { key: 'game', label: '게임', hint: '어떤 판이었는지 먼저 정합니다.' },
  { key: 'seat', label: '자리·스택', hint: '내 자리와 상대 자리, 유효 스택을 고릅니다.' },
  { key: 'cards', label: '카드·액션', hint: '카드를 고르고 액션을 순서대로 쌓습니다.' },
  { key: 'choice', label: '내 선택', hint: '그 자리에서 실제로 한 선택을 고릅니다.' },
] as const;
type StepKey = typeof STEPS[number]['key'];

export interface NuriSpotInit {
  spot?: Partial<SpotReview>;
  tab?: SpotTab;
}

export default function NuriSpotPanel({ init }: { init?: NuriSpotInit }) {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<SpotTab>(init?.tab ?? 'analyze');

  // 스팟 상태 — 마지막 입력을 24h 복원(기존 도구와 같은 조리법).
  const [spot, setSpot] = useState<SpotReview>(() => {
    const saved = readSnap<SpotReview>(SNAP_KEY);
    return { ...emptySpot(), ...(saved ?? {}), ...(init?.spot ?? {}) };
  });
  const patch = useCallback((p: Partial<SpotReview>) => setSpot((s) => ({ ...s, ...p })), []);

  // 임시 저장 — 타이핑마다 쓰지 않도록 400ms 디바운스(HandReviewTool 선례)
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => { writeSnap(SNAP_KEY, spot); setSavedAt(Date.now()); }, 400);
    return () => window.clearTimeout(t);
  }, [spot]);

  // 카드 입력은 기존 훅을 그대로 쓴다 — 같은 선택기를 두 벌 만들지 않는다.
  const hb = useHandBoard(5, { hero: spot.hero, villain: spot.villain, board: spot.board });
  // 카드 그리드 → 스팟으로 단방향 반영. hb 가 정본이고 spot 은 그 그림자다.
  useEffect(() => {
    setSpot((s) => {
      const hero = hb.heroCards.map(cardId);
      const villain = hb.villainCards.map(cardId);
      const board = hb.boardCards.map(cardId);
      if (s.hero.join() === hero.join() && s.villain.join() === villain.join() && s.board.join() === board.join()) return s;
      // 보드 장수가 바뀌면 스트리트도 따라간다 — 둘이 어긋나면 곧바로 blocker 다.
      const street: Street = board.length >= 5 ? 'river' : board.length >= 4 ? 'turn' : board.length >= 3 ? 'flop' : 'preflop';
      return { ...s, hero, villain, board, street };
    });
  }, [hb.heroCards, hb.villainCards, hb.boardCards]);

  const issues = useMemo(() => validateSpot(spot), [spot]);
  const blocked = hasBlocker(issues);

  // ── 에퀴티: 워커 위임 + **최신 요청 우선**(오래된 응답이 새 결과를 덮지 않는다) ──
  const [equity, setEquity] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);
  const reqId = useRef(0);
  const key = canonicalSpotKey(spot);
  useEffect(() => {
    const canCalc = hb.heroCards.length === 2 && hb.villainCards.length === 2 && !blocked;
    if (!canCalc) { setEquity(null); setCalculating(false); return; }
    const my = ++reqId.current;
    setCalculating(true);
    const h = hb.heroCards as [Card, Card];
    const v = hb.villainCards as [Card, Card];
    equityAsync(h, v, hb.boardCards, 2500).then((r) => {
      if (my !== reqId.current) return;      // 오래된 응답 — 버린다
      setEquity(r.hero);
      setCalculating(false);
    }).catch(() => { if (my === reqId.current) setCalculating(false); });
    return () => { /* 취소는 reqId 비교로 처리 — 워커는 계속 돌게 둔다(중단 API 없음) */ };
    // key 는 '의미가 바뀌었을 때만' 다시 계산하기 위한 안정 키다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, blocked]);

  const evaluation = useMemo<SpotEvaluation>(
    () => evaluateSpot(spot, { heroEquity: equity }),
    [spot, equity],
  );

  return (
    <div className="space-y-3">
      <SpotHero tab={tab} onTab={setTab} />

      {tab === 'analyze' && (
        <AnalyzeTab
          spot={spot} patch={patch} hb={hb} issues={issues} blocked={blocked}
          evaluation={evaluation} calculating={calculating} savedAt={savedAt}
          user={user} toast={toast}
        />
      )}
      {tab === 'mine' && (
        <MySpotList onOpen={(s) => { setSpot(s); setTab('analyze'); }} />
      )}
      {tab === 'talk' && <TalkTab />}
    </div>
  );
}

// ── 대표 헤더 ────────────────────────────────────────────────────────────────
// Aura LED 는 여기 **한 곳만** 세게 준다. 아래 입력 카드들은 같은 강도로 빛나지 않는다
// (전부 빛나면 위계가 사라져 무엇이 중요한지 안 보인다).
function SpotHero({ tab, onTab }: { tab: SpotTab; onTab: (t: SpotTab) => void }) {
  return (
    <div className="relative overflow-visible">
      {/* 뒤에서 새어 나오는 LED — 장식 레이어는 클릭·포커스를 가로채지 않는다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -top-6 -bottom-2 -z-10"
        style={{
          background:
            'radial-gradient(closest-side, rgb(139 92 246 / 0.22), transparent 72%),'
            + 'radial-gradient(closest-side, rgb(34 211 238 / 0.12), transparent 74%)',
          backgroundPosition: '18% 20%, 78% 60%',
          backgroundSize: '58% 88%, 46% 70%',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="flex items-center gap-3">
        <SpadeMark />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold tracking-tight text-ink-primary">NURI SPOT</h2>
          <p className="truncate text-2xs text-ink-muted">핸드 분석 · 리플레이 · 토론</p>
        </div>
      </div>
      <div className="mt-2.5 overflow-x-auto">
        <SegmentedTabs
          items={[
            { key: 'analyze' as const, label: '분석' },
            { key: 'mine' as const, label: '내 스팟' },
            { key: 'talk' as const, label: '스팟 토론' },
          ]}
          value={tab} onChange={onTab} grow
          // ⚠ .tap-y-44 는 **컨테이너**의 ::before 를 넓힐 뿐이라 버튼 자체의 히트 영역은 그대로다
          //   (실측 27px). 자식 버튼에 직접 높이를 준다 — 이 화면의 1급 내비게이션이라 44px 계약 대상이다.
          className="w-full [&>button]:min-h-[44px]"
        />
      </div>
    </div>
  );
}

/** 골드 스페이드 + 뒤쪽 국소 LED. 브랜드 심벌은 기존 자산을 쓴다(새 이미지 생성 0). */
function SpadeMark() {
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center" aria-hidden>
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: '0 0 18px rgb(139 92 246 / 0.42), 0 0 34px rgb(34 211 238 / 0.18)' }}
      />
      <span
        className="grid h-11 w-11 place-items-center rounded-full border border-white/12"
        style={{ background: 'radial-gradient(120% 120% at 50% 0%, #242B48 0%, #141930 58%, #0A0D1B 100%)' }}
      >
        <img src="/brand/nuri-holdem-symbol.svg" alt="" width={22} height={22} draggable={false} />
      </span>
    </span>
  );
}

// ── 분석 탭 ──────────────────────────────────────────────────────────────────

interface AnalyzeProps {
  spot: SpotReview;
  patch: (p: Partial<SpotReview>) => void;
  hb: ReturnType<typeof useHandBoard>;
  issues: ReturnType<typeof validateSpot>;
  blocked: boolean;
  evaluation: SpotEvaluation;
  calculating: boolean;
  savedAt: number | null;
  user: ReturnType<typeof useAuth>['user'];
  toast: ReturnType<typeof useToast>;
}

function AnalyzeTab({ spot, patch, hb, issues, blocked, evaluation, calculating, savedAt, user, toast }: AnalyzeProps) {
  const [step, setStep] = useState<StepKey>('cards');
  const cur = STEPS.find((s) => s.key === step) ?? STEPS[2];

  return (
    // PC 는 2열(왼쪽 입력 · 오른쪽 결과 sticky), 모바일은 한 줄로 쌓인다 — 같은 컴포넌트·같은 데이터.
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4">
      <div className="min-w-0 space-y-3">
        <StepBar step={step} onStep={setStep} spot={spot} />
        <p className="text-2xs text-ink-muted">{cur.hint}</p>

        {step === 'game' && <GameStep spot={spot} patch={patch} />}
        {step === 'seat' && <SeatStep spot={spot} patch={patch} />}
        {step === 'cards' && (
          <div className="space-y-3">
            <HandBoardPicker hb={hb} hint={<>보드는 플랍 3장부터 리버 5장까지 — 지금은 <b className="text-ink-secondary">{streetLabel(spot.street)}</b></>} />
            <ActionTimeline spot={spot} patch={patch} />
          </div>
        )}
        {step === 'choice' && <ChoiceStep spot={spot} patch={patch} />}

        <IssueList issues={issues} />
        {savedAt !== null && (
          <p className="text-2xs text-ink-muted" aria-live="polite">
            <Icon name="check" size={11} className="mr-1 inline-block align-[-1px]" />임시 저장됨 — 나갔다 와도 그대로입니다
          </p>
        )}
      </div>

      <div className="mt-3 min-w-0 lg:mt-0 lg:sticky lg:top-[calc(var(--stack-top,6.0625rem)+0.75rem)]">
        <SpotReport
          spot={spot} evaluation={evaluation} calculating={calculating} blocked={blocked}
          user={user} toast={toast}
        />
      </div>
    </div>
  );
}

/** 단계 바 — 현재 단계와 완료 상태를 함께 보여준다. */
function StepBar({ step, onStep, spot }: { step: StepKey; onStep: (s: StepKey) => void; spot: SpotReview }) {
  const done: Record<StepKey, boolean> = {
    game: true,
    seat: spot.heroPos !== spot.villainPos,
    cards: spot.hero.length === 2 && spot.board.length === BOARD_LEN[spot.street],
    choice: spot.heroAction !== null,
  };
  // 네 칩은 412px 에서 한 줄에 안 들어간다 — 가로 스크롤은 두되,
  // **지금 서 있는 단계가 잘려 보이면** 안 된다(412px 실측: '4 내 선택' 이 오른쪽에서 잘렸다).
  // block:'nearest' 로 세로는 건드리지 않아 시트 본문이 같이 튀는 것을 막는다.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    barRef.current?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // ⚠ deps 에 done 을 반드시 넣는다. step 만 보면 이렇게 샌다(412px 실측):
    //   4단계로 이동(체크 없음 → 거의 들어맞음, scrollLeft=1) → 액션 선택 →
    //   체크 아이콘이 생겨 칩이 넓어짐 → 그런데 step 은 그대로라 효과가 안 돈다 → 잘린 채 남는다.
  }, [step, done.seat, done.cards, done.choice]);
  return (
    <div ref={barRef} className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="입력 단계">
      {STEPS.map((s, i) => {
        const on = s.key === step;
        return (
          <button
            key={s.key} type="button" aria-current={on ? 'step' : undefined}
            onClick={() => onStep(s.key)}
            className={['tap-y-44 flex shrink-0 items-center gap-1.5 rounded-badge border px-2.5 py-1.5 text-2xs font-bold transition-colors',
              on ? 'border-accent-300 bg-accent-300 text-white'
                : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}
          >
            <span className={on ? 'text-white/80' : 'text-ink-muted'}>{i + 1}</span>
            {s.label}
            {done[s.key] && <Icon name="check" size={11} className={on ? 'text-white' : 'text-emerald-400'} aria-label="완료" />}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs font-medium text-ink-secondary">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

function Pick<T extends string | number>({ value, options, onChange, fmt }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {options.map((o) => (
        <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)}
          className={['min-h-[32px] rounded-input border px-2 text-2xs font-bold transition-colors',
            o === value ? 'border-accent-300 bg-accent-300 text-white'
              : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
          {fmt ? fmt(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function GameStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="형식">
        <Pick value={spot.format} options={['mtt', 'cash'] as const}
          onChange={(v) => patch({ format: v })} fmt={(v) => (v === 'mtt' ? '토너먼트' : '캐시')} />
      </Row>
      <Row label="테이블 인원">
        <Pick value={spot.tableSize} options={[2, 6, 8, 9]}
          onChange={(v) => {
            const seats = positionsFor(v);
            patch({
              tableSize: v,
              heroPos: seats.includes(spot.heroPos) ? spot.heroPos : seats[seats.length - 3] ?? seats[0],
              villainPos: seats.includes(spot.villainPos) ? spot.villainPos : seats[seats.length - 1],
            });
          }}
          fmt={(v) => `${v}인`} />
      </Row>
      <Row label="앤티">
        <Pick value={spot.anteBb} options={[0, 0.125, 0.25]}
          onChange={(v) => patch({ anteBb: v })} fmt={(v) => (v === 0 ? '없음' : `${v}BB`)} />
      </Row>
    </div>
  );
}

function SeatStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const seats = positionsFor(spot.tableSize);
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="내 자리">
        <Pick value={spot.heroPos} options={seats} onChange={(v) => patch({ heroPos: v as SpotPosition })} />
      </Row>
      <Row label="상대 자리">
        <Pick value={spot.villainPos} options={seats} onChange={(v) => patch({ villainPos: v as SpotPosition })} />
      </Row>
      <Row label="유효 스택">
        <Pick value={spot.effectiveBb} options={[10, 20, 40, 60, 100]}
          onChange={(v) => patch({ effectiveBb: v })} fmt={(v) => `${v}BB`} />
      </Row>
      <label className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-ink-secondary">직접 입력</span>
        <input
          type="number" inputMode="decimal" min={1} step={0.5} value={spot.effectiveBb}
          onChange={(e) => patch({ effectiveBb: Number(e.target.value) })}
          className="input min-h-[44px] w-24 text-right" aria-label="유효 스택 BB 직접 입력"
        />
        <span className="text-2xs text-ink-muted">BB</span>
      </label>
    </div>
  );
}

/** 액션 타임라인 — 긴 텍스트 한 칸 대신 **추가 가능한 행**. 구조가 곧 분석 입력이다. */
function ActionTimeline({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const [actor, setActor] = useState<'hero' | 'villain'>('villain');
  const [type, setType] = useState<SpotActionType>('raise');
  const [size, setSize] = useState<number>(2.5);
  const sized = type === 'call' || type === 'bet' || type === 'raise';
  const presets = spot.street === 'preflop' ? SIZE_PRESETS.pre : SIZE_PRESETS.post;

  const add = () => {
    const a: SpotAction = { street: spot.street, actor, type, ...(sized ? { sizeBb: size } : {}) };
    patch({ actions: [...spot.actions, a] });
  };
  const removeAt = (i: number) => patch({ actions: spot.actions.filter((_, n) => n !== i) });

  // 스트리트별로 묶어 보여준다 — 순서가 눈에 보여야 입력이 맞았는지 안다.
  const grouped = (['preflop', 'flop', 'turn', 'river'] as Street[])
    .map((st) => ({ st, rows: spot.actions.map((a, i) => ({ a, i })).filter((x) => x.a.street === st) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-ink-primary">액션 순서</p>
        <p className="text-2xs tabular-nums text-ink-muted">팟 {potBb(spot)}BB</p>
      </div>

      {grouped.length === 0 ? (
        <p className="rounded-input border border-dashed border-border-default px-3 py-4 text-center text-2xs text-ink-muted">
          아직 액션이 없습니다. 아래에서 한 줄씩 쌓아 주세요.
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ st, rows }) => (
            <div key={st}>
              <p className="mb-1 text-2xs font-bold text-accent-200">{streetLabel(st)}</p>
              <ul className="space-y-1">
                {rows.map(({ a, i }) => (
                  <li key={i} className="flex items-center gap-2 rounded-input bg-surface-high px-2.5 py-1.5">
                    <span className={['shrink-0 text-2xs font-bold', a.actor === 'hero' ? 'text-accent-200' : 'text-ink-muted'].join(' ')}>
                      {a.actor === 'hero' ? spot.heroPos : spot.villainPos}
                    </span>
                    <span className="flex-1 text-xs text-ink-primary">
                      {actionLabel(a.type)}{a.sizeBb !== undefined && <span className="ml-1 tabular-nums text-ink-secondary">{a.sizeBb}BB</span>}
                    </span>
                    <button type="button" onClick={() => removeAt(i)}
                      aria-label={`${streetLabel(st)} ${actionLabel(a.type)} 삭제`}
                      className="flex h-[32px] w-[32px] items-center justify-center rounded-input text-ink-muted transition-colors hover:text-danger">
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* 추가 줄 — 버튼으로 빠르게, 필요하면 숫자를 직접 */}
      <div className="mt-2.5 space-y-1.5 border-t border-border-subtle pt-2.5">
        <Row label="누가">
          <Pick value={actor} options={['villain', 'hero'] as const} onChange={setActor}
            fmt={(v) => (v === 'hero' ? `나 (${spot.heroPos})` : `상대 (${spot.villainPos})`)} />
        </Row>
        <Row label="무엇을">
          <Pick value={type} options={ACTION_TYPES} onChange={setType} fmt={actionLabel} />
        </Row>
        {sized && (
          <Row label="얼마나">
            <Pick value={size} options={presets} onChange={setSize} fmt={(v) => `${v}`} />
            <input
              type="number" inputMode="decimal" min={0} step={0.5} value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="input min-h-[36px] w-16 text-right" aria-label="액션 크기 BB 직접 입력"
            />
            <span className="text-2xs text-ink-muted">BB</span>
          </Row>
        )}
        <button type="button" onClick={add} className="btn-ghost mt-1 min-h-[44px] w-full text-xs">
          <Icon name="plus" size={13} className="mr-1 inline-block align-[-2px]" />액션 추가
        </button>
      </div>
    </div>
  );
}

function ChoiceStep({ spot, patch }: { spot: SpotReview; patch: (p: Partial<SpotReview>) => void }) {
  const sized = spot.heroAction === 'call' || spot.heroAction === 'bet' || spot.heroAction === 'raise';
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-3">
      <Row label="그때 나는">
        <Pick value={spot.heroAction ?? ('' as SpotActionType)} options={ACTION_TYPES}
          onChange={(v) => patch({ heroAction: v })} fmt={actionLabel} />
      </Row>
      {sized && (
        <Row label="얼마나">
          <input
            type="number" inputMode="decimal" min={0} step={0.5} value={spot.heroActionSizeBb ?? 0}
            onChange={(e) => patch({ heroActionSizeBb: Number(e.target.value) })}
            className="input min-h-[44px] w-24 text-right" aria-label="내 액션 크기 BB"
          />
          <span className="text-2xs text-ink-muted">BB</span>
        </Row>
      )}
      <div className="mt-2 border-t border-border-subtle pt-2">
        <label className="mb-1 block text-xs font-medium text-ink-secondary" htmlFor="spot-note">메모 (선택)</label>
        <textarea
          id="spot-note" rows={2} value={spot.note ?? ''} maxLength={300}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="왜 그렇게 했는지 · 무엇이 고민이었는지"
          className="input resize-none text-sm"
        />
        <p className="mt-1 text-2xs text-ink-muted">
          상대 이름·매장명은 적지 마세요 — 스팟에는 개인정보를 담지 않습니다.
        </p>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: ReturnType<typeof validateSpot> }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1" role="alert">
      {issues.map((i, n) => (
        <li key={n} className={['flex items-start gap-1.5 rounded-input px-2.5 py-1.5 text-2xs leading-relaxed',
          i.level === 'blocker' ? 'bg-danger/10 text-danger' : 'bg-amber-500/10 text-amber-200'].join(' ')}>
          <Icon name={i.level === 'blocker' ? 'alert' : 'info'} size={12} className="mt-px shrink-0" aria-hidden />
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

// ── 스팟 토론 탭 ─────────────────────────────────────────────────────────────
//
// 오너 지시(2026-09-11): "스팟 토론은 누리 스팟 말고 게시판으로 보내서 게시판을 활성화."
// 그래서 이 탭은 **피드가 아니라 문**이다 — 글은 게시판 '핸드 분석' 카테고리에 쌓인다
// (api/spots.ts 의 share_spot_post 가 p_category:'hand' 로 넣는다).
//
// ⚠ 이벤트 이름을 지어내지 마라. 앱이 듣는 것은 App.tsx 의 'nuri:goto-tab' 과
//   CommunityTab 의 'nuri:community-section' 둘뿐이다. 예전 코드가 쏘던
//   'nuri:open-tab' 은 **리스너가 없어 버튼이 죽어 있었다**(grep 으로 확인).
function gotoBoard() {
  // 도구 겹을 먼저 닫는다 — 안 닫으면 tools pane 이 display:none 으로 숨겨질 뿐
  // 모달이 그대로 살아 있어, 도구 탭으로 돌아왔을 때 남은 겹이 튀어나온다.
  if (window.location.hash.startsWith('#tool=')) history.back();
  // 탭 전환은 겹이 닫힌 **다음 프레임**에. 같은 프레임에 쏘면 popstate 가 뒤늦게 도착해
  // 방금 만든 탭 이력을 되감는다.
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'community' }));
    window.dispatchEvent(new CustomEvent('nuri:community-section', { detail: 'board' }));
  });
}

function TalkTab() {
  return (
    <div className="rounded-card border border-border-default bg-surface-mid p-4 text-center">
      <Icon name="comment" size={22} className="mx-auto mb-2 text-ink-muted" aria-hidden />
      <p className="text-sm font-bold text-ink-primary">스팟 토론은 게시판에서</p>
      <p className="mx-auto mt-1 max-w-[24rem] text-2xs leading-relaxed text-ink-muted break-keep">
        토론은 여기서 따로 돌지 않고 <b className="text-ink-secondary">게시판 · 핸드 분석</b> 에 모입니다.
        올린 스팟은 다른 사람들이 먼저 폴드·콜·레이즈를 고르고, 그 분포를 본 뒤 분석을 열어 봅니다.
      </p>
      <button type="button" onClick={gotoBoard} className="btn-ghost mt-3 min-h-[44px] px-4 text-xs">
        게시판에서 스팟 글 보기
      </button>
    </div>
  );
}
