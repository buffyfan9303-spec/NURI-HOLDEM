// 2026-10-07 번들 감축 PR A ① — storage-js·functions-js 대리가 진짜와 **같은 요청·같은 URL** 을 내는지 직접 비교한다.
// vitest 는 vite.config.ts 의 별칭을 읽지 않으므로 여기서 '@supabase/…' 는 진짜 패키지다.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StorageClient as RealStorage } from '@supabase/storage-js';
import { FunctionsClient as RealFunctions } from '@supabase/functions-js';
import { StorageClient as LazyStorage } from './sbStorageLazy';
import { FunctionsClient as LazyFunctions } from './sbFunctionsLazy';

const URL_ = 'https://idsxiqspecrucvfvtgbw.supabase.co/storage/v1';
const HEADERS = { 'X-Client-Info': 'supabase-js-web/2.112.3' };

type Rec = { url: string; method?: string; headers: [string, string][]; body: string };
async function snap(input: RequestInfo | URL, init?: RequestInit): Promise<Rec> {
  const h = new Headers(init?.headers);
  const b = init?.body;
  const body = b instanceof Blob ? `blob:${b.type}:${await b.text()}` : typeof b === 'string' ? b : b == null ? '' : `[${Object.prototype.toString.call(b)}]`;
  return { url: String(input), method: init?.method, headers: [...h.entries()].sort(), body };
}
function recorder() {
  const calls: Rec[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(await snap(input, init));
    return new Response(JSON.stringify({ Key: 'k', Id: 'i', ok: true, signedURL: '/object/sign/x?token=t' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('sbStorageLazy — getPublicUrl 은 진짜와 같은 문자열', () => {
  const paths = ['ads/1-abc.webp', '/lead/slash.png', '//double/x.jpg', '한글 파일 (1).jpg', 'a b/c%20d.png', 'v/1#2?3.png'];
  for (const opts of [undefined, { useNewHostname: true }]) {
    for (const base of [URL_, `${URL_}/`]) {
      it(`${base} ${JSON.stringify(opts ?? {})}`, () => {
        const real = new RealStorage(base, HEADERS, undefined, opts);
        const lazy = new LazyStorage(base, HEADERS, undefined, opts);
        for (const p of paths) {
          expect(lazy.from('clock_bg').getPublicUrl(p)).toEqual(real.from('clock_bg').getPublicUrl(p));
        }
      });
    }
  }
  it('옵션을 넘기면 조용히 틀리지 않고 던진다', () => {
    const lazy = new LazyStorage(URL_, HEADERS);
    expect(() => lazy.from('b').getPublicUrl('x.png', { download: true })).toThrow(/옵션/);
  });
  it('await 대상(thenable)이 아니다', () => {
    expect((new LazyStorage(URL_, HEADERS).from('b') as { then?: unknown }).then).toBeUndefined();
  });
});

describe('sbStorageLazy — 비동기 메서드는 진짜와 같은 요청을 낸다', () => {
  it('upload · remove · createSignedUrl', async () => {
    const a = recorder();
    const b = recorder();
    const real = new RealStorage(URL_, HEADERS, a.fetchImpl).from('posters');
    const lazy = new LazyStorage(URL_, HEADERS, b.fetchImpl).from('posters');
    const blob = () => new Blob(['img'], { type: 'image/webp' });
    const opts = { contentType: 'image/webp', upsert: true, cacheControl: '31536000' };
    const r1 = await real.upload('u/1.webp', blob(), opts);
    const l1 = await lazy.upload('u/1.webp', blob(), opts);
    expect(l1).toEqual(r1);
    await real.remove(['u/1.webp']);
    await lazy.remove(['u/1.webp']);
    expect(await lazy.createSignedUrl('u/1.webp', 300)).toEqual(await real.createSignedUrl('u/1.webp', 300));
    expect(b.calls).toEqual(a.calls);
    expect(a.calls.map((c) => c.method)).toEqual(['POST', 'DELETE', 'POST']);
  });
});

describe('sbFunctionsLazy — invoke 는 진짜와 같은 요청(인증 헤더 포함)을 낸다', () => {
  it('customFetch·headers 를 그대로 넘긴다', async () => {
    const a = recorder();
    const b = recorder();
    const furl = 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1';
    // supabase-js 의 fetchWithAuth 를 흉내 — Authorization 을 customFetch 가 붙인다.
    const withAuth = (f: typeof fetch): typeof fetch => (input, init) => {
      const h = new Headers(init?.headers);
      h.set('apikey', 'sb_publishable_x');
      h.set('Authorization', 'Bearer user-jwt');
      return f(input, { ...init, headers: h });
    };
    const real = new RealFunctions(furl, { headers: { ...HEADERS }, customFetch: withAuth(a.fetchImpl) });
    const lazy = new LazyFunctions(furl, { headers: { ...HEADERS }, customFetch: withAuth(b.fetchImpl) });
    const body = { body: { userId: 'u1', kind: 'warn' } };
    const r = await real.invoke('notify-sanction', body);
    const l = await lazy.invoke('notify-sanction', body);
    expect(l).toEqual(r);
    expect(b.calls).toEqual(a.calls);
    expect(b.calls[0].headers).toContainEqual(['authorization', 'Bearer user-jwt']);
  });
});

describe('대리 별칭 계약', () => {
  const cfg = readFileSync(join(__dirname, '../../vite.config.ts'), 'utf8');
  it('vite.config.ts 가 두 이름을 대리로 돌리고, manualChunks 가 진짜를 첫 화면 청크에 묶지 않는다', () => {
    expect(cfg).toMatch(/find: \/\^@supabase\\\/storage-js\$\/, replacement: [^\n]*sbStorageLazy\.ts/);
    expect(cfg).toMatch(/find: \/\^@supabase\\\/functions-js\$\/, replacement: [^\n]*sbFunctionsLazy\.ts/);
    expect(cfg).toMatch(/@supabase\/storage-js'\) \|\| id\.includes\('@supabase\/functions-js'\)\) return;/);
  });
  it('앱 코드는 storage·functions 패키지나 StorageApiError(대리의 자리표시자 — instanceof 가 늘 거짓)를 직접 import 하지 않는다', () => {
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(n) || /^sb(Storage|Functions)Lazy\.ts$|^sbLazy\.test\.ts$/.test(n)) continue;
        const s = readFileSync(p, 'utf8');
        if (/from '@supabase\/(storage|functions)-js/.test(s)) bad.push(`${p}: 패키지 직접 import`);
        if (/import\s*\{[^}]*\bStorageApiError\b[^}]*\}\s*from '@supabase\/supabase-js'/.test(s)) {
          bad.push(`${p}: StorageApiError(자리표시자) import`);
        }
      }
    };
    walk(join(__dirname, '..'));
    expect(bad).toEqual([]);
  });
});
