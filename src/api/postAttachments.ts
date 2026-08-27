// src/api/postAttachments.ts — 게시글 어태치먼트(핸드 카드 / 투표) 데이터 레이어
//
// 마이그레이션: supabase/migrations/20260827h_post_attachments.sql
//  * post_hands            — 게시글당 1행(post_id PK). cards 는 'As' 형식 text[] 1~4장(PLO) 또는 NULL
//  * post_polls / options  — 게시글당 투표 1개, 보기 2~6개(idx 0~5)
//  * post_poll_votes       — 1인 1표(PK poll_id,user_id). 직접 INSERT 정책 없음 — RPC 로만 기표
//  * post_poll_results     — 집계 뷰(개별 투표자 비노출)
// 읽기는 게시글과 동일하게 공개(비로그인 열람), 쓰기는 작성자 RLS.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

// ── 카드 타입 ─────────────────────────────────────────────────────────────────
export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export interface Card { rank: Rank; suit: Suit }

const RANKS: readonly Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'];

/** 'As' → { rank:'A', suit:'s' }. 형식이 다르면 null(DB CHECK 와 동일한 52장만 인정). */
export function parseCard(code: string): Card | null {
  if (typeof code !== 'string' || code.length !== 2) return null;
  const rank = code[0] as Rank;
  const suit = code[1] as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
  return { rank, suit };
}

/** Card → 'As' (post_hands.cards 저장 형식) */
const cardToCode = (c: Card): string => `${c.rank}${c.suit}`;

// ── 어태치먼트 타입 ───────────────────────────────────────────────────────────
export type HandTone = 'win' | 'loss';

export interface HandAttachment {
  kind: 'hand';
  headline?: string;      // 한 줄 요약(≤24자)
  tone?: HandTone;        // 카드 프레임 색조
  delta?: string;         // 결과 배지(≤16자)
  meta?: string;          // 상황 메모: 포지션·스트리트 등(≤60자)
  cards?: Card[] | null;  // 1~4장(PLO 지원). null = 카드 미입력(headline 만)
}

export interface PollOption { id: string; idx: number; label: string; votes: number }

export interface PollAttachment {
  kind: 'poll';
  id: string;                 // post_polls.id (기표·구독 키)
  question: string;
  options: PollOption[];      // idx 오름차순
  myOptionId: string | null;  // 내가 기표한 보기(비로그인/미기표 = null)
  closesAt?: string;          // ISO. 없으면 무기한
}

export type Attachment = HandAttachment | PollAttachment;

// ── DB 변환 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToOption = (r: any): PollOption => ({
  id: r.option_id ?? r.id, idx: Number(r.idx), label: r.label, votes: Number(r.votes ?? 0),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToHand = (r: any): HandAttachment => ({
  kind: 'hand',
  headline: r.headline ?? undefined,
  tone: r.tone ?? undefined,
  delta: r.delta ?? undefined,
  meta: r.meta ?? undefined,
  cards: Array.isArray(r.cards)
    ? (r.cards as string[]).map(parseCard).filter((c): c is Card => c !== null)
    : null,
});

/** 집계 뷰에서 보기별 득표 조회(idx 순). 실패 시 null — 호출부가 '어태치먼트 없음'으로 처리. */
async function fetchPollResults(pollId: string): Promise<PollOption[] | null> {
  const { data, error } = await supabase
    .from('post_poll_results').select('*').eq('poll_id', pollId).order('idx');
  if (error) return null;
  return (data ?? []).map(rowToOption);
}

/** 내 표(post_poll_votes 는 RLS 로 본인 행만 노출). 비로그인·실패는 조용히 null. */
async function fetchMyVote(pollId: string): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('post_poll_votes').select('option_id')
    .eq('poll_id', pollId).eq('user_id', user.id).maybeSingle();
  if (error || !data) return null;
  return (data.option_id as string) ?? null;
}

// ── 조회 ─────────────────────────────────────────────────────────────────────
/**
 * 게시글의 어태치먼트 단건 조회(핸드·투표 병렬).
 * 게시글당 어태치먼트는 1개가 전제 — 둘 다 있으면 핸드 우선.
 * 마이그레이션 미적용(42P01)·일시 오류는 null 로 강등해 상세 화면을 깨뜨리지 않는다.
 */
export async function fetchAttachment(postId: string): Promise<Attachment | null> {
  if (IS_MOCK) return null;
  const [handRes, pollRes] = await Promise.all([
    supabase.from('post_hands').select('*').eq('post_id', postId).maybeSingle(),
    supabase.from('post_polls').select('*').eq('post_id', postId).maybeSingle(),
  ]);

  if (!handRes.error && handRes.data) return rowToHand(handRes.data);

  const poll = !pollRes.error ? pollRes.data : null;
  if (!poll) return null;
  const pollId = poll.id as string;
  const [options, myOptionId] = await Promise.all([fetchPollResults(pollId), fetchMyVote(pollId)]);
  if (!options) return null;
  return {
    kind: 'poll',
    id: pollId,
    question: poll.question as string,
    options,
    myOptionId,
    closesAt: (poll.closes_at as string | null) ?? undefined,
  };
}

