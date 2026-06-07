import { useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

/** 팟 오즈 · 콜 오즈 계산기 — 콜에 필요한 승률(에쿼티) 산출 */
export default function PotOddsCalc() {
  const [pot, setPot] = useState(100000);
  const [call, setCall] = useState(50000);
  const [eq, setEq] = useState(40);

  const total = Math.max(0, pot) + Math.max(0, call);
  const need = total > 0 ? (Math.max(0, call) / total) * 100 : 0; // 필요 에쿼티 %
  const ratio = call > 0 ? pot / call : 0;                        // 팟 오즈 X:1
  const ok = eq >= need;

  return (
    <CalcCard title="팟 오즈 · 콜 오즈" desc="팟·콜 금액으로 콜에 필요한 승률(에쿼티)을 계산합니다.">
      <div className="grid grid-cols-2 gap-2">
        <Field label="현재 팟"><NumIn value={pot} onChange={setPot} placeholder="100000" /></Field>
        <Field label="콜 금액"><NumIn value={call} onChange={setCall} placeholder="50000" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="필요 에쿼티" value={`${need.toFixed(1)}%`} accent />
        <Result label="팟 오즈" value={ratio > 0 ? `${ratio.toFixed(2)} : 1` : '–'} />
      </div>
      <div className="rounded-input border border-border-default bg-surface-high p-2.5 space-y-2">
        <Field label="내 예상 승률(%)"><NumIn value={eq} onChange={setEq} suffix="%" /></Field>
        <p className={`text-xs font-bold ${ok ? 'text-emerald-400' : 'text-danger-light'}`}>
          {ok ? '✓ 콜이 이득 (+EV)' : '✗ 콜은 손해 (−EV)'} · 손익분기 {need.toFixed(1)}%
        </p>
      </div>
    </CalcCard>
  );
}
