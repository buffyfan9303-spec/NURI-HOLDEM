// 관리자 '승인 대기' 합계 — 점검 A-09(2026-10-01)
//
// 🔴 실제로 났던 일: 공동 업주 승인·이용권 한도 증액·매장 이벤트 신청·순위 인증 대기열이
//   '게시글 관리 > 포스터' 안에 숨어 있었고, 비면 카드째 사라졌으며, 좌측 메뉴 배지는 포스터만 셌다.
//   운영자는 대기열이 있다는 사실 자체를 몰랐다. 이 훅이 대기열 전부를 한 번에 센다.
// 원칙: **모름(null)은 0 이 아니다.** 조회가 실패한 대기열은 null 로 두고 화면이 '—' 로 그린다(0 은 '없다'는 단정).
import { useCallback, useEffect, useState } from 'react';
import { getPendingGroups, getPendingVenues, adminListVenueOwnerRequests } from '../../api/community';
import { adminListVoucherCreditRequests } from '../../api/vouchers';
import { adminListVenueEventRequests } from '../../api/venueEvents';
import { adminListRankVerifications } from '../../api/rankverify';

export type PendingKey = 'listings' | 'owners' | 'quota' | 'events' | 'rank';
export type PendingCounts = Record<PendingKey, number | null>;

const EMPTY: PendingCounts = { listings: null, owners: null, quota: null, events: null, rank: null };

/** 읽은 개수만 더한다(null=모름은 제외). 배지용 — 모르는 대기열은 더하지 못할 뿐 0 으로 위장하지 않는다. */
export function sumKnown(counts: PendingCounts, posters: number): number {
  return posters + Object.values(counts).reduce<number>((a, n) => a + (n ?? 0), 0);
}

/** @param refreshKey 바뀔 때마다 다시 센다(섹션 이동·처리 직후). */
export function usePendingCounts(refreshKey: unknown): { counts: PendingCounts; reload: () => void } {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const put = (k: PendingKey) => (n: number | null) => { if (alive) setCounts((c) => ({ ...c, [k]: n })); };
    const run = (k: PendingKey, p: Promise<number>) => { p.then(put(k)).catch(() => put(k)(null)); };
    run('listings', Promise.all([getPendingVenues(), getPendingGroups()]).then(([v, g]) => v.length + g.length));
    run('owners', adminListVenueOwnerRequests().then((r) => r.length));
    run('quota', adminListVoucherCreditRequests().then((r) => r.length));
    run('events', adminListVenueEventRequests().then((r) => (r === 'not-deployed' ? 0 : r.length)));
    run('rank', adminListRankVerifications().then((r) => r.length));
    return () => { alive = false; };
  }, [refreshKey, tick]);

  return { counts, reload };
}
