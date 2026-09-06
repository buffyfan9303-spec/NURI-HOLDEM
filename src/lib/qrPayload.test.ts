// QR 분류 계약 — **인쇄되는 문자열**과 **읽는 쪽**이 어긋나면 손님이 엉뚱한 동작을 하거나
// 아무 일도 안 일어난다. 두 쪽이 각각 옳아 보여도 서로 안 맞을 수 있어서, 여기서는
// 발행 함수가 만든 문자열을 그대로 파서에 넣어 **왕복**으로 못박는다.
//
// 매장이 인쇄해 비치하는 QR 은 네 종류다(VoucherManageModal 의 QR_DEFS):
//   ① 매장이용권 사용 `NURIV-VENUE:<venueId>`  ② 출석 `?checkin=`
//   ③ 회원가입 `?signup=1`                      ④ 바인 요청 `?buyin=[&game=N]`
// 스캐너(QrScanModal)는 이 중 ②④ 만 받는다 — ①③ 을 '받아 버리는' 회귀가 이 파일의 주 감시 대상이다.
import { describe, it, expect } from 'vitest';
import { parseQr, ACTIONABLE } from './qrPayload';

const VENUE = '11111111-2222-3333-4444-555555555555';
const ORIGIN = 'https://nuriholdem.com';

// 발행 쪽 규칙을 그대로 옮겨 적는다(api/checkins.ts checkinUrl · api/ledger.ts buyinRequestUrl).
// 그 두 함수는 window.location.origin 을 읽어 테스트에서 직접 부르기 어렵지만, **형식**이 계약이다.
const checkinUrl = (v: string) => `${ORIGIN}/?checkin=${v}`;
const buyinUrl = (v: string, g?: number) => `${ORIGIN}/?buyin=${v}${g ? `&game=${g}` : ''}`;

describe('QR 분류 — 인쇄된 문자열 → 스캐너', () => {
  it('출석 QR 은 checkin 으로 읽힌다', () => {
    expect(parseQr(checkinUrl(VENUE))).toEqual({ kind: 'checkin', venueId: VENUE, gameSeq: null });
  });

  it('바인 요청 QR(게임 미지정)은 buyin · gameSeq=null', () => {
    expect(parseQr(buyinUrl(VENUE))).toEqual({ kind: 'buyin', venueId: VENUE, gameSeq: null });
  });

  it('테이블별 바인 QR 은 그 게임 번호를 그대로 전달한다 — 메인 1 · 사이드1 2 · 사이드2 3', () => {
    expect(parseQr(buyinUrl(VENUE, 1))?.gameSeq).toBe(1);
    expect(parseQr(buyinUrl(VENUE, 2))?.gameSeq).toBe(2);
    expect(parseQr(buyinUrl(VENUE, 3))?.gameSeq).toBe(3);
  });

  it('⚠ 매장이용권 QR 은 알아보되 **실행하지 않는다** — 이용권 사용은 지갑의 별도 스캐너 담당', () => {
    // 여기가 뚫리면 이용권 QR 을 비춘 손님에게 출석이 찍힌다. 반대로 아예 못 알아보면
    // '매장 QR이 아니에요' 라는 거짓 안내로 끝나 손님이 막다른 길에 선다 — 그래서 종류는 알되 실행은 막는다.
    const hit = parseQr(`NURIV-VENUE:${VENUE}`);
    expect(hit).toEqual({ kind: 'voucher', venueId: VENUE, gameSeq: null });
    expect(ACTIONABLE).not.toContain('voucher');
  });

  it('⚠ 회원가입 QR 도 알아보되 실행하지 않는다', () => {
    expect(parseQr(`${ORIGIN}/?signup=1`)?.kind).toBe('signup');
    expect(ACTIONABLE).not.toContain('signup');
  });

  it('실행 대상은 출석·바인 둘뿐이다 — 목록이 늘면 이 테스트가 먼저 깨진다', () => {
    expect([...ACTIONABLE].sort()).toEqual(['buyin', 'checkin']);
  });

  it('접두어만 있고 매장이 없는 이용권 QR 은 null', () => {
    expect(parseQr('NURIV-VENUE:')).toBeNull();
    expect(parseQr('NURIV-VENUE:   ')).toBeNull();
  });

  it('QR 이 아예 아닌 문자열·빈 값은 조용히 null', () => {
    for (const s of ['', '   ', 'hello', 'https://', '01012345678', '{"a":1}', 'https://nuriholdem.com/']) {
      expect(parseQr(s)).toBeNull();
    }
  });

  it('앞뒤 공백·줄바꿈이 섞여도 읽는다 — 인쇄물 스캔은 공백이 붙어 오기도 한다', () => {
    expect(parseQr(`\n  ${checkinUrl(VENUE)}  \t`)?.kind).toBe('checkin');
  });

  it('⚠ 두 파라미터가 같이 있으면 **출석이 이긴다** — 순서에 흔들리지 않는 단일 규칙', () => {
    // 어느 쪽이 이기든 상관없지만 '매번 같아야' 한다. 바인은 되돌리는 데 운영자 손이 필요하고
    // 출석은 하루 한 번 무해하므로, 애매하면 덜 위험한 쪽으로 떨어뜨린다.
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}&buyin=${VENUE}`)?.kind).toBe('checkin');
    expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&checkin=${VENUE}`)?.kind).toBe('checkin');
  });

  it('game 이 숫자가 아니거나 0·음수면 미지정으로 떨어진다 — 장부 게임번호는 1부터다', () => {
    for (const g of ['abc', '0', '-1', '', '1.5e3', ' ']) {
      expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&game=${g}`)?.gameSeq).toBe(
        g === '1.5e3' ? 1 : null, // parseInt('1.5e3') === 1 — 소수·지수는 정수부만 남는다(경계 기록)
      );
    }
  });

  it('origin 이 달라도 파라미터만 본다 — 업주가 어느 주소에서 인쇄했든 매장 QR 은 매장 QR이다', () => {
    expect(parseQr(`https://www.nuriholdem.com/?checkin=${VENUE}`)?.venueId).toBe(VENUE);
    expect(parseQr(`http://localhost:4173/?buyin=${VENUE}&game=2`)?.gameSeq).toBe(2);
  });

  it('빈 파라미터는 매장 없음 — venueId 가 빈 문자열로 흘러들면 안 된다', () => {
    expect(parseQr(`${ORIGIN}/?checkin=`)).toBeNull();
    expect(parseQr(`${ORIGIN}/?buyin=`)).toBeNull();
  });
});
