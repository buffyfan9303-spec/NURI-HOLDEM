import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 환경변수가 없으면 Mock 모드로 동작.
 * API 함수들이 IS_MOCK === true 일 때 MOCK_* 데이터를 반환.
 */
export const IS_MOCK = !url || !key;

// ── 자동 로그인(로그인 상태 유지) 저장소 라우팅 ──────────────────────────────
//
// 요구(오너 #8): "한번 로그인한 브라우저에서 자동 로그인할지" 를 사용자가 고를 수 있어야 한다.
//
// ⚠ 핵심 제약: createClient 는 앱 부팅 때 **한 번** 만들어진다. 로그인 버튼을 누르는 시점에
//   client 의 storage 를 갈아끼울 방법이 없다. 그래서 storage 를 고정된 어댑터 하나로 두고,
//   그 어댑터가 **호출될 때마다** 별도 키(KEEP_KEY)를 읽어 localStorage / sessionStorage 중
//   어디로 위임할지 정한다. 체크박스는 KEEP_KEY 만 바꾸면 되고 client 는 그대로 산다.
//
//   · 체크 ON  → localStorage  : 브라우저를 닫아도 유지(= 자동 로그인)
//   · 체크 OFF → sessionStorage: 탭을 닫으면 해제(공용 PC 안전)
//
// KEEP_KEY 자체는 localStorage 에 둔다 — '지난번에 어떻게 골랐는지' 를 기억해 체크박스
// 초기값으로 되살리기 위해서다(국내 서비스 관행). 토큰이 아니라 취향 플래그라 민감정보가 아니다.
const KEEP_KEY = 'nuri:keep-signed-in';

