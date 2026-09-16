// 접수대 장부 — realtime 세션 동기화 + 대상 게임 할인 계약 (C05·C06, 2026-09-12 재현/고정)
//
// 렌더 트리 테스트로 잡기 어렵다(auth·supabase·ledger API를 다 채워야 한다) — 저장소가 이미 쓰는
// 소스 계약 테스트 방식으로 잠근다(remoteContract.test.ts 와 같은 결).
// 실행: npx vitest run src/components/features/NuriPosLedgerRace.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'NuriPosLedger.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('C05 · 다른 접수대의 realtime 변경이 현재 session state 를 갱신한다', () => {
  it('reloadSession 이 완료를 기다릴 수 있게 Promise 를 반환한다(return 누락 회귀 방지)', () => {
    const m = code.match(/const reloadSession = useCallback\(\(\) => ([\s\S]*?), \[/);
    expect(m, 'reloadSession 정의를 찾지 못했다').not.toBeNull();
    const body = m![1].trim();
    // 화살표 함수 바디가 블록문(`{ ... }`, 반환값 없음)이면 안 되고, 표현식이거나
    // 명시적 `return` 이 있어야 한다 — 둘 다 아니면 호출부의 `await reloadSession()` 이 헛돈다.
    const isBlockWithoutReturn = body.startsWith('{') && !body.includes('return');
    expect(isBlockWithoutReturn, 'reloadSession 이 Promise 를 반환하지 않는다').toBe(false);
  });

  it('subscribeLedger 콜백이 reloadSession 을 호출한다(reload·loadGames 만으론 session 이 안 바뀐다)', () => {
    // §5-A(2026-09-12): active 게이트가 생기며 단일식 화살표에서 블록 effect 로 바뀌었다 — 콜백 본문만 잡는다.
    const m = code.match(/return subscribeLedger\(venueId, \(\) => \{([\s\S]*?)\}\);/);
    expect(m, 'subscribeLedger 구독을 찾지 못했다').not.toBeNull();
    expect(m![1]).toContain('reloadSession(');
  });

  it('subscribeLedger 구독은 이 판이 실제로 보일 때만(active) 걸린다(keep-alive 숨은 탭 낭비 방지, §5-A)', () => {
    // effect 본문 전체(다음 useEffect 시작 전까지)를 잘라 그 안에서 게이트·재검증·deps 를 각각 확인한다.
    const start = code.indexOf('return subscribeLedger(venueId, () => {');
    expect(start, 'subscribeLedger effect 를 찾지 못했다').toBeGreaterThan(-1);
    const before = code.slice(Math.max(0, start - 200), start);
    const after = code.slice(start, start + 400);
    expect(before, 'active 게이트가 없다').toMatch(/if \(!active\) return;/);
    expect(before, '다시 보일 때 재검증(reload/reloadSession)이 없다').toMatch(/reload\(\); reloadSession\(\);/);
    expect(after, 'active 가 deps 에 없다').toMatch(/\}, \[venueId, reload, reloadSession, active\]\);/);
  });

  // 2026-09-12 독립 검증에서 잡힌 결함의 회귀 방지.
  // 재검증을 effect 첫 줄에 무조건 두면 `reload`/`reloadSession` 의 identity 가 `date`·`gameSeq` 에 걸려 있어
  // **날짜·게임 전환마다** 같은 조회가 또 나간다(실측 전환 1회당 11건 → 7건, 중복 4건).
  // 바로 위 초기 로드 effect 가 이미 하는 일이라, 재검증은 **숨었다가 다시 보일 때(상승 에지)만** 돌아야 한다.
  it('🔴 재검증은 active 상승 에지에서만 돈다 — 날짜·게임 전환마다 중복 조회하지 않는다', () => {
    const start = code.indexOf('return subscribeLedger(venueId, () => {');
    const before = code.slice(Math.max(0, start - 400), start);
    expect(before, '상승 에지 판정(이전 active 값 기억)이 없다 — 전환마다 중복 조회한다')
      .toMatch(/ledgerWasActive\.current === false && active/);
    expect(before, '재검증이 상승 에지 조건 뒤에 있지 않다')
      .toMatch(/if \(rising\) \{ reload\(\); reloadSession\(\); \}/);
  });

  it('QR 바인요청 실시간 구독도 active 게이트 뒤에서 걸린다(§5-A)', () => {
    const m = code.match(/useEffect\(\(\) => \{\s*if \(!active\) return;\s*loadPending\(\);\s*return subscribeBuyinRequests\(venueId, loadPending\);\s*\}, \[venueId, loadPending, active\]\);/);
    expect(m, 'subscribeBuyinRequests 의 active 게이트를 찾지 못했다').not.toBeNull();
  });

  it('연동 클락 실시간 구독도 active 게이트 뒤에서 걸린다(§5-A)', () => {
    const m = code.match(/useEffect\(\(\) => \{ if \(!active\) return; return subscribeClock\(venueId, reloadClock\); \}, \[venueId, reloadClock, active\]\);/);
    expect(m, 'subscribeClock 의 active 게이트를 찾지 못했다').not.toBeNull();
  });
});

