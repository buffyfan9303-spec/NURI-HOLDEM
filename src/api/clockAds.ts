// src/api/clockAds.ts — 클락 슬라이드 광고(K단계, 2026-09-30).
//
// 요구 원문: .claude/handoff/specs-0930/PLAN-AB-exec.md §5-1 '클락 광고 관리(관리자 전용)'.
//   · 광고 여러 개 — 기간(시작·끝) · 대상 매장(전체 또는 지정) · 순번.
//   · 이미지 840×1120(3:4) **정확히** · 500KB 이하 · webp/jpg/png.
//     형식·크기는 저장소 버킷(clock_ads)의 file_size_limit·allowed_mime_types 가 서버에서 강제하고, 가로세로는 업로드 전에 여기서 잰다.
//   · 쓰기는 관리자만(RLS my_role()='admin'), 읽기는 공개(TV 는 비로그인 화면이다).
//   · 기존 우하단 스폰서 칸(app_settings clock_ad_image)은 그대로 둔다 — 이것은 왼쪽 칸 슬라이드에 끼는 별도 광고다.
//
// 🔴 서버 표·버킷은 supabase/migrations/20260930h_clock_slides_ads.sql **초안**이다(리드가 리허설 후 적용).
//   적용 전에는 조회가 '표 없음'(42P01·PGRST205)으로 실패한다 → 빈 목록으로 읽는다(광고 칸만 건너뛰고 TV 는 그대로).
import { supabase, IS_MOCK } from '../lib/supabase';
import { mustAffect } from './_mustAffect';

export const CLOCK_AD_BUCKET = 'clock_ads';
export const CLOCK_AD_W = 840;
export const CLOCK_AD_H = 1120;
export const CLOCK_AD_MAX_BYTES = 500 * 1024;
export const CLOCK_AD_MIME = ['image/webp', 'image/jpeg', 'image/png'] as const;

export interface ClockAd {
  id: string;
  imageUrl: string;
  /** ISO. 이 시각부터 건다. */
  startsAt: string;
  /** ISO. 이 시각 전까지 건다. */
  endsAt: string;
  /** null = 전체 매장. */
  venueIds: string[] | null;
  sortOrder: number;
}

/** §28 — 관리 화면에 늘 보이는 안내(사행성·현금·환전 표현 금지). */
export const CLOCK_AD_NOTICE = '광고 이미지에 현금·환전·수익·상금 지급 같은 사행성 표현을 넣지 마세요. 참가비·GTD 같은 가격 안내는 괜찮습니다.';

/** 지금 이 매장 TV 에 걸 광고(기간 안 · 대상 포함) — 순번대로. */
export function pickActiveAds(ads: readonly ClockAd[], venueId: string, nowMs: number): ClockAd[] {
  return ads
    .filter((a) => Date.parse(a.startsAt) <= nowMs && nowMs < Date.parse(a.endsAt))
    .filter((a) => !a.venueIds || a.venueIds.length === 0 || a.venueIds.includes(venueId))
    .slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 업로드 전 검사 — 사람이 읽는 오류 문구, 통과면 null. */
export function checkClockAdMeta(m: { type: string; size: number; width: number; height: number }): string | null {
  if (!(CLOCK_AD_MIME as readonly string[]).includes(m.type)) return 'webp·jpg·png 이미지만 올릴 수 있습니다';
  if (m.size > CLOCK_AD_MAX_BYTES) return `500KB 이하만 올릴 수 있습니다 (지금 ${Math.ceil(m.size / 1024)}KB)`;
  if (m.width !== CLOCK_AD_W || m.height !== CLOCK_AD_H) return `이미지는 정확히 ${CLOCK_AD_W}×${CLOCK_AD_H} 이어야 합니다 (지금 ${m.width}×${m.height})`;
  return null;
}

const isMissingTable = (e: unknown) => {
  const c = (e as { code?: string } | null)?.code;
  return c === '42P01' || c === 'PGRST205';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToAd = (r: any): ClockAd => ({
  id: r.id, imageUrl: r.image_url, startsAt: r.starts_at, endsAt: r.ends_at,
  venueIds: Array.isArray(r.venue_ids) && r.venue_ids.length ? r.venue_ids : null, sortOrder: r.sort_order ?? 0,
});

/** 표가 아직 없다고 서버가 한 번 답했으면 이 탭에서는 다시 묻지 않는다 — TV 가 30초마다 404 를 콘솔에 쌓지 않게(새로고침하면 다시 확인). */
let adsTableMissing = false;

/** 전체 목록(관리 화면·TV 공용). 표가 아직 없으면 빈 목록. */
export async function fetchClockAds(): Promise<ClockAd[]> {
  if (IS_MOCK || adsTableMissing) return [];
  const { data, error } = await supabase.from('clock_ads')
    .select('id, image_url, starts_at, ends_at, venue_ids, sort_order')
    .order('sort_order', { ascending: true });
  if (error) { if (isMissingTable(error)) { adsTableMissing = true; return []; } throw error; }
  return (data ?? []).map(rowToAd);
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    const r = { width: bmp.width, height: bmp.height };
    bmp.close();
    return r;
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
    img.src = url;
  });
}

/** 원본 그대로 올린다(재압축하면 규격 검사가 무의미해진다). 반환 = 공개 URL. */
export async function uploadClockAdImage(file: File): Promise<string> {
  const { width, height } = await imageSize(file);
  const bad = checkClockAdMeta({ type: file.type, size: file.size, width, height });
  if (bad) throw new Error(bad);
  if (IS_MOCK) return URL.createObjectURL(file);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `ads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(CLOCK_AD_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from(CLOCK_AD_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createClockAd(a: Omit<ClockAd, 'id'>): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('clock_ads').insert({
    image_url: a.imageUrl, starts_at: a.startsAt, ends_at: a.endsAt, venue_ids: a.venueIds, sort_order: a.sortOrder,
  });
  if (error) throw error;
}

export async function updateClockAd(id: string, patch: Partial<Pick<ClockAd, 'startsAt' | 'endsAt' | 'venueIds' | 'sortOrder'>>): Promise<void> {
  if (IS_MOCK) return;
  const row: Record<string, unknown> = {};
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.venueIds !== undefined) row.venue_ids = patch.venueIds;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  await mustAffect(supabase.from('clock_ads').update(row).eq('id', id), '광고를 바꾸지 못했습니다(관리자만 가능)');
}

export async function deleteClockAd(id: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('clock_ads').delete().eq('id', id), '광고를 삭제하지 못했습니다(관리자만 가능)');
}
