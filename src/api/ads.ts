// src/api/ads.ts — 커뮤니티 광고 5칸.
//
// ── 2026-09-11 모델 변경(오너 지시) ──────────────────────────────────────────
// 광고는 더 이상 (문구 + 외부 링크) 로 된 **독립 행**이 아니다.
// 광고 = **게시판에 이미 있는 글을 슬롯에 연결한 것**(게시글 승격)이다.
//
// 왜 바꿨나: 종전 AdRow 는 게시글 행과 완전히 별개 컴포넌트였고, link_url 이 없으면 `<div>` 라
//   **아예 클릭이 안 됐다**. 눌러도 게시글 상세로 가지 않았다(외부 새 탭이 유일한 목적지).
//   피드에서 생김새도 달라 이질적이었다. 이제 광고는 진짜 게시글 객체이고,
//   화면은 기존 PostRow/PostCard 를 그대로 쓰며, 누르면 기존 게시글 상세가 열린다.
//
// 읽기는 서버 RPC(community_ads_public) 한 번이다:
//   · 광고마다 글을 따로 조회하는 N+1 이 없다(조인 1회).
//   · 노출 조건(활성·게재 창 KST·글 존재·블라인드 아님)을 **서버가** 판정한다.
//   · post_id 가 없거나 글을 읽을 수 없는 슬롯은 서버가 애초에 안 준다 → 빈 AD 행이 생기지 않는다.
// 쓰기는 종전대로 PostgREST + RLS(관리자만). 일반 사용자는 자기 글을 AD 로 만들 수 없다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { rowToPost, type CommunityPost } from './community';

/** 게재 중인 광고 한 칸 = 슬롯 번호 + 그 자리에 승격된 **진짜 게시글**. */
export interface PromotedPost { slot: number; post: CommunityPost }

/** 관리자 화면용 슬롯 상태(빈 칸·미연결 포함). */
export interface AdSlot {
  slot: number;
  postId: string | null;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  /** DEPRECATED — 게시글 승격 이전의 광고 문구. 지우지 않고 '연결 필요' 판정에만 쓴다. */
  legacyTitle: string;
}

/**
 * 게재 중인 광고(승격 게시글)를 슬롯 순으로.
 *
 * ⚠ 실패와 '광고 0개'를 구분해서 돌려준다. 종전 구현은 `.catch(() => {})` 로 둘을 같게 만들어,
 *   조회가 깨져도 화면은 '광고 없음' 처럼 보였다(운영자가 게재 사실을 확인할 방법이 없었다).
 */
export async function getActivePromotedPosts(): Promise<{ ads: PromotedPost[]; error: unknown }> {
  if (IS_MOCK) return { ads: [], error: null };
  const { data, error } = await supabase.rpc('community_ads_public');
  if (error) return { ads: [], error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return {
    // 서버가 slot 순으로 준다. 같은 슬롯이 두 번 올 수 없다(PK) — 추가 정렬·중복 제거가 필요 없다.
    ads: rows.map((r) => ({ slot: Number(r.slot), post: rowToPost(r) })),
    error: null,
  };
}

// ── 관리자 ──────────────────────────────────────────────────────────────────

/** 전체 슬롯(빈 칸·미연결 포함). 쓰기와 같은 테이블을 직접 읽는다(관리자 RLS). */
export async function getAdSlots(): Promise<AdSlot[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('community_ads')
    .select('slot, post_id, active, starts_at, expires_at, title')
    .order('slot');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    slot: r.slot,
    postId: r.post_id ?? null,
    active: r.active ?? true,
    startsAt: r.starts_at ?? null,
    expiresAt: r.expires_at ?? null,
    legacyTitle: r.title ?? '',
  }));
}

/** 슬롯 저장(연결·게재 창·노출). post_id 가 null 이면 '연결 해제'다. */
export async function saveAdSlot(s: AdSlot): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('community_ads').upsert({
    slot: s.slot,
    post_id: s.postId,
    active: s.active,
    starts_at: s.startsAt || null,
    expires_at: s.expiresAt || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/**
 * 두 슬롯의 **내용을 맞바꾼다**(자리 1~5 는 고정, 안에 든 광고만 위/아래로).
 *
 * ⚠ 요청은 **둘**이다 — 유니크 인덱스 탓에 한쪽 슬롯을 먼저 비운 뒤에야 두 행을 upsert 할 수 있다.
 *   둘째가 실패하면 첫 슬롯이 '해제·꺼짐'으로 남아 그 광고는 손님 화면에서 내려간다(관리 화면은
 *   move() 의 reload 로 그 상태를 드러낸다). 원자성은 클라이언트로 만들 수 없다 —
 *   swap_community_ad_slots RPC 한 트랜잭션으로 옮겨야 한다(nuri-migration).
 *   종전엔 Promise.all 로 두 요청을 따로 보내
 *   한쪽만 성공하면 같은 글이 두 슬롯에 남았다(그리고 UI 는 옛 순서를 계속 보여줬다).
 *   부분 유니크 인덱스(community_ads_active_post_uidx)가 그 상태를 이제 DB 에서도 거부한다.
 */
export async function swapAdSlots(a: AdSlot, b: AdSlot): Promise<void> {
  if (IS_MOCK) return;
  const stamp = new Date().toISOString();
  const row = (dst: AdSlot, src: AdSlot) => ({
    slot: dst.slot, post_id: src.postId, active: src.active,
    starts_at: src.startsAt || null, expires_at: src.expiresAt || null, updated_at: stamp,
  });
  // 유니크 인덱스 충돌을 피하려면 먼저 한쪽을 비워야 한다(같은 post_id 가 잠깐 두 행에 존재할 수 없다).
  const clear = await supabase.from('community_ads')
    .update({ post_id: null, active: false, updated_at: stamp }).eq('slot', a.slot);
  if (clear.error) throw new Error(clear.error.message);
  const { error } = await supabase.from('community_ads').upsert([row(b, a), row(a, b)]);
  if (error) throw new Error(error.message);
}
