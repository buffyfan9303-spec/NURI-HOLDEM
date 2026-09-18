// 스윕①(2026-09-19): 이용권 보유자 표시명 정본화.
//
// 버그: '보유자별 상세'(holderLabel)가 실명은 있고 닉네임은 없는 보유자를 '홍길동/매장 보관' 처럼
//   존재하지 않는 값과 붙여 보여줬다(`p.nickname ?? g.name` 에서 g.name 이 '매장 보관' 대체 문구였다).
//   같은 사람이 '이용 내역' 피드에서는 '홍길동' 한 줄로 보여 한 화면에서 이름이 둘이었다.
// 고침: api/vouchers.ts 의 voucherHolderLabel(정본, 서버 issue_reason 과 무관한 순수 함수) 하나로
//   whoOf·recentRecipients·holderLabel 세 복제를 대체했다(VoucherManageModal.tsx).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voucherHolderLabel } from '../../api/vouchers';

describe('voucherHolderLabel — 정본 함수', () => {
  it('실명+닉네임 둘 다 있으면 실명/닉네임', () => {
    expect(voucherHolderLabel({ realName: '홍길동', nickname: '길동이' })).toBe('홍길동/길동이');
  });
  it('실명만 있고 닉네임·holderName 이 없으면 실명만(대체 문구를 안 붙인다)', () => {
    expect(voucherHolderLabel({ realName: '홍길동', nickname: null, holderName: null })).toBe('홍길동');
  });
  // ⚠ voucherHolderLabel 자체는 holderName 을 "닉네임이 없을 때 쓸 발급 당시 이름"으로 **정당하게** 쓴다
  //   (문서 주석: "닉네임(또는 발급 당시 이름)") — holderName='매장 보관' 을 넣으면 당연히 그대로 조합된다.
  //   실제 버그는 이 함수가 아니라 **호출부**(VoucherManageModal.tsx 의 holders useMemo)가 진짜 이름이
  //   없는 자리에 '매장 보관' 이라는 사람이 읽는 문구를 holderName 자리에 미리 채워 넣은 것이었다 —
  //   그건 아래 소스 스캔이 잡는다.
  it('닉네임만 있으면 닉네임만', () => {
    expect(voucherHolderLabel({ realName: null, nickname: '길동이' })).toBe('길동이');
  });
  it('아무 정보도 없으면 -', () => {
    expect(voucherHolderLabel({})).toBe('-');
  });
});

describe('VoucherManageModal — 복제 제거 확인(소스 스캔)', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/features/VoucherManageModal.tsx'), 'utf8');
  it('voucherHolderLabel 을 import 하고 3곳(whoOf·recentRecipients·holderLabel)에서 쓴다', () => {
    expect(src).toMatch(/voucherHolderLabel[^,]*,?\s*type VoucherReason\s*\}\s*from\s*'\.\.\/\.\.\/api\/vouchers'/);
    const calls = src.match(/voucherHolderLabel\(\{/g) ?? [];
    expect(calls.length, `voucherHolderLabel(...) 호출 횟수: ${calls.length}`).toBeGreaterThanOrEqual(3);
  });
  it("되돌아간 조합 패턴(p.nickname ?? g.name, p?.nickname ?? g.name 등)이 없다", () => {
    expect(src).not.toMatch(/p\??\.nickname\s*\?\?\s*g\.name/);
  });
  it("holders useMemo 의 raw name 에 '매장 보관' 대체 문구를 미리 넣지 않는다", () => {
    expect(src).not.toMatch(/name:\s*v\.holderName\s*\?\?\s*'매장 보관'/);
  });
});
