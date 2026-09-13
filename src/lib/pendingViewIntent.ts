// src/lib/pendingViewIntent.ts — 로그인 왕복에서 '보고 있던 화면'을 잃지 않게 잠깐 적어 둔다.
//
// 왜 필요한가 (N03, 2026-09-12):
//   구글 로그인은 **페이지를 떠났다 돌아온다**(`signInWithGoogle` 의 `redirectTo: window.location.origin`).
//   돌아오는 주소는 origin 이라 열려 있던 글·대회·매장·탭이 통째로 사라지고, 사용자는 로그인만 된 홈에 남는다.
//   "댓글 쓰려고 로그인했는데 글이 어디 갔지" 가 그래서 생긴다.
//   같은 문제를 QR 의도(`pendingQrIntent.ts`)와 초대 코드(`referrals.ts`)가 이미 이 패턴으로 풀어 뒀다 — 그걸 따른다.
//
// ⚠ **원시 URL 을 저장하지 않는다.** `returnTo=<주소>` 꼴로 두면 외부 주소가 섞여 들어와
//   오픈 리다이렉트가 된다. 여기서는 **허용된 종류(kind)와 내부 id** 만 저장하고,
//   복원하는 쪽이 그 id 로 자기 화면을 여는 식이라 주소를 만들 여지 자체가 없다.
//
// ⚠ **복원은 '보기'까지다.** 좋아요·예약·이용권 소비 같은 **행동은 자동으로 다시 실행하지 않는다.**
//   로그인 전에 누른 좋아요가 로그인 후 저절로 눌리면 그건 사용자가 지시하지 않은 쓰기다.
//   (댓글 입력 중이던 **본문**은 별도로 컴포넌트가 들고 있으며 여기 담지 않는다 — private 초안을 저장소에 흘리지 않는다.)

const KEY = 'nuri:view-intent';
/** 로그인 왕복은 길어야 몇 분이다. 하루 뒤 우연히 로그인했을 때 옛 글이 열리면 그건 복원이 아니라 난입이다. */
const TTL_MS = 10 * 60 * 1000;

/** 복원해도 되는 화면 종류 — **여기 없는 것은 복원하지 않는다.**
 *
 * `event` 의 id 는 **캠페인 slug**다(`card-open-2026-09` 꼴). 카드 번호가 아니다 —
 * 복원은 '이벤트 판을 여는 데까지'이고, 고른 카드까지 되살리면 로그인 직후 카드가 저절로 열린다.
 * 그건 사용자가 지시하지 않은 쓰기(참여권 소모)라 위 ⚠ 가 금지한 바로 그것이다.
 * ViewIntent 가 kind·id **둘뿐**인 것이 그 금지를 구조로 강제한다(필드가 없으면 담을 수 없다). */
export const VIEW_KINDS = ['post', 'schedule', 'venue', 'tab', 'event'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

export interface ViewIntent {
  kind: ViewKind;
  /** 내부 식별자. `tab` 이면 탭 id. 주소가 아니다. */
  id: string;
}

/**
 * 내부 식별자로 받아들일 수 있는 모양인가.
 *
 * ⚠ **허용 목록으로 판단한다.** 처음엔 `/[/\\:?#@\s]/` 같은 거부 목록이었는데,
 * 그러면 전각 슬래시(`／` U+FF0F)·유니코드 공백·제어문자처럼 **목록에 안 적힌 글자**가 통과한다.
 * 지금 구조에선 이 id 로 주소를 조립하지 않아 악용까지 가진 않지만,
 * 나중에 누가 `` `/posts/${id}` `` 한 줄을 쓰는 순간 오픈 리다이렉트가 된다.
 * 거부 목록은 "빠뜨린 글자"가 곧 구멍이고, 허용 목록은 빠뜨려도 막히는 쪽으로 실패한다.
 *
 * 실제 id 는 UUID·ULID·탭 이름이라 `A-Za-z0-9_-` 로 충분하다.
 */
export function isSafeIntentId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

export function isViewIntent(v: unknown): v is ViewIntent {
  if (!v || typeof v !== 'object') return false;
  const o = v as { kind?: unknown; id?: unknown };
  return VIEW_KINDS.includes(o.kind as ViewKind) && isSafeIntentId(o.id);
}

// ── 지금 보고 있는 화면 ────────────────────────────────────────────────────────
// 로그인 버튼은 AuthModal·대시보드 두 곳에 있고, 둘 다 열려 있는 글·대회가 뭔지 모른다.
// 그래서 화면 상태를 아는 App 이 여기에 적어 두고, 로그인 직전에 그 값을 스냅샷한다.
let currentView: ViewIntent | null = null;

/** App 이 열린 대상이 바뀔 때마다 호출한다. 아무것도 안 열려 있으면 `null`. */
export function setCurrentView(v: ViewIntent | null): void {
  currentView = v && isViewIntent(v) ? { kind: v.kind, id: v.id } : null;
}

/** 테스트·복원 후 정리용. */
export function getCurrentView(): ViewIntent | null {
  return currentView;
}

/** **로그인으로 페이지를 떠나기 직전**에 부른다. 열린 대상이 없으면 아무것도 남기지 않는다. */
export function rememberCurrentView(): void {
  if (!currentView) { clearViewIntent(); return; }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...currentView, at: Date.now() }));
  } catch { /* ignore */ }
}

export function clearViewIntent(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** 읽고 **지운다** — 한 번만 복원된다. 만료·형식 불량은 조용히 버린다. */
export function takeViewIntent(): ViewIntent | null {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ViewIntent & { at?: number };
    if (!isViewIntent(v)) return null;
    if (!v.at || Date.now() - v.at > TTL_MS) return null;
    return { kind: v.kind, id: v.id };
  } catch { return null; }
}
