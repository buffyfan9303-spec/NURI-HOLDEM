/**
 * `@supabase/storage-js` 의 대리 — 첫 화면에서 storage 코드를 뺀다(2026-10-07 번들 감축 PR A ①).
 *
 * 왜: supabase-js 는 `createClient` 안에서 `new StorageClient(...)` 를 **정적으로** 부른다. 그래서 앱이 업로드를
 *   한 번도 안 해도 storage-js(+iceberg-js, gz 약 7KB)가 첫 화면 청크(vendor-supabase)에 실렸다.
 *   supabase-js 는 클래스 기반이라 트리셰이킹이 안 된다(supabase-js #151, 공식 해결책 없음).
 * 어떻게: vite.config.ts 의 `resolve.alias` 가 supabase-js 의 `import … from '@supabase/storage-js'` 만 이 파일로 돌린다.
 *   진짜 패키지는 하위 경로(`/dist/index.mjs`)로 불러 별칭에 다시 걸리지 않는다. 첫 비동기 호출 때 `import()` 한다.
 *   vitest 는 vite.config.ts 를 읽지 않으므로 테스트에서는 별칭이 없다(sbLazy.test.ts 가 진짜와 직접 비교한다).
 *
 * 앱이 쓰는 모양(2026-10-07 전수): `supabase.storage.from(b).upload | remove | createSignedUrl`(비동기) · `.getPublicUrl(path)`(동기).
 * - 비동기 메서드는 이름과 상관없이 진짜 StorageFileApi 의 같은 메서드로 그대로 위임한다(인자·반환·오류 모양 동일).
 * - `getPublicUrl` 은 동기 반환이라 진짜를 기다릴 수 없다 → 진짜와 **같은 식**으로 문자열을 조립한다.
 *   옵션(download·transform·cacheNonce)은 지금 호출부가 없어 지원하지 않는다 — 넘기면 조용히 틀리지 않게 던진다.
 * - `throwOnError()`·`setHeader()` 같은 동기 체이닝은 지원하지 않는다(호출부 0). 필요해지면 진짜를 정적으로 쓰는 쪽으로 되돌려라.
 * 이 패키지가 다시 내보내는 `StorageApiError` 는 아래 자리표시자다 — 앱 코드에서 `instanceof` 로 쓰지 마라
 *   (sbLazy.test.ts 가 그런 import 를 막는다). 실제 오류 객체는 진짜 패키지가 만든다.
 */
import { retryableImport } from './retryImport';

type RealMod = typeof import('@supabase/storage-js/dist/index.mjs');
type RealClient = InstanceType<RealMod['StorageClient']>;
type RealFileApi = ReturnType<RealClient['from']>;
type Opts = { useNewHostname?: boolean };

// 실패해도 다음 호출이 새 주소(?r=n)로 다시 받는다(retryImport.ts).
const load = retryableImport(() => import('@supabase/storage-js/dist/index.mjs'));

export class StorageClient {
  private real?: Promise<RealClient>;
  private readonly args: [string, Record<string, string>, typeof fetch | undefined, Opts | undefined];
  /** 진짜 StorageBucketApi 생성자와 같은 정규화 — 공개 URL 조립에 쓴다. */
  private readonly base: string;

  constructor(url: string, headers: Record<string, string> = {}, fetchImpl?: typeof fetch, opts?: Opts) {
    this.args = [url, headers, fetchImpl, opts];
    const u = new URL(url);
    if (opts?.useNewHostname && /supabase\.(co|in|red)$/.test(u.hostname) && !u.hostname.includes('storage.supabase.')) {
      u.hostname = u.hostname.replace('supabase.', 'storage.supabase.');
    }
    this.base = u.href.replace(/\/$/, '');
  }

  private client(): Promise<RealClient> {
    return (this.real ??= load().then(
      (m) => new m.StorageClient(...this.args),
      (err) => { this.real = undefined; throw err; },   // 실패한 약속을 붙들지 않는다 — 다음 호출이 load() 로 다시 받는다
    ));
  }

  /** 타입은 진짜 StorageFileApi 로 둔다 — 실제로 지원하는 범위는 머리 주석. */
  from(bucket: string): RealFileApi {
    const base = this.base;
    const file = () => this.client().then((c) => c.from(bucket));
    return new Proxy({} as Record<string, unknown>, {
      get(_t, key) {
        // await 대상으로 오인되지 않게(thenable 아님)
        if (key === 'then' || typeof key !== 'string') return undefined;
        if (key === 'getPublicUrl') {
          return (path: string, options?: object) => {
            if (options && Object.keys(options).length) {
              throw new Error('sbStorageLazy: getPublicUrl 옵션은 지원하지 않는다 — src/lib/sbStorageLazy.ts 머리 주석 참고');
            }
            const p = `${bucket}/${path.replace(/^\/+/, '')}`;
            return { data: { publicUrl: encodeURI(`${base}/object/public/${p}`) } };
          };
        }
        return (...args: unknown[]) =>
          file().then((f) => (f as unknown as Record<string, (...a: unknown[]) => unknown>)[key](...args));
      },
    }) as unknown as RealFileApi;
  }
}

/** 자리표시자 — 위 머리 주석 참고. supabase-js 의 재수출 문법을 만족시키기만 한다. */
export class StorageApiError extends Error {}
