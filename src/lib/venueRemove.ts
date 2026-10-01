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
  // 서버(admin_set_venue_archived)는 활성 매장만 보관한다 — 정지·비활성 매장에 '보관할까요?' 를 물으면 승낙해도 거부되고,
  // 그 거부 문구에는 서버 상태값 원문('현재 suspended')이 실린다. 묻기 전에 여기서 이유를 말하고 멈춘다(review-admin-wire-1002 메모 ①②).
  if (v.status && v.status !== 'active') throw new Error('장부·이용권·출석 등 기록이 있어 삭제할 수 없습니다. 정지·비활성 매장은 보관(숨김)으로 바꿀 수 없으니 먼저 활성 상태로 되돌려 주세요.');
  if (!confirm(`'${v.name}' 매장은 장부·이용권·출석 등 기록이 있어 삭제할 수 없습니다.\n대신 숨김(보관)으로 전환할까요? 기록은 그대로 보존되고, 나중에 다시 풀 수 있습니다.`)) return 'cancelled';
  try {
    await adminSetVenueArchived(v.id, true, '삭제 시도(기록 있음) → 보관');
  } catch (e) {
    // 그사이 다른 관리자가 상태를 바꿨으면 서버 문구에 '(현재 suspended)'·'활성(active)' 같은 원문 상태값이 실린다 — 그 괄호만 뗀다.
    const msg = e instanceof Error ? e.message : '';
    throw new Error(msg.replace(/\s*\((?:현재 )?[a-z_]+\)/g, '') || '보관(숨김)으로 바꾸지 못했습니다', { cause: e });
  }
  return 'archived';
}
