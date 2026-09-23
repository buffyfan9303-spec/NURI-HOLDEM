// src/api/spotReview.ts — NURI SPOT 'AI 아쉬운 포인트'(2026-09-23 오너 결정 SPOT-WRITE-UX-AI).
//
// 외부 AI 통로는 둘뿐이다: tda-assist(규칙 질의) 와 spot-review(이 파일). src/api/aiSurface.test.ts 가 잠근다.
// 클라이언트가 보내는 것은 **저장된 스팟의 id 하나**다 — 스팟 내용·프롬프트·모델은 서버가 정한다.
// 과금(30P)·하루 3회·실패 환불은 DB(20260923c)가 강제한다. 여기 값은 화면 안내용일 뿐이다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { toJSON, type SpotReview } from '../lib/spot';

/**
 * AI 코칭을 받을 만큼 채워졌는가 — 내 카드 2장 + 내 선택 + 액션 1개 이상.
 * ⚠ **AI 버튼만** 이 판정으로 막는다. 저장·공유는 예전처럼 입력 blocker 만 본다(기능 보존).
 */
export function spotCompleteness(s: Pick<SpotReview, 'hero' | 'heroAction' | 'actions'>): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (s.hero.length !== 2) missing.push('내 카드 2장');
  if (s.actions.length < 1) missing.push('액션 1개 이상');
  if (!s.heroAction) missing.push('내 선택');
  return { ok: missing.length === 0, missing };
}

export interface SpotAiStatus {
  enabled: boolean;
  price: number;
  usedToday: number;
  limit: number;
  available: number;
}

/** spot_ai_status() — 꺼져 있거나 읽지 못하면 null(버튼을 숨긴다). */
export async function getSpotAiStatus(): Promise<SpotAiStatus | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('spot_ai_status');
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  if (d.enabled !== true || typeof d.price !== 'number') return null;
  return {
    enabled: true,
    price: d.price,
    usedToday: Number(d.used_today ?? 0),
    limit: Number(d.limit ?? 3),
    available: Number(d.available ?? 0),
  };
}

export type SpotAiCode =
  | 'INSUFFICIENT' | 'DAILY_LIMIT' | 'DISABLED' | 'NOT_OWNER' | 'SANCTIONED' | 'PENDING'
  | 'AI_FAILED' | 'REFUND_PENDING' | 'ATTEMPT_LIMIT' | 'LOGIN' | 'UNKNOWN';

export class SpotAiError extends Error {
  code: SpotAiCode;
  constructor(code: SpotAiCode, message: string) { super(message); this.code = code; }
}

/** 코드별 안내 — 서버 문구보다 이쪽이 우선이다(화면 문구를 한곳에서 고친다). */
export function spotAiMessage(code: SpotAiCode, extra?: { available?: number; price?: number }): string {
  switch (code) {
    case 'INSUFFICIENT':
      return `포인트가 부족해요${extra?.available !== undefined && extra?.price !== undefined ? ` (사용 가능 ${extra.available}P · 필요 ${extra.price}P)` : ''}. 포인트는 차감되지 않았습니다.`;
    case 'DAILY_LIMIT': return '오늘 AI 코칭 3회를 모두 썼어요. 내일(자정 기준) 다시 이용해 주세요.';
    case 'DISABLED': return '지금은 AI 코칭을 이용할 수 없어요.';
    case 'NOT_OWNER': return '내가 저장한 스팟만 AI 코칭을 받을 수 있어요.';
    case 'SANCTIONED': return '이용이 제한된 계정이에요.';
    case 'PENDING': return '이 스팟의 코칭을 만드는 중이에요. 잠시 후 다시 열어 주세요.';
    // 'AI_FAILED' 는 서버가 환불 RPC 의 true 를 확인했을 때만 온다(F3). 확인 못 하면 REFUND_PENDING.
    case 'AI_FAILED': return 'AI 답변을 받지 못했어요. 포인트를 돌려드렸어요.';
    case 'REFUND_PENDING': return 'AI 답변을 받지 못했어요. 포인트 환불이 늦어지고 있어요 — 5분 뒤 다시 요청하면 먼저 돌려드려요.';
    case 'ATTEMPT_LIMIT': return '오늘 AI 코칭 요청이 너무 많아요. 내일 다시 이용해 주세요.';
    case 'LOGIN': return '로그인이 필요합니다.';
    default: return 'AI 코칭을 받지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

const KNOWN: readonly SpotAiCode[] = ['INSUFFICIENT', 'DAILY_LIMIT', 'DISABLED', 'NOT_OWNER', 'SANCTIONED', 'PENDING', 'AI_FAILED', 'REFUND_PENDING', 'ATTEMPT_LIMIT'];

/** 저장된 스팟 하나에 AI 코칭을 요청한다. 같은 스팟의 재요청은 서버가 무료로 돌려준다(cached). */
export async function requestSpotAi(spotReviewId: string): Promise<{ body: string; cached: boolean }> {
  if (IS_MOCK) throw new SpotAiError('DISABLED', spotAiMessage('DISABLED'));
  const { data, error } = await supabase.functions.invoke('spot-review', { body: { spotId: spotReviewId } });
  if (error) {
    // FunctionsHttpError: error.context 가 Response — 서버의 code 를 꺼낸다(identity.ts 와 같은 조리법).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    let j: Record<string, unknown> | null = null;
    if (ctx && typeof ctx.json === 'function') { try { j = await ctx.json(); } catch { /* 본문 없음 */ } }
    const status = typeof ctx?.status === 'number' ? ctx.status : 0;
    const raw = String(j?.code ?? '');
    const code: SpotAiCode = (KNOWN as readonly string[]).includes(raw) ? (raw as SpotAiCode)
      // 코드 없는 502 는 환불 여부를 모른다 — '돌려드렸다' 고 말하지 않는다(F3).
      : status === 401 ? 'LOGIN' : status === 502 ? 'REFUND_PENDING' : 'UNKNOWN';
    throw new SpotAiError(code, spotAiMessage(code, {
      available: typeof j?.available === 'number' ? j.available : undefined,
      price: typeof j?.price === 'number' ? j.price : undefined,
    }));
  }
  const body = typeof data?.body === 'string' ? data.body.trim() : '';
  if (!body) throw new SpotAiError('UNKNOWN', spotAiMessage('UNKNOWN'));
  return { body, cached: data?.cached === true };
}

/**
 * AI 는 **저장된** 스팟(spot_reviews id)에만 붙는다. 같은 내용의 행이 이미 있으면 그 id 를 쓰고,
 * 없을 때만 새로 저장한다 — AI 한 번에 '내 스팟' 이 한 줄씩 불어나지 않게.
 */
export async function findSavedSpotId(spot: SpotReview): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase
    .from('spot_reviews').select('id').eq('spot', JSON.stringify(toJSON(spot)))
    .order('created_at', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return (data[0] as { id: string }).id;
}

/** 저장 목록 재열람용 — 끝난 코칭만, 본인 것만(RLS). 과금 없음. */
export async function listSpotAiReviews(spotReviewIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (IS_MOCK || spotReviewIds.length === 0) return out;
  const { data, error } = await supabase
    .from('spot_ai_reviews')
    .select('spot_review_id, body, created_at')
    .eq('status', 'done')
    .in('spot_review_id', spotReviewIds)
    .order('created_at', { ascending: false });
  if (error || !data) return out;
  for (const r of data as { spot_review_id: string | null; body: string | null }[]) {
    if (r.spot_review_id && r.body && !out.has(r.spot_review_id)) out.set(r.spot_review_id, r.body);
  }
  return out;
}
