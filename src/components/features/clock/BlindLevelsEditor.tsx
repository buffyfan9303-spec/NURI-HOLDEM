// src/components/features/clock/BlindLevelsEditor.tsx
// 재사용 블라인드 구조 편집기 — 레벨별 SB/BB/앤티/시간 + 일괄 듀레이션("15레벨까지 25분, 16레벨부터 15분")
// + 레벨/브레이크 추가 + 자동 생성. 클락(ClockConfig.levels)·프리셋·포스터(structure.levels)에 공통으로 쓰는 ClockLevel[] 생성.
import { useState } from 'react';
import { type ClockLevel, generateBlinds, countLevels } from '../../../api/clock';

// index i 까지의 레벨 번호(브레이크 제외)
function levelNoAt(levels: ClockLevel[], i: number): number {
  let n = 0;
  for (let k = 0; k <= i && k < levels.length; k++) if (levels[k].kind === 'level') n++;
  return n;
}

const NUM = 'input w-full text-xs tabular-nums min-w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export default function BlindLevelsEditor({ levels, onChange }: { levels: ClockLevel[]; onChange: (levels: ClockLevel[]) => void }) {
  const [bulkAll, setBulkAll] = useState(20);
  const [bulkFrom, setBulkFrom] = useState(16);
  const [bulkFromMin, setBulkFromMin] = useState(15);
  const [genMax, setGenMax] = useState(18);
  const total = countLevels(levels);

  const setLevel = (i: number, patch: Partial<ClockLevel>) => onChange(levels.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLevel = () => {
    const last = [...levels].reverse().find((l) => l.kind === 'level');
    const sb = last ? Math.round(last.bb) : 100, bb = sb * 2;
    onChange([...levels, { kind: 'level', sb, bb, ante: bb, minutes: last?.minutes ?? 20 }]);
  };
  const addBreak = () => onChange([...levels, { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK' }]);
  const removeLevel = (i: number) => onChange(levels.filter((_, idx) => idx !== i));

  const applyAll = (min: number) => { if (min > 0) onChange(levels.map((l) => l.kind === 'level' ? { ...l, minutes: min } : l)); };
  const applyFrom = (fromNo: number, min: number) => {
    if (min <= 0) return;
    onChange(levels.map((l, i) => (l.kind === 'level' && levelNoAt(levels, i) >= fromNo) ? { ...l, minutes: min } : l));
  };
  const autoGen = () => {
    if (levels.length && !window.confirm('현재 블라인드 구조를 자동 생성으로 덮어쓸까요?')) return;
    onChange(generateBlinds(0, genMax));
  };

  return (
    <div className="space-y-2">
      {/* 일괄 듀레이션 */}
      <div className="rounded-input border border-border-subtle bg-surface-high p-2 space-y-1.5">
        <p className="text-[10px] text-ink-muted">듀레이션 일괄 설정 — 예: 전체 25분 후, 16레벨부터 15분</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="w-8 shrink-0 text-2xs text-ink-secondary">전체</span>
          <div className="relative w-16">
            <input type="number" min="1" value={bulkAll || ''} onChange={(e) => setBulkAll(+e.target.value || 0)} className="input w-full pr-5 text-xs tabular-nums" />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">분</span>
          </div>
          <button type="button" onClick={() => applyAll(bulkAll)} className="rounded-input border border-gold-400/40 bg-gold-300/15 px-2.5 py-1.5 text-2xs font-bold text-gold-300 hover:bg-gold-300/25">전체 적용</button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="w-8 shrink-0 text-2xs text-ink-secondary">레벨</span>
          <input type="number" min="1" value={bulkFrom || ''} onChange={(e) => setBulkFrom(+e.target.value || 0)} className="input w-16 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="text-2xs text-ink-muted">부터</span>
          <div className="relative w-16">
            <input type="number" min="1" value={bulkFromMin || ''} onChange={(e) => setBulkFromMin(+e.target.value || 0)} className="input w-full pr-5 text-xs tabular-nums" />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">분</span>
          </div>
          <button type="button" onClick={() => applyFrom(bulkFrom, bulkFromMin)} className="rounded-input border border-gold-400/40 bg-gold-300/15 px-2.5 py-1.5 text-2xs font-bold text-gold-300 hover:bg-gold-300/25">적용</button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-muted">자동 생성 · 최대</span>
          <input type="number" min="1" max="60" value={genMax || ''} onChange={(e) => setGenMax(+e.target.value || 0)} className="input w-14 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="text-[10px] text-ink-muted">레벨</span>
          <button type="button" onClick={autoGen} className="rounded-input border border-border-default px-2 py-1 text-2xs font-bold text-ink-secondary hover:text-gold-300">⚙ 자동 생성</button>
        </div>
      </div>

      {/* 레벨 목록 */}
      <div className="space-y-1">
        <p className="text-[10px] text-ink-muted">총 {total}레벨 · 부족하면 아래 ‘+ 레벨’로 계속 추가하세요</p>
        {levels.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-center text-2xs font-bold text-gold-300">{l.kind === 'break' ? 'B' : levelNoAt(levels, i)}</span>
            {l.kind === 'break' ? (
              <input value={l.label ?? ''} onChange={(e) => setLevel(i, { label: e.target.value })} placeholder="BREAK" className="input flex-1 text-xs" />
            ) : (<>
              <input type="number" value={l.sb || ''} onChange={(e) => setLevel(i, { sb: +e.target.value || 0 })} placeholder="SB" className={NUM} />
              <input type="number" value={l.bb || ''} onChange={(e) => setLevel(i, { bb: +e.target.value || 0 })} placeholder="BB" className={NUM} />
              <input type="number" value={l.ante || ''} onChange={(e) => setLevel(i, { ante: +e.target.value || 0 })} placeholder="ANTE" className={NUM} />
            </>)}
            <div className="relative w-[4.5rem] shrink-0">
              <input type="number" value={l.minutes || ''} onChange={(e) => setLevel(i, { minutes: +e.target.value || 0 })} className="input w-full pr-6 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted pointer-events-none">분</span>
            </div>
            <button type="button" onClick={() => removeLevel(i)} className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={addLevel} className="flex-1 rounded-input border border-dashed border-border-default py-1.5 text-2xs text-ink-secondary hover:text-gold-300">+ 레벨</button>
        <button type="button" onClick={addBreak} className="flex-1 rounded-input border border-dashed border-border-default py-1.5 text-2xs text-ink-secondary hover:text-gold-300">+ 브레이크</button>
      </div>
    </div>
  );
}
