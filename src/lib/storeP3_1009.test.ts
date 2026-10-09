// 매장 P3 묶음(2026-10-09) — 근거: audit12/verify-224b.md '참고' H03-08·H03-06 · 잔여 위험(localStorage 차단) ·
//   fix-store-batch.md '2차'(대시보드 '예정된 게임이 없습니다' 가 일정 조회 실패에도 뜸).
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultClockConfig, emptyClockState, withDerivedEarly, undoSkippedText, clockOwnerKey, type ClockState } from '../api/clock';
import { ledgerStartClockConfig, sessionEarlyBasis, sessionEarlyOf, clockStartAction } from './ledgerStart';
import { rankDraftKey, writeRowsDraft, readRowsDraft, clearRowsDraft } from './rankingDraft';

const DATE = '2026-10-09';
const form = { earlyBonus: 10000, doubleEarlyBonus: 20000, earlyDoubleLevel: 3, earlySingleLevel: 7, startStack: 50000, rebuyStack: 70000 };

describe('② H03-08 후속 — 장부 저장 직전 클락 기준으로 세션 얼리 한 벌', () => {
  // 클락 판에서 이미 다른 얼리 레벨(1·4)로 시작한 클락. 폼은 마운트 때 정지였던 스냅샷을 보고 3·7 로 열려 있다.
  const clockCfg = withDerivedEarly({ ...defaultClockConfig(), earlyDoubleLevel: 1, earlySingleLevel: 4 });
  const running: ClockState = { ...emptyClockState('v1', clockCfg, 1), running: true, endsAt: new Date().toISOString(), sessionDate: DATE };
  const formCfg = ledgerStartClockConfig(defaultClockConfig(), null, null, form);

  it('전제: 폼 cfg 와 진행 중 클락의 얼리 분이 실제로 다르다(같으면 이 시험은 아무것도 안 본다)', () => {
    expect(clockStartAction(running, DATE)).toBe('protect');
    expect(formCfg.earlyDoubleMin).not.toBe(clockCfg.earlyDoubleMin);
  });
  it('🔴 클락이 보호되면(protect) 세션 얼리는 그 클락 설정 — TV 얼리와 장부 자동 얼리가 같다', () => {
    const s = sessionEarlyOf(sessionEarlyBasis(running, DATE, formCfg));
    expect(s.earlyDoubleMin).toBe(clockCfg.earlyDoubleMin);
    expect(s.earlySingleMin).toBe(clockCfg.earlySingleMin);
  });
  it('일시정지했지만 오늘 진행 흔적이 있는 클락도 보호 대상 → 클락 설정', () => {
    const paused: ClockState = { ...running, running: false, endsAt: null, currentIndex: 2 };
    expect(clockStartAction(paused, DATE)).toBe('protect');
    expect(sessionEarlyOf(sessionEarlyBasis(paused, DATE, formCfg)).earlyDoubleMin).toBe(clockCfg.earlyDoubleMin);
  });
  it('클락이 없거나(new)·진행 흔적 없는 행(update)이면 이번에 쓸 cfg 그대로(같은 객체)', () => {
    expect(sessionEarlyBasis(null, DATE, formCfg)).toBe(formCfg);
    expect(sessionEarlyBasis(emptyClockState('v1', clockCfg, 1), DATE, formCfg)).toBe(formCfg);
  });
  it('지난 날 남은 클락(reset)은 포스터 설정으로 새로 채우므로 cfg', () => {
    const left: ClockState = { ...running, running: false, endsAt: null, currentIndex: 3, sessionDate: '2026-10-01', updatedAt: '2026-10-01T05:00:00.000Z' };
    expect(clockStartAction(left, DATE)).toBe('reset');
    expect(sessionEarlyBasis(left, DATE, formCfg)).toBe(formCfg);
  });
});

