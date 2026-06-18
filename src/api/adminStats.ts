// src/api/adminStats.ts — 관리자 플랫폼 운영 지표(admin 전용 RPC)
import { supabase, IS_MOCK } from '../lib/supabase';

export interface PlatformStats {
  users: number; newUsers7d: number; newUsers30d: number;
  venues: number; activeVenues: number;
  schedules: number; upcomingSchedules: number;
  checkinsToday: number; checkins7d: number;
  referrals: number; referralsRewarded: number;
  pushSubs: number; announcements: number; posts7d: number;
}

export async function getAdminPlatformStats(): Promise<PlatformStats | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('admin_platform_stats');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (data as any)?.[0];
  if (error || !r) return null;
  return {
    users: +r.users || 0, newUsers7d: +r.new_users_7d || 0, newUsers30d: +r.new_users_30d || 0,
    venues: +r.venues || 0, activeVenues: +r.active_venues || 0,
    schedules: +r.schedules || 0, upcomingSchedules: +r.upcoming_schedules || 0,
    checkinsToday: +r.checkins_today || 0, checkins7d: +r.checkins_7d || 0,
    referrals: +r.referrals || 0, referralsRewarded: +r.referrals_rewarded || 0,
    pushSubs: +r.push_subs || 0, announcements: +r.announcements || 0, posts7d: +r.posts_7d || 0,
  };
}
