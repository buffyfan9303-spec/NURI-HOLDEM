import { useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

// 추가 계산기 — 상금 분배 / 종료시간 예측(운영) + 콤보(플레이어). 모두 calcUi 카드 UI.

// ── 상금 분배 계산기 ────────────────────────────────────────────────────────
// 총 상금과 참가 인원으로 시상 인원(~상위 12%)과 표준 분배표(참고용)를 자동 산출.
type PayoutStyle = 'topheavy' | 'flat' | 'satellite';
const PAYOUT_STYLES: { id: PayoutStyle; label: string; desc: string }[] = [
  { id: 'topheavy', label: '탑헤비', desc: '상위에 집중(가파른 곡선)' },
  { id: 'flat', label: '뱅크롤 관리', desc: '완만·다수 시상(플레이어 친화)' },
  { id: 'satellite', label: '세틀라이트', desc: '상위 동일 금액(시트)' },
];

export function PayoutCalc() {
  const [pool, setPool] = useState(11000000);
  const [entries, setEntries] = useState(80);
  const [placesIn, setPlacesIn] = useState(0); // 0 = 자동
  const [style, setStyle] = useState<PayoutStyle>('topheavy');

  const autoPct = style === 'flat' ? 0.18 : style === 'satellite' ? 0.15 : 0.10;
  const places = Math.max(1, placesIn > 0 ? placesIn : Math.round(entries * autoPct));

  let amounts: number[];
  if (style === 'satellite') {
    // 세틀라이트: 상위 시상자 동일 금액(시트). 반올림 잔액은 1위에 보정.
    const each = Math.max(0, Math.floor(pool / places / 1000) * 1000);
    amounts = Array.from({ length: places }, () => each);
    if (amounts.length) amounts[0] += pool - each * places;
  } else {
    // 탑헤비(가파름)=1.15 / 뱅크롤(완만)=0.55 지수 곡선.
    const exp = style === 'flat' ? 0.55 : 1.15;
    const weights = Array.from({ length: places }, (_, i) => 1 / Math.pow(i + 1, exp));
    const wSum = weights.reduce((a, b) => a + b, 0);
    amounts = weights.map((w) => Math.max(0, Math.round((w / wSum) * pool / 1000) * 1000));
    const used = amounts.reduce((a, b) => a + b, 0);
    if (amounts.length) amounts[0] += pool - used;
  }

  return (
    <CalcCard title="상금 분배 계산기" desc="총 상금·참가 인원 → 시상 인원과 분배표(참고용)">
      <div className="grid grid-cols-2 gap-2">
        <Field label="총 상금"><NumIn value={pool} onChange={setPool} /></Field>
        <Field label="참가 인원"><NumIn value={entries} onChange={setEntries} suffix="명" /></Field>
      </div>
      <div>
        <p className="mb-1 text-2xs font-semibold text-ink-secondary">분배 방식</p>
        <div className="grid grid-cols-3 gap-1">
          {PAYOUT_STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyle(s.id)} title={s.desc}
              className={['rounded-input py-1.5 text-2xs font-bold leading-tight transition-colors', style === s.id ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>{s.label}</button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-ink-muted">{PAYOUT_STYLES.find((s) => s.id === style)!.desc}</p>
      </div>
      <Field label="시상 인원 (0=자동)"><NumIn value={placesIn} onChange={setPlacesIn} suffix="명" /></Field>
      <Result label={`시상 인원 ${places}명 · 1위`} value={(amounts[0] ?? 0).toLocaleString()} accent />
      <div className="max-h-56 overflow-y-auto rounded-input border border-border-subtle">
        <table className="w-full text-2xs tabular-nums">
          <thead className="sticky top-0 bg-surface-high text-ink-muted">
            <tr><th className="py-1.5 px-2 text-left font-semibold">순위</th><th className="py-1.5 px-2 text-right font-semibold">상금</th><th className="py-1.5 px-2 text-right font-semibold">비중</th></tr>
          </thead>
          <tbody>
            {amounts.map((a, i) => (
              <tr key={i} className="border-t border-border-subtle">
                <td className={['py-1 px-2 text-left', i < 3 ? 'font-bold text-accent-300' : 'text-ink-secondary'].join(' ')}>{i + 1}위</td>
                <td className={['py-1 px-2 text-right', i < 3 ? 'font-bold text-accent-300' : 'text-ink-primary'].join(' ')}>{a.toLocaleString()}</td>
                <td className="py-1 px-2 text-right text-ink-muted">{pool > 0 ? Math.round((a / pool) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-relaxed text-ink-muted">표준 곡선 기반 참고값입니다. 실제 시상은 매장 정책에 맞게 조정하세요.</p>
    </CalcCard>
  );
}

// ── 종료시간 예측 ────────────────────────────────────────────────────────────
// 시작 시간·레벨·브레이크로 총 소요시간과 예상 종료 시각 산출.
export function EndTimeCalc() {
  const [startH, setStartH] = useState(17);
  const [startM, setStartM] = useState(0);
  const [levels, setLevels] = useState(25);
  const [perLevel, setPerLevel] = useState(20);
  const [breakEvery, setBreakEvery] = useState(5);
  const [breakMin, setBreakMin] = useState(8);

  const numBreaks = breakEvery > 0 ? Math.floor((Math.max(1, levels) - 1) / breakEvery) : 0;
  const totalMin = levels * perLevel + numBreaks * breakMin;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const endTotal = (startH * 60 + startM + totalMin) % (24 * 60);
  const endH = Math.floor(endTotal / 60);
  const endM = endTotal % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const overnight = startH * 60 + startM + totalMin >= 24 * 60;

  return (
    <CalcCard title="종료시간 예측" desc="레벨·브레이크로 총 소요시간과 예상 종료 시각">
      <div className="grid grid-cols-2 gap-2">
        <Field label="시작 시"><NumIn value={startH} onChange={setStartH} suffix="시" /></Field>
        <Field label="시작 분"><NumIn value={startM} onChange={setStartM} suffix="분" /></Field>
        <Field label="총 레벨"><NumIn value={levels} onChange={setLevels} suffix="LV" /></Field>
        <Field label="레벨 시간"><NumIn value={perLevel} onChange={setPerLevel} suffix="분" /></Field>
        <Field label="브레이크 주기"><NumIn value={breakEvery} onChange={setBreakEvery} suffix="LV마다" /></Field>
        <Field label="브레이크 시간"><NumIn value={breakMin} onChange={setBreakMin} suffix="분" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="총 소요시간" value={`${h}시간 ${m}분`} />
        <Result label={`예상 종료${overnight ? ' (익일)' : ''}`} value={`${pad(endH)}:${pad(endM)}`} accent />
      </div>
      <p className="text-[10px] text-ink-muted">레지 마감 전 탈락·딜레이는 미반영. 브레이크 {numBreaks}회 포함.</p>
    </CalcCard>
  );
}

// ── 콤보 계산기 ──────────────────────────────────────────────────────────────
// 핸드 표기(AA·AKs·AKo·AK)로 가능한 콤보 수 계산. 레인지 합산(쉼표 구분)도 지원.
function handCombos(raw: string): { label: string; n: number } | null {
  const s = raw.trim().toUpperCase().replace(/10/g, 'T');
  const m = s.match(/^([2-9TJQKA])([2-9TJQKA])(S|O)?$/);
  if (!m) return null;
  const [, a, b, t] = m;
  if (a === b) return { label: '페어', n: 6 };
  if (t === 'S') return { label: '수딧', n: 4 };
  if (t === 'O') return { label: '오프수트', n: 12 };
  return { label: '수딧+오프', n: 16 };
}

export function ComboCalc() {
  const [hand, setHand] = useState('AKs');
  const parts = hand.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  const parsed = parts.map((p) => ({ p, r: handCombos(p) }));
  const total = parsed.reduce((sum, x) => sum + (x.r?.n ?? 0), 0);
  const valid = parsed.some((x) => x.r);

  return (
    <CalcCard title="콤보 계산기" desc="핸드 표기로 콤보 수 계산 (AA·AKs·AKo / 쉼표로 레인지)">
      <Field label="핸드 / 레인지">
        <input
          type="text"
          value={hand}
          onChange={(e) => setHand(e.target.value)}
          placeholder="예: AKs, QQ, AJo"
          className="input w-full text-sm"
        />
      </Field>
      <Result label="총 콤보 수" value={valid ? `${total} 콤보` : '-'} accent />
      {valid && parts.length > 1 && (
        <ul className="flex flex-wrap gap-1.5">
          {parsed.map((x, i) => (
            <li key={i} className={['rounded-badge border px-2 py-0.5 text-2xs', x.r ? 'border-border-default bg-surface-high text-ink-secondary' : 'border-danger/40 bg-danger/10 text-danger-light'].join(' ')}>
              {x.p} {x.r ? `· ${x.r.n}` : '· ?'}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-input bg-surface-high p-2"><p className="text-2xs text-ink-muted">페어</p><p className="text-sm font-bold text-ink-primary">6</p></div>
        <div className="rounded-input bg-surface-high p-2"><p className="text-2xs text-ink-muted">수딧</p><p className="text-sm font-bold text-ink-primary">4</p></div>
        <div className="rounded-input bg-surface-high p-2"><p className="text-2xs text-ink-muted">오프수트</p><p className="text-sm font-bold text-ink-primary">12</p></div>
      </div>
      <p className="text-[10px] text-ink-muted">블로커(내 카드·보드)가 있으면 실제 콤보는 더 줄어듭니다.</p>
    </CalcCard>
  );
}
