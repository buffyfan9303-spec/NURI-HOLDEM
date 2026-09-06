// src/lib/pendingQrIntent.ts — 로그인 왕복에서 'QR 로 하려던 일'을 잃지 않게 잠깐 적어 둔다.
//
// 왜 필요한가(2026-09-06 QR 감사에서 확인):
//   비회원 손님이 매장 벽의 출석 QR 을 폰 카메라로 찍으면 `/?checkin=<id>` 가 열리고, 로그인 창이 뜬다.
//   그런데 카카오·구글 로그인은 **페이지를 떠났다 돌아온다**. 돌아오는 주소는 redirectTo(=origin) 라
//   `?checkin=` 이 통째로 사라지고, 손님은 로그인만 된 홈 화면에 남는다 — 출석도, 안내도, 에러도 없다.
//   (이메일 로그인은 페이지 이동이 없어 멀쩡하다. 그래서 '로그인 수단에 따라 QR 이 되기도 안 되기도' 했다.)
//
// 같은 문제를 초대 코드(?ref=)는 이미 이렇게 풀어 뒀다(referrals.ts rememberRefCode) — 그 패턴을 따른다.
// OAuth redirectTo 를 href 로 바꾸는 방법도 있지만 Supabase 허용목록 설정에 의존해 조용히 깨질 수 있다.
//
// ⚠ **수명을 반드시 짧게 둔다.** 출석은 '지금 그 매장에 있다'는 기록이다. 며칠 뒤 우연히 로그인했을 때
//   되살아나 도장이 찍히면 그건 거짓 기록이다. 그래서 30분이 지난 의도는 버린다.
const KEY = 'nuri:qr-intent';
const TTL_MS = 30 * 60 * 1000;

export interface QrIntent {
  kind: 'checkin' | 'buyin';
  venueId: string;
  gameSeq: number | null;
}

export function rememberQrIntent(i: QrIntent): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...i, at: Date.now() })); } catch { /* ignore */ }
}

/** 읽고 **지운다** — 한 번만 쓰인다(두 번 소비되면 출석이 두 번 찍힌다). 만료된 것은 조용히 버린다. */
export function takeQrIntent(): QrIntent | null {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as QrIntent & { at?: number };
    if (!v?.venueId || (v.kind !== 'checkin' && v.kind !== 'buyin')) return null;
    if (!v.at || Date.now() - v.at > TTL_MS) return null;
    return { kind: v.kind, venueId: v.venueId, gameSeq: typeof v.gameSeq === 'number' ? v.gameSeq : null };
  } catch { return null; }
}
