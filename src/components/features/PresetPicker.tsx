// src/components/features/PresetPicker.tsx
// PL2c — 게임 프리셋 '불러오기' 공용 컴포넌트. 포스터/장부/클락 4곳에 제각각이던 불러오기 UI
// (select 2종·접이식 리스트·검색 리스트)를 이 하나로 통일한다.
// 부분 프리셋은 숨기거나 막지 않는다 — 무엇이 채워져 있는지 요약을 보여주고 '있는 것만' 적용은
// 어댑터(lib/gameInherit.applyTo*)가 보장한다(§13-B). 적용 자체는 소비처의 onApply 몫.
import { useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import { countLevels } from '../../api/clock';
import {
  listGamePresets, presetBuyInWon, presetFilledCount,
  type GamePreset, type GamePresetData,
} from '../../api/presets';
import { presetPrizeWon } from '../../lib/units';

export type PresetScope = 'poster' | 'ledger' | 'clock';

const SCOPE_LABEL: Record<PresetScope, string> = { poster: '포스터', ledger: '장부', clock: '클락' };

/** scope 폼에 실제로 채워질 항목 수 — 공용 필드 + 그 단계 네임스페이스 */
function scopeFilled(d: GamePresetData, scope: PresetScope): number {
  const common = [
    d.title, d.gameType, presetBuyInWon(d) || undefined, d.startStack || undefined,
    d.rebuyStack || undefined, d.addonStack || undefined,
    d.blindLevels?.length ? d.blindLevels : undefined,
    d.rankingPrizes?.length ? d.rankingPrizes : undefined,
    presetPrizeWon(d) || undefined,
  ].filter((v) => v != null && v !== '').length;
  return common + presetFilledCount(d[scope]);
}

/** 한 줄 요약 — 바인(만원 표시)·블라인드 레벨 수·해당 단계 전용 항목 수 */
function rowSummary(d: GamePresetData, scope: PresetScope): string {
  const parts: string[] = [];
  const buy = presetBuyInWon(d);
  if (buy) parts.push(`바인 ${(buy / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}만`);
  if (d.blindLevels?.length) parts.push(`${countLevels(d.blindLevels)}레벨`);
  else if (scope === 'clock') parts.push('블라인드 없음');
  const nsCnt = presetFilledCount(d[scope]);
  if (nsCnt) parts.push(`${SCOPE_LABEL[scope]} 전용 ${nsCnt}`);
  return parts.join(' · ') || '내용 없음';
}

export default function PresetPicker({ venueId, scope, onApply, note }: {
  venueId: string;
  scope: PresetScope;
  /** 선택된 프리셋을 이 단계 폼에 적용(어댑터 경유·토스트는 소비처에서) */
  onApply: (p: GamePreset) => void;
  /** 버튼 아래 보조 설명(생략 시 기본 문구) */
  note?: string;
}) {
  const [presets, setPresets] = useState<GamePreset[] | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { listGamePresets(venueId).then(setPresets).catch(() => setPresets([])); }, [venueId]);

  // 프리셋 0개면 렌더하지 않음 — 기존 UI들(개수 조건부)과 동일한 노출 규칙
  if (!presets || presets.length === 0) return null;

  const filtered = presets.filter((p) => {
    const t = q.trim().toLowerCase();
    return !t || p.name.toLowerCase().includes(t);
  });

  return (
    <div data-testid={`preset-picker-${scope}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-input border border-accent-400/40 bg-accent-300/10 px-3 py-2.5 text-sm font-bold text-accent-300 transition-colors hover:bg-accent-300/15">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name="cards" size={15} className="shrink-0" />
          <span className="truncate">게임 프리셋 불러오기 ({presets.length})</span>
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} className="shrink-0" />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {presets.length > 5 && (
            <div className="relative">
              <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="프리셋 검색" className="input w-full py-1.5 pl-8 text-xs" />
            </div>
          )}
          <div className="max-h-[13rem] divide-y divide-border-subtle overflow-y-auto rounded-input border border-border-subtle bg-surface-base">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-2xs text-ink-muted">"{q.trim()}" 검색 결과가 없습니다.</p>
            ) : filtered.map((p) => (
              <button key={p.id} type="button" onClick={() => { onApply(p); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-high">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-primary">{p.name}</span>
                  <span className="block truncate text-2xs text-ink-muted">{rowSummary(p.data, scope)}</span>
                </span>
                <span className="shrink-0 rounded-badge border border-accent-400/40 bg-accent-300/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-accent-300">
                  채워진 {scopeFilled(p.data, scope)}
                </span>
              </button>
            ))}
          </div>
          <p className="text-2xs text-ink-muted">{note ?? `프리셋 1개로 ${SCOPE_LABEL[scope]} 폼이 채워집니다(수정 가능). 비어 있는 항목은 건드리지 않아요.`}</p>
        </div>
      )}
    </div>
  );
}
