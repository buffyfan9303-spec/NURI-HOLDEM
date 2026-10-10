// 2026-10-10 오너: 커뮤니티 하위 내비 = 1 게시판 · 2 홀덤펍 · 3 실시간, 처음 들어오면 게시판.
// 섹션 ID(board/venues/live…)는 그대로 — 저장된 선택(sessionStorage 'nuri:reload:community-sec'·딥링크·keep-alive)이 ID 로 복원된다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./CommunityTab.tsx', import.meta.url), 'utf8');

describe('커뮤니티 하위 내비 순서 · 기본 선택', () => {
  it('화면(DOM) 순서 = 게시판 · 홀덤펍 · 실시간 · 순위 · 장터 · 딜러', () => {
    const ids = [...SRC.matchAll(/<SectionTab id="(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['board', 'venues', 'live', 'rank', 'market', 'dealer']);
  });

  it('SEC_ORDER(전환 방향·프리마운트 순서)가 화면 순서와 같다', () => {
    const order = SRC.match(/const SEC_ORDER: Section\[\] = \[([^\]]*)\]/)?.[1].match(/'(\w+)'/g)?.map((s) => s.slice(1, -1));
    expect(order).toEqual(['board', 'venues', 'live', 'rank', 'market', 'dealer']);
  });

  it('처음 들어오면 게시판 — 기본값만 바뀌고 저장·외부 지정 경로는 그대로', () => {
    expect(SRC).toContain("let lastCommunitySection: Section = 'board';");
    expect(SRC).toContain("sessionStorage.getItem('nuri:community-section')"); // 딥링크 1회성 지정
    expect(SRC).toContain("reloadSaved(SEC_KEY, SEC_ORDER, 'community')");        // 새로고침 복원(ID)
  });

  it('삭제된 섹션이 없다(6개 ID 모두 렌더 판이 있다)', () => {
    for (const id of ['board', 'venues', 'live', 'rank', 'dealer', 'market']) expect(SRC).toContain(`data-sec="${id}"`);
  });
});
