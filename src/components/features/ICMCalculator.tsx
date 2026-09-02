// src/components/features/ICMCalculator.tsx
// ICM 계산기 — 두 모드를 한 화면에서 전환한다.
//   기대 지분 : 스택 + 상금 → 각자의 상금 지분(기존 화면, 그대로 보존)
//   콜 압박   : 위 입력 + 내 자리·올인한 상대·깔린 팟 → 콜에 필요한 승률(리스크 프리미엄)
// 스택·상금 입력은 두 모드가 공유한다 — 같은 테이블을 두 번 입력시키지 않기 위해서다.
// 계산(Malmuth-Harville · 리스크 프리미엄)은 src/lib/icm.ts 단일 소스. 예전엔 이 파일과
// tools/DealCalc.tsx 에 icmEquity 가 두 벌로 복제돼 있었다.
import { useMemo, useState } from 'react';
import { CalcCard } from './tools/calcUi';
import SegmentedTabs from '../atoms/SegmentedTabs';
import {
  icmEquity, callPressure, handLadder, verdictLine,
  SHOVE_RANGES, ICM_MAX_PLAYERS, type ShoveRangeId,
} from '../../lib/icm';

type Mode = 'equity' | 'pressure';

const MODES: { key: Mode; label: string }[] = [
  { key: 'equity', label: '기대 지분' },
  { key: 'pressure', label: '콜 압박' },
];

const num = (v: number) => v.toLocaleString('ko-KR');

/** 기대 지분 모드에서 압박 계산을 건너뛸 때 쓰는 자리표시자(렌더되지 않는다) */
const IDLE_PRESSURE = callPressure({ stacks: [], prizes: [], heroIndex: 0, villainIndex: 0, pot: 0 });

/** 자리 지정 토글 — '나' / '올인' */
function SeatBtn({ on, tone, label, onClick }: { on: boolean; tone: 'hero' | 'villain'; label: string; onClick: () => void }) {
  const active = tone === 'hero'
    ? 'border-accent-400 bg-accent-300 text-white'
    : 'border-danger-deep/50 bg-danger/15 text-danger-deep dark:border-danger-light dark:bg-danger-light/15 dark:text-danger-light';
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={[
        'w-11 shrink-0 rounded-input border px-1 py-2 text-2xs font-bold leading-none transition-colors',
        on ? active : 'border-border-default bg-surface-high text-ink-muted',
      ].join(' ')}
    >{label}</button>
  );
}

