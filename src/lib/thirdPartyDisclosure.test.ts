// [DS] LEGAL-4 — '매장에 실명이 간다'는 사실과 고지·처리방침을 서로 묶는다.
//
// 왜 필요한가
//   예약하면 매장 운영자 화면에 회원의 **이름(실명)** 이 뜬다(RPC schedule_reservations_for_owner
//   → OwnerReservation.realName). 매장은 자기 사업을 위해 그 정보를 쓰므로 수탁자가 아니라 별도의
//   개인정보처리자로 보는 것이 안전하고, 그렇다면 이 전달은 **제3자 제공**이다.
//   개인정보보호법 §17① 은 제3자 제공에 원칙적으로 동의를 요구하며, §17①2 가 열거하는 예외에
//   §15①4(계약의 이행)는 **포함되지 않는다** — "예약 계약을 이행하려면 필요하다"만으로는 안 된다.
//
//   그래서 잠가야 할 불변식은 하나다: **실명이 매장으로 가는 코드가 살아 있는 한, 예약 화면의 고지와
//   처리방침 제9조의 제공 항목에 실명이 반드시 함께 있어야 한다.** 셋 중 하나만 조용히 바뀌면
//   (예: 리디자인으로 고지 문구가 사라지면) 그 순간 동의 없는 제3자 제공이 된다.
//   반대로 실명 전달 자체를 없앤다면 이 테스트는 고지를 강제하지 않는다 — 그 편이 더 나은 해법이라서다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');

const RESERVATIONS = read('src/api/reservations.ts');
const RESERVE_UI = read('src/components/features/ScheduleDetailModal.tsx');
const PRIVACY = read('src/pages/legal/PrivacyPolicy.tsx');

/** 매장 운영자에게 실명이 반환되는가 — 이 한 줄이 아래 고지 의무의 발동 조건이다. */
const ownerGetsRealName = /interface OwnerReservation[\s\S]*?realName/.test(RESERVATIONS);

describe('예약 시 매장 제공 고지 (LEGAL-4)', () => {
  it('실명이 매장으로 가면 예약 화면이 그 사실을 구체적으로 고지한다', () => {
    if (!ownerGetsRealName) return; // 실명을 안 넘기면 고지 의무도 없다
    expect(RESERVE_UI, '예약 화면에 실명 전달 고지가 없다. 동의 없는 제3자 제공')
      .toContain('이름(실명)과 닉네임');
    // 무엇을·누구에게·왜·언제까지가 모두 보여야 고지다. 하나라도 빠지면 '알렸다'고 할 수 없다.
    for (const k of ['전달 항목', '받는 곳', '이용 목적', '보유 기간']) {
      expect(RESERVE_UI, `예약 고지에 '${k}'가 없다`).toContain(k);
    }
  });

  it('처리방침 제9조의 제공 항목이 실제 제공 내용과 일치한다', () => {
    const article9 = PRIVACY.slice(PRIVACY.indexOf('개인정보의 제3자 제공'));
    if (ownerGetsRealName) {
      expect(article9, '제9조 제공 항목에 실명이 빠졌다. 과소 고지').toContain('이름(실명)');
    }
    // 과다 고지도 위법 소지다(전자상거래법 §21①1). 매장에 넘기지 않는 항목을 넘긴다고 적지 않는다.
    const sendsPhone = /interface OwnerReservation[\s\S]*?\bphone\b/.test(RESERVATIONS);
    expect(sendsPhone, '예약 응답에 전화번호가 생겼다. 고지 문안을 함께 고쳐야 한다').toBe(false);
    expect(article9, '전화번호를 제공하지 않는다는 명시가 사라졌다')
      .toContain('휴대전화번호를 매장에 제공하지 않습니다');
  });
});
