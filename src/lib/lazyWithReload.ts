// src/lib/lazyWithReload.ts
// 코드 스플리팅 청크 로드 실패 시(예: 재배포로 옛 청크 해시가 404) 흰 화면 대신
// 1회 자동 새로고침으로 새 index.html + 새 청크를 받아 매끄럽게 복구한다.
// 무한 새로고침을 막기 위해 sessionStorage 로 최근 시도 시각을 기록해 1회만 reload.
import { lazy } from 'react';
import type { ComponentType } from 'react';

const KEY = 'nuri_chunk_reload_at';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
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
}
