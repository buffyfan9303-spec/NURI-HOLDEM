// UP-11 · UP-15 · UP-19 (2026-10-08 user-fixes) — 화면 소스 계약. 각 항목을 되돌리면 해당 케이스가 실패한다.
//   UP-13b(순수 함수)는 src/lib/venueVisitRank.test.ts, UP-08(키보드)은 e2e/notif-thread-race.spec.ts 에 있다.
// 실행: npx vitest run src/components/features/userFixes1008.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('UP-15 후기 답글 — 고치지 않고 저장해도 기존 답글을 지우지 않는다', () => {
  const src = read('VenueReviews.tsx');
  it("replyToReview 인자는 draft → 기존 ownerReply → '' 순서다(서버가 빈 값이면 답글을 지운다)", () => {
    expect(src).toMatch(/replyToReview\(r\.id, replyDraft\[r\.id\] \?\? r\.ownerReply \?\? ''\)/);
  });
});

describe('UP-11 내 모임 — 계정이 바뀌면 이전 계정 목록이 남지 않는다', () => {
  const src = read('CommunityTab.tsx');
  const fn = src.slice(src.indexOf('function MyCommunitiesAction'), src.indexOf('function MyCommunitiesAction') + 2500);
  it('재조회 effect 가 user?.id 에 의존한다', () => {
    expect(fn).toMatch(/useEffect\(\(\) => \{ reload\(\); \}, \[version, user\?\.id\]\)/);
  });
  it('user 가 바뀌면 owned/joined 를 먼저 비운다', () => {
    expect(fn).toMatch(/setOwned\(\[\]\); setJoined\(\[\]\); \}, \[user\?\.id\]\)/);
  });
  it('늦게 온 응답은 세대 가드로 버린다', () => {
    expect(fn).toMatch(/g === gen\.current\) setOwned/);
    expect(fn).toMatch(/g === gen\.current\) setJoined/);
  });
});

describe('UP-19 예약 취소 — 키보드 초점이 보이지 않는 버튼에 가지 않는다', () => {
  const src = read('CustomerDashboardPage.tsx');
  const row = src.slice(src.indexOf('function SwipeCancelRow'), src.indexOf('function RecordSummary'));
  it('취소 버튼이 peer 이고 덮개가 peer-focus 에서 비켜난다(모든 폭)', () => {
    expect(row).toMatch(/className="peer absolute inset-y-0 right-0/);
    expect(row).toMatch(/peer-focus:translate-x-\[-76px\]/);
  });
  it('안쪽 열기 버튼 초점에는 반응하지 않는다(group-focus-within 금지)', () => {
    expect(row).not.toMatch(/group-focus-within/);
  });
});
