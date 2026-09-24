// CommentThread 읽기시점 재그룹(검증 #05) 단위 테스트
// 버그: 대댓글의 replies 를 하드코딩 빈 배열로 렌더 → 3레벨 이상 댓글 화면 유실.
// 수정: groupThreads 가 루트 밑으로 전체 하위 트리를 평탄 수집(4레벨+ 흡수)하고,
//       루트 직속이 아닌 답글엔 원부모 닉(mentionOf='@원부모닉' 프리픽스 재료)을 붙인다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupThreads, guardedSubmit } from './CommentThread';
import type { Comment } from '../../api/community';

// 렌더러 없이(environment: node) 소스 배선만 보는 계약 — readingSurface.contract.test.ts 와 같은 관행.
const SRC = readFileSync(join(__dirname, 'CommentThread.tsx'), 'utf-8');

const c = (id: string, parentId: string | undefined, userName: string): Comment => ({
  id,
  parentId,
  userId: `u-${id}`,
  userName,
  userRole: 'user',
  isOwner: false,
  content: `내용 ${id}`,
  createdAt: '2026-08-01T00:00:00.000Z',
});

describe('groupThreads · 3레벨+ 대댓글 유실 0', () => {
  // 픽스처: 루트1 아래 4레벨 체인 + 루트2 아래 1레벨
  //   r1 ← a(2레벨) ← b(3레벨) ← d(4레벨)
  //   r2 ← e(2레벨)
  const fixture: Comment[] = [
    c('r1', undefined, '철수'),
    c('a', 'r1', '영희'),
    c('b', 'a', '민수'),
    c('d', 'b', '지연'),
    c('r2', undefined, '동혁'),
    c('e', 'r2', '수진'),
  ];

  it('3레벨+ 포함 전체 댓글이 렌더 트리에 남는다(유실 0)', () => {
    const threads = groupThreads(fixture);
    const renderedIds = threads.flatMap((t) => [t.root.id, ...t.replies.map((r) => r.comment.id)]);
    expect(renderedIds).toHaveLength(fixture.length); // 유실 0
    expect(new Set(renderedIds)).toEqual(new Set(fixture.map((x) => x.id)));
  });

  it('루트 밑으로 하위 트리를 DFS 순서로 평탄 수집한다', () => {
    const threads = groupThreads(fixture);
    const t1 = threads.find((t) => t.root.id === 'r1')!;
    expect(t1.replies.map((r) => r.comment.id)).toEqual(['a', 'b', 'd']);
    const t2 = threads.find((t) => t.root.id === 'r2')!;
    expect(t2.replies.map((r) => r.comment.id)).toEqual(['e']);
  });

  it("3레벨+ 답글에만 '@원부모닉' 표기(mentionOf)가 붙는다", () => {
    const t1 = groupThreads(fixture).find((t) => t.root.id === 'r1')!;
    const byId = Object.fromEntries(t1.replies.map((r) => [r.comment.id, r.mentionOf]));
    expect(byId['a']).toBeUndefined();  // 루트 직속 — 문맥이 바로 위라 생략
    expect(byId['b']).toBe('영희');     // 3레벨 — 원부모 a(영희)
    expect(byId['d']).toBe('민수');     // 4레벨 — 원부모 b(민수)
  });

  it('부모가 유실된 고아 답글은 루트로 승격되어 화면에서 사라지지 않는다', () => {
    const withOrphan = [...fixture, c('x', 'ghost', '고아')];
    const threads = groupThreads(withOrphan);
    const renderedIds = threads.flatMap((t) => [t.root.id, ...t.replies.map((r) => r.comment.id)]);
    expect(renderedIds).toContain('x');
    expect(threads.some((t) => t.root.id === 'x')).toBe(true);
  });
});

