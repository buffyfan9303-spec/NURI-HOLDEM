// src/components/features/gto/AiExplainSheet.tsx
import { useEffect, useState } from 'react';
import type { ActionFrequency, GtoScenario, HandCombo } from './gto.types';
import { explainGtoSpot } from './gto.api';

interface Props {
  open: boolean;
  onClose: () => void;
  scenario: GtoScenario;
  combo: HandCombo | null;
  frequency: ActionFrequency | null;
}

/** AI 연결 실패 시 폴백 — 규칙 기반 요약 */
function heuristicSummary(scenario: GtoScenario, combo: HandCombo, f: ActionFrequency): string {
  const pct = (n: number) => Math.round(n * 100);
  const parts: string[] = [];
  if (f.raise >= 0.5) parts.push(`주로 공격적으로 플레이(레이즈/3벳 ${pct(f.raise)}%)하는 핸드입니다.`);
  else if (f.call >= 0.5) parts.push(`콜(${pct(f.call)}%) 위주로 방어하는 핸드입니다.`);
  else if (f.fold >= 0.6) parts.push(`이 스팟에서는 대부분 폴드(${pct(f.fold)}%)가 정답입니다.`);
  else parts.push('혼합 전략(레이즈/콜/폴드가 섞인 핸드)입니다. 빈도대로 분산해 플레이하세요.');

  if (scenario.villain) {
    parts.push(`상대(${scenario.villain.position})의 ${scenario.villain.sizingBb ?? ''}bb 액션 기준 ${scenario.stackDepthBb}bb 전략입니다.`);
  } else {
    parts.push(`${scenario.heroPosition} 오픈(RFI) 기준 ${scenario.stackDepthBb}bb 전략입니다.`);
  }
  if (combo.kind === 'suited') parts.push('수딧 조합은 플러시 잠재력으로 동일 랭크 오프수딧보다 가치가 높습니다.');
  return parts.join(' ');
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function AiExplainSheet({ open, onClose, scenario, combo, frequency }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open || !combo || !frequency) return;
    let active = true;
    setStatus('loading');
    setText('');
    explainGtoSpot({ scenario, combo, frequency })
      .then((t) => { if (active) { setText(t); setStatus('done'); } })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
    // combo.id / scenario.id 변할 때마다 재요청
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, combo?.id, scenario.id]);

  if (!open) return null;

  const fallback = combo && frequency ? heuristicSummary(scenario, combo, frequency) : '';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="AI 해설">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex max-h-[70vh] w-full max-w-md flex-col rounded-t-dialog bg-surface-mid shadow-dialog animate-slide-up">
        <div className="flex justify-center pt-2 pb-1"><div className="h-1 w-10 rounded-full bg-border-strong" /></div>
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-gold-300">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
            AI 해설
          </h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-input text-ink-secondary hover:bg-surface-high hover:text-ink-primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-ink-secondary">
          {!combo || !frequency ? (
            <p>카드를 먼저 선택해 주세요.</p>
          ) : (
            <>
              <p><b className="text-ink-primary">{scenario.label}</b> · <b className="text-gold-300">{combo.id}</b></p>

              {status === 'loading' && (
                <p className="inline-flex items-center gap-2 text-ink-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gold-300 border-t-transparent" />
                  AI가 이 스팟을 분석하고 있어요...
                </p>
              )}

              {status === 'done' && <p className="whitespace-pre-wrap">{text}</p>}

              {status === 'error' && (
                <>
                  <p className="whitespace-pre-wrap">{fallback}</p>
                  <p className="text-2xs text-amber-400">AI 해설 연결에 실패하여 기본 요약을 표시했습니다. (네트워크 또는 키 설정을 확인하세요)</p>
                </>
              )}

              <div className="rounded-input border border-border-subtle bg-surface-high p-3">
                <p className="text-2xs leading-relaxed text-ink-muted">
                  AI가 생성한 학습용 참고 설명입니다. 실제 플레이는 상황·상대에 따라 달라질 수 있습니다.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
