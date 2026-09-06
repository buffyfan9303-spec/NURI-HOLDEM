// 장부 옆 이용권 레일의 계약 — 업주가 손님과 다툴 때 근거로 보는 화면이라 값이 틀리면 안 된다.
import { describe, it, expect } from 'vitest';
import { toFeedRows, summarizeFor } from './voucherFeed';
import type { Voucher } from '../api/vouchers';

const NOW = Date.parse('2026-09-06T12:00:00+09:00');
const v = (o: Partial<Voucher> & { id: string; createdAt: string }): Voucher => ({
  venueId: 'V', venueName: null, issuedBy: 'O', holderUserId: null, holderName: '홍길동',
  title: '매장이용권', status: 'active', usedVenueId: null, usedVenueName: null,
  usedAt: null, expiresAt: null, issueReason: 'event', ...o,
});

describe('사건 목록', () => {
  it('한 장이 발급·사용 **두 줄**이 된다 — 두 사건의 시각이 다르기 때문', () => {
    const rows = toFeedRows([v({ id: 'a', createdAt: '2026-09-06T01:00:00Z', usedAt: '2026-09-06T02:00:00Z' })], NOW);
    expect(rows.map((r) => r.kind)).toEqual(['used', 'issued']); // 최신이 위
    expect(rows.every((r) => r.name === '홍길동')).toBe(true);
  });

  it('안 쓴 이용권은 한 줄뿐이다', () => {
    expect(toFeedRows([v({ id: 'a', createdAt: '2026-09-06T01:00:00Z' })], NOW)).toHaveLength(1);
  });

  it('최신이 맨 위 — 운영 중에는 눈만 올려서 봐야 한다', () => {
    const rows = toFeedRows([
      v({ id: 'a', createdAt: '2026-09-06T01:00:00Z' }),
      v({ id: 'b', createdAt: '2026-09-06T03:00:00Z' }),
      v({ id: 'c', createdAt: '2026-09-06T02:00:00Z' }),
    ], NOW);
    expect(rows.map((r) => r.at)).toEqual([
      '2026-09-06T03:00:00Z', '2026-09-06T02:00:00Z', '2026-09-06T01:00:00Z',
    ]);
  });

  it('⚠ 회수는 **사건이 아니라 배지**다 — 회수 시각이 없어 지어내면 순서가 거짓말이 된다', () => {
    const rows = toFeedRows([v({ id: 'a', createdAt: '2026-09-06T01:00:00Z', status: 'revoked' })], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('issued');
    expect(rows[0].revoked).toBe(true);
  });

  it('만료 배지는 **안 쓰고 기한만 지난 것**에만 — 쓴 것에 붙으면 거짓이다', () => {
    const past = '2026-09-01T00:00:00Z';
    const unused = toFeedRows([v({ id: 'a', createdAt: past, expiresAt: past })], NOW);
    expect(unused[0].expired).toBe(true);

    const used = toFeedRows([v({ id: 'b', createdAt: past, expiresAt: past, usedAt: '2026-08-31T00:00:00Z' })], NOW);
    expect(used.find((r) => r.kind === 'issued')!.expired).toBe(false);

    const revoked = toFeedRows([v({ id: 'c', createdAt: past, expiresAt: past, status: 'revoked' })], NOW);
    expect(revoked[0].expired, '회수된 것은 만료가 아니라 회수다').toBe(false);
  });

  it('이름이 없으면 빈칸이 아니라 표시가 있어야 한다 — 빈 줄은 버그로 읽힌다', () => {
    expect(toFeedRows([v({ id: 'a', createdAt: '2026-09-06T01:00:00Z', holderName: null })], NOW)[0].name).toBe('이름 없음');
    expect(toFeedRows([v({ id: 'b', createdAt: '2026-09-06T01:00:00Z', holderName: '   ' })], NOW)[0].name).toBe('이름 없음');
  });

  it('행 key 가 겹치지 않는다 — 겹치면 React 가 줄을 잘못 재사용한다', () => {
    const rows = toFeedRows([
      v({ id: 'a', createdAt: '2026-09-06T01:00:00Z', usedAt: '2026-09-06T02:00:00Z' }),
      v({ id: 'b', createdAt: '2026-09-06T01:00:00Z', usedAt: '2026-09-06T02:00:00Z' }),
    ], NOW);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("'보냈는지' 한 줄 요약", () => {
  const rows = [
    v({ id: 'a', createdAt: '2026-09-06T01:00:00Z', holderName: '홍길동' }),
    v({ id: 'b', createdAt: '2026-09-06T01:00:00Z', holderName: '홍길동', usedAt: '2026-09-06T02:00:00Z' }),
    v({ id: 'c', createdAt: '2026-09-06T01:00:00Z', holderName: '홍길동', status: 'revoked' }),
    v({ id: 'd', createdAt: '2026-09-06T01:00:00Z', holderName: '김철수' }),
  ];

  it('발급·사용·보유를 사람별로 센다 — 회수분은 보유에서 빠진다', () => {
    expect(summarizeFor(rows, '홍길동', NOW)).toEqual({ issued: 3, used: 1, held: 1 });
  });

  it('부분 일치로 찾는다(성만 쳐도)', () => {
    expect(summarizeFor(rows, '홍', NOW)!.issued).toBe(3);
  });

  it('보낸 적 없으면 0 — "없다"를 분명히 말할 수 있어야 한다', () => {
    expect(summarizeFor(rows, '없는사람', NOW)).toEqual({ issued: 0, used: 0, held: 0 });
  });

  it('빈 검색어는 요약하지 않는다(전체를 요약하면 오해를 부른다)', () => {
    expect(summarizeFor(rows, '   ', NOW)).toBeNull();
  });
});
