// 관리자 '승인 대기' 모음 — 점검 A-09(2026-10-01)
//   · 합계는 모름(null)을 0 으로 더하지 않는다(다만 배지가 모르는 대기열 때문에 깎여 보일 수는 있다 — 요약 줄이 '—' 로 말한다)
//   · 대기열 4종 카드는 '게시글 관리 > 포스터' 가 아니라 '승인 대기' 섹션에 있다
// 실행: npx vitest run src/components/features/adminPendingCounts.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sumKnown, type PendingCounts } from './adminPendingCounts';

const src = readFileSync(new URL('./AdminTab.tsx', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

describe('sumKnown', () => {
  const c = (o: Partial<PendingCounts>): PendingCounts => ({ listings: null, owners: null, quota: null, events: null, rank: null, ...o });
  it('포스터 + 읽은 대기열을 더한다', () => {
    expect(sumKnown(c({ listings: 1, owners: 2, quota: 0, events: 3, rank: 4 }), 5)).toBe(15);
  });
  it('모름(null)은 0 으로 더한다기보다 빼고 센다 — 전부 모르면 포스터 수만', () => {
    expect(sumKnown(c({}), 2)).toBe(2);
    expect(sumKnown(c({ listings: 1 }), 0)).toBe(1);
  });
});

describe('AdminTab 배치 계약', () => {
  const block = (startMarker: string, endMarker: string) => {
    const a = src.indexOf(startMarker);
    expect(a, `${startMarker} 없음`).toBeGreaterThan(-1);
    const b = src.indexOf(endMarker, a);
    expect(b, `${endMarker} 없음`).toBeGreaterThan(a);
    return src.slice(a, b);
  };
  const pendingBlock = block("{section === 'pending' && (", "{section === 'reorder' && (");
  const reorderBlock = block("{section === 'reorder' && (", "{section === 'exposure' && (");

  it('🔴 공동 업주·이용권 한도·이벤트 신청·순위 인증·입점 대기열은 승인 대기 섹션에 있다', () => {
    for (const name of ['PendingGroupsPanel', 'VenueOwnerRequestsCard', 'VoucherQuotaAdminCard', 'VenueEventAdminCard', 'RankVerifyAdminCard', 'PendingSummary']) {
      expect(pendingBlock, `${name} 가 승인 대기 섹션에 없다`).toContain(`<${name}`);
      expect(reorderBlock, `${name} 가 게시글 관리 섹션에 남아 있다(숨은 대기열)`).not.toContain(`<${name}`);
    }
  });
  it('좌측 메뉴 배지는 포스터만이 아니라 합계', () => {
    expect(src).toContain("badge={a.id === 'pending' && pendingTotal > 0 ? pendingTotal : undefined}");
    expect(src).toContain('sumKnown(pendingCounts, pending.length)');
  });
  it('섹션 이름은 내용과 맞는다(포스터 승인 → 승인 대기)', () => {
    expect(src).toContain("{ id: 'pending', label: '승인 대기',");
  });
});
