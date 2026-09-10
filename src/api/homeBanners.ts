// src/api/homeBanners.ts — 홈 상단 캐러셀 배너. 읽기 공개 / 쓰기 관리자(RLS 가 최종 강제).
//
// 파이프라인 위치: **노출**(사슬 첫 칸). 종전엔 PosterCarousel.tsx 소스에 배너가 하드코딩돼 있어
// 한 장 바꾸려면 배포가 필요했다 — 여기가 그걸 운영 가능하게 만든다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { getAppSetting } from './settings';

/** app_settings 킬스위치 — 'off' 면 코드에 박힌 기본 배너(PosterCarousel POSTER_SLIDES)를 **어느 역할에게도** 띄우지 않는다.
 *  왜 스위치인가: 20260904g 이후 비관리자에게는 RLS 가 '게재 중인 행'만 돌려주므로, 클라이언트는
 *  '아직 등록 전'과 '관리자가 전부 껐음'을 구분할 수 없다(관리자만 전량이 보인다). 그 구분을 역할별
 *  행 수로 흉내 내면 손님 홈에는 기본 배너가 되살아나고 관리자 화면에는 안 떠 '내 화면과 손님 화면이
 *  다르다'가 된다. 구분은 서버(app_settings, 전원 공개 읽기)가 한 값으로 말한다 — tabbar_autohide_v2 와 같은 패턴. */
export const HOME_BANNER_FALLBACK_KEY = 'home_banner_fallback';

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
  /** (기록) 예전엔 코드 내장 기본 배너의 폴백 여부였다. 2026-09-10 하드코딩 포스터를 제거해 PosterCarousel 은 더 이상 이 값을 읽지 않는다 —
   *  관리 화면 표시용으로만 남긴다.
   *  ⚠ 판정은 **역할과 무관하게 같은 값**이어야 한다. 예전엔 '표에 행이 있는가(rows.length)'였는데,
   *  RLS 축소(20260904g) 뒤 비관리자에게 rows 는 곧 '게재 중'이라 관리자가 전부 끈 순간 손님 홈에만
   *  기본 배너가 되살아났다(관리자 화면은 빈 캐러셀 — 서로 다른 화면). 지금은
   *  게재 중인 배너가 있거나, 킬스위치(HOME_BANNER_FALLBACK_KEY='off')가 켜져 있으면 true. */
  configured: boolean;
}

/** 조회 결과 → 노출 목록·폴백 판정. 순수 함수(테스트는 여기만 본다). */
export function homeBannerFeed(rows: HomeBanner[], t: string, fallbackOff: boolean): HomeBannerFeed {
  const banners = rows.filter((b) =>
    b.active && b.imageUrl.trim()
    && (!b.startsAt || b.startsAt <= t)
    && (!b.endsAt || b.endsAt >= t));
  return { banners, configured: banners.length > 0 || fallbackOff };
}

export async function getActiveHomeBanners(): Promise<HomeBannerFeed> {
  if (IS_MOCK) return { banners: [], configured: false };
  const [{ data, error }, fallback] = await Promise.all([
    supabase.from('home_banners').select('*').order('sort_order').order('created_at'),
    // 스위치 조회 실패는 '스위치 없음'과 같게 — 배너 조회만이 이 함수의 성패다.
    getAppSetting(HOME_BANNER_FALLBACK_KEY).catch(() => null),
  ]);
  if (error) throw error;   // 조회 실패를 '등록 전'으로 오인해 기본 배너를 띄우지 않는다
  return homeBannerFeed((data ?? []).map(rowToBanner), today(), fallback === 'off');
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
