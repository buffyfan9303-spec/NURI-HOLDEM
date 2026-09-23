// src/lib/lazyWithReload.ts
// 코드 스플리팅 청크 로드 실패 시(예: 재배포로 옛 청크 해시가 404) 흰 화면 대신
// 1회 자동 새로고침으로 새 index.html + 새 청크를 받아 매끄럽게 복구한다.
// 무한 새로고침을 막기 위해 sessionStorage 로 최근 시도 시각을 기록해 1회만 reload.
//
// preload()(GTO-TOOL-OPEN-JANK, 2026-09-24) — 모듈을 **미리 받아 두면 lazy 를 거치지 않고 동기로 그린다.**
//   React 는 새로 마운트된 Suspense 경계가 서스펜드하면 폴백을 최소 ~300ms 붙잡는다(청크가 캐시에 있어도,
//   startTransition 으로 감싸도 — 모달처럼 열 때마다 경계가 새로 생기면 소용없다. React 19.2 최소 재현).
//   그래서 '받는 시점'을 앞당기는 것만으로는 부족하고, 받아졌으면 lazy 자체를 건너뛰어야 한다.
//   받기 전에는 지금과 똑같이 lazy + Suspense 폴백이 안전망이다(호출부 동작 불변).
import { createElement, lazy, useState } from 'react';
import type { ComponentProps, ComponentType } from 'react';

const KEY = 'nuri_chunk_reload_at';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  let mod: T | undefined;
  let pending: Promise<{ default: T }> | undefined;
  // 같은 요청을 공유한다(preload 와 lazy 가 청크를 두 번 받지 않게). 실패하면 비워 다음에 다시 시도한다.
  const load = () => (pending ??= factory().then(
    (m) => { mod = m.default; return m; },
    (err) => { pending = undefined; throw err; },
  ));
  const Lazy = lazy(async () => {
    try {
      return await load();
    } catch (err) {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      const now = Date.now();
      // 최근 10초 내 이미 새로고침했다면(여전히 실패) 루프 방지 → ErrorBoundary 로 위임
      if (now - last > 10000) {
        sessionStorage.setItem(KEY, String(now));
        window.location.reload();
        // reload 가 진행되는 동안 컴포넌트가 마운트되지 않도록 영원히 대기
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
  function LazyWithReload(props: ComponentProps<T>) {
    // ⚠ 경로는 **마운트 때 한 번** 정한다. 렌더마다 고르면 lazy 로 마운트된 뒤 모듈이 도착했을 때
    //   요소 타입이 Lazy → 모듈로 바뀌어 하위 트리가 통째로 재마운트된다(상태 소실).
    const [direct] = useState(() => mod !== undefined);
    return createElement((direct ? mod! : Lazy) as ComponentType<ComponentProps<T>>, props);
  }
  /** 청크를 미리 받는다. 실패는 삼킨다 — 실제로 열 때 lazy 경로가 다시 시도하고 복구한다. */
  LazyWithReload.preload = (): Promise<void> => load().then(() => undefined, () => undefined);
  return LazyWithReload;
}
