// src/api/ads.ts — 커뮤니티 광고 5칸(게시판 한 줄 리스트 사이). 읽기 공개 / 쓰기 관리자(RLS).
import { supabase, IS_MOCK } from '../lib/supabase';

export interface CommunityAd { slot: number; title: string; linkUrl: string; advertiser: string; expiresAt: string | null; active: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToAd = (r: any): CommunityAd => ({
  slot: r.slot, title: r.title, linkUrl: r.link_url, advertiser: r.advertiser, expiresAt: r.expires_at,
  // 20260903a 추가 — 컬럼이 없던 응답은 켜진 것으로 본다(종전 동작 보존)
  active: r.active ?? true,
});

/** 게재 중인 광고(켜져 있고, 제목 있고, 만료 전)만 슬롯 순으로. */
export async function getActiveCommunityAds(): Promise<CommunityAd[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('community_ads').select('*').order('slot');
  const today = new Date().toLocaleDateString('en-CA');
  return (data ?? []).map(rowToAd)
    .filter((a) => a.active && a.title.trim() && (!a.expiresAt || a.expiresAt >= today));
}

/** 관리자: 전체 슬롯(빈 칸 포함) 조회. */
export async function getAllCommunityAds(): Promise<CommunityAd[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('community_ads').select('*').order('slot');
  return (data ?? []).map(rowToAd);
}

/** 관리자: 슬롯 저장(제목 비우면 게재 중단, active=false 면 내용 유지한 채 노출만 끔). */
export async function saveCommunityAd(ad: CommunityAd): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('community_ads').upsert({
    slot: ad.slot, title: ad.title.trim(), link_url: ad.linkUrl.trim(),
    advertiser: ad.advertiser.trim(), expires_at: ad.expiresAt || null,
    active: ad.active,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
