/**
 * `@supabase/realtime-js` 의 대리 — 실시간 코드(realtime-js + phoenix, gz 약 15KB)를 첫 `channel()` 때 불러온다
 * (2026-10-07 번들 감축 PR B). 구조는 sbStorageLazy.ts 와 같다: vite.config.ts 의 `resolve.alias` 가 supabase-js 의
 * `import { RealtimeClient } from '@supabase/realtime-js'` 만 이 파일로 돌리고, 진짜는 하위 경로로 불러 별칭에 다시 걸리지 않는다.
 * vitest 는 별칭이 없다 — sbRealtimeLazy.test.ts 가 같은 시나리오를 진짜와 이 대리에 돌려 소켓 프레임·콜백 순서를 비교한다.
 *
 * 어떻게 같게 만드나 — **기록했다가 같은 순서로 재생한다.**
 *   진짜가 오기 전의 호출(channel·on·subscribe·send·unsubscribe·removeChannel·setAuth …)은 전부 한 줄 큐에 쌓고,
 *   진짜가 오면 같은 인자·같은 순서로 진짜에 그대로 부른다. 그 뒤로는 모든 호출을 진짜로 바로 넘긴다
 *   (`supabase.channel()` 도 그때부터는 진짜 채널을 돌려준다). 콜백·상태·프레임은 전부 진짜가 만든다.
 *   대리가 스스로 흉내 내는 것은 **동기 반환값과 동기 예외** 뿐이다 — "소켓이 아직 안 열린 진짜"와 같게:
 *   ① 같은 이름 채널은 같은 객체(진짜 channel() 의 topic 재사용) ② subscribe 뒤 presence·postgres_changes 의 on() 은 던진다
 *   ③ 닫힌 채널을 다시 subscribe 하면 던진다 ④ 아직 join 전인 채널의 unsubscribe·removeChannel 은 그 자리에서 목록에서 빠진다
 *   ⑤ presenceState() 는 빈 객체. 재생 중 진짜가 다르게 굴면(예측과 다른 예외) 조용히 넘기지 않고 보고한다.
 *   진짜 setAuth 는 세대 번호로 마지막 호출이 이긴다 — 순서를 지켜 재생하므로 결과가 같다.
 *
 * 청크를 못 받으면(망 흔들림·배포 공백): 구독 중인 채널 콜백에 'CHANNEL_ERROR' 를 준다(진짜도 소켓이 실패하면 같은 상태를 준다 —
 *   채팅은 이걸 보고 폴링으로 돌아간다). 그리고 **다른 주소(?r=n)** 로 다시 받는다 — 브라우저는 실패한 동적 import 를
 *   같은 주소로는 다시 받지 않는다(iconsExtraLoader.ts 머리 주석, PR #205 실측). 계기: 타이머(src/lib/chunkRetry.ts) · online · 화면 복귀 · 클릭.
 *   받으면 쌓인 호출을 재생해 진짜 'SUBSCRIBED' 가 온다. 실패는 console.error + reportError(client_errors·Sentry)로 남긴다.
 *
 * 앱이 쓰는 모양(2026-10-07 전수, 24곳): `supabase.channel(name).on('postgres_changes', …).subscribe(cb?)` · `supabase.removeChannel(ch)`.
 * 여기 없는 채널 멤버(state 외 내부 필드)는 진짜가 오기 전엔 없다 — 새로 쓰려면 아래 LazyChannel 에 추가하고 테스트에 넣어라.
 */
import { chunkRetry } from './chunkRetry';

type RealMod = typeof import('@supabase/realtime-js/dist/module/RealtimeClient.js');
type RealClient = InstanceType<RealMod['default']>;
type RealChannel = ReturnType<RealClient['channel']>;
type Opts = ConstructorParameters<RealMod['default']>[1];
type StatusCb = (status: string, err?: Error) => void;
/** subscribe 콜백 하나 — pre: 진짜가 오기 전에 대리가 먼저 준 'CLOSED' 수(재생 때 진짜가 같은 수만큼 다시 주면 삼킨다). */
type Reg = { cb: StatusCb; pre: number };
type Op = (r: RealClient) => void;

// 진입을 RealtimeClient 파일로 — 청크 이름이 'RealtimeClient-<해시>.js' 가 된다(e2e/realtime-chunk-retry.spec.ts 가 이 이름으로 막는다).
const importReal = () => import('@supabase/realtime-js/dist/module/RealtimeClient.js');
let mod: Promise<RealMod> | undefined;
let fails = 0;

