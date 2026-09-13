// 자동 로그인 저장소 어댑터 — A02·A03.
//
// A02 다른 탭의 체크박스가 **이 탭의 세션 위치를 옮기면 안 된다.**
//   `nuri:keep-signed-in` 은 localStorage 라 모든 탭이 공유한다. 예전에는 `stores()` 가 매번 그 플래그를
//   다시 읽어서, A 탭이 OFF 로 로그인해 sessionStorage 에 세션을 둔 상태에서 **B 탭이 체크박스만 켜도**
//   A 탭이 localStorage 를 보게 돼 자기 세션을 못 찾았다 — 폼 조작만으로 로그아웃된 것처럼 보인다.
//
// A03 저장소가 **접근은 되는데 읽기가 던지는** 환경(사파리 프라이빗·쿠키 차단 웹뷰의 SecurityError)에서
//   어댑터가 통째로 터지면 안 된다. 예전엔 `stores()` 가 try 블록 **밖**이라 폴백에 닿기도 전에 새어 나갔다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** 최소 Storage 구현. `throwOnGet` 이면 읽기에서 던진다(SecurityError 흉내). */
function makeStorage(throwOnGet = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => { if (throwOnGet) throw new Error('SecurityError'); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
    _dump: () => [...m.entries()],
  } as unknown as Storage & { _dump: () => [string, string][] };
}

let ls: ReturnType<typeof makeStorage>;
let ss: ReturnType<typeof makeStorage>;

const load = async () => {
  vi.resetModules();
  return await import('./supabase');
};

