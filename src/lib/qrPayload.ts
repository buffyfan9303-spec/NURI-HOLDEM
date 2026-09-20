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

// venueId 는 항상 Postgres UUID 다(venues.id). 표준 8-4-4-4-12 형식만 통과시킨다 —
// 예전엔 `NURIV-VENUE:` 뒤 아무 문자열이나 통과해, 손으로 조작한 문자열도 venueId 로 채택됐다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 인쇄 QR 은 checkinUrl/buyinRequestUrl 이 window.location.origin 으로 찍고, signup 만 이 상수로 고정 인쇄한다(VoucherManageModal.tsx:138,231).
const PROD_ORIGINS = ['https://nuriholdem.com', 'https://www.nuriholdem.com'];

function isAllowedOrigin(origin: string): boolean {
  if (PROD_ORIGINS.includes(origin)) return true;
  // 지금 실행 중인 origin(프리뷰 배포·로컬 dev/e2e 빌드가 여기 걸린다)도 허용한다.
  // 테스트·SSR 처럼 location 이 아예 없는 환경에서는 이 분기를 건너뛴다 — 미검증 origin 을 허용하지 않는 안전 쪽으로 떨어진다.
  try { return typeof location !== 'undefined' && location.origin === origin; } catch { return false; }
}

/** raw 를 거부했을 때 **왜**인지 담을 선택적 out-파라미터. 기존 `parseQr(raw)` 한 인자 호출부는
 *  그대로 동작한다 — 이 인자를 넘긴 호출부만 사용자 안내에 이유를 쓸 수 있다. */
export interface QrRejectOut { reason?: string }
export function parseQr(raw: string, out?: QrRejectOut): QrHit | null {
  const reject = (reason: string): null => { if (out) out.reason = reason; return null; };
  const t = raw.trim();
  // 매장이용권 QR 은 URL 이 아니라 접두어 토큰이다(VoucherWallet 과 같은 술어).
  if (t.startsWith('NURIV-VENUE:')) {
    const v = t.slice('NURIV-VENUE:'.length).trim();
    if (!v) return reject('매장 ID가 없어요');
    if (!UUID_RE.test(v)) return reject('매장 ID 형식이 올바르지 않아요');
    return { kind: 'voucher', venueId: v, gameSeq: null };
  }
  let url: URL;
  try { url = new URL(t); } catch { return reject('QR 형식을 알아볼 수 없어요'); }
  if (!isAllowedOrigin(url.origin)) return reject('허용되지 않은 주소의 QR이에요');
  const sp = url.searchParams;
  // 혼합 의도 거부 — 한 URL 에 두 용도 이상의 파라미터가 같이 실리면(예: checkin+buyin) 어느 쪽도 실행하지 않는다.
  // 예전엔 '출석이 이긴다'는 우선순위 규칙이 있었는데, A 매장 이용권 QR 오사용 사고(Q1)처럼
  // 섞인 입력을 조용히 한쪽으로 해석하는 규칙 자체가 위험하다고 판단해 거부로 바꿨다.
  // 🔴 Q6(2026-09-21) — 경계를 `get()` 이 아니라 **`has`/`getAll`** 로 센다.
  //   `get()` 은 빈 값(`?checkin=`)을 `''` 로 주고 falsy 라 "없음" 과 구별되지 않았고,
  //   같은 키가 여러 번 실린 `?buyin=A&buyin=B` 도 앞의 것만 조용히 채택됐다.
  const INTENT_KEYS = ['checkin', 'buyin', 'signup'] as const;
  const present = INTENT_KEYS.filter((k) => sp.has(k));
  for (const k of present) {
    if (sp.getAll(k).length > 1) return reject('QR에 같은 값이 여러 번 실려 있어요');
  }
  if (present.length > 1) return reject('QR에 서로 다른 용도가 섞여 있어요');
  if (sp.getAll('game').length > 1) return reject('QR에 같은 값이 여러 번 실려 있어요');
  if (present.length === 0) {
    // 단독 `?game=2` — 무엇을 할지가 없다. 무엇이 빠졌는지 말해 주는 편이 손님에게 쓸모 있다.
    if (sp.has('game')) return reject('게임 번호만 있고 무엇을 할 QR인지가 없어요');
    return reject('QR을 알아볼 수 없어요');
  }

  const only = present[0];
  if (only === 'signup') {
    // 가입 QR 은 고정 인쇄물이라 값이 정확히 `1` 이다(App 의 기존 판정과 같은 규칙).
    if (sp.get('signup') !== '1') return reject('회원가입 QR 형식이 올바르지 않아요');
    if (sp.has('game')) return reject('회원가입 QR에 게임 번호가 붙어 있어요');
    return { kind: 'signup', venueId: null, gameSeq: null };
  }

  const v = sp.get(only) ?? '';
  if (!v) return reject('매장 ID가 없어요');
  if (!UUID_RE.test(v)) return reject('매장 ID 형식이 올바르지 않아요');
  if (only === 'checkin') {
    // `game` 은 바인 전용이다. 출석 QR 에 붙어 있으면 인쇄물이 잘못됐거나 손댄 주소다 — 조용히 무시하지 않는다.
    if (sp.has('game')) return reject('출석 QR에 게임 번호가 붙어 있어요');
    return { kind: 'checkin', venueId: v, gameSeq: null };
  }
  // buyin — `game` 은 **생략하거나 양의 정수 전체 문자열**만.
  // ⚠ 종전에는 `parseInt(raw, 10)` 이라 `'12x'` → 12, `'1.5e3'` → 1 로 **조용히 통과**했다.
  //   테이블 번호가 잘못 읽히면 손님이 **다른 테이블**에 참가 요청을 보낸다. 거부가 맞다.
  //   (이 계약은 2026-09-21 오너 실행문서가 요구해 '통과' 에서 '거부' 로 **강화**됐다 —
  //    약화가 아니라서 기존 단언을 갱신했다. qrPayload.test.ts 의 해당 it 참고.)
  let gameSeq: number | null = null;
  if (sp.has('game')) {
    const g = sp.get('game') ?? '';
    if (!/^[0-9]+$/.test(g)) return reject('게임 번호 형식이 올바르지 않아요');
    const n = Number(g);
    if (!Number.isSafeInteger(n) || n <= 0) return reject('게임 번호 형식이 올바르지 않아요');
    gameSeq = n;
  }
  return { kind: 'buyin', venueId: v, gameSeq };
}
/** 알아봤지만 여기서 못 하는 QR — 실패로 끝내지 않고 **어디로 가야 하는지** 말해 준다.
 *  (매장은 이 넷을 한 장에 인쇄해 비치한다 — 손님이 옆 QR 을 비추는 건 실수가 아니라 정상이다.) */
export function elsewhereMsg(kind: QrKind): string | null {
  if (kind === 'voucher') return '매장이용권 QR이에요. 아래 ‘매장이용권’ 목록에서 사용할 이용권을 고른 뒤 스캔해 주세요';
  if (kind === 'signup') return '회원가입 QR이에요. 이미 로그인되어 있어 스캔이 필요 없어요';
  return null;
}
