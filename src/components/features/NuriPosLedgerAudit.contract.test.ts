// 접수대 장부 — 2026-09-13 독립 점검 F2·F4·F5 의 배선 계약.
//
// F2  장부 시작 폼이 새 클락을 `remainingMs: 0` 인라인 리터럴로 만들었다. clockPhase 는 (levels 있음 · index 0 ·
//     remainingMs 0) 를 'paused' 로 읽으므로 시작도 안 한 대회가 TV 에 PAUSED 로 뜨고, 주 버튼이 '계속하기' 가 되고,
//     그걸 누르면 endsAt=now 로 1레벨이 통째로 건너뛰었다. 단일 소스 `emptyClockState` 를 쓴다(값 검사는 clockPhase.test.ts).
// F4  `ledger_access` 직접 SELECT 는 RLS(la_select) 때문에 POS 권한 없는 장부직원에게 **자기 행 1개만** 준다. 그걸
//     status:'ready'(완전한 목록) 로 읽어 후보를 본인만 남기고 자동 선택 → 저장 → 동료 전원이 그 장부에서 잠겼다.
//     클라이언트 최소 수정: fullAccess 가 아니면 후보를 '부분' 으로 표시하고 자동 선택하지 않는다(담당 비움 = 권한 직원 전원 열람).
//     ⚠ 근본 수정(can_access_ledger 로 게이트한 RPC)은 DB 변경 — 오너 승인 사항이라 여기서 하지 않는다.
// F5  `clockLinked` 가 venueId 를 대조하지 않고 reloadClock 이 대상 전환 시 상태를 안 비워, 매장을 바꿔도 앞 매장 클락이
//     이 장부의 정본으로 남았다(리모컨 조작이 남의 매장 대회로 나간다). staleResponse 의 owner 스탬프로 막는다.
//
// 못 보는 것: 문장의 존재만 본다 — 렌더·네트워크는 e2e 몫. 이름 바꾼 복제본은 못 잡는다.
// 음성 대조: NuriPosLedger.tsx 에서
//   · `...emptyClockState(base.venueId, cfg, base.gameSeq)` 를 옛 리터럴(`remainingMs: 0` 포함)로 되돌리면 F2 두 검사가,
//   · `operatorOptionsPartial={!fullAccess}` 를 한 곳이라도 지우거나 init 의 `!operatorOptionsPartial &&` 를 빼면 F4 가,
//   · clockLinked 의 `clock.venueId === venueId &&` 를 빼거나 reloadClock 의 `setClock(null)` 줄을 지우면 F5 가 실패한다.
// 실행: npx vitest run src/components/features/NuriPosLedgerAudit.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'NuriPosLedger.tsx'), 'utf-8');
const code = SRC.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

describe('F2 · 장부 시작 폼의 새 클락은 emptyClockState 단일 소스로 만든다', () => {
  it('🔴 emptyClockState 를 import 하고 SessionForm 의 새 클락이 그것을 펼친다', () => {
    expect(code).toMatch(/import \{[^}]*\bemptyClockState\b[^}]*\} from '\.\.\/\.\.\/api\/clock';/);
    // 2026-09-17: 모양이 바뀌었다(아래 F2b 참고) — 지켜야 할 것은 **emptyClockState 를 펼친다**는 사실이다.
    expect(code).toMatch(/\{ \.\.\.emptyClockState\(base\.venueId, cfg, base\.gameSeq\), title: base\.title \?\? '' \}/);
  });

  // 🔴 F2b (2026-09-17) — 새로 생긴 계약이다. 여기서 쓰던 clockState 는 폼 마운트 시 한 번 읽은 스냅샷이라
  //   장부 판 keep-alive 동안 낡고, 조회 실패 시에는 아예 null 이었다. 그 값으로 전 행 upsert 를 하면
  //   **진행 중인 대회가 0 으로 초기화된다.** 쓰기 직전 재조회 + 진행 흔적 검사를 계약으로 박아 둔다.
  it('🔴 클락 설정 쓰기 전에 다시 읽고, 진행 중이면 덮지 않는다', () => {
    expect(code, '쓰기 직전 재조회가 사라졌다').toMatch(/const fresh = await getClockState\(base\.venueId, base\.gameSeq\);/);
    expect(code, '진행 흔적 검사가 사라졌다').toMatch(/fresh\.running \|\| clockHasProgress\(fresh\)/);
  });

  it('🔴 `remainingMs: 0` 인라인 리터럴이 파일에 없다 — 있으면 시작 전 클락이 PAUSED 가 된다', () => {
    expect(code).not.toMatch(/remainingMs:\s*0\b/);
  });
});

