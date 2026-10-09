// 2026-10-07 번들 감축 PR B — realtime-js 대리(sbRealtimeLazy.ts)가 진짜와 **같은 소켓 프레임·같은 콜백 순서**를 내는지 직접 비교한다.
// vitest 는 vite.config.ts 의 별칭을 읽지 않으므로 여기서 '@supabase/realtime-js' 는 진짜 패키지다.
// 같은 시나리오(아래 scenario)를 진짜와 대리에 각각 돌리고, 가짜 웹소켓이 받은 프레임·가짜 서버 응답에 대한 콜백 기록을 통째로 비교한다.
import { describe, expect, it, vi } from 'vitest';
import { RealtimeClient as RealClient } from '@supabase/realtime-js';
import { RealtimeClient as LazyClient } from './sbRealtimeLazy';
import { resubscribeStatus } from './realtimeResync';

const ENDPOINT = 'wss://idsxiqspecrucvfvtgbw.supabase.co/realtime/v1';
const APIKEY = 'sb_publishable_test';
const tick = () => new Promise((r) => setTimeout(r, 0));
async function flush(n = 6) { for (let i = 0; i < n; i++) await tick(); }
async function until(fn: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(); }
}

type Msg = [string | null, string | null, string, string, Record<string, unknown>];
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** 가짜 웹소켓 + 가짜 서버. 같은 입력에 같은 응답을 같은 시점(다음 틱)에 낸다.
 *  frames = 망으로 나간 것(소켓 생성·프레임·닫기·REST 대체 전송) 순서. log = 앱이 보는 것(콜백·동기 반환값·예외) 순서. */
