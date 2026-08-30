// src/lib/naverMap.ts — 네이버 지도 API v3 로더.
//
// 왜 별도 로더인가:
//  ① 스크립트를 index.html 에 넣으면 **임계 경로**에 외부 스크립트가 하나 더 붙는다.
//     (번들 예산 게이트가 외부 스타일시트를 막는 것과 같은 이유 — 첫 화면을 남이 막게 두지 않는다)
//     그래서 매장 페이지에서 지도가 실제로 필요해진 순간에만 <script> 를 head 에 붙인다.
//  ② 인증 실패(`navermap_authFailure`)를 **반드시 상태로 승격**시킨다.
//     지금 카카오에서 벌어지고 있는 문제가 정확히 "키가 없는데 조용히 빈 화면"이다.
//     같은 실패를 네이버로 옮겨 오면 교체한 의미가 없다.
//  ③ v3 는 구 `ncpClientId`/`govClientId`/`finClientId` 를 폐기하고 **`ncpKeyId` 로 통합**했다.
//     구 파라미터를 쓰면 401 로 떨어진다.

/** 로더 상태. 'missing-key' 와 'auth-failed' 는 **사용자에게 보이는 안내**로 떨어져야 한다. */
export type NaverMapState = 'missing-key' | 'loading' | 'ready' | 'auth-failed' | 'error';

const KEY = (import.meta.env.VITE_NAVER_MAP_KEY as string | undefined)?.trim() || '';

/** 키가 설정돼 있는가 — 지도 공급자(네이버/카카오/대체 UI) 선택의 기준. */
export function naverMapConfigured(): boolean { return !!KEY; }

// ── 최소 타입 선언 (전역 naver 네임스페이스) ──────────────────────────────────
export interface NaverLatLng { lat(): number; lng(): number }
export interface NaverMarker { setMap(map: NaverMapInstance | null): void }
export interface NaverMapInstance { destroy?(): void; setCenter(latlng: NaverLatLng): void }
interface NaverGeocodeAddress { x: string; y: string }
interface NaverGeocodeResponse { v2?: { addresses?: NaverGeocodeAddress[] } }
export interface NaverMapsNS {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => NaverMapInstance;
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Marker: new (opts: Record<string, unknown>) => NaverMarker;
  Point: new (x: number, y: number) => unknown;
  Service?: {
    geocode(
      opts: { query: string },
      cb: (status: string, res: NaverGeocodeResponse) => void,
    ): void;
    Status: { OK: string };
  };
}
interface NaverGlobal { maps?: NaverMapsNS }

const w = window as unknown as {
  naver?: NaverGlobal;
  navermap_authFailure?: () => void;
  [k: string]: unknown;
};

const CALLBACK = '__nuriNaverMapsReady';
const SCRIPT_MARK = 'data-naver-maps';
/** 스크립트가 통째로 응답이 없을 때 스피너에 영원히 갇히지 않게 하는 상한. */
const LOAD_TIMEOUT_MS = 12_000;

let state: NaverMapState = KEY ? 'loading' : 'missing-key';
let started = false;
const listeners = new Set<(s: NaverMapState) => void>();

function settle(next: NaverMapState) {
  // 인증 실패는 되돌리지 않는다 — ready 뒤에 늦게 와도 실패가 이긴다(빈 지도를 성공으로 보이게 두지 않는다).
  if (state === 'auth-failed') return;
  if (state === next) return;
  state = next;
  for (const fn of listeners) fn(next);
}

/** 현재 로더 상태(동기). */
export function naverMapState(): NaverMapState { return state; }

