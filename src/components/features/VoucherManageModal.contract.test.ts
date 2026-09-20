// Q2(2026-09-20) — VoucherManageModal 직접 발급 경로도 실행 전 최종 확인(매장/받는 회원/장수/사유/만료)을
// 받고, issueVoucher 가 돌려주는 실제 발급 수량을 요청 count 와 대조한다.
//
// 왜 소스 계약인가: 렌더 트리 테스트는 auth·supabase·모달 트리를 다 채워야 해서 이 저장소의 관용구가
//   아니다(voucherStaleGuard.test.ts·StoreDashboardRace.contract.test.ts 와 같은 결).
//
// 음성 대조: 확인 단계를 건너뛰고 버튼이 곧장 issue() 를 부르게 되돌리거나, issued===count 비교를
//   지우면 아래 테스트가 실패한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'VoucherManageModal.tsx'), 'utf-8');

describe('VoucherManageModal.tsx — Q2 최종 확인 + 발급 수량 대조', () => {
  it('confirmOpen 상태가 있다', () => {
    expect(SRC).toContain('const [confirmOpen, setConfirmOpen] = useState(false);');
  });

  it('매장이 바뀌면(venueId effect) 확인을 취소한다', () => {
    const m = SRC.match(/useEffect\(\(\) => \{\s*voucherReq\.current[\s\S]*?\}, \[venueId\]\);/);
    expect(m, 'venueId 변경 effect 를 찾지 못했다').not.toBeNull();
    expect(m![0]).toContain('setConfirmOpen(false)');
  });

  it('확인 내용(count·reason·expiry·recvUserId)이 하나라도 바뀌면 확인을 취소한다', () => {
    expect(SRC).toContain('useEffect(() => { setConfirmOpen(false); }, [count, reason, expiry, recvUserId]);');
  });

  it('issue() 가 issueVoucher 의 반환 수량을 count 와 대조하고, 일치할 때만 성공 토스트를 띄운다', () => {
    const m = SRC.match(/const issue = async \(\) => \{[\s\S]*?\n {2}\};/);
    expect(m, 'issue() 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('const issued = await issueVoucher(');
    expect(body).toMatch(/if \(issued === count\) \{/);
    expect(body, '불일치는 결과 확인 필요로 안내해야 한다(자동 재시도 금지)').toContain('결과 확인 필요');
    expect(body, '실패 시 확인 화면에 머무르지 않는다').toContain('setConfirmOpen(false)');
  });

  it('실행 버튼은 발급을 바로 부르지 않고 확인 단계를 연다', () => {
    expect(SRC).toContain('onClick={() => setConfirmOpen(true)} className="btn-primary min-h-[44px] w-full text-sm disabled:opacity-50">');
  });

  it('issue() 를 직접 부르는 자리는 확인 화면의 CTA 한 곳뿐이다', () => {
    const directCount = (SRC.match(/onClick=\{issue\}/g) ?? []).length;
    expect(directCount, '실행 버튼에 곧장 issue 가 달려 있으면 확인 단계를 건너뛴다').toBe(1);
  });

  it('확인 화면이 매장/받는 회원/장수/사유/만료 다섯 항목을 모두 보여준다', () => {
    const m = SRC.match(/\{confirmOpen \? \([\s\S]*?\) : \(/);
    expect(m, '확인 화면 블록을 찾지 못했다').not.toBeNull();
    const body = m![0];
    for (const label of ['매장:', '받는 회원:', '장수:', '사유:', '만료:']) {
      expect(body, `${label} 항목이 없다`).toContain(label);
    }
  });

  it('받는 회원 표시는 표시명 + userId 끝 6자리다 — 실명·전화 전체를 공개하지 않는다', () => {
    const m = SRC.match(/\{confirmOpen \? \([\s\S]*?\) : \(/);
    const body = m![0];
    expect(body).toContain('recvUserId.slice(-6)');
  });

  it('확인 화면의 취소·발급 버튼 둘 다 44px 이상이다', () => {
    const m = SRC.match(/\{confirmOpen \? \([\s\S]*?\) : \(/);
    const body = m![0];
    const hits = (body.match(/min-h-\[44px\]/g) ?? []).length;
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});