function makeEnv(o: { authDelayMs?: number } = {}) {
  const frames: string[] = [];
  const log: string[] = [];
  const sockets: FakeWS[] = [];
  /** 가짜 서버가 채널(topic)마다 마지막으로 받은 토큰 — join 의 access_token(없으면 apikey) 뒤 access_token 프레임으로 바뀐다. */
  const serverTok = new Map<string, string>();
  const reply = (ws: FakeWS, m: Msg) => setTimeout(() => ws.readyState === 1 && ws.onmessage?.({ data: JSON.stringify(m) }), 0);
  class FakeWS {
    readyState = 0;
    binaryType = '';
    onopen?: () => void;
    onclose?: (e: { code: number; reason?: string; wasClean?: boolean }) => void;
    onerror?: (e: unknown) => void;
    onmessage?: (e: { data: string }) => void;
    constructor(url: string) { sockets.push(this); frames.push(`ws:new ${url}`); }
    open() { this.readyState = 1; this.onopen?.(); }
    drop() { this.readyState = 3; this.onclose?.({ code: 1006, wasClean: false }); }
    close(code?: number) { this.readyState = 3; frames.push(`ws:close ${code ?? ''}`); setTimeout(() => this.onclose?.({ code: code ?? 1000, wasClean: true }), 0); }
    send(d: string | ArrayBuffer) {
      if (typeof d !== 'string') { frames.push(`bin:${hex(d)}`); return; }
      frames.push(d);
      const [joinRef, ref, topic, event, payload] = JSON.parse(d) as Msg;
      const tok = (payload as { access_token?: string }).access_token;
      if (event === 'phx_join') serverTok.set(topic, tok ?? APIKEY);
      else if (event === 'access_token') serverTok.set(topic, String(tok));
      else if (event === 'phx_leave') serverTok.delete(topic);
      if (event === 'phx_join') {
        if (topic.includes('deny')) return reply(this, [joinRef, ref, topic, 'phx_reply', { status: 'error', response: { reason: 'denied' } }]);
        if (topic.includes('slow')) return;   // 응답 없음 → TIMED_OUT
        const pc = ((payload.config as { postgres_changes?: object[] })?.postgres_changes ?? []).map((f, i) => ({ ...f, id: 100 + i }));
        reply(this, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pc } }]);
      } else if (event === 'phx_leave' || event === 'heartbeat' || event === 'presence') {
        reply(this, [joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]);
      }
    }
    push(m: Msg) { this.onmessage?.({ data: JSON.stringify(m) }); }
  }
  let token = 'anon';
  const fetchImpl = (async (url: string, init: RequestInit) => {
    frames.push(`fetch ${init.method} ${url} ${String(init.body)} auth=${new Headers(init.headers).get('Authorization')}`);
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  const options = {
    params: { apikey: APIKEY },
    transport: FakeWS as never,
    fetch: fetchImpl,
    // supabase-js _getAccessToken(getSession) 처럼 비동기 — authDelayMs 를 주면 실제처럼 타이머 한 번을 넘긴다.
    accessToken: async () => { if (o.authDelayMs) await new Promise((r) => setTimeout(r, o.authDelayMs)); return token; },
    timeout: 120,
    heartbeatIntervalMs: 600_000,
    reconnectAfterMs: () => 10,
  };
  return { frames, log, sockets, serverTok, options, setToken: (t: string) => { token = t; } };
}

type AnyClient = {
  channel(t: string, p?: object): AnyChan;
  removeChannel(c: AnyChan): Promise<unknown>;
  removeAllChannels(): Promise<unknown>;
  setAuth(t?: string | null): Promise<void>;
  getChannels(): AnyChan[];
  disconnect?: () => Promise<unknown>;
};
type AnyChan = {
  on(type: string, filter: object, cb: (p: unknown) => void): AnyChan;
  subscribe(cb?: (s: string, e?: Error) => void, timeout?: number): AnyChan;
  unsubscribe(): Promise<unknown>;
  send(a: object): Promise<unknown>;
  track(p: object): Promise<unknown>;
  presenceState(): Record<string, unknown>;
};
type Ctor = new (url: string, opts: object) => AnyClient;

/** 앱이 실제로 쓰는 모양 + presence·broadcast·토큰 갱신·로그아웃/로그인·끊김 재연결·오류·타임아웃·로드 전 제거. */
async function scenario(C: Ctor, opts: { failFirstLoad?: boolean } = {}) {
  const env = makeEnv();
  const { log } = env;
  const st = (name: string) => (s: string, e?: Error) => log.push(`${name}:${s}${e ? ` ${e.message}` : ''}`);
  const ev = (name: string) => (p: unknown) => {
    const q = p as { eventType?: string; new?: unknown; event?: string; payload?: unknown };
    log.push(`${name}:${JSON.stringify(q.eventType ? { t: q.eventType, n: q.new } : q.event ? { e: q.event, p: q.payload } : p)}`);
  };
  const tryLog = (label: string, fn: () => unknown) => { try { fn(); log.push(`${label}:ok`); } catch (e) { log.push(`${label}:throw ${(e as Error).message}`); } };
  const pg = (table: string, filter?: string) => ({ event: '*', schema: 'public', table, ...(filter ? { filter } : {}) });

  // ── 진짜가 오기 전(대리는 기록만) — 앱 부팅 순서: INITIAL_SESSION setAuth → 구독들 ──
  const c = new C(ENDPOINT, env.options);
  env.setToken('jwt-A');
  void c.setAuth('jwt-A');
  const a = c.channel('gmsg:1').on('postgres_changes', pg('group_messages', 'group_id=eq.1'), ev('a')).subscribe(st('a'));
  const dup = c.channel('gmsg:1');                                   // 같은 이름 → 같은 객체
  log.push(`dup-same:${dup === a}`);
  tryLog('dup-on-after-subscribe', () => dup.on('postgres_changes', pg('x'), ev('x')));   // 진짜는 던진다
  const b = c.channel('lm:2').on('postgres_changes', pg('listing_messages'), ev('b')).subscribe(st('b'));
  void c.removeChannel(b).then((r) => log.push(`b-removed:${String(r)}`));              // 로드 전 제거
  const b2 = c.channel('lm:2');
  log.push(`b2-new:${b2 !== b}`);
  b2.on('postgres_changes', pg('listing_messages'), ev('b2')).subscribe(st('b2'));
  const u = c.channel('u:1').subscribe(st('u'));
  void u.unsubscribe().then((r) => log.push(`u-unsub:${String(r)}`));
  tryLog('u-resubscribe', () => u.subscribe(st('u2')));               // 진짜(phoenix)는 두 번째 join 을 던진다
  const room = c.channel('room:1', { config: { presence: { key: 'me' }, broadcast: { self: false, ack: true } } })
    .on('presence', { event: 'sync' }, () => log.push(`room:sync ${JSON.stringify(room.presenceState())}`))
    .on('broadcast', { event: 'ping' }, ev('room-bc'))
    .subscribe(st('room'));
  log.push(`presence-before:${JSON.stringify(room.presenceState())}`);
  void room.send({ type: 'broadcast', event: 'ping', payload: { n: 0 } }).then((r) => log.push(`room-send0:${String(r)}`));   // join 전 → REST 대체
  c.channel('deny:1').on('postgres_changes', pg('t'), ev('deny')).subscribe(st('deny'));
  c.channel('slow:1').subscribe(st('slow'));
  log.push(`channels:${c.getChannels().length}`);

  // ── 진짜가 온 뒤 — 소켓을 열고 가짜 서버가 응답한다 ──
  await until(() => env.sockets.length > 0);
  if (opts.failFirstLoad) log.push('(loaded after failure)');
  const ws = env.sockets[0];
  ws.open();
  await flush();
  await new Promise((r) => setTimeout(r, 200));   // slow → TIMED_OUT(timeout 120)
  await flush();

  ws.push([null, null, 'realtime:gmsg:1', 'postgres_changes', {
    ids: [100], data: { schema: 'public', table: 'group_messages', type: 'INSERT', commit_timestamp: 't',
      columns: [{ name: 'id', type: 'int8' }, { name: 'content', type: 'text' }], record: { id: '7', content: 'hi' } },
  }]);
  ws.push([null, null, 'realtime:room:1', 'presence_state', { me: { metas: [{ phx_ref: 'r1', u: 1 }] } }]);
  ws.push([null, null, 'realtime:room:1', 'broadcast', { type: 'broadcast', event: 'ping', payload: { n: 1 } }]);
  void room.track({ u: 1 }).then((r) => log.push(`room-track:${String(r)}`));
  void room.send({ type: 'broadcast', event: 'ping', payload: { n: 2 } }).then((r) => log.push(`room-send2:${String(r)}`));
  await flush();

  env.setToken('jwt-B'); await c.setAuth('jwt-B'); await flush();     // TOKEN_REFRESHED
  env.setToken('anon'); await c.setAuth(); await flush();             // SIGNED_OUT
  env.setToken('jwt-C'); await c.setAuth('jwt-C'); await flush();     // SIGNED_IN(다른 계정)

  ws.drop();                                                          // 소켓 끊김 → 재연결 → 다시 join
  await until(() => env.sockets.length > 1);
  env.sockets[1].open();
  await flush(10);

  log.push(`a-removed:${String(await c.removeChannel(a))}`);
  await flush();
  log.push(`all-removed:${JSON.stringify(await c.removeAllChannels())}`);
  await flush(10);
  return { frames: env.frames, log };
}

describe('sbRealtimeLazy — 진짜와 같은 프레임·같은 콜백 순서', () => {
  it('기록·재생 시나리오(로드 전 제거·같은 이름·presence·broadcast·토큰·로그아웃/로그인·재연결·오류·타임아웃)', async () => {
    const real = await scenario(RealClient as unknown as Ctor);
    const lazy = await scenario(LazyClient as unknown as Ctor);
    // 시나리오가 실제로 뭔가를 했는지(빈 비교의 거짓 통과 방지)
    expect(real.frames.length).toBeGreaterThan(20);
    for (const s of ['a:SUBSCRIBED', 'b2:SUBSCRIBED', 'room:SUBSCRIBED', 'deny:CHANNEL_ERROR denied', 'slow:TIMED_OUT', 'b:CLOSED',
      'dup-same:true', 'b2-new:true', 'u-resubscribe:throw', 'dup-on-after-subscribe:throw', 'room-bc:', 'room:sync', 'a:{"t":"INSERT"']) {
      expect(real.log.some((l) => l.startsWith(s)), s).toBe(true);
    }
    expect(real.frames.some((f) => f.includes('"access_token"') && f.includes('jwt-B'))).toBe(true);
    expect(real.frames.some((f) => f.startsWith('bin:'))).toBe(true);
    expect(lazy.log).toEqual(real.log);
    expect(lazy.frames).toEqual(real.frames);
  }, 20_000);

  it('removeChannel·unsubscribe 는 진짜처럼 동기로 목록에서 빠진다(로드 전)', () => {
    const env = makeEnv();
    for (const C of [RealClient, LazyClient] as unknown as Ctor[]) {
      const c = new C(ENDPOINT, env.options);
      const x = c.channel('x').subscribe();
      void c.removeChannel(x);
      const y = c.channel('y');
      void y.unsubscribe();
      expect(c.getChannels().length).toBe(0);
      void c.removeAllChannels();
    }
  });

  it('apikey 가 없으면 진짜처럼 생성자에서 던진다', () => {
    expect(() => new LazyClient(ENDPOINT, {} as never)).toThrow('API key is required to connect to Realtime');
    expect(() => new RealClient(ENDPOINT, {} as never)).toThrow('API key is required to connect to Realtime');
  });
});

// 위 동일성 시험의 기준은 '소켓이 아직 안 열린 진짜'다 — 재생 충실도(프레임·콜백 순서)는 그걸로 보지만, 토큰은 그 기준이 같은 틈을 가져
// 못 본다(PR #206 critical P2-1: 진짜도 소켓이 늦으면 join 이 옛 토큰으로 굳는다). 그래서 토큰은 **로드된 진짜에 같은 호출을 실시간으로
// 보낸 결과**(소켓이 첫 subscribe 직후 열림 · 로그아웃은 끝난 뒤 다음 화면)와 서버가 아는 채널 토큰을 비교한다.
// 음성 대조: sbRealtimeLazy.ts 의 setAuth 를 ops 큐로 되돌리면(순서대로 재생) 세 시험 모두 빨개진다.
describe('sbRealtimeLazy — 로드 전 토큰 변경이 서버 채널에 반영된다(진짜 실시간 기준)', () => {
  const pg = (table: string, filter?: string) => ({ event: '*', schema: 'public', table, ...(filter ? { filter } : {}) });
  type Env = ReturnType<typeof makeEnv>;
  /** live=진짜를 실시간으로(소켓이 첫 subscribe 직후 열린다). 대리는 소켓이 로드 뒤에야 생기므로 끝에 연다. */
  async function run(C: Ctor, live: boolean, steps: (c: AnyClient, env: Env, openNow: () => Promise<void>) => Promise<void>) {
    const env = makeEnv({ authDelayMs: 1 });
    const c = new C(ENDPOINT, env.options);
    const openNow = async () => { if (!live) return; await until(() => env.sockets.length > 0); env.sockets[0].open(); await flush(); };
    await steps(c, env, openNow);
    await until(() => env.sockets.length > 0);
    if (env.sockets[0].readyState === 0) env.sockets[0].open();
    await flush(20);
    return { serverTok: Object.fromEntries(env.serverTok), frames: env.frames };
  }

  it('로그아웃 → 다른 계정(B) 로그인: 서버 채널은 B', async () => {
    const steps = async (c: AnyClient, env: Env, openNow: () => Promise<void>) => {
      env.setToken('jwt-A'); void c.setAuth('jwt-A');                     // INITIAL_SESSION(A)
      c.channel('ledger:venueA:r1').on('postgres_changes', pg('ledger_entries', 'venue_id=eq.A'), () => {}).subscribe();
      await openNow();
      env.setToken(APIKEY); void c.setAuth();                              // SIGNED_OUT
      env.setToken('jwt-B'); void c.setAuth('jwt-B');                      // SIGNED_IN(B)
    };
    const real = await run(RealClient as unknown as Ctor, true, steps);
    const lazy = await run(LazyClient as unknown as Ctor, false, steps);
    expect(real.serverTok).toEqual({ 'realtime:ledger:venueA:r1': 'jwt-B' });
    expect(lazy.serverTok).toEqual(real.serverTok);
  });

  it('첫 join 전 토큰 갱신(A1 → A2): 서버 채널은 A2', async () => {
    const steps = async (c: AnyClient, env: Env, openNow: () => Promise<void>) => {
      env.setToken('jwt-A1'); void c.setAuth('jwt-A1');
      c.channel('notif:A').on('postgres_changes', pg('notifications', 'user_id=eq.A'), () => {}).subscribe();
      await openNow();
      env.setToken('jwt-A2'); void c.setAuth('jwt-A2');                    // TOKEN_REFRESHED
    };
    const real = await run(RealClient as unknown as Ctor, true, steps);
    const lazy = await run(LazyClient as unknown as Ctor, false, steps);
    expect(real.serverTok).toEqual({ 'realtime:notif:A': 'jwt-A2' });
    expect(lazy.serverTok).toEqual(real.serverTok);
  });

  it('로그아웃 뒤 새로 만든 채널은 익명(apikey)으로 join 한다 — 로그아웃한 A 의 토큰이 나가지 않는다', async () => {
    const steps = (awaitLogout: boolean) => async (c: AnyClient, env: Env) => {
      env.setToken('jwt-A'); void c.setAuth('jwt-A');
      env.setToken(APIKEY); const out = c.setAuth();                       // SIGNED_OUT
      if (awaitLogout) await out;   // 진짜: 로그아웃이 끝난 뒤 사용자가 홈으로 간다(대리는 로드 전이라 기다리면 영영 안 풀린다)
      c.channel('schedules_all_r').on('postgres_changes', pg('schedules'), () => {}).subscribe();
    };
    const real = await run(RealClient as unknown as Ctor, true, steps(true));
    const lazy = await run(LazyClient as unknown as Ctor, false, steps(false));
    expect(real.serverTok).toEqual({ 'realtime:schedules_all_r': APIKEY });
    expect(lazy.serverTok).toEqual(real.serverTok);
    expect(lazy.frames.filter((f) => f.includes('jwt-A')), '로그아웃한 토큰이 망으로 나갔다').toEqual([]);
  });

  it('토큰을 기다리는 동안 들어온 호출(새 setAuth·채널)도 큐로 가서 마지막 토큰으로 붙는다', async () => {
    const env = makeEnv({ authDelayMs: 5 });
    const c = new LazyClient(ENDPOINT, env.options) as unknown as AnyClient;
    env.setToken('jwt-A'); void c.setAuth();                              // 로드 시점에 아직 진행 중일 비동기 토큰
    c.channel('x').on('postgres_changes', pg('x'), () => {}).subscribe();
    await new Promise((r) => setTimeout(r, 1));                            // 로드는 끝났고 토큰은 기다리는 중
    env.setToken('jwt-B'); void c.setAuth('jwt-B');
    c.channel('y').on('postgres_changes', pg('y'), () => {}).subscribe();
    await until(() => env.sockets.length > 0);
    env.sockets[0].open();
    await flush(20);
    expect(Object.fromEntries(env.serverTok)).toEqual({ 'realtime:x': 'jwt-B', 'realtime:y': 'jwt-B' });
  });
});

describe('sbRealtimeLazy — 청크를 못 받으면', () => {
  it('구독 콜백에 CHANNEL_ERROR 를 주고, 다시 받아 재생하면 진짜와 같은 프레임으로 붙는다', async () => {
    const real = await scenario(RealClient as unknown as Ctor);
    vi.resetModules();
    let failOnce = true;
    vi.doMock('@supabase/realtime-js/dist/module/RealtimeClient.js', async (orig) => {
      if (failOnce) { failOnce = false; throw new Error('Failed to fetch dynamically imported module'); }
      return orig();
    });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { RealtimeClient: Fresh } = await import('./sbRealtimeLazy');
      const lazy = await scenario(Fresh as unknown as Ctor, { failFirstLoad: true });
      // 실패 때 join 중이던 채널(a·b2·room·deny·slow)만 CHANNEL_ERROR — 그 뒤는 진짜와 똑같다.
      const failed = lazy.log.slice(0, lazy.log.indexOf('(loaded after failure)')).filter((l) => l.includes(':CHANNEL_ERROR'));
      expect(failed.map((l) => l.split(':')[0]).sort()).toEqual(['a', 'b2', 'deny', 'room', 'slow']);
      expect(errs).toHaveBeenCalled();
      expect(lazy.log.filter((l) => !failed.includes(l) && l !== '(loaded after failure)')).toEqual(real.log);
      expect(lazy.frames).toEqual(real.frames);
    } finally {
      errs.mockRestore();
      vi.doUnmock('@supabase/realtime-js/dist/module/RealtimeClient.js');
    }
  }, 20_000);

  it('CHANNEL_ERROR 뒤 복구된 SUBSCRIBED 에 resubscribeStatus 가 재조회한다(끊긴 동안의 변경, PR #206 P3-1)', async () => {
    vi.resetModules();
    let failOnce = true;
    vi.doMock('@supabase/realtime-js/dist/module/RealtimeClient.js', async (orig) => {
      if (failOnce) { failOnce = false; throw new Error('Failed to fetch dynamically imported module'); }
      return orig();
    });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { RealtimeClient: Fresh } = await import('./sbRealtimeLazy');
      const env = makeEnv();
      const c = new Fresh(ENDPOINT, env.options as never) as unknown as AnyClient;
      void c.setAuth('jwt-A');
      let reloads = 0;
      const statuses: string[] = [];
      const rs = resubscribeStatus(() => { reloads++; });
      c.channel('clock:A:r').on('postgres_changes', { event: '*', schema: 'public', table: 'clock_states' }, () => {})
        .subscribe((s) => { statuses.push(s); rs(s); });
      await until(() => env.sockets.length > 0, 4000);   // 재시도 타이머(1초) 뒤 로드
      env.sockets[0].open();
      await flush(20);
      expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
      expect(reloads, '복구 SUBSCRIBED 에 재조회가 없다').toBe(1);
    } finally {
      errs.mockRestore();
      vi.doUnmock('@supabase/realtime-js/dist/module/RealtimeClient.js');
    }
  }, 10_000);
});

