import { useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

// 아웃츠 → 완성 확률(정확/간이) + 브레이크이븐 팟 오즈.
export default function OutsCalc() {
  const [outs, setOuts] = useState(8);
  const [street, setStreet] = useState<'flop' | 'turn'>('flop'); // flop=2장(턴+리버), turn=1장(리버)

  const o = Math.max(0, Math.min(outs, 21));
  const unseen = street === 'flop' ? 47 : 46;
  const oneCard = o / unseen;
  const twoCard = 1 - ((unseen - o) / unseen) * ((unseen - 1 - o) / (unseen - 1));
  const exact = street === 'flop' ? twoCard : oneCard;
  const rule = street === 'flop' ? Math.min(o * 4, 100) : o * 2; // 4·2 법칙
  const pct = Math.round(exact * 1000) / 10;
  const breakeven = exact > 0 && exact < 1 ? `${(Math.round(((1 - exact) / exact) * 10) / 10).toFixed(1)} : 1` : '-';

  return (
    <CalcCard title="아웃츠 / 확률 계산기" desc="남은 아웃츠로 완성 확률과 필요한 팟 오즈를 계산">
      <Field label="아웃츠 (남은 도움 카드 수)">
        <NumIn value={outs} onChange={setOuts} suffix="장" />
      </Field>
      <Field label="시점">
        <div className="flex gap-1.5">
          {([{ id: 'flop', label: '플랍 (턴+리버 · 2장)' }, { id: 'turn', label: '턴 (리버 · 1장)' }] as const).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStreet(s.id)}
              className={[
                'flex-1 h-9 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                street === s.id ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Result label="완성 확률 (정확)" value={`${pct}%`} accent />
        <Result label="간이 (4·2 법칙)" value={`≈${rule}%`} />
      </div>
      <Result label="브레이크이븐 팟 오즈" value={breakeven} />
      <p className="text-[10px] leading-relaxed text-ink-muted">상대 베팅이 팟 대비 이 비율보다 작으면 콜이 이득입니다. (예: 3:1 이상이면 콜)</p>
    </CalcCard>
  );
}
