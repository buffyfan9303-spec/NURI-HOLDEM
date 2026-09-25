// src/components/features/clock/LiveLevelsEditor.tsx — 진행 중 블라인드 구조 수정(C10, 오너 2026-09-25).
//
// [설정] 화면의 편집기는 '새로 시작' 용이라 저장하면 레벨·경과·엔트리·탈락이 0 이 된다. 이 편집기는 **config.levels 만** 바꾼다.
//   · 지난 레벨: 읽기 전용(자물쇠). · 진행 중 레벨: 블라인드·앤티만. · 앞으로 올 레벨: 전부 + 삭제. · 맨 뒤에 레벨/브레이크 추가.
// 규칙의 정본은 api/clock.ts liveStructurePatch 다 — 이 화면은 입력을 막아 줄 뿐이고, 저장 직전에 그 함수가 다시 판정한다
// (편집 중에 시간이 흘러 레벨이 넘어가면 저장이 거절된다 — 지난 레벨을 조용히 바꾸지 않는다).
import { useMemo, useState } from 'react';
import Modal from '../../atoms/Modal';
import Icon from '../../atoms/Icon';
import { liveLockedCount, type ClockLevel, type ClockState } from '../../../api/clock';
import { levelNumberAt } from '../../../lib/clockLevel';

// px-2: 기본 .input 의 px-3 은 390 폭에서 글자 공간을 25.5px 로 줄여 6~7자리 블라인드가 잘렸다(FULL-RECHECK-2/C #1).
const NUM = 'input w-full min-w-0 px-2 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-60';

export default function LiveLevelsEditor({ state, onClose, onApply }: {
  state: ClockState;
  onClose: () => void;
  /** 적용 — 성공하면 true(닫는다), 규칙 위반이면 false(편집 내용 유지). */
  onApply: (levels: ClockLevel[]) => boolean;
}) {
  const [draft, setDraft] = useState<ClockLevel[]>(() => (state.config?.levels ?? []).map((l) => ({ ...l })));
  // 열 때 한 번 잰다 — 편집 중 레벨이 넘어가도 저장 직전 판정(liveStructurePatch)이 다시 막는다.
  const lock = useMemo(() => liveLockedCount(state), [state]);
  const finished = lock.current === null && lock.passed === (state.config?.levels?.length ?? 0) && lock.passed > 0;

  const set = (i: number, patch: Partial<ClockLevel>) => setDraft((d) => d.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setDraft((d) => d.filter((_, k) => k !== i));
  const addLevel = () => setDraft((d) => {
    const last = [...d].reverse().find((l) => l.kind === 'level');
    const sb = last ? Math.round(last.bb) : 100, bb = sb * 2;
    return [...d, { kind: 'level', sb, bb, ante: bb, minutes: last?.minutes ?? 20 }];
  });
  const addBreak = () => setDraft((d) => [...d, { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK' }]);

  return (
    <Modal open onClose={onClose} title="블라인드 구조 수정" maxWidth="lg" variant="sheet">
      <div className="space-y-2 p-4" data-testid="clk-live-editor">
        <p className="text-2xs leading-relaxed text-ink-muted">
          {finished
            ? '마지막 레벨까지 끝난 대회입니다. 아래에 레벨을 덧붙이면 그 레벨에서 일시정지로 이어지고, [계속하기]로 재개합니다.'
            : '지난 레벨은 바꿀 수 없습니다. 진행 중 레벨은 블라인드·앤티만, 남은 시간은 콘솔의 Min/Sec ± 로 조정하세요. 엔트리·탈락·경과 기록은 그대로입니다.'}
        </p>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
          {draft.map((l, i) => {
            const passed = i < lock.passed;
            const current = i === lock.current;
            const no = levelNumberAt(draft, i);
            // 좁은 폭(<sm)은 두 줄 — 1줄: 번호·SB·BB·ANTE, 2줄: 시간·상태. 한 줄 6칸이면 390 에서 입력칸이 55px 로 눌렸다.
            return (
              <div key={i} data-level-row={i} data-row-state={passed ? 'passed' : current ? 'current' : 'future'}
                className={['grid grid-cols-[1.75rem_repeat(3,minmax(0,1fr))] items-center gap-1.5 rounded-input px-1 py-0.5 sm:grid-cols-[1.75rem_repeat(3,minmax(0,1fr))_4.5rem_2.75rem]', current ? 'bg-accent-300/10 ring-1 ring-accent-400/40' : ''].join(' ')}>
                <span className="w-7 shrink-0 text-center text-2xs font-bold text-accent-300">{l.kind === 'break' ? 'B' : no}</span>
                {l.kind === 'break' ? (
                  <input value={l.label ?? ''} disabled={passed} onChange={(e) => set(i, { label: e.target.value })} placeholder="BREAK" aria-label={`브레이크 ${i + 1} 라벨`} className="input col-span-3 min-w-0 text-xs disabled:opacity-60" />
                ) : (<>
                  <input type="number" inputMode="numeric" disabled={passed} value={l.sb || ''} onChange={(e) => set(i, { sb: +e.target.value || 0 })} placeholder="SB" aria-label={`레벨 ${no} SB`} className={NUM} />
                  <input type="number" inputMode="numeric" disabled={passed} value={l.bb || ''} onChange={(e) => set(i, { bb: +e.target.value || 0 })} placeholder="BB" aria-label={`레벨 ${no} BB`} className={NUM} />
                  <input type="number" inputMode="numeric" disabled={passed} value={l.ante || ''} onChange={(e) => set(i, { ante: +e.target.value || 0 })} placeholder="ANTE" aria-label={`레벨 ${no} 앤티`} className={NUM} />
                </>)}
                <div className="relative col-start-2 sm:col-start-auto">
                  <input type="number" inputMode="numeric" disabled={passed || current} value={l.minutes || ''} onChange={(e) => set(i, { minutes: +e.target.value || 0 })}
                    aria-label={`${l.kind === 'break' ? '브레이크' : `레벨 ${no}`} 시간(분)`} className={`${NUM} pr-6`} />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">분</span>
                </div>
                {passed ? (
                  <span className="w-11 text-center text-[10px] font-bold text-ink-muted" title="이미 지난 레벨"><Icon name="lock" size={12} className="inline-block" /> 지남</span>
                ) : current ? (
                  <span className="w-11 text-center text-[10px] font-bold text-accent-300">진행 중</span>
                ) : (
                  <button type="button" onClick={() => remove(i)} aria-label={`${l.kind === 'break' ? '브레이크' : `레벨 ${no}`} 삭제`}
                    className="hit grid h-8 w-11 place-items-center text-xs text-ink-muted hover:text-danger-light">✕</button>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={addLevel} data-testid="clk-live-add-level" className="flex-1 rounded-input border border-dashed border-border-default py-2 text-2xs font-bold text-ink-secondary hover:text-accent-300">+ 레벨</button>
          <button type="button" onClick={addBreak} className="flex-1 rounded-input border border-dashed border-border-default py-2 text-2xs font-bold text-ink-secondary hover:text-accent-300">+ 브레이크</button>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm">취소</button>
          <button type="button" data-testid="clk-live-apply" onClick={() => { if (onApply(draft)) onClose(); }} className="btn-primary flex-1 text-sm">적용</button>
        </div>
      </div>
    </Modal>
  );
}