beforeEach(() => {
  ls = makeStorage();
  ss = makeStorage();
  vi.stubGlobal('window', { localStorage: ls, sessionStorage: ss });
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('sessionStorage', ss);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('A02 — 다른 탭의 체크박스가 이 탭의 세션 위치를 바꾸지 않는다', () => {
  it('🔴 OFF 로 로그인한 탭은 다른 탭이 플래그를 ON 으로 바꿔도 계속 sessionStorage 를 본다', async () => {
    const m = await load();
    m.__resetAuthStoragePin();
    m.setKeepSignedIn(false);                 // 이 탭: 자동 로그인 끔 → sessionStorage
    m.authStorage.setItem('sb-token', 'A세션');
    expect(ss._dump().length, 'OFF 인데 sessionStorage 에 안 들어갔다').toBe(1);

    // 다른 탭이 공유 플래그만 바꾼다(이 탭에서 setKeepSignedIn 을 부르지 않는다).
    ls.setItem('nuri:keep-signed-in', '1');

    expect(m.authStorage.getItem('sb-token'), '다른 탭의 폼 조작만으로 내 세션을 잃었다').toBe('A세션');
  });

  it('🔴 ON 으로 로그인한 탭도 마찬가지로 흔들리지 않는다', async () => {
    const m = await load();
    m.__resetAuthStoragePin();
    m.setKeepSignedIn(true);
    m.authStorage.setItem('sb-token', 'B세션');
    ls.setItem('nuri:keep-signed-in', '0');   // 다른 탭이 끔
    expect(m.authStorage.getItem('sb-token')).toBe('B세션');
  });

  it('이 탭에서 직접 바꾸면 위치도 함께 옮긴다 — 사용자가 고른 것은 반영한다', async () => {
    const m = await load();
    m.__resetAuthStoragePin();
    m.setKeepSignedIn(true);
    m.authStorage.setItem('sb-token', 'x');
    expect(ls._dump().length).toBe(2);        // 토큰 + 플래그

    m.setKeepSignedIn(false);                 // 이 탭에서 직접 끔
    m.authStorage.setItem('sb-token', 'y');
    expect(ss._dump().length, '직접 끄면 sessionStorage 로 옮겨야 한다').toBe(1);
  });

  it('부팅 시에는 플래그를 따른다 — 고정은 그 뒤부터다', async () => {
    ls.setItem('nuri:keep-signed-in', '0');
    const m = await load();
    m.__resetAuthStoragePin();
    m.authStorage.setItem('sb-token', 'z');
    expect(ss._dump().length, '부팅 때 플래그(OFF)를 안 따랐다').toBe(1);
  });
});

describe('A03 — 저장소 읽기가 던져도 어댑터가 살아남는다', () => {
  it('🔴 getItem 이 SecurityError 를 던져도 예외가 새지 않는다', async () => {
    vi.stubGlobal('window', { localStorage: makeStorage(true), sessionStorage: makeStorage(true) });
    const m = await load();
    m.__resetAuthStoragePin();
    expect(() => m.authStorage.getItem('sb-token'), '폴백 전에 예외가 새어 나갔다').not.toThrow();
    expect(m.authStorage.getItem('sb-token')).toBeNull();
  });

  it('🔴 isKeepSignedIn 도 던지지 않는다 — 여기서 새면 stores() 가 통째로 터진다', async () => {
    vi.stubGlobal('window', { localStorage: makeStorage(true), sessionStorage: makeStorage(true) });
    const m = await load();
    expect(() => m.isKeepSignedIn()).not.toThrow();
    // 값을 못 읽으면 **기존 사용자를 로그아웃시키지 않는 쪽**(true)이 안전한 기본값이다.
    expect(m.isKeepSignedIn()).toBe(true);
  });

  it('저장소가 막히면 메모리로 버틴다 — 탭 수명 동안은 로그인이 유지된다', async () => {
    const blocked = makeStorage(true);
    vi.stubGlobal('window', { localStorage: blocked, sessionStorage: blocked });
    const m = await load();
    m.__resetAuthStoragePin();
    expect(() => m.authStorage.setItem('sb-token', '메모리')).not.toThrow();
    expect(m.authStorage.getItem('sb-token'), '메모리 폴백이 동작하지 않는다').toBe('메모리');
  });

  it('값이 없으면 자동 로그인은 켜진 것으로 본다 — 배포 순간 전원 로그아웃을 막는 기본값', async () => {
    const m = await load();
    expect(m.isKeepSignedIn()).toBe(true);
  });
});

describe('🔴 메모리 거울이 "로그아웃했는데 다시 로그인됨" 을 만들지 않는다', () => {
  it('저장소가 정상인데 값이 사라졌으면 null 이다 — 메모리로 되살리지 않는다', async () => {
    const m = await load();
    m.__resetAuthStoragePin();
    m.setKeepSignedIn(true);
    m.authStorage.setItem('sb-token', '세션');
    expect(m.authStorage.getItem('sb-token')).toBe('세션');

    // 사용자가 브라우저 설정에서 사이트 데이터를 지웠다 / 다른 경로로 토큰이 사라졌다.
    ls.removeItem('sb-token');
    expect(m.authStorage.getItem('sb-token'), '메모리 거울이 지워진 세션을 되살렸다').toBeNull();
  });

  it('removeItem(로그아웃)은 양쪽 저장소와 메모리를 모두 비운다', async () => {
    const m = await load();
    m.__resetAuthStoragePin();
    m.setKeepSignedIn(true);
    m.authStorage.setItem('sb-token', '세션');
    m.authStorage.removeItem('sb-token');
    expect(m.authStorage.getItem('sb-token'), '로그아웃했는데 값이 남았다').toBeNull();
  });

  it('읽기가 막힌 환경에서만 메모리가 답한다', async () => {
    const blocked = makeStorage(true);
    vi.stubGlobal('window', { localStorage: blocked, sessionStorage: blocked });
    const m = await load();
    m.__resetAuthStoragePin();
    m.authStorage.setItem('sb-token', '메모리');
    expect(m.authStorage.getItem('sb-token')).toBe('메모리');
    m.authStorage.removeItem('sb-token');
    expect(m.authStorage.getItem('sb-token'), '막힌 환경에서도 로그아웃은 돼야 한다').toBeNull();
  });
});
