// 🔴 2026-09-20 오너 결정 — '회수 이용권'은 **건수가 아니라 T 합계**다.
//
// 오너 원문: "티켓 바인 건수면 티켓으로 바이인한 횟수인데 예를들어 10만원짜리 3건이면 30T 잖아. T로 표기해."
//
// 이력(이 자리는 두 번 뒤집혔다 — 다음 사람이 또 뒤집기 전에 읽어라):
//   · 2026-09-05 감사: `ticketPaid`(T 단위)를 그대로 더하면 '발행 2장 / 회수 20장' 처럼 척도가 갈린다며
//     `ticketPaid > 0 ? 1 : 0` 으로 **건수**를 세게 바꿨다.
//   · 2026-09-11 / 09-18: 라벨을 '장' → 'T' 로 통일했다. 값은 여전히 건수였다 — **라벨과 값이 갈렸다.**
//     그래서 20T 짜리 바인 1건이 화면에 `1T` 로 나왔다.
//   · 2026-09-20(지금): 오너가 값을 T 합계로 정했다. 라벨 T 는 그대로.
//
// ⚠ '오늘 회수'(fin.ticket)와 '7일 회수'(weekTicket)는 **같은 화면에 나란히** 있다. 한쪽만 바꾸면
//   2026-09-18 에 고쳤던 '같은 라벨 다른 척도' 버그가 그대로 되돌아온다 — 이 검사가 둘을 함께 잠근다.
// ⚠ '발행'은 `ledger_sessions.voucher_issued`(업주가 손으로 적는 장수)라 **다른 종류의 수**다.
//   이번에 건드리지 않았고, 캡션이 그 차이를 말해야 한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(process.cwd(), 'src/components/features/StoreDashboard.tsx'), 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('회수 이용권 = 티켓으로 낸 바인 금액(T) 합계', () => {
  it("'오늘 회수'(fin.ticket)가 ticketPaid 를 **합산**한다 — 건수가 아니다", () => {
    expect(src, '회수가 다시 건수 세기로 돌아갔다 — 라벨은 T 인데 값이 건수가 된다')
      .not.toMatch(/a\.ticket\s*\+=\s*f\.ticketPaid\s*>\s*0/);
    expect(src, 'fin.ticket 이 ticketPaid 합산이 아니다').toMatch(/a\.ticket\s*\+=\s*f\.ticketPaid\s*;/);
  });

  it("'7일 회수'(weekTicket)도 같은 척도다 — 한쪽만 바꾸면 화면에서 두 수가 갈린다", () => {
    expect(src, '7일 회수가 건수 세기로 남아 있다 — 오늘 회수(T)와 척도가 갈린다')
      .not.toMatch(/weekTicket\s*\+=\s*buyinFinance\([^)]*\)\.ticketPaid\s*>\s*0/);
    expect(src, '7일 회수가 ticketPaid 합산이 아니다')
      .toMatch(/weekTicket\s*\+=\s*buyinFinance\([^)]*\)\.ticketPaid\s*;/);
  });

  it('캡션이 발행·회수가 서로 다른 종류의 수라고 말한다', () => {
    // '회수 = 티켓 바인 건수' 라는 옛 설명이 남아 있으면 화면이 거짓말을 한다.
    expect(src, "캡션이 아직 '건수' 라고 말한다").not.toMatch(/회수\s*=\s*티켓 바인 건수/);
    expect(src, '캡션이 회수의 단위를 말하지 않는다').toMatch(/회수\s*=\s*티켓으로 낸 바인 금액\(T\)/);
  });

  it('두 값이 같은 표현으로 계산된다 — 나중에 한쪽만 고치는 것을 막는다', () => {
    const today = /a\.ticket\s*\+=\s*f\.ticketPaid\s*;/.test(src);
    const week = /weekTicket\s*\+=\s*buyinFinance\([^)]*\)\.ticketPaid\s*;/.test(src);
    expect(today && week, `오늘 회수=${today} · 7일 회수=${week} — 둘 다 T 합계여야 한다`).toBe(true);
  });
});
