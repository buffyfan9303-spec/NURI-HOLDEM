// src/api/homeBanners.ts — 홈 상단 캐러셀 배너. 읽기 공개 / 쓰기 관리자(RLS 가 최종 강제).
//
// 파이프라인 위치: **노출**(사슬 첫 칸). 종전엔 PosterCarousel.tsx 소스에 배너가 하드코딩돼 있어
// 한 장 바꾸려면 배포가 필요했다 — 여기가 그걸 운영 가능하게 만든다.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface HomeBanner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  sortOrder: number;
  startsAt: string | null;   // 'YYYY-MM-DD'
  endsAt: string | null;
  active: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToBanner = (r: any): HomeBanner => ({
  id: r.id,
  title: r.title ?? '',
  subtitle: r.subtitle ?? '',
  imageUrl: r.image_url ?? '',
  linkUrl: r.link_url ?? '',
  sortOrder: r.sort_order ?? 0,
  startsAt: r.starts_at ?? null,
  endsAt: r.ends_at ?? null,
  active: r.active ?? true,
});

/** 오늘 기준 KST 날짜('YYYY-MM-DD') — 만료 판정은 서버 시각이 아니라 사용자 달력 기준이어야 자연스럽다. */
const today = () => new Date().toLocaleDateString('en-CA');

/**
 * 게재 중인 배너만 순서대로.
 * 노출 조건 = active AND 이미지 있음 AND 시작 전 아님 AND 만료 전.
 * 만료 '삭제'(purge_expired_home_banners)와 무관하게 노출은 이 필터가 끊는다 —
 * 정리 함수가 안 돌아도 지난 배너가 화면에 남지 않는다.
 */
export interface HomeBannerFeed {
  /** 지금 게재 중인 배너(순서대로) */
  banners: HomeBanner[];
  /** 표에 행이 하나라도 있는가. **'아직 등록 전'과 '관리자가 전부 숨김'을 가르는 값**이다 —
   *  둘을 같은 빈 배열로 뭉개면 관리자가 배너를 모두 끈 순간 코드에 박힌 기본 배너가 되살아나
   *  '지웠는데 그대로 있다'가 된다(운영 불가). 조회는 한 번 그대로다(이미 전체 행을 읽고 있었다). */
  configured: boolean;
}

export async function getActiveHomeBanners(): Promise<HomeBannerFeed> {
  if (IS_MOCK) return { banners: [], configured: false };
  const t = today();
  const { data, error } = await supabase
    .from('home_banners').select('*')
    .order('sort_order').order('created_at');
  if (error) throw error;   // 조회 실패를 '등록 전'으로 오인해 기본 배너를 띄우지 않는다
  const rows = (data ?? []).map(rowToBanner);
  return {
    banners: rows.filter((b) =>
      b.active && b.imageUrl.trim()
      && (!b.startsAt || b.startsAt <= t)
      && (!b.endsAt || b.endsAt >= t)),
    configured: rows.length > 0,
  };
}

/** 관리자: 전체 목록(꺼진 것·만료된 것 포함). */
export async function getAllHomeBanners(): Promise<HomeBanner[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase
    .from('home_banners').select('*')
    .order('sort_order').order('created_at');
  return (data ?? []).map(rowToBanner);
}

type BannerInput = Omit<HomeBanner, 'id'> & { id?: string };

/** 관리자: 생성·수정. id 가 있으면 수정. */
export async function saveHomeBanner(b: BannerInput): Promise<void> {
  if (IS_MOCK) return;
  const payload = {
    title: b.title.trim(),
    subtitle: b.subtitle.trim(),
    image_url: b.imageUrl.trim(),
    link_url: b.linkUrl.trim(),
    sort_order: b.sortOrder,
    starts_at: b.startsAt || null,
    ends_at: b.endsAt || null,
    active: b.active,
  };
  const { error } = b.id
    ? await supabase.from('home_banners').update(payload).eq('id', b.id)
    : await supabase.from('home_banners').insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteHomeBanner(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('home_banners').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 관리자: 순서 일괄 저장(위/아래 이동 후 확정). */
export async function reorderHomeBanners(ids: string[]): Promise<void> {
  if (IS_MOCK) return;
  // 행 수가 한 자리라 순차 업데이트로 충분하다. 실패 시 앞쪽만 반영될 수 있으나
  // sort_order 는 화면 순서일 뿐이라 부분 반영이 데이터를 깨지 않는다(재시도로 수렴).
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from('home_banners').update({ sort_order: i }).eq('id', ids[i]);
    if (error) throw new Error(error.message);
  }
}

/** 관리자: 만료 후 7일 지난 배너 정리. 서버 함수가 관리자 권한을 다시 검사한다. */
export async function purgeExpiredHomeBanners(): Promise<number> {
  if (IS_MOCK) return 0;
  const { data, error } = await supabase.rpc('purge_expired_home_banners');
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}
