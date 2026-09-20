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

  it('⚠[교체 2026-09-21, Q1] 혼합 의도(checkin+buyin)는 이제 통째로 거부한다', () => {
    // 예전 계약(삭제하지 않고 방향만 뒤집음): "두 파라미터가 같이 있으면 출석이 이긴다"였다.
    // 왜 위험했나 — '섞인 입력을 조용히 한쪽으로 해석'하는 규칙 자체가, VoucherWallet 의 중복
    // parseVenueId 처럼 다른 의도의 QR 을 엉뚱하게 실행할 길을 열어 준다(A 매장 출석 QR → 이용권
    // 사용으로 오인된 실사고, 이 파일이 지키는 대상). 같은 입력, 기대값만 null 로 뒤집는다.
    const out: { reason?: string } = {};
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}&buyin=${VENUE}`, out)).toBeNull();
    expect(out.reason).toBeTruthy();
    expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&checkin=${VENUE}`)).toBeNull();
  });

  it('⚠[교체 2026-09-21, Q6] 잘못된 game 은 "미지정" 이 아니라 **거부**다', () => {
    // 예전 계약(방향만 뒤집음): "숫자가 아니거나 0·음수면 미지정(gameSeq=null)으로 떨어진다".
    // 왜 위험했나 — `parseInt` 는 `'12x'` 를 12 로, `'1.5e3'` 을 1 로 **조용히** 읽는다.
    //   테이블 번호가 잘못 해석되면 손님이 **다른 테이블**에 참가 요청을 보내고, 화면에는
    //   아무 이상 신호가 없다. 위 혼합 의도와 같은 이유로 '조용한 해석' 을 거부로 바꾼다.
    //   같은 입력, 기대값만 null(거부)로 뒤집고 이유가 붙는지도 본다.
    // ⚠ `'1 '` 처럼 **문자열 끝** 공백은 쓰지 마라 — `parseQr` 은 입력 전체를 `trim()` 하므로
    //   URL 꼬리의 공백이 사라져 `game=1` 이 되고, 파서가 아니라 테스트가 틀린다(2026-09-21에 실제로 겪음).
    //   꼬리 공백을 재려면 `1%20` 처럼 인코딩해서 파라미터 값 안에 넣는다.
    for (const g of ['abc', '0', '-1', '', '1.5e3', ' ', '12x', '+1', '1%20', '%20', '٢', '1e3', '0x2']) {
      const out: { reason?: string } = {};
      expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&game=${g}`, out), `game=${JSON.stringify(g)} 가 통과했다`).toBeNull();
      expect(out.reason, `game=${JSON.stringify(g)} 거부에 이유가 없다`).toBeTruthy();
    }
    // 양의 정수 전체 문자열만 통과한다 — 기존 통과 경로는 그대로다.
    expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&game=7`)?.gameSeq).toBe(7);
    expect(parseQr(`${ORIGIN}/?buyin=${VENUE}`)?.gameSeq, 'game 생략은 여전히 미지정이다').toBeNull();
  });

  it('🔴 Q6 — 같은 키가 여러 번 실리면 앞의 것을 조용히 쓰지 않고 거부한다', () => {
    // `URLSearchParams.get()` 은 첫 값만 준다 — `?buyin=A&buyin=B` 가 A 로 조용히 해석됐다.
    for (const u of [
      `${ORIGIN}/?buyin=${VENUE}&buyin=${VENUE}`,
      `${ORIGIN}/?checkin=${VENUE}&checkin=${VENUE}`,
      `${ORIGIN}/?buyin=${VENUE}&game=1&game=2`,
      `${ORIGIN}/?signup=1&signup=1`,
    ]) {
      const out: { reason?: string } = {};
      expect(parseQr(u, out), `${u} 가 통과했다`).toBeNull();
      expect(out.reason).toBeTruthy();
    }
  });

  it('🔴 Q6 — 빈 값은 "없음" 이 아니다', () => {
    // `get()` 이 `''` 를 주고 falsy 라, 예전에는 `?checkin=` 이 "checkin 키 없음" 과 똑같이 취급됐다.
    for (const u of [`${ORIGIN}/?checkin=`, `${ORIGIN}/?buyin=`, `${ORIGIN}/?signup=`]) {
      expect(parseQr(u), `${u} 가 통과했다`).toBeNull();
    }
    // 빈 값이라도 **의도 키는 있는 것**이므로, 다른 의도와 같이 오면 혼합으로 잡힌다.
    expect(parseQr(`${ORIGIN}/?checkin=&buyin=${VENUE}`), '빈 checkin 이 무시되고 buyin 이 실행됐다').toBeNull();
  });

  it('🔴 Q6 — signup 은 정확히 1 만, game 단독은 거부한다', () => {
    expect(parseQr(`${ORIGIN}/?signup=1`)?.kind).toBe('signup');
    for (const u of [`${ORIGIN}/?signup=2`, `${ORIGIN}/?signup=true`, `${ORIGIN}/?signup=01`, `${ORIGIN}/?signup=1&game=2`]) {
      expect(parseQr(u), `${u} 가 통과했다`).toBeNull();
    }
    // 무엇을 할지가 없는 `?game=2` — 예전엔 '알아볼 수 없음' 으로 뭉뚱그렸다.
    const out: { reason?: string } = {};
    expect(parseQr(`${ORIGIN}/?game=2`, out)).toBeNull();
    expect(out.reason, '단독 game 거부에 이유가 없다').toBeTruthy();
  });

  it('🔴 Q6 — game 은 바인 전용이다. 출석 QR 에 붙으면 거부한다', () => {
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}&game=2`), '출석 QR 의 game 이 조용히 무시됐다').toBeNull();
  });

  it('🔴 Q6 — 세 의도가 한꺼번에 와도 거부한다(둘일 때와 같은 판정)', () => {
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}&buyin=${VENUE}&signup=1`)).toBeNull();
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}&signup=1`)).toBeNull();
    expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&signup=1`)).toBeNull();
  });

  it('🔴 Q6 — QR 과 무관한 쿼리가 섞여 있어도 정상 QR 은 그대로 읽는다', () => {
    // 이용권 링크·추천 코드 같은 다른 파라미터가 함께 올 수 있다. 그것 때문에 거부하면 안 된다.
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}&ref=ABC&tab=home`)?.kind).toBe('checkin');
    expect(parseQr(`${ORIGIN}/?buyin=${VENUE}&game=3&ref=ABC`)?.gameSeq).toBe(3);
  });

  it('허용 목록 origin(현재 실행 origin·운영 도메인·www)은 통과한다', () => {
    // checkinUrl/buyinRequestUrl 은 window.location.origin 으로 찍는다(api/checkins.ts,
    // api/ledger.ts) — 이 vitest 는 environment:'node' 라 location 이 없으므로 "현재 실행 origin"
    // 분기는 여기서 검증되지 않는다(e2e 가 실브라우저에서 검증). 여기서는 운영 도메인 allowlist만 확인한다.
    expect(parseQr(`https://www.nuriholdem.com/?checkin=${VENUE}`)?.venueId).toBe(VENUE);
    expect(parseQr(`${ORIGIN}/?checkin=${VENUE}`)?.venueId).toBe(VENUE); // https://nuriholdem.com (무 www)
  });

  it('⚠[교체 2026-09-21, Q1] 허용 목록 밖 origin은 이제 거부한다', () => {
    // 예전 계약(삭제하지 않고 방향만 뒤집음): "origin 이 달라도 파라미터만 본다 — 업주가 어느 주소에서
    // 인쇄했든 매장 QR 은 매장 QR이다"였다. 왜 위험했나 — venueId·checkin= 파라미터만 맞으면
    // 어떤 origin 의 URL 도 통과했으므로, 똑같은 파라미터를 실은 가짜/복제 사이트 QR 도 그대로
    // 실행됐다. 같은 입력을 그대로 두고(localhost:4173), 기대값만 null 로 뒤집는다.
    const out: { reason?: string } = {};
    expect(parseQr(`http://localhost:4173/?buyin=${VENUE}&game=2`, out)).toBeNull();
    expect(out.reason).toBeTruthy();
    expect(parseQr(`https://evil-clone.example/?checkin=${VENUE}`)).toBeNull();
  });

  it('NURIV-VENUE 뒤가 UUID 형식이 아니면 거부한다', () => {
    expect(parseQr('NURIV-VENUE:not-a-uuid')).toBeNull();
    expect(parseQr(`NURIV-VENUE:${VENUE}x`)).toBeNull(); // 자릿수 초과
  });

  it('checkin/buyin 의 venueId 도 UUID 형식이 아니면 거부한다', () => {
    expect(parseQr(`${ORIGIN}/?checkin=not-a-uuid`)).toBeNull();
    expect(parseQr(`${ORIGIN}/?buyin=12345`)).toBeNull();
  });

  it('빈 파라미터는 매장 없음 — venueId 가 빈 문자열로 흘러들면 안 된다', () => {
    expect(parseQr(`${ORIGIN}/?checkin=`)).toBeNull();
    expect(parseQr(`${ORIGIN}/?buyin=`)).toBeNull();
  });
});