describe('③ H03-06 후속 — 실행취소를 안 쓴 이유는 매장/게임에 맞게', () => {
  it('🔴 매장이 바뀌었으면 "다른 매장" — "다른 게임으로 옮겨" 라 하지 않는다', () => {
    const owner = clockOwnerKey({ venueId: 'venue-a', gameSeq: 1 });
    const t = undoSkippedText(owner, { venueId: 'venue-b', gameSeq: 1 });
    expect(t).toContain('다른 매장');
    expect(t).not.toContain('다른 게임으로 옮겨');
  });
  it('같은 매장의 다른 게임이면 예전 문구 그대로', () => {
    const owner = clockOwnerKey({ venueId: 'venue-a', gameSeq: 1 });
    expect(undoSkippedText(owner, { venueId: 'venue-a', gameSeq: 2 })).toContain('다른 게임으로 옮겨');
  });
  it('매장 id 가 앞부분만 겹쳐도(접두 일치) 다른 매장으로 본다', () => {
    const owner = clockOwnerKey({ venueId: 'venue-ab', gameSeq: 1 });
    expect(undoSkippedText(owner, { venueId: 'venue-a', gameSeq: 1 })).toContain('다른 매장');
  });
});

describe('④ localStorage 가 막힌 브라우저 — 순위 편집 중 게임 전환에도 미저장 입력이 남는다', () => {
  const real = (globalThis as unknown as { localStorage: unknown }).localStorage;
  afterEach(() => { (globalThis as unknown as { localStorage: unknown }).localStorage = real; });
  it('🔴 메인에 친 입력 → 사이드 칩 → 메인으로 돌아오면 그대로(메모리 폴백)', () => {
    const boom = () => { throw new Error('SecurityError'); };
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      get length(): number { throw new Error('SecurityError'); }, key: boom, getItem: boom, setItem: boom, removeItem: boom,
    };
    const main = rankDraftKey('v-p3', DATE, '메인'), side = rankDraftKey('v-p3', DATE, '사이드');
    writeRowsDraft(main, [{ nickname: '우승자', realName: '' }, { nickname: '준우승', realName: '' }]);
    writeRowsDraft(side, [{ nickname: '사이드1', realName: '' }]);   // 전환한 칸에서도 입력
    expect(readRowsDraft(main)?.map((r) => r.nickname)).toEqual(['우승자', '준우승']);
    expect(readRowsDraft(side)?.map((r) => r.nickname)).toEqual(['사이드1']);
    clearRowsDraft(main); clearRowsDraft(side);
  });
});

describe('① 대시보드 "다가오는 예약" — 일정 조회 실패를 "예정된 게임이 없습니다" 로 위장하지 않는다', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const dash = strip(readFileSync(join(__dirname, '../components/features/StoreDashboard.tsx'), 'utf8'));
  const tab = strip(readFileSync(join(__dirname, '../components/features/VenueManageTab.tsx'), 'utf8'));
  it('🔴 비었고 실패했으면 오류·재시도 줄, 성공해서 빈 것만 "예정된 게임이 없습니다"', () => {
    expect(dash).toMatch(/upcoming\.length === 0 && schedulesError \? \(\s*<LoadFailRow what="게임 목록" onRetry=\{onRetrySchedules\} \/>\s*\) : upcoming\.length === 0 \? \(\s*<p[^>]*>예정된 게임이 없습니다\.<\/p>/);
  });
  it('VenueManageTab 이 App 의 schedulesError·재시도를 대시보드에 넘긴다(MyPostersTab 과 같은 값)', () => {
    const at = tab.indexOf('<StoreDashboardM ');
    expect(at).toBeGreaterThan(-1);
    const el = tab.slice(at, tab.indexOf('/>', at));
    expect(el).toMatch(/schedulesError=\{schedulesError\}/);
    expect(el).toMatch(/onRetrySchedules=\{onRetrySchedules\}/);
    expect(tab).toMatch(/<MyPostersTabM schedules=\{schedules\} loadError=\{schedulesError\} onRetry=\{onRetrySchedules\}/);
  });
});
