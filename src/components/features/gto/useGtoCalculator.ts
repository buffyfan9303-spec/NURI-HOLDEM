// src/components/features/gto/useGtoCalculator.ts
//
// ⚠ 이름과 달리 **더 이상 훅이 아니다**(2026-09-18). `useGtoCalculator()` 와 그 데이터
// `gto.data.ts`(GTO_SCENARIOS)를 지웠다 — 호출부가 전수 grep 로 0곳이었고, 그 표는 BTN RFI 에서
// A9s·K8s·J9s 를 100% 폴드로 적어 두어 **화면에 연결되는 순간 그대로 오조언**이 되는 물건이었다
// (죽은 데이터를 지운 GtoDeepSituation 전례와 같은 이유 — useDeepGto.ts 머리말 참고).
//
// 남은 것은 콤보 표기 순수 함수들이고, 이건 살아 있다:
//   canonicalizeHand  ← src/lib/spot.ts · GtoDeepPanel.tsx · useDeepGto.ts
//   normalizeFrequency ← useDeepGto.ts
// 그래서 **파일째 지우지 않았다.** 파일명 정리는 `src/lib/spot.ts` 를 포함한 3곳의 import 를
// 건드려야 해서 그 파일 소유자와 함께 할 일로 남긴다.
import {
  RANKS,
  type Rank, type Suitedness, type ComboKind,
  type HandCombo, type HandComboId,
  type ActionFrequency,
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

/** 빈도 합으로 정규화(데이터가 1로 안 맞아도 차트가 안정적이도록) */
export function normalizeFrequency(f: ActionFrequency): Required<ActionFrequency> {
  const allin = f.allin ?? 0;
  const total = f.raise + f.call + f.fold + allin;
  if (total <= 0) return { raise: 0, call: 0, fold: 1, allin: 0 };
  return { raise: f.raise / total, call: f.call / total, fold: f.fold / total, allin: allin / total };
}
