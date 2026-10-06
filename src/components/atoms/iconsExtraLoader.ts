// src/components/atoms/iconsExtraLoader.ts — 첫 화면 밖 lucide 아이콘(iconsExtra.ts) 청크를 받는 곳(2026-10-07 번들 감축 PR A ③).
//
// 깜빡임을 막는 세 겹:
//   ① lazyWithReload 가 화면 청크와 **같이** 이 청크를 기다린다 → lazy 화면은 첫 프레임부터 아이콘이 있다.
//   ② 미리 받는다 — 실제로는 대개 **부팅 중**에 나간다: 부팅 때 마운트되는 lazyWithReload 셸 조각이 ①로 먼저 부르기 때문이다
//      (PR #205 검토 실측: Slow 4G 탐색 시작 후 약 7초, load 이벤트보다 먼저). 그런 조각이 없으면 load + 유휴 때 받는다.
//   ③ 그래도 아직이면 Icon 이 **같은 크기의 빈 svg** 를 그렸다가 도착하면 채운다(레이아웃 이동 0) —
//      그 순간은 DOM 에 data-icon-pending 이 남아 측정·e2e 가 셀 수 있다.
// 첫 화면 파일이 여기 아이콘을 쓰면 ③ 으로 떨어진다 → iconsCore.contract.test.ts 가 막는다.
//
// 실패 복구(PR #205 검토 P2-1): 브라우저는 실패한 동적 import 를 모듈 맵에 남긴다 — **같은 주소로 다시 import() 하면 망이 돌아와도
//   즉시 또 실패한다**(실측 2026-10-07: Chromium·WebKit·Firefox 모두 같은 주소 2회 실패, `?r=1` 을 붙인 주소는 성공).
//   그래서 재시도는 주소 뒤에 ?r=n 을 붙여 새 모듈로 받는다. 새로고침으로 복구하지 않는다 — 입력 중인 글·열린 시트가 날아가고,
//   망이 아직 끊겨 있으면 앱 대신 오프라인 화면이 뜬다(검토 O1). 재시도 계기: 다음 호출(새 화면·빈 칸 마운트) · 화면 클릭 · online · 타이머.
//   e2e/icons-extra-retry.spec.ts 가 '부팅 중 실패 → 복구 → GTO 빈 칸 0 · 새로고침 없음' 을 지킨다.
import type { LucideIcon } from 'lucide-react';
import type { IconName } from './Icon';

type Extra = Partial<Record<IconName, LucideIcon>>;
let extra: Extra | undefined;
let pending: Promise<void> | undefined;
let fails = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();

export const getIconsExtra = (): Extra | undefined => extra;

export function subscribeIconsExtra(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

const importExtra = () => import('./iconsExtra');

/** 재시도 주소. 해시 붙은 청크 이름은 빌드가 importExtra 본문에 써 넣은 `import("./iconsExtra-<해시>.js")` 에만 있어 거기서 읽는다
 *  (WebKit 의 오류 문구에는 주소가 없다). 못 읽으면 undefined → 같은 주소로 다시 부른다(이전 동작). */
function retryUrl(): string | undefined {
  const m = /import\(\s*["'`]([^"'`]+)["'`]/.exec(String(importExtra));
  return m ? `${new URL(m[1], import.meta.url).href}?r=${fails}` : undefined;
}

/** 한 번 받으면 끝. 실패하면 비워 두고 다음 호출이 다른 주소로 다시 받는다(던지는 것은 호출부가 삼킨다). */
export function loadIconsExtra(): Promise<void> {
  const url = fails ? retryUrl() : undefined;
  return (pending ??= (url ? (import(/* @vite-ignore */ url) as ReturnType<typeof importExtra>) : importExtra()).then(
    (m) => { extra = m.EXTRA; clearTimeout(timer); subs.forEach((fn) => fn()); },
    (err) => {
      pending = undefined;
      fails++;
      // ponytail: 타이머 재시도는 8번(약 45초)까지만 — 배포로 옛 청크가 404 인 세션이 영원히 두드리지 않게. 그 뒤는 클릭·online·새 화면이 계기.
      if (fails <= 8) { clearTimeout(timer); timer = setTimeout(retry, Math.min(1000 * 2 ** (fails - 1), 8000)); }
      throw err;
    },
  ));
}

function retry() { if (!extra && !pending) loadIconsExtra().catch(() => {}); }

// ② 미리 받기 + 실패 뒤 재시도 계기 — 브라우저에서만.
if (typeof window !== 'undefined') {
  type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const w = window as IdleWin;
  const schedule = () => (w.requestIdleCallback ? w.requestIdleCallback(retry, { timeout: 2000 }) : setTimeout(retry, 1000));
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  window.addEventListener('online', () => { if (fails) retry(); });
  document.addEventListener('click', () => { if (fails) retry(); }, { capture: true, passive: true });
}
