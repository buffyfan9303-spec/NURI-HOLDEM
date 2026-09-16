// src/api/discountIndex.ts — "이 게임의 지금 레벨에 맞는 할인 자리번호" **정본 하나**.
//
// 🔴 왜 이 파일이 생겼나 (2026-09-17)
//   바인 승인은 세 경로로 들어온다: ① 장부 화면 ② 대시보드 QR 위젯 ③ 서버 RPC.
//   ①만 `autoDiscountIndex(session.discounts, currentLevelNo(clock))` 를 계산해 넘기고 있었고,
//   ②는 9번째 인자를 아예 안 넘겨 기본값 0(=할인 없음)으로 들어갔다. 서버는 받은 값을 그대로 믿는다.
//   결과: **같은 손님이 같은 레벨에 들어와도 창구에 따라 매출이 갈렸다.**
//   1레벨 5만 할인 프리셋이 있으면 대시보드 승인은 +5만원 과대 기록이고,
//   `discount_index = 0` 이라 `discountSummary` 가 그 바인을 못 세며
//   `buyinFinance` 의 disc=0 때문에 **엔트리가 0.5 대신 1.0** 으로 잡힌다.
//
// 🔴 왜 서버로 안 옮겼나
//   "서버가 p_discount_index 를 자동 산정하게 하면 세 경로가 한 곳으로 모인다" 가 더 근본적으로 보이지만,
//   그러려면 **클락의 현재 레벨 계산을 SQL 에 다시 구현**해야 한다(endsAt·remainingMs·currentIndex·
//   일시정지 보정). 그것이야말로 이 감사가 잡아낸 "같은 계산이 두 벌" 문제를 서버에 새로 만드는 일이다.
//   그래서 계산은 클라이언트에 **한 벌로** 두고, 두 호출부가 이 함수를 공유한다.
//   서버는 대신 받은 값이 만들 수 있는 사고(세션 없음·분납 합계 불일치)를 막는다(20260917e).
//
// ⚠ 이 파일이 ledger.ts 가 아니라 별도인 이유: `clock.ts` 가 `ledger.ts` 를 import 한다(earlyTypeOf·ledgerCounts).
//   ledger.ts 에서 clock.ts 를 부르면 **런타임 순환**이 된다. 둘 다 부르는 쪽은 위에 있어야 한다.
import { getLedgerSession, autoDiscountIndex } from './ledger';
import { getClockState, currentLevelNo } from './clock';

/** (매장, 날짜, 게임) 의 지금 레벨에 자동 적용될 할인 자리번호. 해당 없으면 0(정가).
 *
 *  클락이 **다른 날짜**의 것이면 레벨을 0으로 본다 — 어제 켜 둔 클락의 레벨로 오늘 할인을 주면 안 된다.
 *  조회가 실패하면 예외가 그대로 올라간다(0으로 접으면 '할인 없음'이 조용히 정가로 굳는다). */
export async function resolveDiscountIndex(venueId: string, date: string, gameSeq: number): Promise<number> {
  const [session, clock] = await Promise.all([
    getLedgerSession(venueId, date, gameSeq),
    getClockState(venueId, gameSeq),
  ]);
  const levelNo = clock && clock.sessionDate === date ? currentLevelNo(clock) : 0;
  return autoDiscountIndex(session.discounts, levelNo);
}
