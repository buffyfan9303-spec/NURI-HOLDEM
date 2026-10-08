// 아웃 카드 목록 머리 문장 — OutsFromCards 에서 꺼낸 순수 함수(테스트용).
//
// 🔴 2026-09-30 감사: 내 아웃 0장을 무조건 "드로잉 데드" 라 불렀다. 아웃은 "다음 한 장이 뜨면 리버까지 승률 50% 초과"
//   카드라, 0장이어도 턴+리버 두 장으로 역전하는 길(러너러너)이 남는다. 반례 2h3h vs AsAd / Kc7d8h — 아웃 0 · 승률 5.86%.
//   드로잉 데드는 **승률이 정확히 0** 일 때만이다(플랍·턴 승률은 전수계산이라 0 비교가 정확하다).
import type { Standing } from './equityEngine';

/** 내 아웃츠를 보일까(아니면 상대 아웃츠=위험 카드)? **지금 패의 우열**로 고른다 — 리버까지의 지분이 아니다(G2).
 *  동률은 '무엇이 뜨면 내가 이기나' 가 궁금한 자리라 내 쪽. 아웃츠 계산기·핸드 리플레이어가 같이 쓴다. */
export const showMyOuts = (standing: Standing | undefined): boolean => standing !== 'ahead';

export function outsHeadline(mine: boolean, outs: number, standing: Standing, heroEquity: number, next: 'turn' | 'river'): string {
  if (!mine) return outs === 0 ? '이미 앞서 있고, 다음 카드로는 뒤집히지 않습니다' : '이미 내가 앞서 있습니다. 이 카드가 뜨면 상대 승률이 50%를 넘습니다';
  if (outs > 0) return '이 카드가 뜨면 리버까지 승률이 50%를 넘습니다';
  if (standing === 'tied') return '비긴 상태이고, 다음 카드로 유리해지는 카드가 없습니다';
  if (heroEquity <= 0) return '역전 카드가 없습니다. 드로잉 데드입니다';
  return `다음 한 장으로 역전하는 카드는 없습니다 (${next === 'river' ? '리버까지' : '턴+리버 합쳐'} 승률 ${(heroEquity * 100).toFixed(1)}%)`;
}
