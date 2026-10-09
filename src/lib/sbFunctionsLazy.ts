/**
 * `@supabase/functions-js` 의 대리 — 엣지 함수 클라이언트를 첫 `invoke` 때 불러온다(2026-10-07 번들 감축 PR A ①).
 * 구조·이유는 sbStorageLazy.ts 머리 주석과 같다(vite.config.ts 의 `resolve.alias` 가 이 파일로 돌린다).
 *
 * supabase-js 는 `supabase.functions` 를 읽을 때마다 `new FunctionsClient(url, { headers, customFetch })` 를 만든다.
 * 인증 헤더(apikey·Authorization)는 그 `customFetch`(supabase-js 의 fetchWithAuth)가 붙이므로, 같은 인자로 진짜
 * FunctionsClient 를 만들어 `invoke` 를 위임하면 요청이 그대로 같다(sbLazy.test.ts 가 헤더를 비교한다).
 * 오류 클래스는 작은 types 모듈에서 진짜를 그대로 다시 내보낸다(FunctionsHttpError 의 context 등 모양 동일).
 */
import { retryableImport } from './retryImport';

export {
  FunctionsError,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  FunctionRegion,
} from '@supabase/functions-js/dist/module/types.js';

type RealMod = typeof import('@supabase/functions-js/dist/module/FunctionsClient.js');
type RealClient = InstanceType<RealMod['FunctionsClient']>;

// 실패해도 다음 호출이 새 주소(?r=n)로 다시 받는다(retryImport.ts — 같은 주소 재시도는 브라우저가 실패를 캐시해 영영 못 받는다).
const load = retryableImport(() => import('@supabase/functions-js/dist/module/FunctionsClient.js'));

type Opts = ConstructorParameters<RealMod['FunctionsClient']>[1];

export class FunctionsClient {
  private readonly url: string;
  private readonly opts: Opts;
  constructor(url: string, opts: Opts = {}) {
    this.url = url;
    this.opts = opts;
  }

  async invoke(...args: Parameters<RealClient['invoke']>): ReturnType<RealClient['invoke']> {
    const { FunctionsClient: Real } = await load();
    return new Real(this.url, this.opts).invoke(...args);
  }
}
