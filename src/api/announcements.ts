// src/api/announcements.ts — 운영자 마케팅 푸시(팔로워에게 커스텀 알림)
//   send_venue_announcement: 알림 insert → trg_push_on_notification 가 푸시 발송. 하루 3회 제한.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface AnnounceStatus { followers: number; sentToday: number }

export async function getVenueAnnounceStatus(venueId: string): Promise<AnnounceStatus> {
  if (IS_MOCK) return { followers: 0, sentToday: 0 };
  const { data } = await supabase.rpc('venue_announce_status', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (data as any)?.[0];
  return { followers: Number(row?.followers) || 0, sentToday: Number(row?.sent_today) || 0 };
}

/** 팔로워에게 알림 발송 → 수신자 수 반환. 권한/한도 위반 시 throw. */
export async function sendVenueAnnouncement(venueId: string, title: string, message: string): Promise<number> {
  if (IS_MOCK) return 0;
  const { data, error } = await supabase.rpc('send_venue_announcement', { p_venue_id: venueId, p_title: title, p_message: message });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
