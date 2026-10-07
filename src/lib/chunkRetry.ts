/**
 * 나중 청크(동적 import)를 못 받았을 때 언제 다시 부를지 — iconsExtraLoader.ts·sbRealtimeLazy.ts 공용(2026-10-07 PR #206).
 *
 * 일정: 처음 `limit` 번은 1초부터 두 배씩(최대 `cap`), 그 뒤는 **문서가 보이는 동안 60초마다 계속**.
 *   끊지 않는 이유: 무인 클락 TV 는 클릭·화면 복귀 같은 계기가 없다 — 상한에서 멈추면 그 화면은 영영 안 붙는다(리드 판단 10-07).
 *   숨김 상태면 타이머를 멈추고, 다시 보이면 즉시 1회 부른 뒤 같은 일정으로 돈다.
 *   그 밖의 계기: online · 화면 클릭(capture) — 사람이 돌아온 순간 기다리지 않게.
 * 재시도 주소는 호출부가 ?r=n 으로 바꾼다(실패한 동적 import 는 같은 주소로는 다시 안 받힌다 — iconsExtraLoader.ts 머리 주석).
 * 배포 공백에 옛 청크 자리로 오는 index.html 이 ?r=n 주소마다 SW 캐시에 쌓이던 문제는 public/sw.js 가 content-type 으로 막는다.
 */
export const SLOW_RETRY_MS = 60_000;

type Win = { addEventListener(t: string, f: () => void, o?: object): void };
type Doc = Win & { visibilityState?: string };

export interface ChunkRetry {
  /** 이번 시도가 실패했다 — 다음 시도를 예약하고(처음이면) 계기 이벤트를 건다. */
  failed(): void;
  /** 받았다 — 예약을 지운다. */
  done(): void;
}

/** `retry` 는 '아직 못 받았으면 다시 받기' 여야 한다(받은 뒤 계기 이벤트가 와도 아무것도 안 하게). */
export function chunkRetry(retry: () => void, opts: { limit: number; cap: number }): ChunkRetry {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let n = 0;
  let armed = false;
  let pending = false;   // 실패 뒤 아직 받지 못한 상태
  const doc = (): Doc | undefined => (globalThis as { document?: Doc }).document;
  const hidden = () => doc()?.visibilityState === 'hidden';
  const fire = () => { clearTimeout(timer); timer = undefined; retry(); };
  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    if (hidden()) return;   // 보일 때 visibilitychange 가 다시 시작한다
    const ms = n < opts.limit ? Math.min(1000 * 2 ** n, opts.cap) : SLOW_RETRY_MS;
    n++;
    timer = setTimeout(fire, ms);
  };
  const arm = () => {
    const w = (globalThis as { window?: Win }).window;
    const d = doc();
    if (armed || !w || !d) return;
    armed = true;
    w.addEventListener('online', () => { if (pending) fire(); });
    d.addEventListener('click', () => { if (pending) fire(); }, { capture: true, passive: true });
    d.addEventListener('visibilitychange', () => {
      if (!pending) return;
      if (hidden()) { clearTimeout(timer); timer = undefined; } else fire();
    });
  };
  return {
    failed() { pending = true; arm(); schedule(); },
    done() { pending = false; clearTimeout(timer); timer = undefined; },
  };
}
