// 2026-09-29 C-1 같은 부류 — 차단한 사람의 글·판매글이 통합검색(Ctrl+K)에서 다시 나온다.
//
// 왜 소스 계약인가: GlobalSearchModal 은 App 이 준 원본 posts·listings 를 그대로 받는다. 게시판·장터는
//   각자 isPostVisible / isBlocked 로 거르는데 여기만 필터가 없었다(verifier 2026-09-29, PR #31).
//   렌더 테스트는 auth·block 컨텍스트 때문에 세우기 어렵고, 이 부류는 "판정을 한 벌로 지나는가" 가 핵심이라
//   게시판과 **같은 함수**를 부르는지를 못박는다.
//   ⚠ 한계: 문장이 있는가만 본다 — 인자(isBlocked·meId)까지 함께 단언해 빈 호출로 통과하지 못하게 한다.
//
// 실행: npx vitest run src/components/features/globalSearchBlocked.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SRC = strip(readFileSync(join(__dirname, 'GlobalSearchModal.tsx'), 'utf-8'));

describe('🔴 통합검색도 게시판과 같은 차단·숨김 판정을 지난다', () => {
  it('게시글 결과는 isPostVisible(차단 + blinded) 를 통과한 것만', () => {
    expect(SRC, 'posts 필터에 isPostVisible 이 없다 — 차단·숨김 글이 검색에 나온다')
      .toMatch(/p:\s*posts\.filter\(\(x\)\s*=>\s*isPostVisible\(x,\s*\{\s*isBlocked,[^}]*meId:\s*user\?\.id\s*\}\)/);
  });

  it('판매글 결과는 차단한 판매자를 뺀다(MarketplaceTab 과 같은 식)', () => {
    expect(SRC, 'listings 필터에 isBlocked(sellerId) 가 없다')
      .toMatch(/l:\s*listings\.filter\(\(x\)\s*=>\s*!isBlocked\(x\.sellerId\)/);
  });

  it('차단 목록이 바뀌면 결과를 다시 계산한다(memo deps)', () => {
    expect(SRC).toMatch(/\}, \[query, venues, schedules, posts, listings, notices, isBlocked,/);
  });
});