export default function ICMCalculator() {
  const [mode, setMode] = useState<Mode>('equity');
  const [stacks, setStacks] = useState<number[]>([5000, 3000, 2000]);
  const [prizes, setPrizes] = useState<number[]>([40, 24, 15, 10, 7, 4]);
  // 압박 모드 입력 — 기본값은 '중간 스택이 칩리더의 올인을 받는' 대표적 버블 자리(결과 먼저 원칙)
  const [heroSeat, setHeroSeat] = useState(1);
  const [villainSeat, setVillainSeat] = useState(0);
  const [pot, setPot] = useState(1200);
  const [rangeId, setRangeId] = useState<ShoveRangeId>('mid');

  const equities = useMemo(() => {
    const s = stacks.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    if (s.reduce((a, b) => a + b, 0) <= 0) return stacks.map(() => 0);
    return icmEquity(s, prizes.map((v) => (Number.isFinite(v) ? v : 0)));
  }, [stacks, prizes]);
  // 실제 지급되는 상금 합계(= 기대값 합). 상금 자리가 인원보다 많아도 % 가 100%로 합산되도록 분모로 사용.
  const awarded = equities.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  // 상금 입력 단위 안내 — 합계가 100±1 이면 % 구조로, 아니면 금액 그대로 해석된다는 캡션.
  const prizeSum = prizes.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const looksPct = Math.abs(prizeSum - 100) <= 1;

  // 인원을 줄이면 저장된 자리 인덱스가 범위를 벗어난다 — 표시 직전에 좁혀서 쓴다(effect 불필요).
  const n = stacks.length;
  const hero = Math.min(Math.max(heroSeat, 0), n - 1);
  const villain = (() => {
    const v = Math.min(Math.max(villainSeat, 0), n - 1);
    return v === hero ? (hero === 0 ? 1 : 0) : v;
  })();

  // 압박 모드에서만 계산한다 — 10인 만석 기준 실측 1.19ms/회(icmEquity 3회). 한 프레임에 여유는
  // 있지만 기대 지분 모드에서는 쓰지 않는 값이라, 스택을 타이핑할 때 굳이 매번 돌릴 이유가 없다.
  const press = useMemo(
    () => (mode === 'pressure'
      ? callPressure({ stacks, prizes, heroIndex: hero, villainIndex: villain, pot })
      : IDLE_PRESSURE),
    [mode, stacks, prizes, hero, villain, pot],
  );
  const ladder = useMemo(() => (press.ok ? handLadder(press.reqIcm, rangeId) : []), [press, rangeId]);
  // 큰 숫자와 아래 상세가 어긋나지 않도록 표시 문자열을 한 번만 만든다(54.96 → "55" + ".0%")
  const [reqInt, reqDec] = (press.reqIcm * 100).toFixed(1).split('.');

  const setStack = (i: number, v: number) => setStacks((p) => p.map((x, k) => (k === i ? v : x)));
  const setPrize = (i: number, v: number) => setPrizes((p) => p.map((x, k) => (k === i ? v : x)));
  const pickHero = (i: number) => { setHeroSeat(i); if (villain === i) setVillainSeat(i === 0 ? 1 : 0); };
  const pickVillain = (i: number) => { setVillainSeat(i); if (hero === i) setHeroSeat(i === 0 ? 1 : 0); };
  // 버블 프리셋 — 4명 남고 3자리 시상(전형적 버블 상황)을 한 번에 입력. 압박 모드 입력까지 같이 맞춘다.
  const applyBubble = () => {
    setStacks([40, 30, 20, 10]); setPrizes([50, 30, 20]);
    setHeroSeat(1); setVillainSeat(2); setPot(4);
  };

  // 두 모드가 공유하는 입력 블록 — 순서만 모드별로 바꾼다.
  //   기대 지분: 상금 → 스택(기존 순서 그대로)
  //   콜 압박  : 스택·자리 → 팟 → 레인지 → 상금. 결론 바로 아래에 '가장 자주 만지는 입력'을 둔다
  //   (실측: 원래 순서면 자리 지정 토글이 카드 상단에서 887px 아래라 모바일에서 한참 스크롤해야 했다).
  const prizeBlock = ( // 상금 구조
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-2xs font-semibold text-ink-secondary">상금 구조</span>
      <div className="inline-flex items-center gap-1.5">
        <button type="button" aria-label="상금 자리 줄이기" onClick={() => setPrizes((p) => p.slice(0, -1))} disabled={prizes.length <= 2}
          className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-border-default bg-surface-high text-base font-bold text-ink-secondary leading-none disabled:opacity-30">−</button>
        <span className="min-w-[2.75rem] text-center text-2xs font-bold text-ink-primary tabular-nums">{prizes.length}명</span>
        <button type="button" aria-label="상금 자리 늘리기" onClick={() => setPrizes((p) => [...p, 0])} disabled={prizes.length >= 20}
          className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-accent-400/50 bg-accent-300/10 text-base font-bold text-accent-300 leading-none disabled:opacity-30">+</button>
      </div>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {prizes.map((v, i) => (
        <label key={i} className="block">
          <span className="block text-2xs text-ink-muted mb-0.5">{i + 1}위</span>
          <input type="number" inputMode="decimal" value={v === 0 ? '' : v}
            onChange={(e) => setPrize(i, e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
            className="input w-full text-sm tabular-nums" />
        </label>
      ))}
    </div>
    <p className="mt-1 text-2xs text-ink-muted">
      {looksPct ? '합계 ≈100 · % 상금 구조로 입력됨(결과도 % 단위)' : '합계가 100이 아니므로 금액 단위 그대로 계산됩니다'}
    </p>
  </div>
  );
  const stackBlock = ( // 스택 + (기대 지분 모드) 결과 / (압박 모드) 자리 지정
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-2xs font-semibold text-ink-secondary">
        {mode === 'equity' ? '플레이어 스택' : '남은 스택 · 자리 지정'}
      </span>
      <div className="inline-flex items-center gap-1.5">
        <button type="button" aria-label="플레이어 줄이기"
          onClick={() => setStacks((p) => p.slice(0, -1))}
          disabled={stacks.length <= 2}
          className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-border-default bg-surface-high text-base font-bold text-ink-secondary leading-none disabled:opacity-30">−</button>
        <span className="min-w-[2.75rem] text-center text-2xs font-bold text-ink-primary tabular-nums">{stacks.length}/{ICM_MAX_PLAYERS}명</span>
        <button type="button" aria-label="플레이어 늘리기" onClick={() => setStacks((p) => [...p, 1000])} disabled={stacks.length >= ICM_MAX_PLAYERS}
          className="w-6 h-6 inline-flex items-center justify-center rounded-input border border-accent-400/50 bg-accent-300/10 text-base font-bold text-accent-300 leading-none disabled:opacity-30">+</button>
      </div>
    </div>
    <ul className="space-y-1.5">
      {stacks.map((v, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-2xs font-bold text-ink-muted tabular-nums">P{i + 1}</span>
          <input type="number" inputMode="numeric" value={v === 0 ? '' : v}
            onChange={(e) => setStack(i, e.target.value === '' ? 0 : (parseInt(e.target.value, 10) || 0))}
            className="input flex-1 text-sm tabular-nums" placeholder="스택" />
          {mode === 'equity' ? (
            <span className="w-24 shrink-0 text-right text-base font-extrabold text-accent-300 tabular-nums">
              {equities[i] !== undefined ? equities[i].toFixed(2) : '0'}
              {awarded > 0 && (
                <span className="ml-1 text-2xs font-normal text-ink-muted">
                  ({((equities[i] / awarded) * 100 || 0).toFixed(1)}%)
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex shrink-0 gap-1">
              <SeatBtn on={hero === i} tone="hero" label="나" onClick={() => pickHero(i)} />
              <SeatBtn on={villain === i} tone="villain" label="올인" onClick={() => pickVillain(i)} />
            </span>
          )}
        </li>
      ))}
    </ul>
  </div>
  );

  // 압박 모드 전용 입력 — 스택·자리 바로 아래(결론에서 가장 가깝게)
  const pressureInputs = (
    <>
    {/* 상대 올인 레인지 */}
    <div>
      <span className="mb-1.5 block text-2xs font-semibold text-ink-secondary">상대 올인 레인지</span>
      <div className="grid grid-cols-3 gap-1.5">
        {SHOVE_RANGES.map((r) => {
          const on = r.id === rangeId;
          return (
            <button key={r.id} type="button" onClick={() => setRangeId(r.id)} aria-pressed={on}
              className={[
                'rounded-input border px-2 py-1.5 text-2xs font-bold leading-tight transition-colors',
                on ? 'border-accent-400 bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-secondary',
              ].join(' ')}>
              {r.label}
              <span className={`ml-1 font-normal tabular-nums ${on ? 'text-white' : 'text-ink-muted'}`}>상위 {r.pct}%</span>
            </button>
          );
        })}
      </div>
    </div>

    {/* 깔린 팟 */}
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold text-ink-secondary">이미 깔린 팟 (블라인드 + 앤티)</span>
      <input type="number" inputMode="numeric" min={0} value={pot === 0 ? '' : pot}
        onChange={(e) => setPot(e.target.value === '' ? 0 : (parseInt(e.target.value, 10) || 0))}
        className="input w-full text-sm tabular-nums" placeholder="0" />
    </label>
    </>
  );

  const failMsg = press.reason === 'stacks' ? '모든 자리에 1 이상의 스택을 넣어야 압박을 계산합니다.'
    : press.reason === 'prizes' ? '상금 구조를 1자리 이상 입력하세요.'
    : '자리를 다시 지정해 주세요.';

  return (
    // 제목은 전체화면 헤더(도구 런처)가 이미 표시 — 공통 CalcCard 로 흡수(2중 노출 제거)
    <CalcCard desc={mode === 'equity'
      ? '스택과 상금을 입력하면 각 플레이어의 기대 상금(ICM)을 계산합니다.'
      : '상대가 올인했을 때, 콜하려면 칩 기준 승률이 몇 % 필요한지 계산합니다.'}>
      <div className="flex items-center justify-between gap-2">
        <SegmentedTabs items={MODES} value={mode} onChange={setMode} />
        <button type="button" onClick={applyBubble}
          className="shrink-0 rounded-input border border-accent-400/50 bg-accent-300/10 px-2 py-1 text-2xs font-bold text-accent-300 leading-none">
          버블: 4명 · 3자리 시상
        </button>
      </div>

      {/* ── 결론 먼저 — 압박 모드의 큰 숫자 하나 ── */}
      {mode === 'pressure' && (
        <div aria-live="polite">
          {press.ok ? (
            <>
              <div className="rounded-card border border-accent-400/50 bg-accent-300/[0.07] px-3 py-4 text-center">
                <p className="text-2xs font-semibold text-ink-secondary">
                  P{villain + 1}의 올인을 콜하려면
                </p>
                <p className="mt-1 font-extrabold tabular-nums text-accent-200">
                  <span className="text-[2.75rem] leading-none">{reqInt}</span>
                  <span className="text-xl leading-none">.{reqDec}%</span>
                </p>
                <p className="mt-1.5 text-2xs text-ink-secondary">
                  칩만 보면 <span className="font-bold tabular-nums text-ink-secondary">{(press.reqChip * 100).toFixed(1)}%</span>
                  {' '}— 탈락 위험이 <span className="font-extrabold tabular-nums text-danger-deep dark:text-danger-light">+{(press.riskPremium * 100).toFixed(1)}%p</span> 더 요구합니다
                </p>
              </div>

              {/* 한 줄 결론 + 대표 핸드 사다리 */}
              <div className="mt-2 rounded-card border border-border-default bg-surface-high/60 p-2.5">
                <p className="text-sm font-bold text-ink-primary">{verdictLine(press.reqIcm, rangeId)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ladder.map((e) => (
                    <span key={e.hand}
                      className={[
                        'rounded-input border px-1.5 py-0.5 text-2xs font-bold tabular-nums',
                        e.call
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/50 dark:bg-emerald-400/10 dark:text-emerald-300'
                          : 'border-border-subtle bg-surface-low text-ink-muted',
                      ].join(' ')}>
                      {e.hand}<span className="ml-1 font-normal opacity-70">{e.eq.toFixed(0)}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-2xs text-ink-muted">
                  초록 = 필요 승률을 넘는 핸드(콜). 숫자는 상대 올인 레인지 상대 승률(%)입니다.
                </p>
              </div>

              {/* 보조 수치 — 큰 숫자를 방해하지 않게 한 줄 3칸 */}
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <div className="rounded-input bg-surface-high p-2">
                  <p className="text-2xs text-ink-muted">버블 팩터</p>
                  <p className="text-sm font-extrabold tabular-nums text-ink-primary">{press.bubbleFactor.toFixed(2)}배</p>
                </div>
                <div className="rounded-input bg-surface-high p-2">
                  <p className="text-2xs text-ink-muted">콜에 거는 칩</p>
                  <p className="text-sm font-extrabold tabular-nums text-ink-primary">{num(press.callAmount)}</p>
                </div>
                <div className="rounded-input bg-surface-high p-2">
                  <p className="text-2xs text-ink-muted">이기면 얻는 칩</p>
                  <p className="text-sm font-extrabold tabular-nums text-ink-primary">{num(press.winAmount)}</p>
                </div>
              </div>
              <p className="mt-1.5 text-2xs text-ink-muted">
                내 지분 — 폴드 <span className="tabular-nums text-ink-secondary">{press.eqFold.toFixed(2)}</span>
                {' · '}이기면 <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{press.eqWin.toFixed(2)}</span>
                {' · '}지면 <span className="font-bold tabular-nums text-danger-deep dark:text-danger-light">{press.eqLose.toFixed(2)}</span>
                {press.awarded > 0 && <> (배분 상금 {num(Math.round(press.awarded))})</>}
              </p>
            </>
          ) : (
            <div className="rounded-card border border-border-default bg-surface-high/60 p-3 text-center text-2xs text-ink-muted">
              {failMsg}
            </div>
          )}
        </div>
      )}

      {mode === 'pressure' ? <>{stackBlock}{pressureInputs}{prizeBlock}</> : <>{prizeBlock}{stackBlock}</>}

      <p className="text-2xs text-ink-muted">
        칩 2배 ≠ 상금 2배 — 칩이 쌓일수록 칩 1개의 상금 가치는 줄어듭니다(ICM의 핵심).
      </p>
      <p className="text-2xs text-ink-muted">
        Malmuth-Harville 모델 기준 추정치입니다. 실제 딜·체급에 따라 차이가 있을 수 있습니다.
        {mode === 'pressure' && ' 판정 예시는 학습용 기준선. 상대 레인지 추정이 틀리면 결론도 달라집니다.'}
      </p>
    </CalcCard>
  );
}
