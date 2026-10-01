// 신고 → 제재 연결(점검 A-07, 2026-10-01): 신고 행에서 제재할 '작성자'를 어떻게 정하는가
// 개정(검토 T11, 2026-10-02): 신고 행의 target_owner_id 는 예전에 신고자가 적은 값이었다 — 원문 행의 작성자가 이긴다.
// 실행: npx vitest run src/api/reports.reportedUser.test.ts
import { describe, it, expect, vi } from 'vitest';

const AUTHOR = 'u-author';
const FORGED = 'u-forged';
const rows: Record<string, unknown[]> = {
  reports: [
    { id: 'r1', reporter_name: 'a', target_type: 'post', target_id: 'p1', target_owner_id: FORGED, target_summary: null, reason: 'x', status: 'open', created_at: '2026-10-02T00:00:00Z' },
    { id: 'r2', reporter_name: 'b', target_type: 'comment', target_id: 'c1', target_owner_id: FORGED, target_summary: null, reason: 'x', status: 'open', created_at: '2026-10-02T00:00:00Z' },
    { id: 'r3', reporter_name: 'c', target_type: 'listing', target_id: 'l1', target_owner_id: FORGED, target_summary: null, reason: 'x', status: 'open', created_at: '2026-10-02T00:00:00Z' },
    { id: 'r4', reporter_name: 'd', target_type: 'post', target_id: 'gone', target_owner_id: AUTHOR, target_summary: null, reason: 'x', status: 'open', created_at: '2026-10-02T00:00:00Z' },
  ],
  community_posts: [{ id: 'p1', user_id: AUTHOR, title: 't', content: 'c' }],
  comments: [{ id: 'c1', user_id: AUTHOR, content: 'c' }],
  marketplace_listings: [{ id: 'l1', seller_id: AUTHOR, title: 'l' }],
};
vi.mock('../lib/supabase', () => {
  const q = (name: string) => {
    const res = Promise.resolve({ data: rows[name] ?? [], error: null });
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'order', 'limit', 'in']) chain[k] = () => Object.assign(res, chain);
    return chain;
  };
  return { IS_MOCK: false, supabase: { from: (n: string) => q(n) } };
});

import { reportedUserId, getReportQueue } from './reports';

describe('reportedUserId', () => {
  it('원문을 못 읽었으면 저장된 작성자(targetOwnerId — 20261002a 트리거가 서버에서 채운다)', () => {
    for (const targetType of ['post', 'comment', 'listing', 'live']) {
      expect(reportedUserId({ targetType, targetId: 'x1', targetOwnerId: 'u9' })).toBe('u9');
    }
  });
  it('원문 작성자가 있으면 저장된 칸보다 이긴다(위조된 칸 무시)', () => {
    expect(reportedUserId({ targetType: 'post', targetId: 'x1', targetOwnerId: FORGED }, AUTHOR)).toBe(AUTHOR);
  });
  it('회원 신고는 대상 id 자체 — 원문 작성자·저장 칸을 보지 않는다', () => {
    expect(reportedUserId({ targetType: 'user', targetId: 'u7', targetOwnerId: undefined })).toBe('u7');
    expect(reportedUserId({ targetType: 'user', targetId: 'u7', targetOwnerId: FORGED }, AUTHOR)).toBe('u7');
  });
  it('작성자를 모르면 null — 제재 버튼을 그리지 않는다', () => {
    expect(reportedUserId({ targetType: 'post', targetId: 'x1', targetOwnerId: undefined })).toBeNull();
    expect(reportedUserId({ targetType: 'user', targetId: undefined, targetOwnerId: 'u9' })).toBeNull();
  });
});

describe('getReportQueue — 작성자는 원문 행에서', () => {
  it('게시글·댓글·매물 신고의 작성자 칸이 위조돼 있어도 대기 목록은 원문 작성자를 제재 대상으로 보인다', async () => {
    const q = await getReportQueue();
    const by = Object.fromEntries(q.map((r) => [r.id, r]));
    expect(by.r1.authorId).toBe(AUTHOR);
    expect(by.r2.authorId).toBe(AUTHOR);
    expect(by.r3.authorId).toBe(AUTHOR);
    // 이력도 같은 기준: 위조 칸(FORGED)으로 세지 않는다
    expect(by.r1.authorReports).toBe(4);
    expect(q.some((r) => r.authorId === FORGED)).toBe(false);
  });
  it('원문이 지워진 신고는 targetMissing — 화면이 정지 버튼을 숨긴다(서버도 거절)', async () => {
    const q = await getReportQueue();
    const gone = q.find((r) => r.id === 'r4')!;
    expect(gone.targetMissing).toBe(true);
    expect(gone.authorId).toBe(AUTHOR);   // 회원 관리로 가는 '작성자 제재' 안내는 서버가 채운 칸으로 유지
  });
});
