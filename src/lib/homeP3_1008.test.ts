// 홈/공용 P3 묶음(2026-10-08) — UP-09 · UP-14 · UP-17 · 출석 링크 복사 실패 피드백.
// 근거: audit12/triage-user.md(UP-09·14·17), audit12/function-1008.md(P3-1).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { upcomingToday } from './liveUpcoming';
import { copyOrDial } from './copyOrDial';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8').replace(/\r\n/g, '\n');

describe('UP-17 오늘 곧 시작 — 이미 끝난 오늘 일정 제외', () => {
  const today = '2026-10-08';
  // 2026-10-08 23:30 KST
  const now = Date.parse('2026-10-08T23:30:00+09:00');
  const rows = [
    { id: 'early', approved: true, date: today, startTime: '12:00' }, // 12:00 + 10h = 22:00 종료 → 빼야 함
    { id: 'night', approved: true, date: today, startTime: '19:30' }, // 진행 창 안 → 남김
    { id: 'late', approved: true, date: today, startTime: '23:50' }, // 아직 시작 전 → 남김
    { id: 'running', approved: true, date: today, startTime: '20:00' }, // 클락이 도는 중 → 빼야 함(기존 계약)
    { id: 'unapproved', approved: false, date: today, startTime: '23:55' },
    { id: 'tomorrow', approved: true, date: '2026-10-09', startTime: '01:00' },
  ];

  it('시작 + 10시간이 지난 오늘 일정은 목록에 없다', () => {
    const ids = upcomingToday(rows, new Set(['running']), today, now).map((s) => s.id);
    expect(ids).toEqual(['night', 'late']);
  });

  it('아침에는 같은 일정이 모두 남는다(양성 대조)', () => {
    const morning = Date.parse('2026-10-08T09:00:00+09:00');
    const ids = upcomingToday(rows, new Set<string>(), today, morning).map((s) => s.id);
    expect(ids).toEqual(['early', 'night', 'running', 'late']);
  });

  it('LiveGamesTab 은 정본 판정을 쓴다(두 벌 계산 금지)', () => {
    const t = src('src/components/features/LiveGamesTab.tsx');
    expect(t).toMatch(/upcomingToday\(schedules, liveSchedIds, today\)/);
  });
});

describe('UP-14 전화번호 칩 — 기본 동작은 동기로 막는다', () => {
  it('클립보드가 있으면 복사 Promise 가 끝나기 전에 preventDefault 가 불린다', () => {
    const order: string[] = [];
    let resolveWrite: () => void = () => {};
    const clipboard = { writeText: vi.fn(() => new Promise<void>((r) => { resolveWrite = r; })) };
    const e = { preventDefault: vi.fn(() => order.push('prevent')) };
    const p = copyOrDial(e, '010-1234-5678', 'tel:01012345678', () => order.push('copied'), { clipboard, dial: vi.fn() });
    // 여기는 아직 같은 동기 구간 — 클릭 디스패치 안에서 막혀야 효과가 있다
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['prevent']);
    resolveWrite();
    return Promise.resolve(p).then(() => expect(order).toEqual(['prevent', 'copied']));
  });

  it('복사가 거부되면 tel: 로 보낸다', async () => {
    const dial = vi.fn();
    const onCopied = vi.fn();
    const e = { preventDefault: vi.fn() };
    await copyOrDial(e, '010', 'tel:010', onCopied, { clipboard: { writeText: () => Promise.reject(new Error('denied')) }, dial });
    expect(dial).toHaveBeenCalledWith('tel:010');
    expect(onCopied).not.toHaveBeenCalled();
  });

  it('클립보드 API 가 없으면 막지 않는다(기본 tel: 실행)', () => {
    const e = { preventDefault: vi.fn() };
    copyOrDial(e, '010', 'tel:010', vi.fn(), { clipboard: null, dial: vi.fn() });
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('ContactActions 의 두 칩이 모두 이 경로를 쓰고, await 뒤 preventDefault 가 남지 않는다', () => {
    const t = src('src/components/features/ContactActions.tsx');
    expect(t.match(/copyOrDial\(e, /g)?.length).toBe(2);
    expect(t).not.toMatch(/await navigator\.clipboard\.writeText\([^)]*\);\s*e\.preventDefault\(\)/);
  });
});

describe('UP-09 쪽지 받는 사람 검색 — 옛 응답이 최신 결과를 덮지 않는다', () => {
  it('검색 effect 가 세대 가드(alive)로 then/catch/finally 를 막고 cleanup 에서 끈다', () => {
    const t = src('src/components/features/NotificationPanel.tsx');
    const start = t.indexOf('findUserForTransfer(q)');
    expect(start).toBeGreaterThan(0);
    const block = t.slice(start, start + 400);
    expect(block).toMatch(/\.then\(\(r\) => \{ if \(alive\) setResults\(r\); \}\)/);
    expect(block).toMatch(/\.catch\(\(\) => \{ if \(alive\) setResults\(\[\]\); \}\)/);
    expect(block).toMatch(/\.finally\(\(\) => \{ if \(alive\) setSearching\(false\); \}\)/);
    expect(block).toMatch(/return \(\) => \{ alive = false; clearTimeout\(t\); \};/);
  });
});

describe('출석 링크 복사 실패 피드백(function-1008 P3-1)', () => {
  it('클립보드 거부 시 실패 토스트를 띄운다(무반응 금지)', () => {
    const t = src('src/components/features/CheckinModal.tsx');
    const line = t.split('\n').find((l) => l.includes('const copy = async'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/catch \{ toast\.show\('[^']+', 'error'\); \}/);
  });
});
