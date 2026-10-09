// 장부 새 게임 폼 — 늦게 도착한 '직전 게임 설정'을 빈 칸에만 채운다 (store-link-1002 F-1, 2026-10-02).
//
// 왜: SessionForm 은 base 를 첫 렌더의 useState 초기값으로만 읽는다. 직전 설정(prefill)은 폼이 그려진 **뒤에** 도착해서
//   '직전 게임 설정을 불러왔습니다' 문구만 뜨고 칸은 비어 있었다(e2e 실측: 문구 보임 · 게임명 '').
//   폼을 다시 마운트하면 업주가 그 사이 친 값이 사라진다 — 그래서 **빈 칸만** 채운다. 이미 친 칸(포스터 자동 연동 포함)은 그대로다.
import type { DiscountPreset, LedgerSession } from '../api/ledger';

export interface PrefillFields {
  title: string; cash: number; card: number; target: number; dealers: string; event: string; discs: DiscountPreset[];
}

/** 지금 폼 값 중 비어 있는 칸만, prefill 이 값을 가진 경우에 한해 채울 값을 돌려준다(없으면 빈 객체).
 *  posterLinked — 포스터가 연결된 폼이면 할인은 채우지 않는다: 포스터 할인이 정본이고(할인 없는 포스터면 빈 칸이 맞다),
 *  직전 게임은 **다른 포스터**의 레벨 자동 할인일 수 있어 오늘 바인 금액·엔트리를 틀리게 만든다(PIPE-F2). */
export function fillEmptyFromPrefill(cur: PrefillFields, p: Partial<LedgerSession>, posterLinked = false): Partial<PrefillFields> {
  const out: Partial<PrefillFields> = {};
  if (!cur.title.trim() && p.title?.trim()) out.title = p.title;
  if (!cur.cash && p.buyinAmount) out.cash = p.buyinAmount;
  if (!cur.card && p.cardAmount) out.card = p.cardAmount;
  if (!cur.target && p.targetEntries) out.target = p.targetEntries;
  if (!cur.dealers.trim() && p.dealers?.trim()) out.dealers = p.dealers;
  if (!cur.event.trim() && p.eventMemo?.trim()) out.event = p.eventMemo;
  if (!posterLinked && cur.discs.length === 0 && p.discounts?.length) out.discs = p.discounts;
  return out;
}
