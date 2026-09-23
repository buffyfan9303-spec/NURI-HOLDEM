// 조회수 표시 위치 계약 (2026-09-23, 오너 결정 BOARD-VIEWCOUNT-DETAIL-ONLY)
//
// 무엇을 막는가
//   오너 지시: "조회수를 없애. 그냥 게시글 클릭해서 내부에서만 볼 수 있게."
//   1) 목록(PostRow 한 줄 보기 · PostCard 피드 카드)에 조회수가 다시 나타나는 것 —
//      두 컴포넌트 소스에 `viewCount` 참조가 전혀 없어야 한다(자리 확보용 폭 클래스 포함).
//   2) 상세(PostDetailModal)의 조회수 표시가 다시 `> 0` 조건으로 숨는 것 —
//      상세는 0 을 포함해 항상 보여야 한다(좋아요·댓글과 같은 규칙).
//   3) 조회수 증가 호출(incrementPostView)이 이 변경에 묻혀 같이 지워지는 것.
//
// 이 테스트가 못 보는 것
//   실제 렌더 결과(0이 화면에 어떻게 보이는지)는 소스 정적 검사로는 못 잡는다 — 그건
//   design-reviewer 실측 몫이고, 여기서는 재발하기 쉬운 코드 형태만 막는다.
//
// 실행: npx vitest run src/components/features/community/viewCountPlacement.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROW_CARD_SRC = readFileSync(join(__dirname, 'PostRowCard.tsx'), 'utf8');
const DETAIL_SRC = readFileSync(join(__dirname, '..', 'PostDetailModal.tsx'), 'utf8');

describe('조회수 표시 위치 계약', () => {
  it('PostRowCard(목록 한 줄 보기·피드 카드)는 viewCount 를 전혀 참조하지 않는다', () => {
    expect(ROW_CARD_SRC).not.toMatch(/viewCount/);
  });

  it('PostDetailModal 의 조회수는 0 을 포함해 항상 렌더한다(> 0 가드 재발 금지)', () => {
    expect(DETAIL_SRC).not.toMatch(/\(post\.viewCount\s*\?\?\s*0\)\s*>\s*0\s*&&/);
    // 조회 배지 자체는 살아 있어야 한다(양성 대조) — 가드만 지우고 배지째 날리는 사고 방지.
    expect(DETAIL_SRC).toMatch(/aria-label=\{`조회 \$\{post\.viewCount/);
  });

  it('조회수 증가 호출은 그대로 남아 있다(같이 지워지는 사고 방지)', () => {
    expect(DETAIL_SRC).toMatch(/incrementPostView\(post\.id\)/);
  });
});
