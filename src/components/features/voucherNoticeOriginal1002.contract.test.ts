// 이용권 전송 화면의 법적 고지 — 원문 고정(2026-10-02 리드 지시).
// 1c(0d51fe88)에서 문장을 줄였는데, 그 자리 주석은 "문구를 바꿔야 하면 오너 확인을 받아라" 다. 오너 확인 전이라 원문으로 되돌렸다.
// 문구를 바꾸려면 오너 확인을 받은 뒤 이 테스트도 같이 고친다(CheckinModal 의 같은 취지 문구와 함께).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'VoucherManageModal.tsx'), 'utf8');

describe('VoucherManageModal 이용권 고지 — 원문', () => {
  it('범위·양도 불가·금전적 가치 없음 문장이 원문 그대로다', () => {
    expect(SRC).toContain('매장이용권 전송은 이 매장의 업주·공동운영자 중 관리자 승인을 받은 계정만 할 수 있습니다.');
    expect(SRC).toContain('손님끼리 주고받을 수 없으며, <b className="text-ink-primary">금전적 가치가 없습니다</b>(매장 안에서 참가비로만 쓸 수 있고 다른 용도로 바꿀 수 없습니다).');
    expect(SRC).toContain('본인인증을 마친 회원 계정에만 전송됩니다(받는 손님 지정 필수)');
  });
});
