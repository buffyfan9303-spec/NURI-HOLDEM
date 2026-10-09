// UP-02·05·06·07·16·18(2026-10-08, audit12 triage-user) — 커뮤니티 P3 묶음의 수정 전 FAIL·후 PASS 계약.
// 렌더러 없이(vitest environment: node) 순수 함수는 직접, 컴포넌트 배선은 소스로 검증한다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyCommentEvent } from './PostDetailModal';
import { samePostProps, type PostRowData } from './community/PostRowCard';
import { mergeEarlyRows } from '../../lib/mergeEarlyRows';
import { revokeDropped } from '../../lib/blobPreviews';
import type { Comment, CommunityPost } from '../../api/community';

const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const c = (id: string): Comment => ({
  id, parentId: undefined, userId: 'u1', userName: 'a', userRole: 'user', isOwner: false,
  content: id, createdAt: '2026-10-08T00:00:00.000Z',
});

describe('UP-05 · 실시간 INSERT 가 HTTP 응답보다 먼저 와도 댓글은 한 번만', () => {
  it('insert 이벤트 → onSaved(같은 id) 순서에서 길이 1', () => {
    let list = applyCommentEvent([], { type: 'insert', comment: c('x') });
    list = applyCommentEvent(list, { type: 'insert', comment: c('x') });
    expect(list.map((r) => r.id)).toEqual(['x']);
  });
  it('onSaved 는 무조건 앞에 붙이지 않고 applyCommentEvent 로 병합한다', () => {
    const s = src('./PostDetailModal.tsx');
    expect(s).toMatch(/onSaved:\s*\(saved\)\s*=>\s*setReplies\(\(prev\)\s*=>\s*applyCommentEvent\(prev,\s*\{\s*type:\s*'insert',\s*comment:\s*saved\s*\}\)\)/);
    expect(s).not.toMatch(/setReplies\(\(prev\)\s*=>\s*\[saved,/);
  });
});

describe('UP-06 · 늦은 초기 조회가 먼저 받은 실시간 행을 덮지 않는다', () => {
  it('댓글(최신이 앞): 먼저 받은 새 댓글 B 가 늦은 조회 [A] 뒤에도 남는다', () => {
    expect(mergeEarlyRows([c('B')], [c('A')], 'front').map((r) => r.id)).toEqual(['B', 'A']);
  });
  it('채팅(최신이 뒤): 먼저 받은 메시지가 끝에 남는다', () => {
    expect(mergeEarlyRows([c('m3')], [c('m1'), c('m2')], 'back').map((r) => r.id)).toEqual(['m1', 'm2', 'm3']);
  });
  it('겹치는 id 는 조회 결과를 쓰고 중복되지 않는다', () => {
    const early = { ...c('A'), content: 'old' };
    const out = mergeEarlyRows([early], [c('A')], 'front');
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('A');
  });
  it('재접속·재시도(prev=null)면 조회 결과 그대로', () => {
    const fetched = [c('A')];
    expect(mergeEarlyRows(null, fetched, 'back')).toBe(fetched);
  });
  it('PostDetailModal·GroupPage 가 조회 응답으로 목록을 통째 교체하지 않는다', () => {
    const pd = src('./PostDetailModal.tsx');
    expect(pd).not.toMatch(/setReplies\(cs\)/);
    expect(pd).toMatch(/setReplies\(\(prev\)\s*=>\s*mergeEarlyRows\(prev,\s*cs,\s*'front'\)\)/);
    const gp = src('./GroupPage.tsx');
    expect(gp).not.toMatch(/setMessages\(m\.reverse\(\)\)/);
    expect(gp).toMatch(/setMessages\(\(prev\)\s*=>\s*mergeEarlyRows\(prev,\s*m\.reverse\(\),\s*'back'\)\)/);
  });
});

describe('UP-07 · 이전 글의 반응 실패가 다음 글 카운터를 덮지 않는다', () => {
  it('react 의 catch 는 startId 가 지금 글일 때만 되돌린다', () => {
    const s = src('./PostDetailModal.tsx');
    const body = s.slice(s.indexOf('const react = async'), s.indexOf('const handleBump'));
    expect(body).toMatch(/const startId = post\.id;/);
    const catchBody = body.slice(body.indexOf('} catch (e) {'));
    expect(catchBody).toMatch(/if \(currentPostIdRef\.current === startId\) \{ setMyReaction\(before\.my\); setBb\(before\.bb\); setGr\(before\.gr\); \}/);
    expect(catchBody).not.toMatch(/^\s*setMyReaction\(before\.my\);/m);
  });
});

describe('UP-18 · 닉네임 색이 늦게 와도 카드가 다시 그려진다', () => {
  const post = { id: 'p1' } as CommunityPost;
  it('nickToken 만 바뀌면 memo 비교가 다르다고 판정한다', () => {
    const a: PostRowData = { post, nickToken: undefined };
    const b: PostRowData = { post, nickToken: 'gold' };
    expect(samePostProps(a, b)).toBe(false);
    expect(samePostProps(b, { post, nickToken: 'gold' })).toBe(true);
  });
});

describe('UP-02 · 미리보기 blob URL 은 빠진 것만 해제한다', () => {
  afterEach(() => vi.restoreAllMocks());
  it('1장 선택 → 추가 선택: 남아 있는 URL 은 revoke 0회', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeDropped(['blob:1'], ['blob:1', 'blob:2']);
    expect(spy).not.toHaveBeenCalled();
  });
  it('삭제·초기화로 빠진 URL 은 해제한다', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeDropped(['blob:1', 'blob:2'], ['blob:2']);
    expect(spy.mock.calls).toEqual([['blob:1']]);
  });
  it('두 폼 모두 이전 배열 전체를 revoke 하는 cleanup 이 없다', () => {
    for (const f of ['./MarketplaceFormModal.tsx', './PostFormModal.tsx']) {
      const s = src(f);
      expect(s, f).not.toMatch(/previews\.forEach\(\(u\)\s*=>\s*URL\.revokeObjectURL\(u\)\)/);
      expect(s, f).toMatch(/useRevokeDroppedPreviews\(previews\)/);
    }
  });
});

describe('UP-16 · 딜러 받은 지원서 조회 실패를 "없음"으로 보이지 않는다', () => {
  it('catch 를 삼키지 않고 LoadErrorCard 로 가른다', () => {
    const s = src('./DealerCommunity.tsx');
    expect(s).not.toMatch(/getDealerApplications\(post\.id\)\.then\(setApps\)\.catch\(\(\) => \{\}\)/);
    expect(s).toMatch(/appsErr \? \(\s*<LoadErrorCard error=\{appsErr\} what="받은 지원서"/);
  });
});
