// V2(오너 2026-09-24) — 유형별 발급 통계의 클라 쪽 계약. 서버 정의는 supabase/migrations/20260924c_voucher_reason_stats.sql.
// 불변식: 행마다 발급 = 보유+사용+만료+회수+기타, 합계도 같다. 표는 현재 유형을 0 이어도 보이고 과거 유형·근거 미기록은 0 이면 숨긴다.
// 음성 대조(2026-09-24): vouchers.ts voucherReasonTable 의 과거 유형 조건 `r && r.issued > 0` 을 `r` 로 바꾸면
//   '0 인 과거 유형은 숨긴다' 가 빨갛다. reasonStatBalanced 에서 `+ s.other` 를 빼면 '기타 상태도 발급에 들어간다' 가 빨갛다.
// 실행: npx vitest run src/api/vouchers.reasonStats.test.ts
import { describe, it, expect } from 'vitest';
import { voucherReasonTable, reasonStatBalanced, voucherStatsRange, voucherReasonLabel, voucherReasonKey, VOUCHER_REASONS, type VoucherReasonStat } from './vouchers';

const s = (reasonKey: string, held: number, used: number, expired: number, revoked: number, other = 0): VoucherReasonStat =>
  ({ reasonKey, issued: held + used + expired + revoked + other, held, used, expired, revoked, other, holders: 1 });

describe('유형별 표 — 불변식·행 순서', () => {
  const rows = [s('event_card', 1, 1, 1, 0), s('grant', 2, 2, 0, 1), s('visit', 0, 2, 0, 0), s('welcome', 0, 0, 0, 0), s('mystery', 1, 0, 0, 0)];
  const t = voucherReasonTable(rows);

  it('행마다·합계 모두 발급 = 보유+사용+만료+회수+기타', () => {
    for (const r of [...t.rows, t.total]) expect(reasonStatBalanced(r), r.reasonKey).toBe(true);
    expect(t.total).toMatchObject({ issued: 11, held: 4, used: 5, expired: 1, revoked: 1, other: 0 });
  });
  it('기타 상태도 발급에 들어간다(빠지면 불일치로 잡는다)', () => {
    expect(reasonStatBalanced(s('grant', 1, 0, 0, 0, 2))).toBe(true);
    expect(reasonStatBalanced({ ...s('grant', 1, 0, 0, 0), issued: 3 })).toBe(false);
  });
  it('현재 유형은 0 이어도 보이고, 0 인 과거 유형은 숨긴다 · 모르는 키는 뒤에 남는다', () => {
    expect(t.rows.map((r) => r.reasonKey)).toEqual(['grant', 'event', 'event_card', 'service', 'other', 'visit', 'mystery']);
    expect(t.rows.find((r) => r.reasonKey === 'service')).toMatchObject({ issued: 0 });
  });
  it('서버가 0 행을 줘도(빈 매장) 합계 0 · 현재 유형 5행', () => {
    const e = voucherReasonTable([]);
    expect(e.rows).toHaveLength(5);
    expect(e.total.issued).toBe(0);
  });
});

describe('라벨·키', () => {
  it('통계 전용 키 라벨 — 발급 사유 목록에는 없다', () => {
    expect(voucherReasonLabel('event_card')).toBe('이벤트 카드 당첨');
    expect(voucherReasonLabel('unrecorded')).toBe('근거 미기록');
    expect(voucherReasonLabel('constructor')).toBe('');
    expect(VOUCHER_REASONS.map((r) => r.value)).not.toContain('event_card');
  });
  it('이용권 한 장의 키 = 서버 CASE(event+캠페인 → 카드, null → 미기록)', () => {
    expect(voucherReasonKey({ issueReason: 'event', eventCampaignId: 'c' })).toBe('event_card');
    expect(voucherReasonKey({ issueReason: 'event', eventCampaignId: null })).toBe('event');
    expect(voucherReasonKey({ issueReason: null, eventCampaignId: null })).toBe('unrecorded');
    expect(voucherReasonKey({ issueReason: 'grant', eventCampaignId: 'c' })).toBe('grant');
  });
});

describe('기간 칩 → KST 날짜', () => {
  // 2026-09-30 15:30Z = KST 10-01 00:30 — UTC 로 세면 9월로 떨어지는 경계
  const edge = Date.parse('2026-09-30T15:30:00Z');
  it('이번 달은 KST 달의 1일부터 오늘까지', () => {
    expect(voucherStatsRange('month', edge)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });
  it('최근 30일은 오늘 포함 30일', () => {
    expect(voucherStatsRange('30d', edge)).toEqual({ from: '2026-09-02', to: '2026-10-01' });
  });
  it('전체는 제한 없음', () => {
    expect(voucherStatsRange('all', edge)).toEqual({ from: null, to: null });
  });
});