// N04(2026-09-12) 재현·수정 검증 — 댓글/답글 submit 이 onSubmit 을 fire-and-forget 으로
// 부른 뒤 즉시 입력을 비웠다(원문 유실 + 중복 제출 무방비). 아래는 그 계약을 렌더러 없이 잰다.
describe('guardedSubmit · N04 제출 계약', () => {
  it('① 실패하면 onSuccess(입력 비우기)가 호출되지 않아 원문이 남는다', async () => {
    const pendingRef = { current: false };
    let cleared = false;
    const outcome = await guardedSubmit(
      '오프라인에서 쓴 댓글',
      pendingRef,
      async () => { throw new Error('P0001: 제재 중'); },
      () => { cleared = true; },
    );
    expect(outcome).toBe('error');
    expect(cleared).toBe(false); // 원문이 지워지지 않았다 — 수정 전엔 즉시 지워졌다
    expect(pendingRef.current).toBe(false); // 실패 후엔 재시도할 수 있어야 한다
  });

  it('② 성공했을 때만 onSuccess(입력 비우기)가 호출된다', async () => {
    const pendingRef = { current: false };
    let cleared = false;
    const outcome = await guardedSubmit(
      '정상 댓글',
      pendingRef,
      async () => {},
      () => { cleared = true; },
    );
    expect(outcome).toBe('success');
    expect(cleared).toBe(true);
  });

  it('③ pending 중 두 번째 제출은 skipped 로 막힌다(연타로 댓글 2개 방지)', async () => {
    const pendingRef = { current: false };
    let submitCount = 0;
    let resolveFirst!: () => void;
    const firstOnSubmit = () => new Promise<void>((resolve) => { resolveFirst = resolve; submitCount++; });

    // 첫 호출 — setPending(true)까지는 동기 실행되므로 await 하지 않고 바로 두번째를 건다
    const first = guardedSubmit('첫 클릭', pendingRef, firstOnSubmit, () => {});
    const second = await guardedSubmit('두번째 클릭(연타)', pendingRef, async () => { submitCount++; }, () => {});

    expect(second).toBe('skipped');
    expect(submitCount).toBe(1); // 두번째 클릭은 실제 onSubmit 을 아예 부르지 않았다

    resolveFirst();
    const firstOutcome = await first;
    expect(firstOutcome).toBe('success');
    expect(pendingRef.current).toBe(false); // 끝난 뒤엔 다시 제출 가능
  });

  it('빈 문자열/공백만 있으면 onSubmit 을 부르지 않고 skipped', async () => {
    const pendingRef = { current: false };
    let called = false;
    const outcome = await guardedSubmit('   ', pendingRef, async () => { called = true; }, () => {});
    expect(outcome).toBe('skipped');
    expect(called).toBe(false);
  });

  // 음성 대조: 아래는 수정 전 동작(fire-and-forget)을 그대로 흉내낸 구현이 이 계약을
  // 통과하지 못함을 보여준다 — guardedSubmit 을 우회해 옛 방식으로 짜면 실패해야 정상.
  it('[음성 대조] fire-and-forget 방식은 실패해도 원문을 지운다 — guardedSubmit 이 막는 바로 그 버그', async () => {
    let cleared = false;
    const legacySubmit = (content: string, onSubmit: (c: string) => Promise<void>, clear: () => void) => {
      onSubmit(content).catch(() => {}); // 결과를 기다리지 않는다(수정 전 CommentThread.tsx 그대로)
      clear();
    };
    legacySubmit('오프라인 댓글', async () => { throw new Error('네트워크 오류'); }, () => { cleared = true; });
    expect(cleared).toBe(true); // 옛 방식은 실패해도 즉시 지운다 — 이것이 N04 버그였다
  });
});

// 오너 2026-09-14: "댓글 0" 헤더 → 입력창(이미 "쓸 수 있다"는 신호) → "첫 댓글을 남겨보세요" 점선박스
// 3단이 같은 말을 반복했다. 로그인(=입력 폼 렌더) 상태에서는 박스를 생략하고, 비로그인(=로그인 버튼만 있고
// 입력 폼이 없음)에서는 그대로 둔다 — 그 경우 박스가 "댓글이 없다"를 알리는 유일한 신호이기 때문이다.
// 음성 대조: `user ? null : (` 가지를 지우고 무조건 렌더로 되돌리면 이 계약이 실패한다(직접 확인함).
describe('댓글 빈 안내 — 입력 폼과 중복되지 않는다(오너 2026-09-14)', () => {
  it('🔴 threads.length === 0 분기가 user 유무로 갈려 있다 — 로그인 시 null, 비로그인 시 emptyText', () => {
    const i = SRC.indexOf('{threads.length === 0 ? (');
    expect(i, 'threads.length === 0 분기를 찾지 못했다').toBeGreaterThan(-1);
    const block = SRC.slice(i, i + 300);
    expect(block).toMatch(/threads\.length === 0 \? \(\s*\n\s*user \? null : \(/);
    expect(block).toMatch(/border-dashed border-border-default py-6[^]*\{emptyText\}/);
    // POST-DETAIL-TRIM(2026-09-24 오너): 모바일 게시글 상세에서만 비로그인 점선 칸도 숨긴다(로그인 버튼이 같은 말을 한다).
    //   다른 호출자·PC 는 종전대로 보인다 — 무조건 숨김(기능 소실)이 아니라 postDetailMobile 분기여야 한다.
    expect(block).toMatch(/postDetailMobile \? 'max-lg:hidden' : ''/);
  });
});
