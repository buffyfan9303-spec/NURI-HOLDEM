// 계정(또는 대상) 경계가 있는 조회 묶음의 응답 격리 — lib/staleResponse 의 owner 스탬프를 '한 줄로' 쓰는 헬퍼(UI-08-1, 2026-09-13).
//
// 왜: TierLeaderboard 는 로그인/로그아웃마다 재마운트하면 랭킹 패널이 스켈레톤으로 접혀 문서 높이가 무너진다(오너 이슈 #5:
//   docHeight 1684→1418 · scrollY 487→221 · CLS 0.2516). 그래서 `key={user?.id}` 는 쓰지 않고, 계정이 바뀌면 **스탬프만 올려**
//   비행 중이던 A 계정 응답을 버리고 B 계정 조회를 새로 낸다. `=== null` 가드가 A 가 채운 값 때문에 B 로는 영영 안 부르던 것도
//   계정 경계에서 상태를 비워 다시 부르게 한다(업적·미션 진행도·순위 인증 신청 이력·장착 마크 = 개인정보).
import { isFreshResponse, type RequestStamp } from './staleResponse';

export interface ScopeRef { current: RequestStamp<string> }

/** 경계가 바뀌었다(새 owner) 또는 같은 owner 로 새 세대 — 이후 도착하는 이전 세대 응답은 전부 버려진다. */
export function bumpScope(ref: ScopeRef, owner: string): RequestStamp<string> {
  ref.current = { seq: ref.current.seq + 1, owner };
  return ref.current;
}

/** 지금 스탬프를 잡아 두고, 응답이 도착했을 때 스탬프가 그대로일 때만 ok/err 를 부른다(finally 도 같다). */
export function scopedLoad<T>(
  ref: ScopeRef,
  p: Promise<T>,
  ok: (v: T) => void,
  err: (e: unknown) => void,
  finallyFn?: () => void,
): void {
  const stamp = ref.current;
  const fresh = () => isFreshResponse(stamp, ref.current);
  p.then((v) => { if (fresh()) ok(v); })
    .catch((e: unknown) => { if (fresh()) err(e); })
    .finally(() => { if (fresh() && finallyFn) finallyFn(); });
}