function safeLocal(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
function safeSession(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

/** 저장소가 통째로 막힌 환경(사파리 프라이빗·쿠키 차단)에서의 최후 보루 — 탭 수명 동안만 산다. */
const memory = new Map<string, string>();

/**
 * 지금 '자동 로그인'이 켜져 있는가.
 *
 * ⚠ 값이 **없으면 true** 다. 이 기능 이전에 이미 로그인해 둔 사람들의 세션은 전부
 *   localStorage 에 있다(supabase 기본값 persistSession:true). 기본을 false 로 두면
 *   배포하는 순간 라이브 사용자 전원이 로그아웃된다 — 그건 기능 추가가 아니라 사고다.
 */
export function isKeepSignedIn(): boolean {
  // ⚠ A03: `safeLocal()` 은 **접근**만 감싼다. 접근은 되는데 `getItem` 이 던지는 환경이 있다
  //   (사파리 프라이빗·쿠키 차단 웹뷰의 SecurityError, 용량 초과 뒤 손상된 저장소).
  //   여기서 새면 `stores()` → `authStorage.getItem` 이 **폴백에 닿기도 전에** 터져
  //   supabase 어댑터가 통째로 실패한다 = 흰 화면. 읽기까지 감싼다.
  let v: string | null;
  try { v = safeLocal()?.getItem(KEEP_KEY) ?? null; } catch { v = null; }
  return v === null ? true : v === '1';
}

/**
 * 자동 로그인 켜기/끄기. **반드시 로그인 요청을 보내기 전에** 호출해야 한다 —
 * 어댑터는 write 시점의 플래그를 보고 저장소를 고르기 때문이다.
 */
export function setKeepSignedIn(on: boolean): void {
  try { safeLocal()?.setItem(KEEP_KEY, on ? '1' : '0'); } catch { /* 저장소 차단 환경 */ }
  // 이 탭에서 **사용자가 직접** 고른 것이므로 현재 탭의 저장 위치도 함께 옮긴다(아래 A02 참조).
  pinned = on ? 'local' : 'session';
}

/**
 * 이 탭의 세션이 **실제로 사는 곳**. `KEEP_KEY` 플래그와 분리한다.
 *
 * ⚠ A02(실측): `KEEP_KEY` 는 localStorage 라 **모든 탭이 공유**한다. 예전에는 `stores()` 가
 *   매번 그 플래그를 다시 읽어서, **A 탭이 OFF 로 로그인해 sessionStorage 에 세션을 두고 있는데
 *   B 탭에서 체크박스를 ON 으로 바꾸기만 해도** A 탭이 localStorage 를 보게 돼 자기 세션을 못 찾았다
 *   (= 다른 탭의 폼 조작만으로 로그아웃된 것처럼 보인다).
 *   플래그는 **다음 로그인의 기본 선택**이고, 이 값은 **지금 이 탭의 실제 위치**다.
 *   부팅 때 한 번 플래그로 정해지고, 그 뒤에는 이 탭에서 명시적으로 바꿀 때만 움직인다.
 */
let pinned: 'local' | 'session' | null = null;

/** 이 탭의 저장 위치를 잊는다 — 테스트 전용(모듈 상태 격리). */
export function __resetAuthStoragePin(): void { pinned = null; }

/** 플래그에 따라 '쓸 곳'과 '비울 곳'을 정한다. 한 번 정해지면 이 탭에서는 유지된다. */
function stores(): { active: Storage | null; other: Storage | null } {
  const ls = safeLocal();
  const ss = safeSession();
  if (pinned === null) pinned = isKeepSignedIn() ? 'local' : 'session';
  return pinned === 'local' ? { active: ls, other: ss } : { active: ss, other: ls };
}

/**
 * supabase-js 에 주입하는 storage 어댑터.
 * getItem 은 **활성 저장소만** 본다 — 여기서 반대편으로 폴백하면 체크를 껐는데도
 * 예전에 남은 localStorage 토큰이 되살아나(= '탭 닫았는데 아직 로그인됨') 규약이 깨진다.
 */
export const authStorage = {
  getItem(k: string): string | null {
    const { active } = stores();
    if (!active) return memory.get(k) ?? null;
    try {
      // ⚠ `null` 은 **그대로 null 로 돌려준다.** 여기서 메모리로 폴백하면
      //   로그아웃·저장소 비움으로 정당하게 사라진 세션이 되살아난다("로그아웃했는데 다시 로그인됨").
      //   메모리는 **읽기 자체가 막힌 환경**에서만 쓴다.
      return active.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem(k: string, v: string): void {
    const { active, other } = stores();
    // 반대편에 남은 같은 키는 즉시 지운다. 두 저장소에 세션이 동시에 존재하면
    // 플래그를 바꾼 순간 '유령 세션'이 살아난다.
    try { other?.removeItem(k); } catch { /* noop */ }
    // ⚠ A03: 쓰기는 되는데 **읽기가 던지는** 환경이 있다(사파리 프라이빗·쿠키 차단 웹뷰).
    //   예전엔 쓰기가 성공하면 `memory.delete(k)` 를 했는데, 그러면 방금 쓴 값을 **다시 읽을 수 없어**
    //   탭 안에서 로그인이 유지되지 않았다. 그래서 메모리에 **항상 거울을 둔다** —
    //   위 `getItem` 이 null 을 메모리로 덮지 않으므로 '되살아남' 은 생기지 않는다.
    memory.set(k, v);
    try { active?.setItem(k, v); } catch { /* 메모리에 이미 있다 */ }
  },
  removeItem(k: string): void {
    // 로그아웃은 **양쪽 다** 비운다 — 한쪽만 지우면 '로그아웃했는데 다시 로그인됨' 이 된다.
    try { safeLocal()?.removeItem(k); } catch { /* noop */ }
    try { safeSession()?.removeItem(k); } catch { /* noop */ }
    memory.delete(k);
  },
};

/** 매장 순위 패널 첫 렌더 캐시의 localStorage 키 접두사(VenuePage.writeRankCache) — 로그아웃이 같이 걷는다(아래).
 *  🔴 2026-09-24 F5 — 접두사를 올렸다(v2). 옛 접두사로 이미 저장된 캐시에는 장부 이름 '실명(닉네임)'(playerCounts·buyinCounts)이
 *  남아 있을 수 있다 — 새 코드는 그 키를 **읽지 않고**, 부팅 때 한 번 지운다(purgeLegacyRankCache). */
export const RANK_CACHE_PREFIX = 'nuri:rankcache2:';
/** 지난 접두사들 — 읽지 않고 지우기만 한다. 접두사를 또 올리면 여기에 옛 값을 더한다. */
export const LEGACY_RANK_CACHE_PREFIXES = ['nuri:rankcache:'] as const;
const isRankCacheKey = (k: string) => k.startsWith(RANK_CACHE_PREFIX) || LEGACY_RANK_CACHE_PREFIXES.some((p) => k.startsWith(p));
/** 옛 접두사 순위 캐시를 두 저장소에서 지운다(부팅 1회 — 아래 모듈 끝에서 부른다). 실패는 조용히 무시한다(저장소 차단 환경). */
export function purgeLegacyRankCache(): void {
  for (const s of [safeLocal(), safeSession()]) {
    if (!s) continue;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && LEGACY_RANK_CACHE_PREFIXES.some((p) => k.startsWith(p))) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch { /* noop */ }
  }
}

/**
 * 로그아웃 마무리 청소 — supabase 가 지우는 건 '자기가 아는 현재 키' 하나뿐이라,
 * PKCE 검증자(`...-auth-token-code-verifier`)나 이전 프로젝트 ref 로 남은 잔재는 그대로 남는다.
 * 두 저장소를 훑어 `sb-*-auth-token*` 을 전부 걷어낸다.
 * D4(2026-09-17): 순위 패널 캐시(`nuri:rankcache:*`)도 함께 — 업주가 보던 매장의 순위 데이터가 공용 매장 PC 에
 * 로그아웃 뒤에도 남아 다음 사용자의 첫 렌더에 그려졌다. 캐시 자체는 이제 실명·사유·방문자 명단을 넣지 않지만(redactForCache),
 * 로그아웃 = 흔적 제거가 맞다.
 */
export function clearAuthStorage(): void {
  for (const s of [safeLocal(), safeSession()]) {
    if (!s) continue;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && (/^sb-.+-auth-token/.test(k) || isRankCacheKey(k))) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch { /* noop */ }
  }
  // 비밀번호 변경 OTP 대기 마커(ProfileModal 'nh_pw_otp')도 여기서 — 키에 사용자 식별이 없어
  // 로그아웃 뒤 5분 안에 다른 계정이 같은 탭에서 로그인하면 그 계정의 보안 탭이 이전 계정의 코드 입력 단계로 열렸다.
  // signOut 의 finally 가 이 함수를 지나므로 모든 로그아웃 경로(헤더 메뉴·제재 자동 로그아웃·탈퇴)가 함께 정리된다.
  try { safeSession()?.removeItem('nh_pw_otp'); } catch { /* noop */ }
  memory.clear();
}

export const supabase = IS_MOCK
  ? (null as unknown as ReturnType<typeof createClient>)  // mock 모드에선 호출되지 않음
  : createClient(url!, key!, {
      auth: {
        // storage 만 갈아끼운다 — 나머지(persistSession·autoRefreshToken·detectSessionInUrl)는
        // supabase 기본값 그대로다. OAuth 리다이렉트 복귀도 sessionStorage 가 탭 안에서 살아남으므로
        // 체크 해제 상태에서 동일하게 동작한다.
        storage: authStorage,
      },
    });

// ── DB row → 앱 타입 변환 헬퍼 ─────────────────────────────────────────────
// snake_case(DB) ↔ camelCase(앱) 변환을 각 api 파일에서 통일하여 사용

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