describe('F4 · fullAccess 가 아닌 호출자의 담당 후보는 미확정이다 — 자동 선택하지 않는다', () => {
  it('🔴 SessionForm 두 호출부 모두 operatorOptionsPartial={!fullAccess} 를 넘긴다', () => {
    const n = (code.match(/operatorOptionsPartial=\{!fullAccess\}/g) ?? []).length;
    expect(n, '장부 열기·세션 수정 두 곳').toBe(2);
  });

  it('🔴 부분 목록이면 operatorOptions[0] 을 자동 선택하지 않는다(담당 비움 = 권한 직원 전원 열람)', () => {
    expect(code).toMatch(/operatorOptionsPartial = false,/);
    expect(code).toMatch(/: base\.openedBy \? \[base\.openedBy\]\s*: \(!operatorOptionsPartial && operatorOptions\[0\]\) \? \[operatorOptions\[0\]\.id\] : \[\],/);
    expect(code).not.toMatch(/: operatorOptions\[0\] \? \[operatorOptions\[0\]\.id\] : \[\],/);
  });

  it('부분 목록 안내가 뜬다 — 왜 전부가 아닌지와 비워 두면 어떻게 되는지를 말한다', () => {
    const i = code.indexOf('{operatorOptionsPartial && (');
    expect(i, '부분 목록 안내 블록이 없다').toBeGreaterThan(-1);
    const block = code.slice(i, i + 700);
    expect(block).toMatch(/role="status"/);
    expect(block).toContain('업주·운영자 계정에서만');
    expect(block).toContain('담당을 비워 두면 장부 권한 직원 모두가');
  });
});

describe('F5 · 연동 클락은 이 매장·이 게임의 것일 때만 정본이다', () => {
  it('🔴 clockLinked 가 venueId 까지 대조한다', () => {
    const m = code.match(/const clockLinked = [^;]+;/);
    expect(m, 'clockLinked 정의를 찾지 못했다').not.toBeNull();
    expect(m![0]).toContain('clock.venueId === venueId');
    expect(m![0]).toContain('clock.sessionDate === date');
    expect(m![0]).toContain('clock.gameSeq === gameSeq');
  });

  it('🔴 reloadClock 이 owner 스탬프(staleResponse)를 쓰고, 대상이 바뀌면 먼저 클락을 비운다', () => {
    expect(code).toMatch(/import \{ isFreshResponse, type RequestStamp \} from '\.\.\/\.\.\/lib\/staleResponse';/);
    const i = code.indexOf('const reloadClock = useCallback(');
    expect(i, 'reloadClock 을 찾지 못했다').toBeGreaterThan(-1);
    const end = code.indexOf('}, [venueId, gameSeq, clockSaver]);', i);   // 2026-09-24 CLOCK-TAP-LAG: 저장기 의존성 추가
    expect(end, 'reloadClock 끝을 찾지 못했다').toBeGreaterThan(i);
    const body = code.slice(i, end);
    expect(body).toMatch(/const owner = `\$\{venueId\}#\$\{gameSeq\}`;/);
    expect(body).toMatch(/if \(clockReq\.current\.owner !== owner\) setClock\(null\);/);
    expect(body).toMatch(/const stamp: RequestStamp<string> = \{ seq: clockReq\.current\.seq \+ 1, owner \};/);
    expect(body).toMatch(/clockReq\.current = stamp;/);
    expect(body).toMatch(/\.then\(\(c\) => \{ if \(isFreshResponse\(stamp, clockReq\.current\) && !clockSaver\.busy\) setClock\(c\); \}\)/);
    // CLOCK-TAP-LAG: 저장 대기 중 재조회는 화면에 쓰지 않는다(자기 저장 에코가 앞선 값으로 되돌린다).
    expect(body).toMatch(/if \(clockSaver\.busy\) \{ clockReloadAfterSaveRef\.current = true; return; \}/);
    // 옛 모양(무가드 setClock)이 남아 있지 않다.
    expect(body).not.toMatch(/\.then\(setClock\)/);
  });
});
