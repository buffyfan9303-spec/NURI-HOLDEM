// src/components/features/PresetManager.tsx
// 게임 프리셋 관리 — 포스터/장부를 만들지 않고도 게임 내용(+듀레이션)을 템플릿으로 생성/수정/삭제.
import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { listGamePresets, saveGamePreset, deleteGamePreset, type GamePreset, type GamePresetData } from '../../api/presets';
import BlindLevelsEditor from './clock/BlindLevelsEditor';

const EMPTY: GamePresetData = {
  title: '', gameType: '', buyIn: 0, startStack: 0, rebuyStack: 0, addonStack: 0, addonCost: 0,
  prizeType: 'GTD', prizeAmount: 0, prizePercent: 0, duration: '', blinds: '', isCompetition: false, memo: '',
};

export default function PresetManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [presets, setPresets] = useState<GamePreset[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; data: GamePresetData } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listGamePresets(venueId).then(setPresets).catch(() => setPresets([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [venueId]);

  const startNew = () => setEditing({ name: '', data: { ...EMPTY } });
  const startEdit = (p: GamePreset) => setEditing({ id: p.id, name: p.name, data: { ...EMPTY, ...p.data } });

  const save = async () => {
    if (!editing || busy) return;
    if (!editing.name.trim()) { toast.show('프리셋 이름을 입력하세요', 'error'); return; }
    setBusy(true);
    try { await saveGamePreset(venueId, editing.name, editing.data, editing.id); toast.show('프리셋을 저장했어요', 'success'); setEditing(null); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); } finally { setBusy(false); }
  };
  const remove = async (p: GamePreset) => {
    if (!window.confirm(`'${p.name}' 프리셋을 삭제할까요?`)) return;
    try { await deleteGamePreset(p.id); toast.show('삭제했어요', 'info'); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  };

  const set = (patch: Partial<GamePresetData>) => setEditing((e) => e ? { ...e, data: { ...e.data, ...patch } } : e);

  // 프리셋 한 줄 요약
  const summary = (d: GamePresetData) => [
    d.gameType, d.buyIn ? `바인 ${d.buyIn.toLocaleString()}원` : '', d.startStack ? `스타팅 ${d.startStack.toLocaleString()}` : '',
    d.prizeType === 'GTD' && d.prizeAmount ? `${d.prizeAmount}만 GTD` : '', d.duration ? `듀레이션 ${d.duration}` : '',
  ].filter(Boolean).join(' · ') || '내용 없음';

  if (editing) {
    const d = editing.data;
    return (
      <section className="space-y-2.5 rounded-card border border-border-default bg-surface-low p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-primary">{editing.id ? '프리셋 수정' : '새 프리셋'}</h3>
          <button type="button" onClick={() => setEditing(null)} className="text-lg leading-none text-ink-muted">✕</button>
        </div>
        <Field label="프리셋 이름 *"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={40} placeholder="예: 데일리 6만 스타팅" className="input w-full text-sm" /></Field>
        <Field label="게임 제목"><input value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="예: 데일리 토너먼트" className="input w-full text-sm" /></Field>
        <Field label="게임 종류"><input value={d.gameType ?? ''} onChange={(e) => set({ gameType: e.target.value })} placeholder="프리즈아웃 · 바운티 · 애드온 등" className="input w-full text-sm" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="바이인(원)"><NumInput v={d.buyIn} on={(n) => set({ buyIn: n })} /></Field>
          <Field label="듀레이션"><input value={d.duration ?? ''} onChange={(e) => set({ duration: e.target.value })} placeholder="예: 레벨당 20분" className="input w-full text-sm" /></Field>
          <Field label="스타팅 스택"><NumInput v={d.startStack} on={(n) => set({ startStack: n })} /></Field>
          <Field label="리바인 스택"><NumInput v={d.rebuyStack} on={(n) => set({ rebuyStack: n })} /></Field>
          <Field label="애드온 스택"><NumInput v={d.addonStack} on={(n) => set({ addonStack: n })} /></Field>
          <Field label="애드온 비용(원)"><NumInput v={d.addonCost} on={(n) => set({ addonCost: n })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="상금 방식">
            <select value={d.prizeType} onChange={(e) => set({ prizeType: e.target.value as 'GTD' | 'ENTRY' })} className="input w-full text-sm">
              <option value="GTD">GTD(보장 상금)</option>
              <option value="ENTRY">엔트리 비율(%)</option>
            </select>
          </Field>
          {d.prizeType === 'GTD'
            ? <Field label="보장 상금(만원)"><NumInput v={d.prizeAmount} on={(n) => set({ prizeAmount: n })} /></Field>
            : <Field label="프라이즈 비율(%)"><NumInput v={d.prizePercent} on={(n) => set({ prizePercent: n })} /></Field>}
        </div>
        <Field label="블라인드 구조 (클락에 그대로 적용)">
          <BlindLevelsEditor levels={d.blindLevels ?? []} onChange={(lv) => set({ blindLevels: lv })} />
        </Field>
        <Field label="메모"><textarea value={d.memo ?? ''} onChange={(e) => set({ memo: e.target.value })} rows={2} placeholder="기타 메모" className="input w-full resize-none text-sm" /></Field>
        <label className="flex items-center gap-2 text-2xs text-ink-secondary">
          <input type="checkbox" checked={!!d.isCompetition} onChange={(e) => set({ isCompetition: e.target.checked })} /> 대회/이벤트로 분류
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setEditing(null)} className="btn-ghost flex-1 text-sm">취소</button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary flex-1 text-sm disabled:opacity-50">{busy ? '저장 중…' : '저장'}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-ink-muted">자주 여는 게임의 내용·듀레이션을 프리셋으로 저장해 두고 재사용하세요.</p>
        <button type="button" onClick={startNew} className="btn-primary shrink-0 px-3 py-1 text-2xs">+ 새 프리셋</button>
      </div>
      {presets === null ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
        : presets.length === 0 ? <p className="rounded-card border border-border-subtle bg-surface-low py-6 text-center text-2xs text-ink-muted">저장된 프리셋이 없습니다. ‘새 프리셋’으로 만들어 보세요.</p>
          : <ul className="space-y-1.5">{presets.map((p) => (
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface-low px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold text-ink-primary">📋 {p.name}</p>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => startEdit(p)} className="btn-ghost px-2 py-1 text-2xs">수정</button>
                  <button type="button" onClick={() => remove(p)} className="btn-ghost px-2 py-1 text-2xs text-danger">삭제</button>
                </div>
              </div>
              <p className="mt-0.5 truncate text-2xs text-ink-muted">{summary(p.data)}</p>
            </li>
          ))}</ul>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-0.5 block text-2xs font-semibold text-ink-secondary">{label}</span>{children}</label>;
}
function NumInput({ v, on }: { v?: number; on: (n: number) => void }) {
  return <input type="number" inputMode="numeric" value={v || ''} onChange={(e) => on(Number(e.target.value) || 0)} className="input w-full text-sm tabular-nums" />;
}