/** 상태 변화 구독. 해제 함수를 돌려준다. */
export function onNaverMapState(fn: (s: NaverMapState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 지도 API 를 (한 번만) 로드한다. 매장 페이지 진입 시점에 호출한다. */
export function loadNaverMaps(): NaverMapState {
  if (!KEY) return 'missing-key';
  if (started) return state;
  started = true;

  if (w.naver?.maps) { settle('ready'); return state; }

  // 인증 실패 전역 훅 — 네이버가 키 오류를 알리는 **유일한** 경로다.
  // 이미 다른 코드가 붙여 뒀다면 체이닝해서 남의 훅을 지우지 않는다.
  const prev = w.navermap_authFailure;
  w.navermap_authFailure = () => {
    try { prev?.(); } catch { /* 남의 훅 오류가 우리 안내를 막지 않게 */ }
    settle('auth-failed');
  };

  w[CALLBACK] = () => { settle(w.naver?.maps ? 'ready' : 'error'); };

  const existing = document.querySelector(`script[${SCRIPT_MARK}]`);
  if (!existing) {
    const s = document.createElement('script');
    // ⚠ v3 신 파라미터 ncpKeyId (구 ncpClientId 는 폐기). geocoder 서브모듈은 주소 → 좌표 변환용.
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(KEY)}`
      + `&submodules=geocoder&callback=${CALLBACK}`;
    s.async = true;
    s.setAttribute(SCRIPT_MARK, '1');
    s.onerror = () => settle('error');
    document.head.appendChild(s);
  }

  window.setTimeout(() => { if (state === 'loading') settle('error'); }, LOAD_TIMEOUT_MS);
  return state;
}

/** 로드 완료된 maps 네임스페이스(미로드면 null). */
export function naverMaps(): NaverMapsNS | null {
  return state === 'ready' ? (w.naver?.maps ?? null) : null;
}

let authProbed = false;

/**
 * 인증 강제 확인(1회).
 *
 * ⚠ 실측으로 드러난 함정: 네이버 v3 는 스크립트 로드가 아니라 **지도 인스턴스를 만들 때** 키를
 *   검사하고, 그때서야 `navermap_authFailure` 를 부른다. 그래서 좌표를 못 구해 지도를 한 번도
 *   만들지 못한 상태에서는 **잘못된 키가 '주소를 못 찾음'으로 위장한다**
 *   (잘못된 키로 빌드해 재현: 스크립트는 뜨고 naver 전역도 생기는데 authFailure 는 오지 않았다).
 *   원인이 틀린 안내는 조용한 빈 화면만큼이나 오너를 헤매게 한다.
 * → 지오코딩이 실패한 **그 순간에만** 1x1 숨은 지도를 만들어 인증을 강제 검사하고 즉시 파기한다.
 *   정상 경로(좌표 확보 → 실제 지도 생성)에서는 호출되지 않으므로 지도 로드 과금이 늘지 않는다.
 */
export function probeNaverAuth(): void {
  const maps = naverMaps();
  if (!maps || authProbed) return;
  authProbed = true;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(el);
  try {
    const m = new maps.Map(el, { center: new maps.LatLng(37.5665, 126.978), zoom: 10 });
    window.setTimeout(() => {
      try { m.destroy?.(); } catch { /* 파기 실패가 화면에 영향을 주지 않게 */ }
      el.remove();
    }, 3_000);
  } catch {
    el.remove();
    settle('error');
  }
}

/**
 * 주소 → 좌표. geocoder 서브모듈이 콘솔에서 비활성이면 `Service` 자체가 없어 null 로 떨어진다
 * (그 경우도 조용히 죽지 않고 호출부가 안내를 띄운다).
 */
export function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const maps = naverMaps();
  const svc = maps?.Service;
  if (!svc) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { lat: number; lng: number } | null) => { if (!done) { done = true; resolve(v); } };
    window.setTimeout(() => finish(null), 8_000);
    try {
      svc.geocode({ query: address }, (status, res) => {
        const hit = status === svc.Status.OK ? res?.v2?.addresses?.[0] : undefined;
        if (!hit) return finish(null);
        const lat = parseFloat(hit.y); const lng = parseFloat(hit.x);
        finish(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
      });
    } catch { finish(null); }
  });
}
