// 장부 옆 이용권 레일의 계약 — 업주가 손님과 다툴 때 근거로 보는 화면이라 값이 틀리면 안 된다.
import { describe, it, expect } from 'vitest';
import { toFeedRows, summarizeFor, manageFeedRows } from './voucherFeed';
import type { Voucher } from '../api/vouchers';

const NOW = Date.parse('2026-09-06T12:00:00+09:00');
const v = (o: Partial<Voucher> & { id: string; createdAt: string }): Voucher => ({
  venueId: 'V', venueName: null, issuedBy: 'O', holderUserId: null, holderName: '홍길동',
  title: '매장이용권', status: 'active', usedVenueId: null, usedVenueName: null,
  usedAt: null, expiresAt: null, issueReason: 'event', eventCampaignId: null, ...o,
});

describe('한 번에 보낸 묶음', () => {
  // 오너 2026-09-08: "1T 단위가 아니라 한번에 보낸 갯수를 정의해서".
  // DB 는 1장당 한 행이라 20장을 보내면 20줄이 흘렀다 — 오히려 누가 몇 장 받았는지가 안 보였다.
  // issue_voucher 는 N장을 한 RPC 로 넣으므로 그 행들은 created_at 이 같다. 그걸 근거로 묶는다.
  const batch = (n: number, o: Partial<Voucher> = {}) =>
    Array.from({ length: n }, (_, i) => v({ id: 'b' + i, createdAt: '2026-09-06T01:00:00Z', ...o }));

  it('같은 사람·같은 제목·같은 시각이면 한 줄로 묶이고 장수를 센다', () => {
    const rows = toFeedRows(batch(10), NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(10);
    expect(rows[0].name).toBe('홍길동');
  });

  it('1장이면 count 가 1 이다 — 예전 동작과 같다', () => {
    const rows = toFeedRows(batch(1), NOW);
    expect(rows[0].count).toBe(1);
  });

  it('🔴 시각이 1초라도 다르면 다른 전송이다 — 반올림해 합치면 장부가 거짓말을 한다', () => {
    const rows = toFeedRows([
      ...batch(3),
      ...Array.from({ length: 2 }, (_, i) => v({ id: 'x' + i, createdAt: '2026-09-06T01:00:01Z' })),
    ], NOW);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.count).sort()).toEqual([2, 3]);
  });

  it('받는 사람이 다르면 안 묶인다 — 동명이인은 userId 로 가른다', () => {
    const rows = toFeedRows([
      v({ id: 'p', createdAt: '2026-09-06T01:00:00Z', holderUserId: 'u1', holderName: '김철수' }),
      v({ id: 'q', createdAt: '2026-09-06T01:00:00Z', holderUserId: 'u2', holderName: '김철수' }),
    ], NOW);
    expect(rows).toHaveLength(2);
  });

  it('전량 회수면 회수 배지, 일부만 회수면 장수로 말한다', () => {
    const all = toFeedRows(batch(4, { status: 'revoked' }), NOW)[0];
    expect(all.revoked).toBe(true);
    expect(all.revokedCount).toBe(4);

    const some = toFeedRows([...batch(3), v({ id: 'r', createdAt: '2026-09-06T01:00:00Z', status: 'revoked' })], NOW)[0];
    expect(some.count).toBe(4);
    expect(some.revokedCount).toBe(1);
    expect(some.revoked, '일부 회수를 전량 회수로 표시하면 안 된다').toBe(false);
  });

  it('사용도 묶인다 — 같은 시각에 여러 장을 쓰면 한 줄', () => {
    const rows = toFeedRows(batch(5, { usedAt: '2026-09-06T05:00:00Z' }), NOW);
    const used = rows.find((r) => r.kind === 'used')!;
    expect(used.count).toBe(5);
    expect(rows.find((r) => r.kind === 'issued')!.count).toBe(5);
  });
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

// dummy-1003 D2 — 이용권 관리 창 '이용 내역'에 전송 취소가 없었다(유형별 표는 '전송 취소 1'). 표와 내역의 수가 맞아야 한다.
describe('이용권 관리 이용 내역 — 전송 취소도 전송 줄에 장수로 남는다', () => {
  // 더미 정산 실측: 전송 9 · 사용 8 · 취소 1 (세 손님, 한 손님은 3장 받아 1장 취소)
  const at = (m: number) => `2026-10-03T0${m}:00:00Z`;
  const list: Voucher[] = [
    ...Array.from({ length: 3 }, (_, i) => v({ id: 'a' + i, holderName: '강도윤', createdAt: at(1), status: i === 0 ? 'revoked' : 'used', usedAt: i === 0 ? null : at(5) })),
    ...Array.from({ length: 3 }, (_, i) => v({ id: 'b' + i, holderName: '서하린', createdAt: at(2), status: 'used', usedAt: at(6) })),
    ...Array.from({ length: 3 }, (_, i) => v({ id: 'c' + i, holderName: '오지후', createdAt: at(3), status: 'used', usedAt: at(7), usedFor: i === 2 ? 'addon' : 'buyin' })),
  ];
  const rows = manageFeedRows(list, (x) => x.holderName ?? '');
  const sum = (t: 'issued' | 'used', k: 'n' | 'revoked') => rows.filter((r) => r.t === t).reduce((s, r) => s + r[k], 0);

  it('🔴 Σ전송 9 · Σ전송 취소 1 · Σ사용 8 — 유형별 표(전송·전송 취소·사용)와 같다', () => {
    expect(sum('issued', 'n')).toBe(9);
    expect(sum('issued', 'revoked')).toBe(1);
    expect(sum('used', 'n')).toBe(8);
  });
  it('🔴 취소는 그 손님의 전송 줄에 붙는다(3장 중 1장)', () => {
    const r = rows.find((x) => x.t === 'issued' && x.who === '강도윤');
    expect(r).toMatchObject({ n: 3, revoked: 1 });
    expect(rows.filter((x) => x.t === 'issued' && x.who !== '강도윤').every((x) => x.revoked === 0)).toBe(true);
  });
  it('전량 취소면 revoked === n (화면은 "전송 취소" 배지)', () => {
    const all = manageFeedRows([v({ id: 'z0', createdAt: at(1), status: 'revoked' }), v({ id: 'z1', createdAt: at(1), status: 'revoked' })], () => '홍길동');
    expect(all).toEqual([expect.objectContaining({ t: 'issued', n: 2, revoked: 2 })]);
  });
  it('최신순 · 애드온 사용은 바인 사용과 다른 줄 · 받는 사람 없으면 "매장 보관"', () => {
    expect(rows[0].at >= rows[rows.length - 1].at).toBe(true);
    expect(rows.filter((r) => r.t === 'used' && r.who === '오지후').map((r) => [r.n, !!r.addon]).sort()).toEqual([[1, true], [2, false]]);
    expect(manageFeedRows([v({ id: 'k', createdAt: at(1) })], () => '')[0].who).toBe('매장 보관');
  });
});
