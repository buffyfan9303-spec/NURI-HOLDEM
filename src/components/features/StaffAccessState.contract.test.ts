// 직원 권한 화면이 '조회 실패' 를 '권한 없음' 으로 그리지 않는다 — 배선 계약 (P02, 2026-09-13).
//
// 왜 계약인가: API(getLedgerAccessUserIds·getVoucherAccessUserIds)가 실패를 던지게 고쳐도(staffAccess.errorPropagation.test.ts),
//   호출부가 `.catch(() => {})` 로 삼키고 `ids.includes(id)` 만 보면 화면은 여전히 "전원 권한 없음" 이다.
//   판정은 src/lib/staffAccess.ts 가 순수 함수로 들고(staffAccess.test.ts), **그 함수를 화면이 실제로 부르는지**는 여기서 본다 —
//   단위 테스트가 함수를 직접 import 하면 아무도 안 부르는 함수도 초록이다(nuri-verify §3-6).
//
// 이 파일이 보는 것:
//   1. StaffManager 의 두 권한 상태가 string[] 이 아니라 AccessLoad(확인 중/실패/준비됨) 다.
//   2. 두 권한 조회가 Promise.all 한 덩어리가 아니라 각자 effect 에서 실패를 status:'error' 로 받는다.
//   3. toggleAccess/toggleVoucher 가 accessViewOf → canToggleAccess 게이트를 지나야만 grant/revoke 를 보낸다.
//   4. 버튼 글귀가 accessLabel(다섯 상태) 을 쓰고, 옛 `access.includes(s.id)` 이분 렌더가 남아 있지 않다.
//   5. 실패 안내 문구가 '다음 행동' 을 말한다.
//   6. NuriPosLedger 의 담당 후보가 AccessLoad 로 실패를 들고 SessionForm 에 재시도를 넘긴다.
// 못 보는 것: 문장의 존재만 본다 — 실제 렌더 결과·클릭 후 네트워크 요청은 e2e 몫이다. 이름을 바꾼 복제본은 못 잡는다.
// 음성 대조: VenueManageTab.tsx 의 `if (!canToggleAccess(view)) {` 를 `if (false) {` 로 바꾸면 3번이,
//   게이트 블록의 `return;` 한 줄만 지워도 3번이(독립 검증 2026-09-13 에서 초판이 이걸 못 봤다 — 괄호 균형으로 고침),
//   NuriPosLedger.tsx 의 `.catch((e: unknown) => { if (alive) setAccessLoad({ status: 'error', error: e }); })` 를
//   `.catch(() => {})` 로 되돌리면 6번이 실패한다.
// 실행: npx vitest run src/components/features/StaffAccessState.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ⚠ 블록 주석은 **공백·줄머리·`{`·`(` 뒤의 `/*` 만** 지운다 — VenueManageTab.tsx 에 `accept="image/*"` 가 있어
//   단순 `/\/\*[\s\S]*?\*\//` 는 거기서 다음 `*/` 까지(StaffManager 선언 포함 3.5KB)를 통째로 삼켰다(2026-09-13 실측).
const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const VMT = strip(readFileSync(join(__dirname, 'VenueManageTab.tsx'), 'utf-8'));
const POS = strip(readFileSync(join(__dirname, 'NuriPosLedger.tsx'), 'utf-8'));

// StaffManager 본문만 잘라 본다 — 같은 파일의 다른 컴포넌트 문장을 주워 통과하지 않게.
const smStart = VMT.indexOf('function StaffManager(');
expect(smStart, 'StaffManager 를 찾지 못했다').toBeGreaterThan(-1);
const SM = VMT.slice(smStart);

