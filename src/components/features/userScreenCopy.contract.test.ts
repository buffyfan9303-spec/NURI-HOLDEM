// 유저 화면 부연설명 계약 — 오너 2026-09-17 "쓸데없는 부연설명들 빼".
// 화면을 보면 이미 아는 것·같은 말을 두 번 하는 문장을 지웠고, 되살아나지 않게 여기서 잠근다.
// 법적 고지(사업자정보·19세·1336)·금액/권한 경고·실패 원인 안내는 대상이 아니다(지우지 않았다).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf-8');

/** [파일, 남긴 문구, 지운 문구] — 남긴 문구가 있어야(기능 보존) 지운 문구가 없어야(부연 제거) 통과 */
const CASES: [string, string, string][] = [
  ['HomeTab.tsx',              '오늘·내일 예정 대회가 없어요',                    '다음 날짜에는 열려 있을 수 있어요'],
  ['ScheduleDetailModal.tsx',  '참가 후기를 커뮤니티 게시판(대회 후기)에 남겨보세요', '다른 플레이어에게 큰 도움이 됩니다'],
  ['VenuePage.tsx',            '체크인하면 출석 도장 · 전적 인정 · 방문 후기가 열려요', '하루 한 번이면 충분해요'],
  ['VenuePage.tsx',            '오늘 진행되는 포스터가 없습니다',                  '아래 예정 포스터를 확인해 보세요'],
  ['MyVoucherSheet.tsx',       '매장 비치 체크인 QR',                             '하루 한 번이면 충분해요'],
  ['MyVoucherSheet.tsx',       '수동으로 보내기',                                 '장수를 정하고 한 번 더 확인한 뒤 보냅니다'],
  ['MyVoucherSheet.tsx',       '업주 전화번호</b>를 입력하세요',                   '번호가 맞아야 서버가 보내 줍니다'],
  ['MyVoucherSheet.tsx',       '승인하면 확정됩니다',                              '매장 장부에 사용 요청으로 올라가고'],
  ['VoucherWallet.tsx',        '에서만 사용됩니다',                                '아래 방법 중 하나로 사용해 주세요'],
  ['CustomerDashboardPage.tsx', '레벨 도감',                                       '활동점수가 쌓이면 레벨이 오릅니다'],
  ['SeasonPanel.tsx',          '아직 시즌 순위 기록이 없습니다',                   '순위가 등록되면 집계됩니다'],
  ['CommunityTab.tsx',         '팔로워순',                                         '그룹을 선택해 커뮤니티를 이용하세요'],
];

describe('유저 화면 부연설명 제거 계약', () => {
  for (const [file, keep, gone] of CASES) {
    it(`${file}: "${keep}" 는 남고 "${gone}" 는 없다`, () => {
      const src = read(file);
      expect(src, `${file} 에서 기능 문구가 사라졌다`).toContain(keep);
      expect(src, `${file} 에 부연설명이 되살아났다`).not.toContain(gone);
    });
  }

  it('법적 고지·경고는 그대로다 — 부연 제거가 여기까지 번지면 안 된다', () => {
    expect(read('EventPage.tsx')).toContain('한 번 연 카드는 되돌릴 수 없어요');       // 되돌릴 수 없음 경고
    expect(read('ScheduleDetailModal.tsx')).toContain('휴대전화번호는 매장에 전달되지 않습니다'); // 개인정보 고지
    expect(read('MyVoucherSheet.tsx')).toContain('지갑으로 돌아옵니다');               // 승인 전 취소 결과
  });
});
