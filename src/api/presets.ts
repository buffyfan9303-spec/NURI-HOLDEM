// src/api/presets.ts — 게임 프리셋(포스터/장부 게임 내용 + 듀레이션 템플릿)
import { supabase, IS_MOCK } from '../lib/supabase';
import type { ClockLevel } from './clock';

// ── PL2a: 단계 전용 네임스페이스 3개 ───────────────────────────────────────────
// 공용 필드(title·buyInWon·스택3종·blindLevels·rankingPrizes)는 GamePresetData 최상위 유지,
// 한 단계에서만 쓰는 값은 아래 네임스페이스에 담는다. 비어 있는 네임스페이스는 그 폼을 건드리지
// 않는다(부분 프리셋 허용 — 어댑터 applyTo* 가 '있는 것만' 패치를 만든다).
// ⚠ 금액 신규 필드는 전부 원(KRW) 정규형 + 이름에 단위(…Won) 명시. 표시 환산은 어댑터에서만.

/** 포스터 전용(9) — 날짜는 이벤트별이라 제외, 시각(HH:MM)은 반복 게임 특성상 포함 */
export interface PresetPosterData {
  startTime?: string;        // 시작 시각 'HH:MM'
  regCloseTime?: string;     // 레지마감 원문('NLV HH:MM')
  region?: string;           // 지역
  grade?: 'daily' | 'satellite' | 'series' | null; // 대회 등급
  paymentMethods?: string[]; // 결제 수단
  partners?: string[];       // 파트너/시드권
  prizes?: string[];         // 시드권/좌석 상품 라벨(포스터 prizes 필드)
  events?: { badge?: string; title: string }[]; // 이벤트/프로모션
  posterUrl?: string;        // 포스터 이미지(재사용)
}

/** 장부 전용(7) — voucherAccrualPerBin 은 전 매장 설정 오염 위험이라 제외(§18.4·카드 명시) */
export interface PresetLedgerData {
  cardAmountWon?: number | null; // 카드단가(원 · null=현금단가 적용)
  targetEntries?: number;    // 기준 엔트리(GTD)
  maxEntries?: number;       // 맥스 엔트리(엔트리 게임)
  discounts?: { label: string; amountWon: number }[]; // 할인 프리셋(원)
  dealers?: string;          // 딜러 명단(줄바꿈 구분)
  eventMemo?: string;        // 이벤트 비고
  tournamentStartTime?: string; // 토너먼트 스타트 시각 'HH:MM'(날짜는 세션에서)
}

/** 클락 전용(8) — 칩 단위(earlyBonus 등)는 금액이 아니므로 Won 미표기 */
export interface PresetClockData {
  regCloseLevel?: number;    // 등록 마감 레벨
  maxLevel?: number;         // 최대 레벨(자동 생성 기준)
  earlyBonus?: number;       // 1얼리 보너스 칩
  doubleEarlyBonus?: number; // 더블얼리 보너스 칩
  earlyDoubleLevel?: number; // ~레벨 N까지 = 더블얼리
  earlySingleLevel?: number; // ~레벨 M까지 = 1얼리
  mysteryBountyWon?: number; // 미스터리 바운티(원 · 표시용)
  isAddon?: boolean;         // 애드온 게임 여부
}

/** 프리셋에 담기는 게임 내용 — 포스터/장부에 적는 항목들 + 듀레이션. 날짜·시간은 제외(이벤트별). */
export interface GamePresetData {
  title?: string;            // 게임 제목
  gameType?: string;         // 게임 종류(프리즈아웃·바운티·애드온 등)
  /** @deprecated 구형(원 단위지만 이름에 단위 없음) — 읽기는 presetBuyInWon 폴백 경유. 쓰기는 buyInWon 과 병기. */
  buyIn?: number;            // 바이인(원 · 구형)
  buyInWon?: number;         // 바이인(원 · PL2a 정규형 — 단위를 이름에 고정)
  startStack?: number;       // 스타팅 스택(칩)
  rebuyStack?: number;       // 리바인 스택(칩)
  addonStack?: number;       // 애드온 스택(칩)
  addonCost?: number;        // 애드온 비용(원)
  prizeType?: 'GTD' | 'ENTRY';
  /** @deprecated 구형(만원) — 읽기는 반드시 lib/units.presetPrizeWon 폴백 경유. 쓰기는 prizeAmountWon 만. */
  prizeAmount?: number;      // GTD 보장 상금(만원 · 구형)
  prizeAmountWon?: number;   // GTD 보장 상금(원 · PL0 정규형)
  prizePercent?: number;     // ENTRY 프라이즈 비율(%)
  duration?: string;         // 듀레이션(블라인드 레벨 시간 등 — 자유 입력)
  blinds?: string;           // 블라인드 구조(텍스트 · 구버전 호환)
  blindLevels?: ClockLevel[]; // 블라인드 구조(구조화 — 클락/포스터 structure.levels 로 적용)
  isCompetition?: boolean;   // 대회/이벤트 분류
  /** 순위별 상금 — amountWon(원·PL0 정규형)이 있으면 우선, 구형 amount+unit 은 lib/units.rankingPrizeWon 폴백 */
  rankingPrizes?: { rank: string; amount: number; unit: string; amountWon?: number }[];
  memo?: string;             // 메모
  // PL2a 네임스페이스 — 기존(네임스페이스 없는) 프리셋은 세 필드가 모두 undefined 로 그대로 열린다.
  poster?: PresetPosterData;
  ledger?: PresetLedgerData;
  clock?: PresetClockData;
}

/** 바이인 읽기(원) — 신형 buyInWon 우선, 구형 buyIn(원) 폴백. 라이브 프리셋 무마이그레이션 통과 경로. */
export function presetBuyInWon(d: Pick<GamePresetData, 'buyInWon' | 'buyIn'>): number {
  return d.buyInWon ?? d.buyIn ?? 0;
}

/** 네임스페이스 채움 개수 — PresetPicker/관리 화면의 '채워진 항목 n개' 배지용 */
export function presetFilledCount(ns: object | undefined): number {
  if (!ns) return 0;
  return Object.values(ns).filter((v) => {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return v !== 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
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
