// src/api/events.ts — 이벤트(카드 뽑기).
//
// 서버가 지키는 것과 클라이언트가 하는 일을 헷갈리지 말 것:
//  · **등급은 서버만 안다.** 안 연 카드의 tier 는 응답에 아예 담기지 않는다(event_board).
//    그래서 화면은 '무엇이 들었는지' 를 계산하지 않는다 — 열어 본 결과만 그린다.
//  · **참여권 소모·카드 확정·이용권 발급은 한 트랜잭션**(open_event_card). 클라이언트가
//    낙관적으로 열어 두고 나중에 맞추는 짓을 하지 않는다 — 실패하면 카드는 닫힌 채로 남아야 한다.
import { supabase, IS_MOCK } from '../lib/supabase';

/** 현재 진행 중인 첫 이벤트. 캠페인이 늘면 목록 API 를 따로 만든다(지금은 하나뿐). */
export const CARD_EVENT_SLUG = 'card-open-2026-09';

export interface EventCard {
  idx: number;
  opened: boolean;
  /** 연 카드만. null = 꽝 */
  tier: number | null;
  /** 연 카드만 — 받은 이용권 장수 */
  count: number | null;
  /** 연 카드만 — 연 사람 표시명 */
  by: string | null;
}

export interface EventBoard {
  slug: string;
  title: string;
  subtitle: string | null;
  status: 'live' | 'ended';
  venueId: string;
  startsAt: string | null;
  endsAt: string | null;
  voucherTitle: string;
  cards: EventCard[];
  myTickets: number;
  /** 남은 등급별 장수 — 사전 고지용(어느 자리인지는 알 수 없다) */
  remainByTier: Record<string, number>;
}

export interface OpenResult {
  idx: number;
  /** null = 꽝 */
  tier: number | null;
  voucherCount: number;
  voucherTitle: string;
}

/** 등급별 표시 규격 — 화면 여러 곳이 같은 색·라벨을 쓰도록 한 곳에 둔다. */
export const TIER_META: Record<number, { label: string; short: string; ring: string; text: string; glow: string }> = {
  1: { label: '1등', short: '1', ring: 'border-gold-300/70',    text: 'text-gold-200',    glow: 'shadow-[0_0_24px_-4px_rgb(255_209_0/0.55)]' },
  2: { label: '2등', short: '2', ring: 'border-accent-300/70',  text: 'text-accent-200',  glow: 'shadow-[0_0_20px_-6px_rgb(88_80_236/0.6)]' },
  3: { label: '3등', short: '3', ring: 'border-cyan-400/60',    text: 'text-cyan-300',    glow: '' },
  4: { label: '4등', short: '4', ring: 'border-emerald-400/55', text: 'text-emerald-300', glow: '' },
};

/** 보드 조회 — 비로그인도 볼 수 있다(참여권만 0). 이벤트가 없으면 null. */
export async function getEventBoard(slug: string = CARD_EVENT_SLUG): Promise<EventBoard | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('event_board', { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data as EventBoard | null) ?? null;
}

/** 카드 열기 — 참여권 1장을 쓰고 그 자리를 확정한다. 실패는 그대로 던진다(카드는 닫힌 채 남는다). */
export async function openEventCard(idx: number, slug: string = CARD_EVENT_SLUG): Promise<OpenResult> {
  const { data, error } = await supabase.rpc('open_event_card', { p_slug: slug, p_idx: idx });
  if (error) throw new Error(error.message);
  return data as OpenResult;
}