// ── 투표 기표 ─────────────────────────────────────────────────────────────────
/**
 * 기표/기표 변경 — 원자적·멱등 RPC(cast_poll_vote)만 사용(직접 INSERT 는 RLS 로 차단).
 * 서버가 마감·보기-투표 불일치를 검증하고, 갱신된 전체 집계를 돌려준다.
 */
export async function castPollVote(pollId: string, optionId: string): Promise<PollOption[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('cast_poll_vote', {
    p_poll_id: pollId, p_option_id: optionId,
  });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(rowToOption);
}

// ── 저장(작성자 전용 — RLS 강제) ─────────────────────────────────────────────
/** 핸드 저장(게시글당 1행 upsert). null = 삭제. 길이 제한은 DB CHECK 와 동일하게 선절단. */
export async function saveHand(postId: string, hand: HandAttachment | null): Promise<void> {
  if (IS_MOCK) return;
  if (hand === null) {
    const { error } = await supabase.from('post_hands').delete().eq('post_id', postId);
    if (error) throw error;
    return;
  }
  const headline = hand.headline?.trim() || null;
  const cards = hand.cards && hand.cards.length > 0 ? hand.cards.slice(0, 4).map(cardToCode) : null;
  // DB CHECK(post_hands_not_empty)와 동일 — 빈 껍데기 저장을 폼 단계에서 차단
  if (!cards && !headline) throw new Error('카드 또는 한 줄 요약을 입력해 주세요');
  const { error } = await supabase.from('post_hands').upsert({
    post_id:  postId,
    cards,
    tone:     hand.tone ?? 'win',
    headline: headline?.slice(0, 24) ?? null,
    delta:    hand.delta?.trim().slice(0, 16) || null,
    meta:     hand.meta?.trim().slice(0, 60) || null,
  }, { onConflict: 'post_id' });
  if (error) throw error;
}

/**
 * 투표 저장. null = 삭제(cascade 로 보기·표 함께 제거).
 * 수정 시 보기를 전량 교체한다 — 보기가 바뀌면 기존 표는 의미가 없으므로 함께 초기화(의도된 동작).
 */
export async function savePoll(postId: string, poll: PollAttachment | null): Promise<void> {
  if (IS_MOCK) return;
  if (poll === null) {
    const { error } = await supabase.from('post_polls').delete().eq('post_id', postId);
    if (error) throw error;
    return;
  }
  const question = poll.question.trim().slice(0, 120);
  if (!question) throw new Error('질문을 입력해 주세요');
  const labels = poll.options.map((o) => o.label.trim()).filter(Boolean);
  if (labels.length < 2) throw new Error('보기를 2개 이상 입력해 주세요');
  if (labels.length > 6) throw new Error('보기는 최대 6개까지입니다');

  // 게시글당 투표 1개(post_id unique) — 있으면 갱신, 없으면 생성
  const existing = await supabase.from('post_polls').select('id').eq('post_id', postId).maybeSingle();
  if (existing.error) throw existing.error;

  let pollId: string;
  if (existing.data?.id) {
    pollId = existing.data.id as string;
    const upd = await supabase.from('post_polls')
      .update({ question, closes_at: poll.closesAt ?? null }).eq('id', pollId);
    if (upd.error) throw upd.error;
    const del = await supabase.from('post_poll_options').delete().eq('poll_id', pollId);
    if (del.error) throw del.error;
  } else {
    const ins = await supabase.from('post_polls')
      .insert({ post_id: postId, question, closes_at: poll.closesAt ?? null })
      .select('id').single();
    if (ins.error) throw ins.error;
    pollId = ins.data.id as string;
  }

  const rows = labels.map((label, idx) => ({ poll_id: pollId, idx, label: label.slice(0, 60) }));
  const opt = await supabase.from('post_poll_options').insert(rows);
  if (opt.error) throw opt.error;
}

// ── 실시간(§7-6) ─────────────────────────────────────────────────────────────
/**
 * 투표 집계 실시간 구독 — 표 INSERT/UPDATE(기표 변경은 upsert→UPDATE) 시 집계 뷰를 재조회해 cb.
 * 채널명 poll-${pollId} 고정: 상세 1개 열림당 1채널(Realtime 연결 예산).
 * 구독·재조회 실패는 조용히 무시(폴백 없음) — 상세가 닫힐 때 반환된 해제 함수를 호출할 것.
 */
export function subscribePollResults(pollId: string, cb: (options: PollOption[]) => void): () => void {
  if (IS_MOCK) return () => {};
  let disposed = false;
  const refetch = async () => {
    const options = await fetchPollResults(pollId);
    if (!disposed && options) cb(options);
  };
  const channel = supabase
    .channel(`poll-${pollId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'post_poll_votes', filter: `poll_id=eq.${pollId}` },
      () => { void refetch(); })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'post_poll_votes', filter: `poll_id=eq.${pollId}` },
      () => { void refetch(); })
    .subscribe();
  return () => { disposed = true; supabase.removeChannel(channel); };
}
