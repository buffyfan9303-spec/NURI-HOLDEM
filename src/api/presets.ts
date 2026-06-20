// src/api/presets.ts — 게임 프리셋(포스터/장부 게임 내용 + 듀레이션 템플릿)
import { supabase, IS_MOCK } from '../lib/supabase';

/** 프리셋에 담기는 게임 내용 — 포스터/장부에 적는 항목들 + 듀레이션. 날짜·시간은 제외(이벤트별). */
export interface GamePresetData {
  title?: string;            // 게임 제목
  gameType?: string;         // 게임 종류(프리즈아웃·바운티·애드온 등)
  buyIn?: number;            // 바이인(원)
  startStack?: number;       // 스타팅 스택(칩)
  rebuyStack?: number;       // 리바인 스택(칩)
  addonStack?: number;       // 애드온 스택(칩)
  addonCost?: number;        // 애드온 비용(원)
  prizeType?: 'GTD' | 'ENTRY';
  prizeAmount?: number;      // GTD 보장 상금(만원)
  prizePercent?: number;     // ENTRY 프라이즈 비율(%)
  duration?: string;         // 듀레이션(블라인드 레벨 시간 등 — 자유 입력)
  blinds?: string;           // 블라인드 구조(텍스트)
  isCompetition?: boolean;   // 대회/이벤트 분류
  rankingPrizes?: { rank: string; amount: number; unit: string }[]; // 순위별 상금
  memo?: string;             // 메모
}

export interface GamePreset { id: string; venueId: string; name: string; data: GamePresetData; updatedAt: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPreset(r: any): GamePreset {
  return { id: r.id, venueId: r.venue_id, name: r.name, data: (r.data ?? {}) as GamePresetData, updatedAt: r.updated_at };
}

export async function listGamePresets(venueId: string): Promise<GamePreset[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('game_presets')
    .select('*').eq('venue_id', venueId).order('updated_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(rowToPreset);
}

/** 프리셋 저장(id 있으면 수정, 없으면 생성). 반환: 프리셋 id */
export async function saveGamePreset(venueId: string, name: string, data: GamePresetData, id?: string): Promise<string> {
  if (IS_MOCK) throw new Error('Mock');
  const row = { venue_id: venueId, name: name.trim() || '무제 프리셋', data: data as unknown as object, updated_at: new Date().toISOString() };
  if (id) {
    const { error } = await supabase.from('game_presets').update(row).eq('id', id);
    if (error) throw new Error(error.message);
    return id;
  }
  const { data: ins, error } = await supabase.from('game_presets').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return ins.id as string;
}

export async function deleteGamePreset(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('game_presets').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
