// 매장 이용권 관리 패널(VoucherManageModal)의 조회 묶음 — **매장이 바뀐 뒤 도착한 응답을 버린다**.
//
// 왜(N04 감사, 적대 반증 생존 · 2026-09-13): 패널은 VenueManageTab 안에서 매장 A→B 전환에 리마운트되지 않는데
//   비동기 setter 8개에 stale 가드가 0 이었다. A 목록이 늦게 도착하면 B 화면에 A 이용권이 실리고, 업주·관리자가
//   '회수'/'삭제'를 누르면 `g.active.map(v => v.id)` 가 **A 매장 이용권 id** 를 서버로 보내 실제로 회수·삭제된다
//   (admin 은 can_manage_pos 를 통과한다). 지갑(VoucherWallet)·시트(MyVoucherSheet)는 이미 lib/staleResponse 로 가드돼 있었다 —
//   같은 계약을 쓴다(새 방식 없음). 렌더 없이 동작을 검사하려고 React 에 의존하지 않는다(venueVoucherLoad.test.ts).
//   ⚠ 현재 실피해 0(킬스위치 OFF · store_vouchers 0행, 2026-09-11 실측) — 기능을 켜는 첫날부터 유효하다.
import { isStaleResponse, type RequestStamp } from './staleResponse';

export interface VenueVoucherApi<V, S, P> {
  list: (venueId: string) => Promise<V[]>;
  stats: (venueId: string) => Promise<S>;
  profiles: (venueId: string) => Promise<P[]>;
  approved: (venueId: string) => Promise<boolean>;
}
export interface VenueVoucherSinks<V, S, P> {
  list: (v: V[]) => void; listErr: (e: unknown) => void; loading: (b: boolean) => void;
  stats: (s: S) => void; profiles: (ps: P[]) => void; statsErr: (e: unknown) => void;
  approved: (b: boolean) => void; approvedErr: (e: unknown) => void;
}

/** owner = venueId. 호출마다 seq 를 올린다 — 이 함수가 돌려준 stamp 가 ref 의 현재값과 다르면 그 응답은 버려진다. */
export function loadVenueVoucherPanel<V, S, P>(
  ref: { current: RequestStamp<string> },
  venueId: string,
  canIssue: boolean,
  api: VenueVoucherApi<V, S, P>,
  on: VenueVoucherSinks<V, S, P>,
): RequestStamp<string> {
  const stamp: RequestStamp<string> = { seq: ref.current.seq + 1, owner: venueId };
  ref.current = stamp;
  const stale = () => isStaleResponse(stamp, ref.current);
  on.loading(true);
  api.list(venueId)
    .then((v) => { if (stale()) return; on.list(v); on.listErr(null); })
    .catch((e) => { if (stale()) return; on.listErr(e); })
    .finally(() => { if (!stale()) on.loading(false); });
  if (canIssue) {
    api.stats(venueId).then((s) => { if (stale()) return; on.stats(s); on.statsErr(null); }).catch((e) => { if (!stale()) on.statsErr(e); });
    api.profiles(venueId).then((ps) => { if (!stale()) on.profiles(ps); }).catch((e) => { if (!stale()) on.statsErr(e); });
  }
  api.approved(venueId)
    .then((b) => { if (stale()) return; on.approved(b); on.approvedErr(null); })
    .catch((e) => { if (!stale()) on.approvedErr(e); });   // 삼키면 approved 초기값 true 가 남아 '운영자 승인 필요' 경고가 사라진다
  return stamp;
}
