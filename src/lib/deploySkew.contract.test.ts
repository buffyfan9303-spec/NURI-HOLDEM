// R-01(2026-10-01, audit-regress-1001) — 배포 뒤 옛 청크를 요청하면 '어두운 셸 → 홈' 으로 새로고침되던 결함의 계약.
//
// 두 원인을 각각 잠근다.
//   ① vercel.json 의 SPA 재작성 `/(.*) → /index.html` 이 없는 `/assets/*` 까지 삼켜 **HTML 을 200 으로**,
//      `/assets/(.*)` 의 1년 immutable 헤더를 단 채 줬다(운영 GET 실측). → 없는 청크는 진짜 404 여야 한다.
//   ② lazyWithReload 가 `location.reload()` 로 부팅 기본 탭(홈)에 떨어뜨렸다. → 누른 목적지(부팅 딥링크)로 새로고침한다.
// 실제 도착은 e2e/deploy-skew.spec.ts 가 잰다(여기는 설정·순수 함수 계약).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { noteIntendedView, reloadUrlForIntent, resetIntendedView, setCurrentView } from './pendingViewIntent';

const ROOT = join(__dirname, '..', '..');
type Header = { key: string; value: string };
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: Header[] }[];
};
/** vercel.json source(path-to-regexp) 중 이 파일이 쓰는 꼴 — 괄호 정규식 + 고정 경로 — 만 정규식으로 옮긴다. */
const toRe = (src: string) => new RegExp(`^${src}$`);
const spaRewrites = vercel.rewrites.filter((r) => r.destination === '/index.html');

describe('① 없는 해시 자산은 index.html 로 재작성되지 않는다', () => {
  it('SPA 재작성이 하나 이상 있고, /assets/ 는 어느 것에도 걸리지 않는다', () => {
    expect(spaRewrites.length).toBeGreaterThan(0);
    for (const p of ['/assets/ToolsPanel-DEADBEEF.js', '/assets/index-OLDHASH.css', '/assets/x']) {
      expect(spaRewrites.filter((r) => toRe(r.source).test(p)).map((r) => r.source), p).toEqual([]);
    }
  });
  it('앱 경로(딥링크·새로고침)는 여전히 index.html 로 간다 — SPA 기능 보존', () => {
    for (const p of ['/', '/my-store', '/admin', '/some/deep/path', '/assetsx', '/about']) {
      expect(spaRewrites.some((r) => toRe(r.source).test(p)), p).toBe(true);
    }
  });
  it('캐시 헤더 계약은 그대로 — 해시 자산은 immutable, 문서는 no-cache', () => {
    const cc = (source: string) => vercel.headers.find((h) => h.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value;
    expect(cc('/assets/(.*)')).toBe('public, max-age=31536000, immutable');
    expect(cc('/')).toBe('no-cache, must-revalidate');
    expect(cc('/index.html')).toBe('no-cache, must-revalidate');
  });
});

describe('② 청크 복구 새로고침은 누른 곳으로 돌아간다', () => {
  const loc = { pathname: '/', search: '' };
  beforeEach(() => { resetIntendedView(); setCurrentView(null); });
  afterEach(() => { vi.useRealTimers(); });

  it('방금 누른 탭(커밋 전)으로 — 홈이 아니다', () => {
    setCurrentView({ kind: 'tab', id: 'home' }); // 트랜지션이 서스펜드 중이라 커밋된 화면은 아직 홈
    noteIntendedView({ kind: 'tab', id: 'tools' });
    expect(reloadUrlForIntent(loc)).toBe('/?tab=tools');
  });
  it('오버레이는 그 밑의 탭과 함께 — 일정 상세 · 이벤트 · 이벤트 목록', () => {
    noteIntendedView({ kind: 'tab', id: 'calendar' });
    noteIntendedView({ kind: 'schedule', id: 'abc-123' });
    expect(reloadUrlForIntent(loc)).toBe('/?tab=calendar&s=abc-123');
    resetIntendedView();
    noteIntendedView({ kind: 'event', id: 'list' });
    expect(reloadUrlForIntent(loc)).toBe('/?event=list');
  });
  it('10초가 지난 의도는 버리고 지금 떠 있는 화면으로', () => {
    const t0 = Date.now();
    noteIntendedView({ kind: 'post', id: 'p1' });
    setCurrentView({ kind: 'tab', id: 'live' });
    expect(reloadUrlForIntent(loc, t0 + 11_000)).toBe('/?tab=live');
  });
  it('홈은 파라미터 없이, 다른 쿼리는 보존하고 낡은 딥링크 값은 덮는다, 해시는 버린다(조각 이동 방지)', () => {
    noteIntendedView({ kind: 'tab', id: 'home' });
    expect(reloadUrlForIntent({ pathname: '/', search: '?display=1&event=old&s=x' })).toBe('/?display=1');
  });
  it('허용 목록 밖의 id 는 적히지 않는다 — 주소를 만들 여지가 없다', () => {
    noteIntendedView({ kind: 'post', id: '//evil.example' });
    expect(reloadUrlForIntent(loc)).toBe('/');
  });
  it('lazyWithReload 는 목적지 없는 reload() 를 쓰지 않는다', () => {
    const src = readFileSync(join(ROOT, 'src', 'lib', 'lazyWithReload.ts'), 'utf8');
    expect(src).not.toMatch(/location\.reload\(/);
    expect(src).toMatch(/location\.replace\(reloadUrlForIntent\(\)\)/);
  });
});