/** 재시도 주소 — iconsExtraLoader.ts 의 retryUrl 과 같은 방법(빌드가 importReal 본문에 써 넣은 해시 청크 이름을 읽는다). */
function retryUrl(): string | undefined {
  const m = /import\(\s*["'`]([^"'`]+)["'`]/.exec(String(importReal));
  return m ? `${new URL(m[1], import.meta.url).href}?r=${fails}` : undefined;
}

function load(): Promise<RealMod> {
  const url = fails ? retryUrl() : undefined;
  return (mod ??= (url ? (import(/* @vite-ignore */ url) as ReturnType<typeof importReal>) : importReal()).catch((err) => {
    mod = undefined;
    fails++;
    throw err;
  }));
}

/** 콘솔 + 전역 오류 경로(reportError → errorLog 의 client_errors·Sentry). toServer=false 는 콘솔만(같은 실패의 반복). */
function report(msg: string, err?: unknown, toServer = true) {
  console.error(`[realtime] ${msg}`, err);
  if (!toServer) return;
  const g = globalThis as { reportError?: (e: unknown) => void };
  try { g.reportError?.(new Error(`[realtime] ${msg}${err instanceof Error ? ` — ${err.message}` : ''}`)); } catch { /* 보고 실패는 무시 */ }
}

const PREFIX = 'realtime:';

class LazyChannel {
  real?: RealChannel;
  /** 진짜가 오기 전 상태 — 'closed' | 'joining'. */
  private st: 'closed' | 'joining' = 'closed';
  private joinedOnce = false;
  private regs: Reg[] = [];
  readonly topic: string;
  private readonly client: RealtimeClient;

  constructor(topic: string, client: RealtimeClient) {
    this.topic = topic;
    this.client = client;
  }

  get state(): string { return this.real ? this.real.state : this.st; }

  on(type: string, filter: unknown, callback: unknown): this {
    if (this.real) {
      (this.real.on as (...a: unknown[]) => unknown)(type, filter, callback);
      return this;
    }
    // ② 진짜와 같은 조건 — subscribe 뒤(joining) presence·postgres_changes 는 붙일 수 없다.
    const throws = this.st === 'joining' && (type === 'presence' || type === 'postgres_changes');
    this.client.queue(() => (this.real!.on as (...a: unknown[]) => unknown)(type, filter, callback), throws);
    if (throws) throw new Error(`cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    return this;
  }

  subscribe(callback?: StatusCb, timeout?: number): this {
    if (this.real) {
      this.real.subscribe(callback, timeout);
      return this;
    }
    let throws = false;
    let cb = callback;
    if (this.st === 'closed') {
      // 진짜는 닫힌 채널이면 콜백을 먼저 등록하고 join 한다. ③ phoenix join 은 한 채널 객체에 한 번만 — 두 번째는 등록 뒤 던진다.
      if (callback) {
        const reg: Reg = { cb: callback, pre: 0 };
        this.regs.push(reg);
        cb = (s, e) => { if (s === 'CLOSED' && reg.pre > 0) { reg.pre--; return; } reg.cb(s, e); };
      }
      if (this.joinedOnce) throws = true;
      else { this.joinedOnce = true; this.st = 'joining'; }
    }
    this.client.queue(() => this.real!.subscribe(cb, timeout), throws);
    if (throws) throw new Error("tried to join multiple times. 'join' can only be called a single time per channel instance");
    return this;
  }

  presenceState(): Record<string, unknown> {
    return this.real ? this.real.presenceState() : {};
  }

  send(...a: Parameters<RealChannel['send']>) { return this.call((c) => c.send(...a)); }
  track(...a: Parameters<RealChannel['track']>) { return this.call((c) => c.track(...a)); }
  untrack(...a: Parameters<RealChannel['untrack']>) { return this.call((c) => c.untrack(...a)); }
  httpSend(...a: Parameters<RealChannel['httpSend']>) { return this.call((c) => c.httpSend(...a)); }

  unsubscribe(timeout?: number) {
    if (!this.real) this.client.closed(this);   // ④
    return this.call((c) => c.unsubscribe(timeout));
  }

  private call<T>(fn: (c: RealChannel) => Promise<T>): Promise<T> {
    return this.real ? fn(this.real) : this.client.queueAsync(() => fn(this.real!));
  }

  /** @internal ④ 진짜가 오기 전의 unsubscribe·removeChannel — join 전인 진짜는 그 자리에서 닫히며(phoenix leave → close 동기 발화)
   *  등록된 subscribe 콜백에 'CLOSED' 를 준다. 같은 순간에 주고, 재생 때 진짜가 다시 주는 같은 'CLOSED' 는 위 래퍼가 삼킨다. */
  markClosed() {
    this.st = 'closed';
    for (const r of this.regs) { r.pre++; r.cb('CLOSED'); }
  }
  /** @internal 청크 실패 — join 중이던 채널에 진짜(소켓 실패)와 같은 상태를 알린다. */
  failed(err: Error) { if (this.st === 'joining') this.regs.forEach((r) => r.cb('CHANNEL_ERROR', err)); }
}

export class RealtimeClient {
  private real?: RealClient;
  private ops: Op[] = [];
  private loading = false;
  /** 진짜 client.channels 의 거울 — 진짜가 오기 전에만 쓴다. */
  private chans: LazyChannel[] = [];
  // ponytail: 20번 빠르게(최대 30초 간격), 그 뒤는 보이는 동안 60초마다 계속 — 무인 TV 도 결국 붙는다. 배포 공백 탭은 1분에 1건씩 두드린다.
  private readonly again = chunkRetry(() => { if (!this.real) this.boot(); }, { limit: 20, cap: 30_000 });
  private readonly endPoint: string;
  private readonly options: Opts;

  constructor(endPoint: string, options: Opts) {
    // 진짜 생성자와 같은 동기 검사
    if (!options?.params?.apikey) throw new Error('API key is required to connect to Realtime');
    this.endPoint = endPoint;
    this.options = options;
  }

  channel(topic: string, params: Parameters<RealClient['channel']>[1] = { config: {} }): RealChannel {
    if (this.real) return this.real.channel(topic, params);
    const t = `${PREFIX}${topic}`;
    let ch = this.chans.find((c) => c.topic === t);   // ① 같은 topic 은 같은 객체
    if (!ch) { ch = new LazyChannel(t, this); this.chans.push(ch); }
    const lazy = ch;
    this.queue((r) => {
      const got = r.channel(topic, params);
      if (lazy.real && lazy.real !== got) report(`재생 불일치 — ${t} 가 다른 채널로 풀렸다`);
      lazy.real = got;
    });
    this.boot();
    return lazy as unknown as RealChannel;
  }

  getChannels(): RealChannel[] {
    return this.real ? this.real.getChannels() : (this.chans as unknown as RealChannel[]);
  }

  removeChannel(channel: RealChannel) {
    if (this.real) return this.real.removeChannel(unwrap(channel));
    const lazy = channel as unknown as LazyChannel;
    this.closed(lazy);
    return this.queueAsync((r) => r.removeChannel(unwrap(channel)));
  }

  removeAllChannels() {
    if (this.real) return this.real.removeAllChannels();
    [...this.chans].forEach((c) => this.closed(c));
    const p = this.queueAsync((r) => r.removeAllChannels());
    this.boot();
    return p;
  }

  setAuth(token?: string | null): Promise<void> {
    // 부팅 때마다 불린다(INITIAL_SESSION) — 이것만으로는 청크를 받지 않는다. 채널이 생기면 순서대로 재생된다.
    return this.real ? this.real.setAuth(token) : this.queueAsync((r) => r.setAuth(token));
  }

  /** @internal 진짜가 오기 전 호출을 쌓는다. throws=동기 예외를 이미 호출부에 던졌다(재생 때도 같은 예외가 나야 정상). */
  queue(op: Op, throws = false) {
    this.ops.push((r) => {
      let threw: unknown;
      try { op(r); } catch (e) { threw = e ?? new Error('throw'); }
      if (!!threw !== throws) report(`재생 불일치 — 예상 예외 ${throws}, 실제 ${String(threw)}`, threw);
    });
  }

  /** @internal 비동기 호출 — 재생 때 진짜가 돌려준 결과로 풀린다. */
  queueAsync<T>(fn: (r: RealClient) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.ops.push((r) => { try { fn(r).then(resolve, reject); } catch (e) { reject(e); } });
    });
  }

  /** @internal ④ 아직 join 전인 진짜 채널은 unsubscribe 순간 닫히고 목록에서 빠진다(phoenix leave → close 동기 발화). */
  closed(ch: LazyChannel) {
    // 진짜와 같은 순서 — 목록에서 먼저 빠지고(_remove) 그다음 subscribe 콜백의 'CLOSED'.
    this.chans = this.chans.filter((c) => c.topic !== ch.topic);
    ch.markClosed();
  }

  private boot() {
    if (this.real || this.loading) return;
    this.loading = true;
    load().then(
      (m) => {
        this.again.done();
        const r = new m.default(this.endPoint, this.options);
        this.real = r;
        this.chans = [];
        // 재생 중 콜백이 대리를 다시 부르면 진짜로 바로 간다(this.real 이 이미 있다). 큐에 새로 붙는 것도 끝까지 비운다.
        while (this.ops.length) this.ops.shift()!(r);
      },
      (err: Error) => {
        this.loading = false;
        report('실시간 모듈을 받지 못했다 — 다른 주소로 다시 받는다', err, fails === 1);
        this.chans.forEach((c) => c.failed(err));
        this.again.failed();
      },
    );
  }
}

function unwrap(ch: RealChannel): RealChannel {
  const c: unknown = ch;
  return c instanceof LazyChannel ? c.real! : ch;
}
