// src/components/features/gto/useGtoCalculator.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GTO_SCENARIOS, DEFAULT_SCENARIO_ID } from './gto.data';
import {
  RANKS, FOLD_FREQUENCY,
  type Rank, type Suitedness, type ComboKind,
  type HandCombo, type HandComboId,
  type ActionFrequency, type GtoScenario,
} from './gto.types';

/** 랭크 강도 인덱스(0 = A 가장 강함 … 12 = 2). 정렬용 순수 함수 */
export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

/** 두 랭크 + 무늬 조합 → 표준 콤보(AKs/TT/72o). 입력 불완전 시 null */
export function canonicalizeHand(ranks: readonly Rank[], suitedness: Suitedness): HandCombo | null {
  if (ranks.length !== 2) return null;
  const [a, b] = ranks as [Rank, Rank];

  if (a === b) {
    return { id: `${a}${b}`, high: a, low: b, kind: 'pair', weight: 6 };
  }
  const [high, low] = rankIndex(a) < rankIndex(b) ? [a, b] : [b, a];
  const kind: ComboKind = suitedness === 'suited' ? 'suited' : 'offsuit';
  const suffix = suitedness === 'suited' ? 's' : 'o';
  return {
    id: `${high}${low}${suffix}`,
    high,
    low,
    kind,
    weight: suitedness === 'suited' ? 4 : 12,
  };
}

/** 콤보 ID(AKs/TT/72o) → 랭크 입력 상태로 역파싱. 잘못된 형식이면 null */
export function parseComboId(id: HandComboId): { ranks: Rank[]; suitedness: Suitedness } | null {
  const isRank = (ch: string): ch is Rank => (RANKS as readonly string[]).includes(ch);
  if (id.length === 2 && isRank(id[0]) && isRank(id[1])) {
    return { ranks: [id[0], id[1]], suitedness: 'offsuit' };
  }
  if (id.length === 3 && isRank(id[0]) && isRank(id[1])) {
    return { ranks: [id[0], id[1]], suitedness: id[2] === 's' ? 'suited' : 'offsuit' };
  }
  return null;
}

const RECENT_KEY = 'nh_gto_recent';
const RECENT_MAX = 8;
function loadRecent(): HandComboId[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as HandComboId[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function saveRecent(list: readonly HandComboId[]): void {
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

/** 빈도 합으로 정규화(데이터가 1로 안 맞아도 차트가 안정적이도록) */
export function normalizeFrequency(f: ActionFrequency): Required<ActionFrequency> {
  const allin = f.allin ?? 0;
  const total = f.raise + f.call + f.fold + allin;
  if (total <= 0) return { raise: 0, call: 0, fold: 1, allin: 0 };
  return { raise: f.raise / total, call: f.call / total, fold: f.fold / total, allin: allin / total };
}

export interface UseGtoCalculator {
  scenarios: readonly GtoScenario[];
  scenario: GtoScenario;
  selectScenario: (id: string) => void;

  ranks: readonly Rank[];
  suitedness: Suitedness;
  combo: HandCombo | null;
  comboId: HandComboId | null;
  isComplete: boolean;
  isPair: boolean;

  /** 원본 빈도(표에 없으면 100% 폴드), 미완성 입력이면 null */
  frequency: ActionFrequency | null;
  /** 차트용 정규화 빈도 */
  normalized: Required<ActionFrequency> | null;

  /** 최근 조회한 콤보(세션 저장, 최신순) */
  recent: readonly HandComboId[];
  /** 콤보 ID 로 입력 상태를 한 번에 설정(최근/즐겨찾기 재선택) */
  applyCombo: (id: HandComboId) => void;

  pushRank: (rank: Rank) => void;
  setSuitedness: (s: Suitedness) => void;
  removeLast: () => void;
  clear: () => void;
}

export function useGtoCalculator(initialScenarioId: string = DEFAULT_SCENARIO_ID): UseGtoCalculator {
  const scenarios = GTO_SCENARIOS;
  const [scenarioId, setScenarioId] = useState<string>(initialScenarioId);
  const [ranks, setRanks] = useState<readonly Rank[]>([]);
  const [suitedness, setSuitednessState] = useState<Suitedness>('suited');
  const [recent, setRecent] = useState<readonly HandComboId[]>(() => loadRecent());

  const scenario = useMemo<GtoScenario>(
    () => scenarios.find((s) => s.id === scenarioId) ?? scenarios[0],
    [scenarios, scenarioId],
  );

  const combo = useMemo(() => canonicalizeHand(ranks, suitedness), [ranks, suitedness]);
  const isPair = ranks.length === 2 && ranks[0] === ranks[1];

  // 완성된 콤보를 최근 목록 맨 앞에 기록(중복 제거, 최대 RECENT_MAX)
  useEffect(() => {
    if (!combo) return;
    setRecent((prev) => {
      if (prev[0] === combo.id) return prev;
      const next = [combo.id, ...prev.filter((x) => x !== combo.id)].slice(0, RECENT_MAX);
      saveRecent(next);
      return next;
    });
  }, [combo]);

  const frequency = useMemo<ActionFrequency | null>(() => {
    if (!combo) return null;
    return scenario.strategy[combo.id] ?? FOLD_FREQUENCY;
  }, [combo, scenario]);

  const normalized = useMemo(
    () => (frequency ? normalizeFrequency(frequency) : null),
    [frequency],
  );

  // 랭크가 이미 2개면 새 입력으로 리셋(키패드 UX). 그 외엔 누적.
  const pushRank = useCallback((rank: Rank) => {
    setRanks((prev) => (prev.length >= 2 ? [rank] : [...prev, rank]));
  }, []);
  const removeLast = useCallback(() => setRanks((prev) => prev.slice(0, -1)), []);
  const clear = useCallback(() => setRanks([]), []);
  const setSuitedness = useCallback((s: Suitedness) => setSuitednessState(s), []);
  const applyCombo = useCallback((id: HandComboId) => {
    const parsed = parseComboId(id);
    if (!parsed) return;
    setRanks(parsed.ranks);
    setSuitednessState(parsed.suitedness);
  }, []);
  const selectScenario = useCallback((id: string) => {
    setScenarioId(id);
    setRanks([]); // 시나리오 변경 시 입력 초기화
  }, []);

  return {
    scenarios,
    scenario,
    selectScenario,
    ranks,
    suitedness,
    combo,
    comboId: combo?.id ?? null,
    isComplete: combo !== null,
    isPair,
    frequency,
    normalized,
    recent,
    applyCombo,
    pushRank,
    setSuitedness,
    removeLast,
    clear,
  };
}
