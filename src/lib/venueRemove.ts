// src/lib/venueRemove.ts — 관리자 '매장 삭제' 의 단일 통로(AdminTab · VenueManagement 가 같이 쓴다).
//
// 서버(20261001d 트리거 _guard_venue_hard_delete)는 장부·이용권·출석 등 기록이 있는 매장의 영구 삭제를 거부한다.
// 예전엔 화면이 그 거부를 '삭제에 실패했습니다' 로 뭉개 눌러도 안 되는 버튼처럼 보였다.
// 이제: 삭제를 시도하고, 기록 때문에 막히면 이유를 말하고 서버가 허용하는 대체 동작(숨김·보관 RPC)을 권한다.
// 기록이 없는 매장(미승인·빈 매장)은 지금처럼 삭제된다 — 기능 소실 없음.
import { deleteVenue, adminSetVenueArchived, isVenueHasRecordsError } from '../api/community';
import type { VenueStatus } from '../api/community';

export type VenueRemoveResult = 'deleted' | 'archived' | 'cancelled';

export async function removeOrArchiveVenue(v: { id: string; name: string; status?: VenueStatus }): Promise<VenueRemoveResult> {
  if (!confirm(`'${v.name}' 매장을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.\n(장부·이용권·출석 등 기록이 있는 매장은 삭제되지 않고, 숨김(보관)으로 전환할 수 있습니다.)`)) return 'cancelled';
  try {
    await deleteVenue(v.id);
    return 'deleted';
  } catch (e) {
    if (!isVenueHasRecordsError(e)) throw e;
  }
  // 여기부터는 기록 때문에 서버가 삭제를 거부한 경우다.
  if (v.status === 'hidden') throw new Error('장부·이용권·출석 등 기록이 있어 삭제할 수 없습니다. 이미 숨김(보관) 상태입니다.');
  if (!confirm(`'${v.name}' 매장은 장부·이용권·출석 등 기록이 있어 삭제할 수 없습니다.\n대신 숨김(보관)으로 전환할까요? 기록은 그대로 보존되고, 나중에 다시 풀 수 있습니다.`)) return 'cancelled';
  await adminSetVenueArchived(v.id, true, '삭제 시도(기록 있음) → 보관');
  return 'archived';
}