describe('P02 · StaffManager 는 권한 조회의 다섯 상태를 든다', () => {
  it('두 권한 상태가 AccessLoad(확인 중/확인 실패/준비됨)이지 string[] 이 아니다', () => {
    expect(SM).toMatch(/useState<AccessLoad>\(\{ status: 'loading' \}\)/);
    expect(SM).not.toMatch(/const \[access, setAccess\] = useState<string\[\]>/);
    expect(SM).not.toMatch(/const \[vouch, setVouch\] = useState<string\[\]>/);
    expect(SM, '변경 중 집합이 없다').toMatch(/const \[changing, setChanging\] = useState<ReadonlySet<string>>/);
  });

  it('🔴 권한 두 조회는 각자 실패를 status:\'error\' 로 받는다 — Promise.all 한 덩어리에 넣지 않는다', () => {
    expect(SM).toMatch(/getLedgerAccessUserIds\(venueId\)\s*\.then\(\(ids\) => \{ if \(alive\) setAccess\(\{ status: 'ready', ids \}\); \}\)\s*\.catch\(\(e: unknown\) => \{ if \(alive\) setAccess\(\{ status: 'error', error: e \}\); \}\)/);
    expect(SM).toMatch(/getVoucherAccessUserIds\(venueId\)\s*\.then\(\(ids\) => \{ if \(alive\) setVouch\(\{ status: 'ready', ids \}\); \}\)\s*\.catch\(\(e: unknown\) => \{ if \(alive\) setVouch\(\{ status: 'error', error: e \}\); \}\)/);
    expect(SM).not.toMatch(/Promise\.all\(\[[^\]]*getLedgerAccessUserIds/);
    expect(SM).not.toMatch(/Promise\.all\(\[[^\]]*getVoucherAccessUserIds/);
  });

  it('🔴 토글은 canToggleAccess 게이트를 지나야만 grant/revoke 를 보낸다 — 확인 실패에서는 재조회만', () => {
    for (const [fn, grant, revoke, reloadFn] of [
      ['toggleAccess', 'grantLedgerAccess', 'revokeLedgerAccess', 'reloadAccess'],
      ['toggleVoucher', 'grantVoucherAccess', 'revokeVoucherAccess', 'reloadVouch'],
    ] as const) {
      const start = SM.indexOf(`const ${fn} = async (id: string) => {`);
      expect(start, `${fn} 을 찾지 못했다`).toBeGreaterThan(-1);
      const body = SM.slice(start, SM.indexOf('\n  };', start));
      const load = fn === 'toggleAccess' ? 'access' : 'vouch';
      // view 는 **그 권한의** 로드에서 나와야 한다 — toggleAccess 가 vouch 를 보면 초록인 채 엉뚱한 값을 저장한다(독립 검증 2026-09-13).
      expect(body, `${fn}: view 가 ${load} 로드에서 나오지 않는다`).toContain(`const view = accessViewOf(${load}, changingOf('${load === 'access' ? 'ledger' : 'voucher'}'), id);`);
      const gate = body.indexOf('if (!canToggleAccess(view)) {');
      expect(gate, `${fn}: canToggleAccess 게이트가 없다`).toBeGreaterThan(-1);
      // 게이트 블록 = 여는 `{` 부터 짝 `}` 까지를 괄호 균형으로 자른다. 그 안에 `return;` 이 **있어야** 하고
      // (독립 검증 2026-09-13: `return;` 한 줄을 지워도 `indexOf('return;')=-1` → slice(gate,-1) 로 본문 전체가 블록이 되어
      //  초록이었다 — 실제로는 토스트 뒤 그대로 흘러 has=false 로 grant 가 나가는 P02 원래 피해), grant/revoke 는 그 짝 `}` 뒤에만 있다.
      const open = body.indexOf('{', gate);
      let depth = 0; let close = -1;
      for (let i = open; i < body.length; i++) {
        if (body[i] === '{') depth += 1;
        else if (body[i] === '}') { depth -= 1; if (depth === 0) { close = i; break; } }
      }
      expect(close, `${fn}: 게이트 블록의 짝 } 를 찾지 못했다`).toBeGreaterThan(open);
      const gateBlock = body.slice(open, close + 1);
      expect(gateBlock, `${fn}: 게이트 블록 안에 return; 이 없다 — 실패 안내 뒤 grant 가 그대로 나간다`).toMatch(/\breturn;\s*\}$/);
      expect(gateBlock).toContain('accessLoadFailedMsg(');
      expect(gateBlock).toContain(`${reloadFn}()`);
      expect(gateBlock, `${fn}: 게이트 블록 안에 ${grant} 가 있다`).not.toContain(grant);
      expect(gateBlock, `${fn}: 게이트 블록 안에 ${revoke} 가 있다`).not.toContain(revoke);
      expect(body.indexOf(grant), `${fn}: ${grant} 가 게이트 블록 뒤에 없다`).toBeGreaterThan(close);
      expect(body.indexOf(revoke), `${fn}: ${revoke} 가 게이트 블록 뒤에 없다`).toBeGreaterThan(close);
      expect(body, `${fn}: 변경 중 표시가 없다`).toMatch(/markChanging\(`(ledger|voucher):\$\{id\}`, true\)/);
      expect(body, `${fn}: 변경 중 해제가 finally 에 없다`).toMatch(/finally \{ markChanging\(`(ledger|voucher):\$\{id\}`, false\); \}/);
      expect(body, `${fn}: has 가 view 에서 나오지 않는다`).toContain("const has = view === 'granted';");
    }
  });

  it('버튼 글귀가 다섯 상태 라벨을 쓰고, 옛 이분 렌더(access.includes / vouch.includes)가 남아 있지 않다', () => {
    expect(SM).toContain("accessLabel('ledger', accessView)");
    expect(SM).toContain("accessLabel('voucher', vouchView)");
    expect(SM).not.toMatch(/access\.includes\(/);
    expect(SM).not.toMatch(/vouch\.includes\(/);
    expect(SM, '확인 중·변경 중 버튼이 비활성이 아니다').toMatch(/disabled=\{accessBusy\}/);
    expect(SM).toMatch(/disabled=\{vouchBusy\}/);
    // busy 는 상수가 아니라 그 버튼의 view 에서 나와야 한다(독립 검증: `const accessBusy = false as boolean;` 이 살아남았다).
    expect(SM).toContain("const accessBusy = accessView === 'checking' || accessView === 'changing';");
    expect(SM).toContain("const vouchBusy = vouchView === 'checking' || vouchView === 'changing';");
    expect(SM).toContain("const accessView = accessViewOf(access, changingOf('ledger'), s.id);");
    // 색 톤(on)도 같은 view 에서 — 검증 2회차 M10: `hasAccess = vouchView === 'granted'` 가 살아남았다(라벨은 맞고 색만 거짓).
    expect(SM).toContain("const hasAccess = accessView === 'granted';");
    expect(SM).toContain("const hasVouch = vouchView === 'granted';");
    expect(SM).toContain("const vouchView = accessViewOf(vouch, changingOf('voucher'), s.id);");
    expect(SM, '상태를 DOM 에 남기지 않는다(e2e·검증용)').toMatch(/data-access-state=\{accessView\}/);
  });

  it('실패 안내가 쉬운 말 + 다음 행동이고, 그동안 저장되지 않는다고 말한다 — 사유별 문장은 순수 함수 accessLoadFailedMsg 가 조회마다 정한다', () => {
    // P02 재작업 6(2026-09-13): 배너가 두 조회의 isDenied 를 OR 로 뭉개 한쪽 처방만 말하던 것 — 조회마다 accessLoadFailedMsg(error) 를 쓴다.
    // (세션 만료 PGRST301 은 '다시 시도' 가 아니라 재로그인 안내 — 문장은 src/lib/staffAccess.test.ts 가 잠근다.)
    expect(SM, '장부 조회 실패는 그 조회의 error 로 문장을 고른다').toMatch(/accessLoadFailedMsg\(access\.error\)/);
    expect(SM, '이용권 조회 실패도 그 조회의 error 로').toMatch(/accessLoadFailedMsg\(vouch\.error\)/);
    expect(SM, '배너에 사유 판정을 인라인으로 다시 쓰지 않는다').not.toMatch(/isDenied\(access\.error\)|isDenied\(vouch\.error\)/);
    expect(SM, '배너 문장은 하드코딩하지 않는다(순수 함수가 유일한 출처)').not.toContain('볼 수 있는 계정이 아니에요. 매장 업주 계정으로 다시 로그인해 주세요.');
    expect(SM).toContain('그동안 권한 버튼은 저장되지 않습니다.');
    // 화면 글귀(JSX 텍스트·라벨)에 '조회 실패' 같은 기술 용어를 쓰지 않는다 — 꼬리 주석은 제외하고 본다.
    expect(SM.replace(/\/\/.*$/gm, '')).not.toMatch(/조회 실패/);
  });

  it('🔴 P02 재작업 4 · 저장 실패는 catch 에서 직접 역연산으로 되돌린다(재조회만 걸면 한 커밋 동안 낙관값이 남는다)', () => {
    expect(SM).toContain("setAccess((a) => a.status === 'ready' ? { status: 'ready', ids: has ? [...a.ids, id] : a.ids.filter((x) => x !== id) } : a);");
    expect(SM).toContain("setVouch((a) => a.status === 'ready' ? { status: 'ready', ids: has ? [...a.ids, id] : a.ids.filter((x) => x !== id) } : a);");
  });

  it('🔴 P02 재작업 5 · 이용권 킬스위치 OFF 면 조회하지 않는다(버튼도 없는데 실패 배너만 뜨던 것)', () => {
    expect(SM).toContain("if (!vchOn) { setVouch({ status: 'ready', ids: [] }); return; }");
    expect(SM, 'effect 의존성에 vchOn').toMatch(/\}, \[tick, vouchTick, venueId, vchOn\]\);/);
  });

  it('구성원 목록 조회 실패도 0명이 아니라 오류 카드다', () => {
    expect(SM).toMatch(/<LoadErrorCard what="구성원 목록" error=\{listError\} onRetry=\{reload\} \/>/);
    expect(SM).toMatch(/\.catch\(\(e: unknown\) => \{ if \(alive\) setListError\(e\); \}\)/);
  });
});

describe('P02 · NuriPosLedger 의 담당 직원 후보는 실패를 조용히 비우지 않는다', () => {
  it('🔴 권한 직원 조회가 AccessLoad 로 실패를 들고, 옛 `.then(setAccessIds).catch(() => {})` 가 없다', () => {
    expect(POS).toMatch(/const \[accessLoad, setAccessLoad\] = useState<AccessLoad>\(\{ status: 'loading' \}\)/);
    expect(POS).toMatch(/getLedgerAccessUserIds\(venueId\)\s*\.then\(\(ids\) => \{ if \(alive\) setAccessLoad\(\{ status: 'ready', ids \}\); \}\)\s*\.catch\(\(e: unknown\) => \{ if \(alive\) setAccessLoad\(\{ status: 'error', error: e \}\); \}\)/);
    expect(POS).not.toMatch(/getLedgerAccessUserIds\(venueId\)\.then\(setAccessIds\)/);
    // 배너의 오류값은 로드 상태에서 **파생**돼야 한다(독립 검증: `const operatorOptionsError: unknown = null;` 이 살아남았다).
    expect(POS).toContain("const operatorOptionsError = accessLoad.status === 'error' ? accessLoad.error : staffLoadError;");
  });

  it('직원 목록 조회 실패도 같은 배너로 말한다 — 후보가 "나" 뿐인 것이 실제인지 못 불러온 것인지(독립 검증 Q2)', () => {
    expect(POS).not.toMatch(/getMyVenueStaff\(\)\.then\(setStaff\)\.catch\(\(\) => \{\}\)/);
    expect(POS).toMatch(/getMyVenueStaff\(\)\s*\.then\(\(s\) => \{ if \(alive\) setStaff\(s\); \}\)\s*\.catch\(\(e: unknown\) => \{ if \(alive\) setStaffLoadError\(e\); \}\)/);
  });

  it('SessionForm 두 호출부 모두 실패와 재시도를 넘긴다(장부 열기·세션 수정)', () => {
    const n = (POS.match(/operatorOptionsError=\{operatorOptionsError\} onRetryOperatorOptions=\{reloadAccessIds\}/g) ?? []).length;
    expect(n, 'SessionForm 호출부 2곳 전부에 넘겨야 한다').toBe(2);
  });

  it('SessionForm 이 실패를 문장 + 다시 시도 버튼으로 그린다', () => {
    expect(POS).toContain('권한 직원 목록을 불러오지 못했어요. 다시 시도해 주세요.');
    expect(POS).toMatch(/onClick=\{onRetryOperatorOptions\}/);
  });
});
