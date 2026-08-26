import { useEffect, useState } from 'react';
import { handName, type FreqMap } from '../../../lib/ranges';
import { type WeightedCombo } from '../gto/equityEngine';
import { rangeVsRangeAsync } from '../gto/equityClient';
import { expandFreqToCombos, scenarioActionCombos } from '../gto/useDeepGto';

/* GTO 위자드형 보조 도구 3종 — MDF/블러프 계산기 · 어그레션 빈도 차트 · 레인지 vs 레인지 에퀴티(실계산) */

const fmtPct = (x: number) => `${Math.round(x * 10) / 10}%`;

// ── MDF · 블러프 빈도 계산기 ──────────────────────────────────────────────────
export function MdfCalc() {
  const [pot, setPot] = useState('100');
  const [bet, setBet] = useState('66');

  const p = Math.max(0, Number(pot) || 0);
  const b = Math.max(0, Number(bet) || 0);
  const ratio = p > 0 ? b / p : 0;
  // MDF = pot / (pot + bet) — 이만큼은 디펜드해야 상대의 임의 블러프가 이득을 못 봄
  const mdf = p + b > 0 ? (p / (p + b)) * 100 : 0;
  // 상대 콜에 필요한 승률(팟 오즈) = bet / (pot + 2bet)
  const callEq = p + 2 * b > 0 ? (b / (p + 2 * b)) * 100 : 0;
  // 밸류:블러프 균형(리버 기준) — 블러프 비율 = bet/(pot+2bet)
  const bluffRatio = callEq;

  return (
    <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">MDF · 블러프 계산기</h3>
        <p className="text-2xs text-ink-muted mt-0.5">상대 벳에 얼마나 수비해야 하는지(MDF), 내 벳에 블러프를 몇 % 섞어야 하는지 즉시 계산합니다.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-2xs font-semibold text-ink-secondary">팟 크기</span>
          <input type="number" inputMode="numeric" value={pot} onChange={(e) => setPot(e.target.value)} className="input w-full text-sm tabular-nums" />
        </label>
        <label className="space-y-1">
          <span className="text-2xs font-semibold text-ink-secondary">벳 크기</span>
          <input type="number" inputMode="numeric" value={bet} onChange={(e) => setBet(e.target.value)} className="input w-full text-sm tabular-nums" />
        </label>
      </div>
      {/* 자주 쓰는 벳 사이즈 프리셋 */}
      <div className="flex flex-wrap gap-1.5">
        {[[25, '¼팟'], [33, '⅓팟'], [50, '½팟'], [66, '⅔팟'], [75, '¾팟'], [100, '팟'], [150, '1.5팟']].map(([pct, label]) => (
          <button key={pct} type="button" onClick={() => setBet(String(Math.round((p * Number(pct)) / 100)))}
            className="rounded-badge border border-border-default bg-surface-high px-2 py-1 text-2xs font-bold text-ink-secondary hover:border-accent-400/50 hover:text-accent-300 transition-colors">
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Result label="MDF (최소 수비 빈도)" value={fmtPct(mdf)} desc={`상대가 ${ratio > 0 ? `${Math.round(ratio * 100)}% 팟` : ''} 벳 시 레인지의 ${fmtPct(mdf)}는 콜/레이즈로 막아야 착취당하지 않아요.`} gold />
        <Result label="콜에 필요한 승률" value={fmtPct(callEq)} desc="이 승률보다 핸드 에퀴티가 높으면 수학적으로 콜이 이득입니다." />
        <Result label="내 벳의 적정 블러프 비율" value={fmtPct(bluffRatio)} desc={`리버 기준 밸류 ${fmtPct(100 - bluffRatio)} : 블러프 ${fmtPct(bluffRatio)}로 섞으면 상대가 콜/폴드 어느 쪽도 착취 못 해요.`} />
      </div>
      <p className="text-2xs text-ink-muted">※ 이론(GTO) 기준 수치입니다. 상대가 과도하게 폴드/콜하면 그에 맞춰 블러프를 늘리거나 줄이세요.</p>
    </div>
  );
}

function Result({ label, value, desc, gold }: { label: string; value: string; desc: string; gold?: boolean }) {
  return (
    <div className={['rounded-input border p-2.5', gold ? 'border-accent-400/50 bg-accent-300/[0.07]' : 'border-border-subtle bg-surface-high'].join(' ')}>
      <p className="text-2xs font-semibold text-ink-muted">{label}</p>
      <p className={['mt-0.5 text-xl font-extrabold tabular-nums', gold ? 'text-accent-300' : 'text-ink-primary'].join(' ')}>{value}</p>
      <p className="mt-1 text-2xs leading-snug text-ink-muted">{desc}</p>
    </div>
  );
}

// ── 어그레션 빈도 차트 ────────────────────────────────────────────────────────
// 6맥스 100bb 기준 권장 프리플랍 빈도(근사) — 출처: 일반적 GTO 솔버 결과 요약
const AGGRO_ROWS: { pos: string; open: number; threeBet: number; coldCall: number; foldTo3bet: number }[] = [
  { pos: 'UTG', open: 17, threeBet: 3.5, coldCall: 4, foldTo3bet: 55 },
  { pos: 'MP',  open: 21, threeBet: 4.5, coldCall: 5, foldTo3bet: 53 },
  { pos: 'CO',  open: 27, threeBet: 6,   coldCall: 6, foldTo3bet: 50 },
  { pos: 'BTN', open: 44, threeBet: 8,   coldCall: 7, foldTo3bet: 47 },
  { pos: 'SB',  open: 36, threeBet: 9,   coldCall: 2, foldTo3bet: 52 },
  { pos: 'BB',  open: 0,  threeBet: 11,  coldCall: 30, foldTo3bet: 45 },
];

export function AggroChart() {
  return (
    <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-2.5">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">어그레션 빈도 차트</h3>
        <p className="text-2xs text-ink-muted mt-0.5">6맥스 · 100bb 기준 포지션별 권장 빈도(근사). 내 성향이 이 범위에서 크게 벗어나면 누수일 수 있어요.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-center text-xs">
          <thead>
            <tr className="text-2xs text-ink-muted">
              <th className="py-1.5 px-2 text-left font-semibold">포지션</th>
              <th className="py-1.5 px-2 font-semibold">오픈레이즈</th>
              <th className="py-1.5 px-2 font-semibold">3벳</th>
              <th className="py-1.5 px-2 font-semibold">콜드콜</th>
              <th className="py-1.5 px-2 font-semibold">3벳에 폴드</th>
            </tr>
          </thead>
          <tbody>
            {AGGRO_ROWS.map((r) => (
              <tr key={r.pos} className="border-t border-border-subtle">
                <td className="py-1.5 px-2 text-left font-bold text-accent-300">{r.pos}</td>
                <td className="py-1.5 px-2"><Bar v={r.open} max={50} /></td>
                <td className="py-1.5 px-2"><Bar v={r.threeBet} max={12} /></td>
                <td className="py-1.5 px-2"><Bar v={r.coldCall} max={32} /></td>
                <td className="py-1.5 px-2 tabular-nums text-ink-secondary">{r.foldTo3bet}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-ink-muted">BB 오픈 0% = 림프 팟 외 오픈 기회 없음(빅블라인드). 콜드콜 30%는 BB 디펜드 기준.</p>
    </div>
  );
}

function Bar({ v, max }: { v: number; max: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-high">
        <span className="block h-full rounded-full bg-accent-300/80" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right tabular-nums text-ink-primary font-semibold">{v}%</span>
    </span>
  );
}

// ── 레인지 vs 레인지 에퀴티(실계산 매트릭스) ──────────────────────────────────
// 표준 차트(ranges.data)를 콤보 단위로 전개해 computeRangeVsRange 몬테카를로로 실계산.
const MATRIX_ITER = 2500; // 프리플랍 반복 수 (성능 규칙: 3000회 이하)

/** 랜덤(전체 100%) — 169 핸드 전부 빈도 1 */
function fullRandomFreq(): FreqMap {
  const m: FreqMap = new Map();
  for (let hi = 0; hi <= 12; hi += 1) {
    m.set(handName(hi, hi, false), 1);
    for (let lo = 0; lo < hi; lo += 1) {
      m.set(handName(hi, lo, true), 1);
      m.set(handName(hi, lo, false), 1);
    }
  }
  return m;
}

interface MatrixPreset { label: string; combos: WeightedCombo[]; }
const MATRIX_PRESETS: MatrixPreset[] = [
  { label: '타이트 오픈(LJ)', combos: scenarioActionCombos('rfi_lj', 'raise') },
  { label: '미들 오픈(HJ)', combos: scenarioActionCombos('rfi_hj', 'raise') },
  { label: '와이드 오픈(BTN)', combos: scenarioActionCombos('rfi_btn', 'raise') },
  { label: '3벳(SB vs BTN)', combos: scenarioActionCombos('sb_3bet_btn', 'raise') },
  { label: 'BB 수비콜', combos: scenarioActionCombos('bb_vs_btn', 'call') },
  { label: '랜덤(100%)', combos: expandFreqToCombos(fullRandomFreq()) },
];
/** 콤보 가중 %(1326 기준) — 셀렉트 라벨용 */
const presetPct = (p: MatrixPreset): string =>
  `${Math.round((100 * p.combos.reduce((s, c) => s + c.weight, 0)) / 1326)}%`;

// 결과 캐시 — 'i:j'(i<j) → i 기준 에퀴티 %. 세션 내 재계산 방지.
const eqCache = new Map<string, number>();
const pairKey = (i: number, j: number): string => (i < j ? `${i}:${j}` : `${j}:${i}`);

export function RangeMatrix() {
  const [a, setA] = useState(2); // 와이드 오픈(BTN)
  const [b, setB] = useState(4); // BB 수비콜
  const [, setTick] = useState(0); // 캐시 갱신 리렌더 트리거

  // 대각선은 대칭이라 정확히 50, 하삼각은 상삼각의 보수(100-x) — 15쌍만 계산하면 된다.
  const getEq = (i: number, j: number): number | null => {
    if (i === j) return 50.0;
    const v = eqCache.get(pairKey(i, j));
    if (v === undefined) return null;
    return i < j ? v : 100 - v;
  };

  // 선택 쌍 우선 → 나머지 쌍 순차 계산.
  // [DS] MO-9C: setTimeout(0) 체인은 프레임 사이 양보만 할 뿐 15개 롱태스크가 메인스레드에
  // 연속됐다 → 워커에 한 쌍씩 순차 위임(메인스레드 점유 0). 결과·캐시·표시 로직은 동일.
  useEffect(() => {
    let cancelled = false;
    const pending: string[] = [];
    const enqueue = (i: number, j: number) => {
      if (i === j) return;
      const key = pairKey(i, j);
      if (!eqCache.has(key) && !pending.includes(key)) pending.push(key);
    };
    enqueue(a, b);
    for (let i = 0; i < MATRIX_PRESETS.length; i += 1)
      for (let j = i + 1; j < MATRIX_PRESETS.length; j += 1) enqueue(i, j);

    const step = () => {
      if (cancelled) return;
      const key = pending.shift();
      if (!key) return;
      const [i, j] = key.split(':').map(Number);
      rangeVsRangeAsync(MATRIX_PRESETS[i].combos, MATRIX_PRESETS[j].combos, [], MATRIX_ITER).then((r) => {
        if (cancelled) return;
        eqCache.set(key, r.hero * 100);
        setTick((t) => t + 1);
        step();
      });
    };
    step();
    return () => { cancelled = true; };
  }, [a, b]);

  const eq = getEq(a, b);

  return (
    <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">레인지 vs 레인지 에퀴티</h3>
        <p className="text-2xs text-ink-muted mt-0.5">표준 차트 레인지를 콤보 단위로 전개해 프리플랍 승률을 실시간 계산합니다. 특정 핸드 vs 레인지는 「GTO 핸드 분석」에서.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-2xs font-semibold text-accent-300">내 레인지</span>
          <select value={a} onChange={(e) => setA(Number(e.target.value))} className="input w-full text-sm">
            {MATRIX_PRESETS.map((r, i) => <option key={r.label} value={i}>{`${r.label} · ${presetPct(r)}`}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-2xs font-semibold text-ink-secondary">상대 레인지</span>
          <select value={b} onChange={(e) => setB(Number(e.target.value))} className="input w-full text-sm">
            {MATRIX_PRESETS.map((r, i) => <option key={r.label} value={i}>{`${r.label} · ${presetPct(r)}`}</option>)}
          </select>
        </label>
      </div>
      {/* 결과 바 */}
      {eq === null ? (
        <div className="flex h-8 items-center gap-2 text-2xs text-ink-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />
          에퀴티 계산 중...
        </div>
      ) : (
        <div>
          <div className="flex items-baseline justify-between text-2xs">
            <span className="font-bold text-accent-300">내 {eq.toFixed(1)}%</span>
            <span className="font-bold text-ink-secondary">상대 {(100 - eq).toFixed(1)}%</span>
          </div>
          <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-surface-high">
            <div className="h-full bg-accent-300 transition-[width] duration-300" style={{ width: `${eq}%` }} />
          </div>
        </div>
      )}
      {/* 전체 매트릭스 — 미계산 셀은 백그라운드 순차 계산 후 채워짐 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-center text-2xs">
          <thead>
            <tr>
              <th className="py-1 px-1.5 text-left text-ink-muted font-semibold">내 \ 상대</th>
              {MATRIX_PRESETS.map((r) => <th key={r.label} className="py-1 px-1.5 text-ink-muted font-semibold whitespace-nowrap">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {MATRIX_PRESETS.map((r, i) => (
              <tr key={r.label} className="border-t border-border-subtle">
                <td className="py-1 px-1.5 text-left font-bold text-accent-300 whitespace-nowrap">{r.label}</td>
                {MATRIX_PRESETS.map((_, j) => {
                  const v = getEq(i, j);
                  return (
                    <td key={j} onClick={() => { setA(i); setB(j); }}
                      className={['py-1 px-1.5 tabular-nums cursor-pointer transition-colors',
                        i === a && j === b ? 'bg-accent-300/15 font-extrabold text-accent-300' : 'text-ink-secondary hover:bg-surface-high'].join(' ')}>
                      {v === null ? '…' : v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-ink-muted">※ 몬테카를로 실계산(쌍마다 {MATRIX_ITER.toLocaleString()}회, ±1%p 오차). 레인지가 넓을수록 보드 의존도가 커집니다.</p>
    </div>
  );
}
