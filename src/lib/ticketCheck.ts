// src/lib/ticketCheck.ts — 장부 티켓 대조(오너 2026-10-04 F4-02).
//
// 오너: "직원들이 그걸 제대로 확인해서 티켓을 보냈는지 확인할 수 있게 … 금일 티켓 바이인 수와 실제 들어온 티켓의 부족 수까지
//        정산내역에 나와야 해. 직원들이 마지막에 레지 마감하고 체크를 해야하기 때문에 장부권한을 가진 직원들도 확인할 수 있게."
// 장부의 '티켓 완납'과 손님 이용권 차감은 **연결하지 않는다**(손님이 먼저 보낼 수도 있어 현행 유지 — 같은 원문).
// 대신 그날 장부에 적힌 티켓과 실제로 들어온 이용권을 나란히 놓는다.
//
// 세 수(전부 **장** 단위 — 1장 = 1T. 금액이 아니다):
//   · 장부 티켓   = 그날 장부에 '이용권으로 받았다'고 적힌 장수. 바인(ticketPaid) + 애드온(ticketT) = ticketUsedT(정본).
//                   가불(미수) 티켓은 아직 안 받은 것이라 넣지 않는다(buyinFinance 가 ticketUnpaid 로 따로 센다).
//   · 들어온 이용권 = 그날 영업일로 이 매장에서 실제로 사용(손님 지갑에서 차감)된 매장이용권 장수 —
//                   api/ledger.getVoucherUsesForDate(요청 1행 = 1장, 거절·되돌림 제외, 승인 대기 포함).
//   · 부족        = max(0, 장부 티켓 − 들어온 이용권). 반대(들어왔는데 장부에 없음)는 '장부 미기록'(extraT)으로 따로 보인다.
// '티켓 바인 N회'는 티켓을 낸 **바인 행 수**(바이인 횟수 축)다 — 장수와 다르다(10만 게임 티켓 완납 1회 = 10장).
//   세 수의 축 구분은 ledgerGolden(바이인 횟수·엔트리·얼리)과 같은 원칙이다. 엔트리(금액 기준)와도 섞지 않는다.
//
// 손님별 행은 이름으로 맞춘다 — 장부 이름이 '실명(닉네임)' 이면 괄호 안 닉네임도 같은 사람으로 본다(이용권 요청은 닉네임으로 온다).
//   ponytail: 이름 대조라 장부에 다른 이름으로 적힌 손님은 '부족'과 '장부 미기록'에 따로 뜬다. 합계(위 세 수)는 이름과 무관하다.
import { addonFinance, buyinFinance, ticketUsedT, type LedgerBuyin, type LedgerSession } from '../api/ledger';

export interface TicketCheckRow { name: string; ledgerT: number; receivedT: number; shortT: number }
export interface TicketCheck {
  /** 티켓을 낸 바인 행 수(회) */
  ticketBuyins: number;
  /** 장부 티켓(장) */
  ledgerT: number;
  /** 들어온 이용권(장) */
  receivedT: number;
  /** 부족(장) = max(0, ledgerT − receivedT) */
  shortT: number;
  /** 장부 미기록(장) = max(0, receivedT − ledgerT) */
  extraT: number;
  /** 손님별(장부 티켓 또는 들어온 이용권이 있는 손님만) — 부족 큰 순 */
  rows: TicketCheckRow[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const innerNick = (name: string) => /\(([^()]+)\)\s*$/.exec(name)?.[1].trim() ?? '';

export function ticketCheck(sessions: LedgerSession[], buyins: LedgerBuyin[], uses: { playerName: string }[]): TicketCheck {
  const by = new Map<string, TicketCheckRow>();
  const nickToName = new Map<string, string>();
  const row = (name: string) => {
    let r = by.get(name);
    if (!r) { r = { name, ledgerT: 0, receivedT: 0, shortT: 0 }; by.set(name, r); }
    return r;
  };
  let ticketBuyins = 0, ledgerT = 0;
  for (const b of buyins) {
    const s = sessions.find((x) => x.sessionDate === b.sessionDate && x.gameSeq === b.gameSeq);
    if (!s) continue;   // 세션 없는 행은 단가를 몰라 장수를 못 센다(settlementReport 와 같은 처리)
    const f = buyinFinance(b, s);
    const t = ticketUsedT(f, addonFinance(b));
    if (f.ticketPaid > 0) ticketBuyins++;
    if (t <= 0) continue;
    const name = b.playerName.trim();
    ledgerT += t;
    row(name).ledgerT += t;
    const nick = innerNick(name);
    if (nick) nickToName.set(nick, name);
  }
  for (const u of uses) {
    const n = u.playerName.trim();
    row(by.has(n) ? n : nickToName.get(n) ?? n).receivedT += 1;
  }
  const rows = [...by.values()].map((r) => ({ ...r, ledgerT: round1(r.ledgerT), shortT: round1(Math.max(0, r.ledgerT - r.receivedT)) }))
    .sort((a, b) => b.shortT - a.shortT || a.name.localeCompare(b.name));
  const receivedT = uses.length;
  return {
    ticketBuyins, ledgerT: round1(ledgerT), receivedT,
    shortT: round1(Math.max(0, ledgerT - receivedT)), extraT: round1(Math.max(0, receivedT - ledgerT)), rows,
  };
}
