// VoucherManageModal — 조회 실패를 삼키지 않고(독립 검증 D), 매장 전환 경합을 막는다(N04-A) — 배선 계약 (2026-09-13).
//
// D: voucherHolderStats / voucherHolderProfiles 가 실패를 던지므로(V04) 옛 `.catch(() => {})` 는 실행되는 코드였다 — stats 가 null/낡은
//    값으로 남아 통계 칸이 조용히 비었다. 실패는 statsErr 로 들고 재시도 카드로 말한다.
// N04-A(적대 반증 생존): 패널은 매장 A→B 전환에 리마운트되지 않는데 비동기 setter 8개에 stale 가드가 0 이었다 — A 목록이 늦게 도착하면 B 화면에
//    A 이용권이 실려 '회수/삭제' 가 A 매장 id 로 나간다. 조회 묶음은 lib/venueVoucherLoad(staleResponse 계약)가 들고(동작 검사: venueVoucherLoad.test.ts),
//    venueId 가 바뀌면 상태를 초기화하며, 검색·쿼터 effect 는 cleanup(alive=false)으로 늦은 응답을 버린다.
//    승인 상태 조회 실패는 approvedErr 로 남긴다(초기값 true 가 '승인됨' 으로 위장하지 않게).
// 못 보는 것: 문장의 존재만 본다. 렌더는 e2e 몫.
// 음성 대조: VoucherManageModal.tsx 의 `loadVenueVoucherPanel(voucherReq,` 를 지우거나 초기화 effect 의 `setList([]);` 를 지우면 실패한다.
// 실행: npx vitest run src/components/features/voucherStatsFailure.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const VM = strip(readFileSync(join(__dirname, 'VoucherManageModal.tsx'), 'utf-8'));

describe('D · 보유자 통계 조회 실패를 삼키지 않는다', () => {
  it('🔴 statsErr 상태가 있고, 옛 빈 catch 가 없으며, 실패 카드 + 재시도가 있다', () => {
    expect(VM).toMatch(/const \[statsErr, setStatsErr\] = useState<unknown>\(null\);/);
    expect(VM).not.toMatch(/voucherHolderStats\(venueId\)\.then\(setStats\)\.catch\(\(\) => \{\}\)/);
    expect(VM).not.toMatch(/voucherHolderProfiles\(venueId\)[^\n]*\.catch\(\(\) => \{\}\)/);
    expect(VM).not.toMatch(/isVoucherIssueApproved\(venueId\)\.then\(setApproved\)\.catch\(\(\) => \{\}\)/);
    expect(VM).toMatch(/\{canIssue && ownerOpen && statsErr != null && <LoadErrorCard what="보유자 통계" error=\{statsErr\} onRetry=\{reload\} compact \/>\}/);
    expect(VM).toMatch(/\{canIssue && ownerOpen && statsErr == null && stats && \(/);
  });
});

describe('N04-A · 매장 전환 경합 — staleResponse 계약 배선', () => {
  it('🔴 reload 가 lib/venueVoucherLoad 에 위임하고(owner=venueId 스탬프), 모든 sink 를 넘긴다', () => {
    expect(VM).toMatch(/import \{ loadVenueVoucherPanel \} from '\.\.\/\.\.\/lib\/venueVoucherLoad';/);
    expect(VM).toMatch(/import type \{ RequestStamp \} from '\.\.\/\.\.\/lib\/staleResponse';/);
    expect(VM).toMatch(/const voucherReq = useRef<RequestStamp<string>>\(\{ seq: 0, owner: '' \}\);/);
    const i = VM.indexOf('const reload = () => {');
    const body = VM.slice(i, VM.indexOf('};', i));
    expect(body).toMatch(/loadVenueVoucherPanel\(voucherReq, venueId, canIssue,/);
    expect(body).toMatch(/\{ list: listVenueVouchers, stats: voucherHolderStats, profiles: voucherHolderProfiles, approved: isVoucherIssueApproved \}/);
    expect(body).toMatch(/approved: setApproved, approvedErr: setApprovedErr/);
    // 옛 무가드 직접 호출이 남아 있지 않다
    expect(body).not.toMatch(/listVenueVouchers\(venueId\)\.then\(/);
  });

  it('🔴 venueId 가 바뀌면 앞 매장 상태를 초기화하고 진행 중 응답을 stale 로 만든다', () => {
    const i = VM.indexOf('voucherReq.current = { seq: voucherReq.current.seq + 1, owner: venueId };');
    expect(i, '초기화 effect 의 스탬프 갱신이 없다').toBeGreaterThan(-1);
    const block = VM.slice(i, VM.indexOf('}, [venueId]);', i));
    for (const s of ['setList([]);', 'setListErr(null);', 'setStats(null);', 'setStatsErr(null);', 'setProfileMap(new Map());', 'setQuota(null);', 'setApproved(true);', 'setApprovedErr(null);', 'setRecvUserId(null);', 'setCands([]);']) {
      expect(block, `초기화에 ${s} 가 없다`).toContain(s);
    }
  });

  it('🔴 쿼터·프리필 검색·디바운스 검색 effect 가 cleanup 으로 늦은 응답을 버린다', () => {
    expect(VM).toMatch(/getVoucherQuota\(venueId\)\.then\(\(q\) => \{ if \(alive\) setQuota\(q\); \}\)/);
    expect(VM).toMatch(/\.then\(\(f\) => \{ if \(!alive\) return; if \(f\.length === 1\) pickRecv\(f\[0\]\); else setCands\(f\); \}\)/);
    expect(VM).toMatch(/finder\(q\)\.then\(\(f\) => \{ if \(!alive\) return; setCands\(f\); setActiveIdx\(-1\); \}\)/);
    expect(VM).not.toMatch(/useEffect\(reloadQuota,/);
  });

  it('🔴 승인 상태 조회 실패는 approvedErr 로 갈라 말하고 발급 버튼을 잠근다', () => {
    expect(VM).toMatch(/const \[approvedErr, setApprovedErr\] = useState<unknown>\(null\);/);
    expect(VM).toMatch(/\{!isAdmin && approvedErr != null && \(\s*<LoadErrorCard what="발급 승인 상태" error=\{approvedErr\} onRetry=\{reload\} compact/);
    expect(VM).toMatch(/disabled=\{busy \|\| \(!isAdmin && \(!approved \|\| approvedErr != null\)\)\}/);
  });
});
