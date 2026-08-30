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
  const v = safeLocal()?.getItem(KEEP_KEY) ?? null;
  return v === null ? true : v === '1';
}

/**
 * 자동 로그인 켜기/끄기. **반드시 로그인 요청을 보내기 전에** 호출해야 한다 —
 * 어댑터는 write 시점의 플래그를 보고 저장소를 고르기 때문이다.
 */
export function setKeepSignedIn(on: boolean): void {
  try { safeLocal()?.setItem(KEEP_KEY, on ? '1' : '0'); } catch { /* 저장소 차단 환경 */ }
}

/** 플래그에 따라 '쓸 곳'과 '비울 곳'을 정한다. */
function stores(): { active: Storage | null; other: Storage | null } {
  const ls = safeLocal();
  const ss = safeSession();
  return isKeepSignedIn() ? { active: ls, other: ss } : { active: ss, other: ls };
}

/**
 * supabase-js 에 주입하는 storage 어댑터.
 * getItem 은 **활성 저장소만** 본다 — 여기서 반대편으로 폴백하면 체크를 껐는데도
 * 예전에 남은 localStorage 토큰이 되살아나(= '탭 닫았는데 아직 로그인됨') 규약이 깨진다.
 */
export const authStorage = {
  getItem(k: string): string | null {
    const { active } = stores();
    try {
      const v = active?.getItem(k);
      if (v != null) return v;
    } catch { /* 접근 차단 — 메모리로 */ }
    return memory.get(k) ?? null;
  },
  setItem(k: string, v: string): void {
    const { active, other } = stores();
    // 반대편에 남은 같은 키는 즉시 지운다. 두 저장소에 세션이 동시에 존재하면
    // 플래그를 바꾼 순간 '유령 세션'이 살아난다.
    try { other?.removeItem(k); } catch { /* noop */ }
    try {
      if (!active) throw new Error('no storage');
      active.setItem(k, v);
      memory.delete(k);
    } catch { memory.set(k, v); }
  },
  removeItem(k: string): void {
    // 로그아웃은 **양쪽 다** 비운다 — 한쪽만 지우면 '로그아웃했는데 다시 로그인됨' 이 된다.
    try { safeLocal()?.removeItem(k); } catch { /* noop */ }
    try { safeSession()?.removeItem(k); } catch { /* noop */ }
    memory.delete(k);
  },
};

/**
 * 로그아웃 마무리 청소 — supabase 가 지우는 건 '자기가 아는 현재 키' 하나뿐이라,
 * PKCE 검증자(`...-auth-token-code-verifier`)나 이전 프로젝트 ref 로 남은 잔재는 그대로 남는다.
 * 두 저장소를 훑어 `sb-*-auth-token*` 을 전부 걷어낸다.
 */
export function clearAuthStorage(): void {
  for (const s of [safeLocal(), safeSession()]) {
    if (!s) continue;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && /^sb-.+-auth-token/.test(k)) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch { /* noop */ }
  }
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