describe('sbRealtimeLazy — 재시도는 20번 뒤에도 끊지 않는다(무인 클락 TV)', () => {
  it('항상 실패: 빠른 20번 뒤 보이는 동안 60초 간격, 숨김이면 0회, 보이면 즉시', async () => {
    class FakeDoc extends EventTarget { visibilityState = 'visible'; }
    const g = globalThis as Record<string, unknown>;
    const doc = new FakeDoc();
    g.document = doc;
    g.window = new EventTarget();
    const io = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.resetModules();
    let attempts = 0;
    vi.doMock('@supabase/realtime-js/dist/module/RealtimeClient.js', () => { attempts++; throw new Error('chunk 404'); });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { RealtimeClient: Fresh } = await import('./sbRealtimeLazy');
      const c = new Fresh(ENDPOINT, makeEnv().options as never);
      c.channel('clock:tv').on('postgres_changes', { event: '*', schema: 'public', table: 'clock_states' }, () => {}).subscribe();
      await io();
      expect(attempts).toBe(1);
      const fast = [1, 2, 4, 8, 16, ...Array(15).fill(30)].map((s) => s * 1000);   // limit 20 · cap 30초
      for (const ms of fast) { vi.advanceTimersByTime(ms); await io(); }
      expect(attempts).toBe(21);
      vi.advanceTimersByTime(59_999); await io();
      expect(attempts, '상한 뒤 60초 전에는 안 부른다').toBe(21);
      vi.advanceTimersByTime(1); await io();
      expect(attempts, '상한 뒤에도 60초에 다시').toBe(22);
      vi.advanceTimersByTime(60_000); await io();
      expect(attempts).toBe(23);
      doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(10 * 60_000); await io();
      expect(attempts, '숨김 동안 0회').toBe(23);
      doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); await io();
      expect(attempts, '보이자마자 1회').toBe(24);
    } finally {
      errs.mockRestore();
      vi.useRealTimers();
      vi.doUnmock('@supabase/realtime-js/dist/module/RealtimeClient.js');
      delete g.document;
      delete g.window;
    }
  });
});