describe('C06 · QR 승인 대상 게임의 할인은 대상 게임 자신의 데이터로 계산한다', () => {
  it('discIdxFor 가 대상 게임(seq)이 현재 게임과 다르면 그 게임의 세션·클락을 다시 조회한다', () => {
    const m = code.match(/const discIdxFor = useCallback\(async \(seq: number\)[\s\S]*?\n {2}\}, \[/);
    expect(m, 'discIdxFor 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    // seq === gameSeq(같은 게임) 일 때만 현재 화면 값을 쓴다 — 다른 게임 분기에서 fallback 하면 회귀.
    expect(body).toMatch(/if \(seq === gameSeq\) return defaultDiscIdx\(\);/);
    // 2026-09-17: 실제 조회는 `src/api/discountIndex.ts` 의 **공유 정본**으로 옮겼다.
    //   대시보드 QR 승인이 이 계산을 하지 않아 같은 손님이 창구에 따라 다른 금액으로 기록됐고,
    //   고치는 방법이 "대시보드에도 같은 코드를 복사" 였다면 다음에 또 갈렸을 것이다 — 그래서 한 곳으로 모았다.
    //   계약은 느슨해진 것이 아니라 **옮겨간 자리까지 따라간다**: 아래에서 그 파일의 내용을 직접 단언한다.
    expect(body).toContain('resolveDiscountIndex(');
  });

  it('공유 정본(discountIndex.ts)이 대상 게임의 세션·클락을 그 게임 기준으로 다시 조회한다', () => {
    const shared = readFileSync(join(__dirname, '..', '..', 'api', 'discountIndex.ts'), 'utf-8');
    expect(shared).toContain('getLedgerSession(venueId, date, gameSeq)');
    expect(shared).toContain('getClockState(venueId, gameSeq)');
    // 다른 날짜의 클락 레벨로 오늘 할인을 주면 안 된다.
    expect(shared).toMatch(/clock\.sessionDate === date/);
    expect(shared).toContain('autoDiscountIndex(');
  });

  it('🔴 대시보드 QR 승인도 **같은 정본**으로 할인을 계산한다 (2026-09-17: 여기가 빠져 있었다)', () => {
    const dash = readFileSync(join(__dirname, 'StoreDashboard.tsx'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(dash, '대시보드가 공유 정본을 쓰지 않는다 — 장부와 다른 금액이 기록된다').toContain('resolveDiscountIndex(');
    // 승인 호출에 할인 인자가 빠지면(기본값 0 = 정가) 다시 갈린다.
    expect(dash).not.toMatch(/approveBuyinRequest\(r\.id, r\.requestedGameSeq \?\? 1, true, method \?\? 'cash', method \? undefined : split\)/);
  });

  it('approveReq 가 defaultDiscIdx() 대신 대상 게임 기준 discIdxFor(target) 을 쓴다', () => {
    const idx = code.indexOf('const approveReq = ');
    expect(idx, 'approveReq 정의를 찾지 못했다').toBeGreaterThan(-1);
    const slice = code.slice(idx, idx + 1200);
    expect(slice).toContain('discIdxFor(target)');
    expect(slice).not.toMatch(/approveBuyinRequest\([^)]*defaultDiscIdx\(\)/);
  });

  it('bulkApprove 가 defaultDiscIdx() 대신 대상 게임 기준 discIdxFor(x.seq) 을 쓴다', () => {
    const idx = code.indexOf('const bulkApprove = ');
    expect(idx, 'bulkApprove 정의를 찾지 못했다').toBeGreaterThan(-1);
    const slice = code.slice(idx, idx + 1800);
    expect(slice).toContain('discIdxFor(');
    expect(slice).not.toMatch(/approveBuyinRequest\([^)]*defaultDiscIdx\(\)/);
  });
});

describe('C05 보완 · 재조회 실패를 조용히 삼키지 않는다(낡은 견적을 성공처럼 보이지 않는다)', () => {
  it('reloadSession 이 실패를 loadError 에 남긴다(빈 catch 로 삼키지 않는다)', () => {
    const idx = code.indexOf('const reloadSession = useCallback(');
    expect(idx, 'reloadSession 정의를 찾지 못했다').toBeGreaterThan(-1);
    const slice = code.slice(idx, idx + 500);
    expect(slice).not.toMatch(/\.catch\(\(\) => \{\}\)/); // 빈 catch 로 되돌리면 회귀
    expect(slice).toMatch(/\.catch\(\([a-zA-Z]+\) => \{\s*setLoadError\(/);
  });

  it('reloadSession 이 성공하면 지난 실패 표시를 지운다(setLoadError(null))', () => {
    const idx = code.indexOf('const reloadSession = useCallback(');
    const slice = code.slice(idx, idx + 500);
    expect(slice).toMatch(/setSession\(s\); setLoadError\(null\); \}/);
  });

  it('loadGames 가 내부에서 실패를 삼키지 않는다(빈 catch 로 되돌리면 reloadSession 의 Promise.all 이 실패를 못 본다)', () => {
    const m = code.match(/const loadGames = useCallback\(\(\) => ([^;]+);/);
    expect(m, 'loadGames 정의를 찾지 못했다').not.toBeNull();
    expect(m![1]).not.toMatch(/\.catch\(\(\) => \{\}\)/);
  });

  it('hasBoardData 가 있어야 전면 카드(초기 실패)와 인라인 배너(재조회 실패)를 가를 수 있다', () => {
    const m = code.match(/const hasBoardData = [^;]+;/);
    expect(m, 'hasBoardData 정의를 찾지 못했다').not.toBeNull();
    expect(m![0]).toContain('session.openedAt');
    expect(m![0]).toMatch(/buyins\.length > 0/);
    expect(m![0]).toMatch(/players\.length > 0/);
  });

  it('전면 로드-실패 카드는 hasBoardData 가 없을 때만 뜬다(있으면 보드 + 인라인 배너로 대체)', () => {
    expect(code).toMatch(/if \(loadError && !hasBoardData\) \{/);
  });

  it('보드 렌더에 hasBoardData 조건의 인라인 재조회-실패 배너가 있다(마지막 정상 값을 지우지 않는다)', () => {
    const idx = code.indexOf('loadError && hasBoardData');
    expect(idx, '인라인 배너 조건을 찾지 못했다').toBeGreaterThan(-1);
    const slice = code.slice(idx, idx + 400);
    expect(slice).toContain('reloadSession()');
  });
});

describe('C04(연동판정) · clockLinked 가 게임 번호까지 맞춰 본다', () => {
  it('clockLinked 가 clock.gameSeq 를 gameSeq 와 비교한다(날짜만 보면 게임 전환 중 응답을 오판한다)', () => {
    const m = code.match(/const clockLinked = [^;]+;/);
    expect(m, 'clockLinked 정의를 찾지 못했다').not.toBeNull();
    expect(m![0]).toContain('clock.gameSeq === gameSeq');
  });
});
