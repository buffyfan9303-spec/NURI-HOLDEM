// lazyWithReload.preload() 계약 — GTO-TOOL-OPEN-JANK(2026-09-24).
// 받아 둔 모듈은 lazy 를 거치지 않고 **동기로** 그려야 한다. lazy 를 거치면 새 Suspense 경계가
// 폴백을 ~300ms 붙잡는다(모듈이 이미 받아졌어도 lazy 자신은 처음 불릴 때 한 번 서스펜드한다).
import { describe, expect, it, vi } from 'vitest';
import { createElement, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { lazyWithReload } from './lazyWithReload';

const Body = ({ label }: { label: string }) => createElement('p', null, `BODY:${label}`);
const html = (C: ReturnType<typeof lazyWithReload<typeof Body>>) =>
  renderToString(createElement(Suspense, { fallback: createElement('i', null, 'FALLBACK') }, createElement(C, { label: 'x' })));

describe('lazyWithReload.preload', () => {
  it('받기 전에는 지금처럼 Suspense 폴백이 안전망이다', () => {
    const C = lazyWithReload(() => new Promise<{ default: typeof Body }>(() => {}));
    expect(html(C)).toContain('FALLBACK');
  });

  it('preload 가 끝난 뒤의 첫 렌더는 폴백 없이 본문을 동기로 그린다(props 전달 포함)', async () => {
    const C = lazyWithReload(() => Promise.resolve({ default: Body }));
    await C.preload();
    const out = html(C);
    expect(out).toContain('BODY:x');
    expect(out).not.toContain('FALLBACK');
  });

  it('청크 요청은 한 번만 — preload 를 여러 번 불러도, 이어서 렌더해도 factory 는 1회', async () => {
    const factory = vi.fn(() => Promise.resolve({ default: Body }));
    const C = lazyWithReload(factory);
    await Promise.all([C.preload(), C.preload()]);
    html(C);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('preload 실패는 삼키고, 다음 시도에서 다시 받는다(실패를 캐시하지 않는다)', async () => {
    const factory = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('404')))
      .mockImplementationOnce(() => Promise.resolve({ default: Body }));
    const C = lazyWithReload(factory as () => Promise<{ default: typeof Body }>);
    await expect(C.preload()).resolves.toBeUndefined();
    await C.preload();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(html(C)).toContain('BODY:x');
  });
});
