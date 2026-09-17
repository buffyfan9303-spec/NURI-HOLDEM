// src/lib/rankRowCount.ts — 랭킹 보드별 "마지막으로 본 실제 행 수" 저장값(스켈레톤 높이 예약용).
//
// 왜: TierLeaderboard 의 활동 순위(ActivityBoardSkeleton)는 이미 이 조리법을 쓴다 — 로딩 중 스켈레톤을
//   실제 행 수와 다르게 그리면(예: 8행으로 그렸는데 실제는 3행) 응답 도착 순간 문서 높이가 바뀌어 스크롤이
//   튄다(오너 이슈 #5 계열). 머니인(CareerBoard)·국내 순위는 각자 `RowSkeleton rows={8}` / `rows={6}` 을
//   하드코딩해 왔고, 그 추정치가 실제보다 크면(입상 0건인 경우가 흔하다) 응답 도착 시 문서가 줄어드는
//   방향으로 튄다 — CommunityTab 의 섹션 전환 스크롤 복원이 이미 감내하는 '첫 진입 클램프'와 겹쳐 두 번 튄다.
//
// activity 는 종전 키('nuri:rank-rows')를 그대로 쓴다 — 이미 값을 갖고 있는 브라우저의 캐시를 버리지 않는다.
// moneyin·domestic 은 새 키를 쓴다(activity 와 실제 인원 규모가 다르므로 하나의 키를 공유하면 서로의
// 추정치를 오염시킨다).
//
// 저장소 관용구는 lib/boardView.ts 와 동일하다: 키 없음·손상 값·저장소 접근 예외(사생활 모드 등)는
// 전부 보드별 기본값으로 떨어진다. 기본값은 종전 하드코딩 값을 그대로 보존해 첫 진입 체감을 바꾸지 않는다.
export type RankBoardKind = 'activity' | 'moneyin' | 'domestic';

const KEY: Record<RankBoardKind, string> = {
  activity: 'nuri:rank-rows',
  moneyin: 'nuri:rank-rows:moneyin',
  domestic: 'nuri:rank-rows:domestic',
};

/** 저장값이 없을 때(첫 진입)의 추정치 — 종전 각 보드의 하드코딩 값 그대로. */
const DEFAULT_ROWS: Record<RankBoardKind, number> = { activity: 8, moneyin: 8, domestic: 6 };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): StorageLike | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

/** 마지막으로 본 실제 행 수(0~30). 키 없음·손상 값·저장소 접근 예외 → 보드 기본값.
 *  ⚠ '키 없음(모름)' 과 '저장된 0(0건으로 확인됨)' 은 다르다 — `Number(null)`·`Number('')` 이 0 이라 Number() 에 넣기 전에 가른다.
 *    가르지 않으면 한 번도 저장된 적 없는 첫 방문자가 '0행' 으로 읽혀 스켈레톤 없이 0 에서 실제 높이로 튄다. */
export function readRankRowCount(kind: RankBoardKind, storage: StorageLike | null = defaultStorage()): number {
  try {
    const raw = storage?.getItem(KEY[kind]);
    if (raw == null || raw.trim() === '') return DEFAULT_ROWS[kind];   // 모름 ≠ 0행
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? Math.min(30, v) : DEFAULT_ROWS[kind];
  } catch {
    return DEFAULT_ROWS[kind];
  }
}

/** 응답이 실제로 도착했을 때만 부른다 — 0~30 으로 클램프한다.
 *  0건(EmptyState)은 0 으로 남긴다(2026-09-17, D-moneyin). 예전엔 최소 1행으로 클램프했다 — "8행 스켈레톤이 0건으로 꺼지는
 *  큰 낙차 대신 1행 → EmptyState 의 작은 낙차만" 이라는 CLS 의도였는데, 실측은 1행 스켈레톤 142px 대 EmptyState 298px 로
 *  156px 낙차가 남아 보드 전환 도중 판이 커지는 '멈칫' 이 됐다. 0 을 0 으로 기억하면 화면이 그 자리에 **EmptyState 자체를
 *  감춰 그려**(TierLeaderboard CareerBoard) 낙차가 작아지는 게 아니라 0 이 된다. 다시 1 로 클램프하면 그 156px 이 돌아온다.
 *  0 을 못 다루는 보드(RowSkeleton 은 rows 를 max(1, …) 로 받는다)는 종전과 같이 1행으로 그린다. */
export function writeRankRowCount(kind: RankBoardKind, n: number, storage: StorageLike | null = defaultStorage()): void {
  const clamped = Math.max(0, Math.min(30, n));
  try { storage?.setItem(KEY[kind], String(clamped)); } catch { /* 저장 차단 환경 — 이번 세션만 유지된다 */ }
}
