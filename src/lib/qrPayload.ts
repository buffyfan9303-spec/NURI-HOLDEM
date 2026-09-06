// src/lib/qrPayload.ts — 매장이 인쇄해 비치하는 QR 의 **단일 해석 규칙**.
//
// 컴포넌트 파일이 아니라 여기 두는 이유는 두 가지다. ① 화면 없이 테스트할 수 있어야 한다
//   (인쇄물과 스캐너가 어긋나면 손님이 엉뚱한 동작을 하는데, 그건 눈으로 못 잡는다 — qrPayload.test.ts).
//   ② 컴포넌트 파일에서 비컴포넌트를 export 하면 fast-refresh 가 깨진다(eslint react-refresh).
/** 스캔 결과 — 매장에 비치되는 인쇄 QR 두 종류를 같은 규칙으로 읽는다.
 *  체크인 `${origin}/?checkin=<venueId>` (checkinUrl) · 바인 요청 `${origin}/?buyin=<venueId>&game=<n>` (buyinRequestUrl).
 *  손님은 테이블에 붙은 QR 을 그냥 비출 뿐 '지금 무엇을 하는지' 먼저 고르지 않는다 —
 *  고르게 만들면 잘못 고를 길만 하나 생긴다. 의도는 QR 자신이 들고 있다. */
export type QrKind = 'checkin' | 'buyin' | 'voucher' | 'signup';
export interface QrHit { kind: QrKind; venueId: string | null; gameSeq: number | null }
/** 이 스캐너가 **실행**하는 종류. voucher·signup 은 알아보기만 하고 실행하지 않는다(각자 다른 화면 담당). */
export const ACTIONABLE: QrKind[] = ['checkin', 'buyin'];
export function parseQr(raw: string): QrHit | null {
  const t = raw.trim();
  // 매장이용권 QR 은 URL 이 아니라 접두어 토큰이다(VoucherWallet 과 같은 술어).
  if (t.startsWith('NURIV-VENUE:')) {
    const v = t.slice('NURIV-VENUE:'.length).trim();
    return v ? { kind: 'voucher', venueId: v, gameSeq: null } : null;
  }
  let sp: URLSearchParams;
  try { sp = new URL(t).searchParams; } catch { return null; }
  const c = sp.get('checkin');
  if (c) return { kind: 'checkin', venueId: c, gameSeq: null };
  const b = sp.get('buyin');
  if (b) {
    const g = parseInt(sp.get('game') ?? '', 10);
    return { kind: 'buyin', venueId: b, gameSeq: Number.isFinite(g) && g > 0 ? g : null };
  }
  if (sp.get('signup')) return { kind: 'signup', venueId: null, gameSeq: null };
  return null;
}
/** 알아봤지만 여기서 못 하는 QR — 실패로 끝내지 않고 **어디로 가야 하는지** 말해 준다.
 *  (매장은 이 넷을 한 장에 인쇄해 비치한다 — 손님이 옆 QR 을 비추는 건 실수가 아니라 정상이다.) */
export function elsewhereMsg(kind: QrKind): string | null {
  if (kind === 'voucher') return '매장이용권 QR이에요. 아래 ‘매장이용권’ 목록에서 사용할 이용권을 고른 뒤 스캔해 주세요';
  if (kind === 'signup') return '회원가입 QR이에요. 이미 로그인되어 있어 스캔이 필요 없어요';
  return null;
}
