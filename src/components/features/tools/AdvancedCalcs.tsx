import { useMemo, useState } from 'react';

/* GTO 위자드형 보조 도구 3종 — MDF/블러프 계산기 · 어그레션 빈도 차트 · 레인지 vs 레인지 에퀴티(근사) */

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
      <p className="text-[10px] text-ink-muted">※ 이론(GTO) 기준 수치입니다. 상대가 과도하게 폴드/콜하면 그에 맞춰 블러프를 늘리거나 줄이세요.</p>
    </div>
  );
}

function Result({ label, value, desc, gold }: { label: string; value: string; desc: string; gold?: boolean }) {
  return (
    <div className={['rounded-input border p-2.5', gold ? 'border-accent-400/50 bg-accent-300/[0.07]' : 'border-border-subtle bg-surface-high'].join(' ')}>
      <p className="text-[10px] font-semibold text-ink-muted">{label}</p>
      <p className={['mt-0.5 text-xl font-extrabold tabular-nums', gold ? 'text-accent-300' : 'text-ink-primary'].join(' ')}>{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-ink-muted">{desc}</p>
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
      <p className="text-[10px] text-ink-muted">BB 오픈 0% = 림프 팟 외 오픈 기회 없음(빅블라인드). 콜드콜 30%는 BB 디펜드 기준.</p>
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

// ── 레인지 vs 레인지 에퀴티(근사 매트릭스) ────────────────────────────────────
// 프리셋 레인지 간 프리플랍 에퀴티 근사값(행 레인지 기준 %, 솔버/시뮬레이터 결과 요약).
const RANGES = ['UTG 오픈(17%)', 'CO 오픈(27%)', 'BTN 오픈(44%)', 'BB 디펜드(30%)', '3벳 레인지(8%)', '랜덤(100%)'] as const;
const EQ: number[][] = [
  // vs UTG  CO    BTN   BB    3bet  Random
  [50.0, 53.5, 57.5, 58.5, 44.5, 62.5], // UTG 오픈
  [46.5, 50.0, 54.0, 55.5, 41.5, 59.5], // CO 오픈
  [42.5, 46.0, 50.0, 52.0, 38.5, 56.0], // BTN 오픈
  [41.5, 44.5, 48.0, 50.0, 37.5, 54.5], // BB 디펜드
  [55.5, 58.5, 61.5, 62.5, 50.0, 66.0], // 3벳 레인지
  [37.5, 40.5, 44.0, 45.5, 34.0, 50.0], // 랜덤
];

export function RangeMatrix() {
  const [a, setA] = useState(2); // BTN 오픈
  const [b, setB] = useState(3); // BB 디펜드
  const eq = useMemo(() => EQ[a][b], [a, b]);

  return (
    <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">레인지 vs 레인지 에퀴티</h3>
        <p className="text-2xs text-ink-muted mt-0.5">프리셋 레인지끼리의 프리플랍 승률(근사). 특정 핸드 vs 레인지는 「GTO 핸드 분석」에서 정밀 계산하세요.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-2xs font-semibold text-accent-300">내 레인지</span>
          <select value={a} onChange={(e) => setA(Number(e.target.value))} className="input w-full text-sm">
            {RANGES.map((r, i) => <option key={r} value={i}>{r}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-2xs font-semibold text-ink-secondary">상대 레인지</span>
          <select value={b} onChange={(e) => setB(Number(e.target.value))} className="input w-full text-sm">
            {RANGES.map((r, i) => <option key={r} value={i}>{r}</option>)}
          </select>
        </label>
      </div>
      {/* 결과 바 */}
      <div>
        <div className="flex items-baseline justify-between text-2xs">
          <span className="font-bold text-accent-300">내 {eq.toFixed(1)}%</span>
          <span className="font-bold text-ink-secondary">상대 {(100 - eq).toFixed(1)}%</span>
        </div>
        <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-surface-high">
          <div className="h-full bg-accent-300 transition-[width] duration-300" style={{ width: `${eq}%` }} />
        </div>
      </div>
      {/* 전체 매트릭스 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-center text-[10px]">
          <thead>
            <tr>
              <th className="py-1 px-1.5 text-left text-ink-muted font-semibold">내 \ 상대</th>
              {RANGES.map((r) => <th key={r} className="py-1 px-1.5 text-ink-muted font-semibold whitespace-nowrap">{r.split('(')[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {RANGES.map((r, i) => (
              <tr key={r} className="border-t border-border-subtle">
                <td className="py-1 px-1.5 text-left font-bold text-accent-300 whitespace-nowrap">{r.split('(')[0]}</td>
                {RANGES.map((_, j) => (
                  <td key={j} onClick={() => { setA(i); setB(j); }}
                    className={['py-1 px-1.5 tabular-nums cursor-pointer transition-colors',
                      i === a && j === b ? 'bg-accent-300/15 font-extrabold text-accent-300' : 'text-ink-secondary hover:bg-surface-high'].join(' ')}>
                    {EQ[i][j].toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-ink-muted">※ 몬테카를로 시뮬레이션 요약 근사치(±1%p). 레인지가 넓을수록 보드 의존도가 커집니다.</p>
    </div>
  );
}
