// 장터 글 상세 카드(MARKET-DETAIL-CARD) 소스 계약 — design-reviewer 2026-09-24 FAIL-2·FAIL-3 재발 방지.
//  ② 신고/차단 묶음은 -my-2.5 로 44px 실박스를 만든다. 칩 줄이 접혀 묶음만 한 줄에 남으면 다음 형제 h1 이
//     아래 2px 를 덮어 히트가 42px 가 됐다(320·긴 지역명 실측) → 묶음이 relative z-[1] 로 위에 쌓여야 한다.
//  ③ 등급·상태칩은 목록과 공유하는 반투명 틴트다. surface-high 카드 위에 바로 두면 라이트 대비가 떨어진다
//     (예약중 4.80 → 4.35, B급 4.8 → 4.33) → 두 칩 모두 셸과 같은 불투명 받침(bg-surface-mid) 안에 있어야 한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ListingDetailModal.tsx'), 'utf-8');

describe('장터 글 상세 카드 계약', () => {
  it('🔴 신고/차단 묶음(-my-2.5)은 relative z-[1] 로 다음 형제 위에 쌓인다', () => {
    const m = SRC.match(/<span className="([^"]*-my-2\.5[^"]*)">/);
    expect(m, '신고/차단 묶음 span 을 못 찾았다').not.toBeNull();
    expect(m![1]).toMatch(/(^| )relative( |$)/);
    expect(m![1]).toMatch(/(^| )z-\[1\]( |$)/);
  });
  it('🔴 반투명 등급칩·상태칩은 불투명 받침(bg-surface-mid) 안에 있다', () => {
    for (const key of ['CONDITION_COLOR[listing.condition]', 'status.cls']) {
      const i = SRC.indexOf(key);
      expect(i, `${key} 칩을 못 찾았다`).toBeGreaterThan(-1);
      const before = SRC.slice(Math.max(0, i - 260), i);
      expect(before, `${key} 칩 바로 바깥에 bg-surface-mid 받침이 없다`).toMatch(/<span className="inline-flex rounded-badge bg-surface-mid">\s*<span className=\{\[\s*'[^']*'\s*,\s*$/);
    }
  });
});
