import { useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

// 소형 계산기 모음 — SPR / M-zone / EV / 뱅크롤 / 변동성. 모두 calcUi 카드 UI 사용.

// ── SPR (Stack-to-Pot Ratio) ──────────────────────────────────────────────
export function SprCalc() {
  const [stack, setStack] = useState(100000);
  const [pot, setPot] = useState(20000);
  const spr = pot > 0 ? stack / pot : 0;
  const guide = spr <= 0 ? '-'
    : spr < 3 ? '커밋 구간 — 강한 탑페어+ 면 올인 각오'
    : spr < 6 ? '중간 — 오버페어·강한 드로우로 스택 투입 고려'
    : '깊음 — 넛 지향, 마진 핸드는 팟 컨트롤';
  return (
    <CalcCard title="SPR 계산기" desc="유효 스택 ÷ 팟 = 커밋 판단 기준">
      <div className="grid grid-cols-2 gap-2">
        <Field label="유효 스택"><NumIn value={stack} onChange={setStack} /></Field>
        <Field label="현재 팟"><NumIn value={pot} onChange={setPot} /></Field>
      </div>
      <Result label="SPR" value={spr ? spr.toFixed(1) : '-'} accent />
      <p className="text-[10px] leading-relaxed text-ink-muted">{guide}</p>
    </CalcCard>
  );
}

// ── M-zone ────────────────────────────────────────────────────────────────
export function MzoneCalc() {
  const [stack, setStack] = useState(30000);
  const [sb, setSb] = useState(1000);
  const [bb, setBb] = useState(2000);
  const [ante, setAnte] = useState(2000);
  const [players, setPlayers] = useState(9);
  const cost = sb + bb + ante * Math.max(1, players);
  const m = cost > 0 ? stack / cost : 0;
  const zone = m >= 20 ? { l: '그린 — 여유', c: '#22C55E' }
    : m >= 10 ? { l: '옐로 — 주의', c: '#EAB308' }
    : m >= 6 ? { l: '오렌지 — 압박', c: '#F97316' }
    : m >= 1 ? { l: '레드 — 위험(푸시/폴드)', c: '#EF4444' }
    : { l: '데드 — 즉시 올인', c: '#94A3B8' };
  return (
    <CalcCard title="M-zone 스택 코치" desc="한 바퀴 비용 대비 스택(M)으로 전략 존 판단">
      <div className="grid grid-cols-2 gap-2">
        <Field label="내 스택"><NumIn value={stack} onChange={setStack} /></Field>
        <Field label="인원"><NumIn value={players} onChange={setPlayers} suffix="명" /></Field>
        <Field label="SB"><NumIn value={sb} onChange={setSb} /></Field>
        <Field label="BB"><NumIn value={bb} onChange={setBb} /></Field>
        <Field label="앤티(1인)"><NumIn value={ante} onChange={setAnte} /></Field>
      </div>
      <Result label={`M = ${m ? m.toFixed(1) : '-'}`} value={zone.l} />
      <div className="h-1.5 w-full rounded-full" style={{ background: zone.c }} />
    </CalcCard>
  );
}

// ── EV 계산기 ──────────────────────────────────────────────────────────────
export function EvCalc() {
  const [win, setWin] = useState(50);
  const [gain, setGain] = useState(30000);
  const [loss, setLoss] = useState(20000);
  const p = Math.max(0, Math.min(win, 100)) / 100;
  const ev = p * gain - (1 - p) * loss;
  return (
    <CalcCard title="EV 계산기" desc="승률·이득·손실로 기대값(EV) 계산">
      <Field label="승률"><NumIn value={win} onChange={setWin} suffix="%" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="이길 때 +이득"><NumIn value={gain} onChange={setGain} /></Field>
        <Field label="질 때 −손실"><NumIn value={loss} onChange={setLoss} /></Field>
      </div>
      <Result label="기대값 (EV)" value={`${ev >= 0 ? '+' : ''}${Math.round(ev).toLocaleString()}`} good={ev > 0} bad={ev < 0} />
      <p className="text-[10px] text-ink-muted">EV가 +면 장기적으로 이득인 결정입니다.</p>
    </CalcCard>
  );
}

// ── 뱅크롤 관리 ────────────────────────────────────────────────────────────
export function BankrollCalc() {
  const [buyin, setBuyin] = useState(100000);
  const [type, setType] = useState<'cash' | 'tourney'>('tourney');
  const mult = type === 'cash' ? { min: 20, rec: 30 } : { min: 50, rec: 100 };
  return (
    <CalcCard title="뱅크롤 관리" desc="게임 유형·바이인 기준 권장 뱅크롤">
      <Field label="게임 유형">
        <div className="flex gap-1.5">
          {([{ id: 'tourney', label: '토너먼트' }, { id: 'cash', label: '캐시' }] as const).map((t) => (
            <button key={t.id} type="button" onClick={() => setType(t.id)}
              className={['flex-1 h-9 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                type === t.id ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="바이인"><NumIn value={buyin} onChange={setBuyin} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Result label={`권장 (${mult.rec}바이인)`} value={(buyin * mult.rec).toLocaleString()} accent />
        <Result label={`최소 (${mult.min}바이인)`} value={(buyin * mult.min).toLocaleString()} />
      </div>
      <p className="text-[10px] text-ink-muted">뱅크롤이 최소 미만이면 한 단계 낮은 바이인을 권장합니다.</p>
    </CalcCard>
  );
}

// ── 변동성 시뮬레이터 ──────────────────────────────────────────────────────
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const cdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

export function VarianceCalc() {
  const [wr, setWr] = useState(5);     // 승률 bb/100
  const [sd, setSd] = useState(100);   // 표준편차 bb/100
  const [hands, setHands] = useState(10000);
  const n = Math.max(0, hands) / 100;
  const mean = wr * n;
  const sigma = sd * Math.sqrt(n);
  const lossProb = sigma > 0 ? cdf(-mean / sigma) : (mean < 0 ? 1 : 0);
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}bb`;
  return (
    <CalcCard title="변동성 시뮬레이터" desc="승률·표준편차로 예상 수익 범위와 손실 확률(근사)">
      <div className="grid grid-cols-2 gap-2">
        <Field label="승률 (bb/100)"><NumIn value={wr} onChange={setWr} /></Field>
        <Field label="표준편차 (bb/100)"><NumIn value={sd} onChange={setSd} /></Field>
      </div>
      <Field label="핸드 수"><NumIn value={hands} onChange={setHands} suffix="핸드" /></Field>
      <Result label="기대 수익" value={fmt(mean)} accent />
      <div className="grid grid-cols-2 gap-2">
        <Result label="68% 구간 (±1σ)" value={`${fmt(mean - sigma)} ~ ${fmt(mean + sigma)}`} />
        <Result label="손실 확률" value={`${Math.round(lossProb * 100)}%`} bad={lossProb > 0.4} />
      </div>
      <p className="text-[10px] leading-relaxed text-ink-muted">정규분포 근사입니다. 캐시 기준 표준편차는 보통 80~120bb/100입니다.</p>
    </CalcCard>
  );
}
