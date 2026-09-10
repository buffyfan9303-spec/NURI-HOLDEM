// src/api/spots.ts — NURI SPOT 저장·공유 데이터 레이어
//
// 마이그레이션: supabase/migrations/20260911d_nuri_spot.sql
//   · spot_reviews — '내 스팟'(비공개). 작성자만 읽고 쓴다(RLS).
//   · post_spots   — 게시글에 붙는 **공유 시점 스냅샷**. 읽기는 부모 글 노출 규칙을 따른다.
//   · share_spot_post() — 게시글 + 스팟 + 액션 투표를 한 트랜잭션에 만드는 RPC.
//
// ⚠ 왜 게시글 공유가 RPC 한 번인가
//   기존 첨부 저장은 '글 insert → 첨부 insert' 2단이라 글만 남는 부분 성공이 가능했고,
//   방금 만든 글의 id 를 몰라 본문 문자열로 재조회까지 했다(PostFormModal.findCreatedPostId).
//   RPC 하나면 둘 다 사라진다 — 실패하면 글도 안 남고, id 는 함수가 돌려준다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { toJSON, fromJSON, type SpotReview } from '../lib/spot';
import type { SpotEvaluation, CoverageKind } from '../lib/spotEvaluate';

/** 저장된 내 스팟 한 건 */
export interface SavedSpot {
  id: string;
  spot: SpotReview;
  coverageKind: CoverageKind;
  sourceLabel: string | null;
  datasetVersion: string;
  createdAt: string;
}

/** 게시글에 붙은 스팟(공유 시점 스냅샷) */
export interface PostSpot {
  spot: SpotReview;
  coverageKind: CoverageKind;
  sourceLabel: string | null;
  datasetVersion: string;
  /** 작성자가 열어 준 것만 true — 기본은 둘 다 가림 */
  revealVillain: boolean;
  revealResult: boolean;
  /** 공유 시점 분석 스냅샷. 엔진이 바뀌어도 옛 글의 결론이 말없이 변하지 않는다 */
  analysis: unknown;
}

/** 분석 결과에서 저장할 조각만 뽑는다 — 화면 상태나 함수는 담지 않는다. */
function analysisSnapshot(e: SpotEvaluation): Record<string, unknown> {
  const base: Record<string, unknown> = {
    kind: e.kind, verdict: e.verdict, datasetVersion: e.datasetVersion,
    notes: e.notes, math: e.math,
  };
  if (e.kind === 'chart_nash' || e.kind === 'normalized_reference') {
    base.mix = e.mix;
    base.heroFreq = e.heroFreq;
    base.sourceLabel = e.sourceLabel;
    base.differences = e.differences;
  }
  return base;
}

const sourceLabelOf = (e: SpotEvaluation): string | null =>
  (e.kind === 'chart_nash' || e.kind === 'normalized_reference') ? e.sourceLabel : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSaved(r: any): SavedSpot | null {
  const spot = fromJSON(r.spot);
  if (!spot) return null;
  return {
    id: r.id as string,
    spot,
    coverageKind: r.coverage_kind as CoverageKind,
    sourceLabel: (r.source_label as string | null) ?? null,
    datasetVersion: r.dataset_version as string,
    createdAt: r.created_at as string,
  };
}

// ── 내 스팟 ───────────────────────────────────────────────────────────────────

/** 최근순. 비로그인·마이그레이션 미적용은 빈 배열(화면을 깨뜨리지 않는다). */
export async function listMySpots(limit = 50): Promise<SavedSpot[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('spot_reviews')
    .select('id, spot, coverage_kind, source_label, dataset_version, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(rowToSaved).filter((s): s is SavedSpot => s !== null);
}

export async function saveMySpot(spot: SpotReview, e: SpotEvaluation): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase
    .from('spot_reviews')
    .insert({
      // user_id 는 RLS with check 가 auth.uid() 와 대조한다 — 클라 값을 서버가 믿지 않는다.
      user_id: (await supabase.auth.getSession()).data.session?.user?.id,
      spot: toJSON(spot),
      hero_action: spot.heroAction,
      coverage_kind: e.kind,
      source_label: sourceLabelOf(e),
      dataset_version: e.datasetVersion,
      analysis: analysisSnapshot(e),
    })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}

export async function deleteMySpot(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('spot_reviews').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── 스팟 토론 공유 ────────────────────────────────────────────────────────────

/** 공유 본문 — 스팟 카드가 구조를 보여주므로 본문은 짧게. 메모가 있으면 그것을 쓴다. */
function shareBody(spot: SpotReview): string {
  const head = `${spot.heroPos} vs ${spot.villainPos} · ${spot.effectiveBb}BB · ${spot.street === 'preflop' ? '프리플랍' : spot.street}`;
  return spot.note?.trim() ? `${head}\n\n${spot.note.trim()}` : `${head}\n\n이 자리에서 어떻게 하시겠어요?`;
}

/**
 * 게시글 + 스팟 + 액션 투표를 **한 번에** 만든다. 반환은 새 글 id.
 * 상대 카드와 결과는 기본 가림 — 토론이 끝난 뒤 작성자가 연다(revealPostSpot).
 */
export async function shareSpotPost(
  spot: SpotReview, e: SpotEvaluation, opts: { title?: string; withVote?: boolean } = {},
): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('share_spot_post', {
    p_content: shareBody(spot),
    p_spot: toJSON(spot),
    p_coverage_kind: e.kind,
    p_dataset_version: e.datasetVersion,
    p_title: opts.title ?? null,
    p_category: 'hand',
    p_hero_action: spot.heroAction,
    p_source_label: sourceLabelOf(e),
    p_analysis: analysisSnapshot(e),
    p_reveal_villain: false,
    p_reveal_result: false,
    p_with_vote: opts.withVote ?? true,
  });
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

/** 게시글의 스팟. 없으면 null — 일반 글과 레거시 리플레이 글은 여기 걸리지 않는다. */
export async function fetchPostSpot(postId: string): Promise<PostSpot | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase
    .from('post_spots')
    .select('spot, coverage_kind, source_label, dataset_version, reveal_villain, reveal_result, analysis')
    .eq('post_id', postId).maybeSingle();
  if (error || !data) return null;
  const spot = fromJSON(data.spot);
  if (!spot) return null;
  // 가리는 일은 **서버가 한다**: 공유 시점에 상대 카드·결과를 spot 본문에서 빼내
  // hidden_* 컬럼(컬럼 수준 SELECT 회수)에 넣어 두고, 작성자가 열 때 되돌려 넣는다
  // (20260911d). 그러니 여기 온 spot 에는 열리기 전 정답이 애초에 없다.
  // 아래 두 줄은 그 계약이 깨졌을 때를 위한 이중 방어다 — 지우지 마라.
  if (!data.reveal_villain) spot.villain = [];
  if (!data.reveal_result) delete spot.result;
  return {
    spot,
    coverageKind: data.coverage_kind as CoverageKind,
    sourceLabel: (data.source_label as string | null) ?? null,
    datasetVersion: data.dataset_version as string,
    revealVillain: data.reveal_villain === true,
    revealResult: data.reveal_result === true,
    analysis: data.analysis,
  };
}

/** 작성자가 상대 카드·결과를 연다. 서버가 작성자 여부를 판정한다. */
export async function revealPostSpot(postId: string, villain: boolean, result: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('reveal_post_spot', {
    p_post_id: postId, p_villain: villain, p_result: result,
  });
  if (error) throw new Error(error.message);
}
