// PR #206(#205 검토 P3-5) — public/sw.js 는 /assets 응답을 **JS·CSS·폰트·이미지일 때만** 캐시에 담는다.
// 배포 공백에 옛 청크 주소로 오는 200 text/html(index.html 재작성)이 ?r=n 주소마다 쌓여 셸 자산을 밀어내던 경로를 막는다.
// 서빙되는 sw.js 원문을 그대로 vm 에 올려 fetch 처리기를 직접 부른다(베끼면 드리프트한다).
// 음성 대조: sw.js 의 CACHEABLE_TYPE 조건을 빼면 text/html 항목이 캐시에 남아 빨개진다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://nuriholdem.com';

function boot(respond: (url: string) => { status?: number; type?: string; body?: string }) {
  const store = new Map<string, unknown>();
  const handlers: Record<string, (e: unknown) => void> = {};
  const cache = {
    put: async (req: { url: string }, res: unknown) => { store.set(req.url, res); },
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (k: { url: string }) => store.delete(k.url),
    add: async () => {},
  };
  const ctx = {
    self: { addEventListener: (t: string, f: (e: unknown) => void) => { handlers[t] = f; }, location: { origin: ORIGIN } },
    caches: { open: async () => cache, match: async (req: { url: string }) => store.get(req.url), keys: async () => [] },
    fetch: async (req: { url: string }) => {
      const r = respond(req.url);
      const status = r.status ?? 200;
      const res = { ok: status >= 200 && status < 300, status, type: 'basic', headers: new Headers(r.type ? { 'content-type': r.type } : {}), clone: () => res };
      return res;
    },
    URL, Response, Headers, console, setTimeout, MessageChannel,
  };
  vm.runInNewContext(SRC, ctx);
  const get = async (path: string) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.fetch({ request: { method: 'GET', url: ORIGIN + path, mode: 'cors' }, respondWith: (p: Promise<unknown>) => { done = p; } });
    return done;
  };
  return { store, get };
}

describe('sw.js — /assets 캐시는 실제 내용 종류로 거른다', () => {
  it('배포 공백의 200 text/html(옛 청크 자리의 index.html)은 ?r=n 마다 와도 담지 않는다', async () => {
    const sw = boot(() => ({ type: 'text/html; charset=utf-8', body: '<!doctype html>' }));
    for (let n = 1; n <= 5; n++) await sw.get(`/assets/RealtimeClient-OLD.js?r=${n}`);
    await sw.get('/assets/iconsExtra-OLD.js');
    expect([...sw.store.keys()]).toEqual([]);
  });

  it('JS·CSS·폰트·이미지는 그대로 담는다(셸 캐시 동작 유지)', async () => {
    const types: Record<string, string> = {
      '/assets/index-abc.js': 'application/javascript; charset=utf-8',
      '/assets/vendor-x.js': 'text/javascript',
      '/assets/index-abc.css': 'text/css; charset=utf-8',
      '/fonts/pretendard.woff2': 'font/woff2',
      '/assets/logo-a.svg': 'image/svg+xml',
      '/icon-192.png': 'image/png',
    };
    const sw = boot((url) => ({ type: types[new URL(url).pathname] }));
    for (const p of Object.keys(types)) await sw.get(p);
    expect([...sw.store.keys()].map((u) => u.replace(ORIGIN, '')).sort()).toEqual(Object.keys(types).sort());
  });

  it('404 와 content-type 없는 응답도 담지 않는다', async () => {
    const sw = boot((url) => (url.includes('missing') ? { status: 404, type: 'text/html' } : {}));
    await sw.get('/assets/missing-1.js');
    await sw.get('/assets/notype-1.js');
    expect([...sw.store.keys()]).toEqual([]);
  });
});
