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
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard desc="팟·콜 금액으로 콜에 필요한 승률(에쿼티) — 콜 오즈를 계산합니다.">
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
      {/* 중복 인지 제거 — 아웃츠 계산기와 같은 '필요 승률' 개념을 딥링크로 잇는다(계산 로직 불변) */}
      <a href="#tool=outs" className="block text-2xs font-semibold text-accent-300 transition-colors hover:text-accent-200">
        이 승률이 실제로 나오는지는 아웃츠 / 확률 계산기에서 확인 →
      </a>
    </CalcCard>
  );
}
