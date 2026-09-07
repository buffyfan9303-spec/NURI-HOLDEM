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
  /** 처음 등급별 장수('none' = 꽝). 확률 공개 표의 분자 — 화면이 상수로 들면 실제와 어긋난다. */
  totalByTier: Record<string, number>;
  /** 등급별 이용권 장수('none' = 0) */
  voucherByTier: Record<string, number>;
}

export interface OpenResult {
  idx: number;
  /** null = 꽝 */
  tier: number | null;
  voucherCount: number;
  voucherTitle: string;
}

/** 등급별 표시 규격 — 화면 여러 곳이 같은 색·라벨을 쓰도록 한 곳에 둔다. */
export const TIER_META: Record<number, { label: string; short: string; ring: string; text: string; glow: string; bg: string; dot: string }> = {
  1: { label: '1등', short: '1', ring: 'border-gold-300/70',    text: 'text-gold-200',    glow: 'shadow-[0_0_28px_-4px_rgb(255_209_0/0.6)]',  bg: 'bg-gold-300/10',    dot: 'bg-gold-300' },
  2: { label: '2등', short: '2', ring: 'border-accent-300/70',  text: 'text-accent-200',  glow: 'shadow-[0_0_22px_-6px_rgb(88_80_236/0.65)]', bg: 'bg-accent-300/10',  dot: 'bg-accent-300' },
  3: { label: '3등', short: '3', ring: 'border-cyan-400/60',    text: 'text-cyan-300',    glow: '',                                            bg: 'bg-cyan-400/10',    dot: 'bg-cyan-400' },
  4: { label: '4등', short: '4', ring: 'border-emerald-400/55', text: 'text-emerald-300', glow: '',                                            bg: 'bg-emerald-400/10', dot: 'bg-emerald-400' },
};

/** 확률 공개용 한 줄. 서버가 준 실제 수량으로만 만든다(상수 금지 — 어긋나면 그게 곧 허위 고지다). */
export interface OddsRow { key: string; label: string; prize: string; total: number; left: number; pct: string }
export function oddsRows(b: EventBoard): OddsRow[] {
  const cards = b.cards.length || 1;
  const rows: OddsRow[] = [1, 2, 3, 4].map((t) => {
    const total = b.totalByTier?.[String(t)] ?? 0;
    return {
      key: String(t), label: TIER_META[t].label,
      // 좁은 폭에서 표가 잘리지 않게 **짧게**. 어떤 이용권인지는 표 위 캡션이 한 번 말한다.
      prize: `이용권 ${b.voucherByTier?.[String(t)] ?? 0}장`,
      total, left: b.remainByTier?.[String(t)] ?? 0,
      pct: ((total / cards) * 100).toFixed(2),
    };
  });
  const none = b.totalByTier?.none ?? 0;
  rows.push({ key: 'none', label: '꽝', prize: '-', total: none,
    left: none - b.cards.filter((c) => c.opened && c.tier === null).length,
    pct: ((none / cards) * 100).toFixed(2) });
  return rows;
}

/** 보드 조회 — 비로그인도 볼 수 있다(참여권만 0). 이벤트가 없으면 null. */
/* 마지막으로 받은 보드 — 이벤트 화면이 **빈 화면 없이** 즉시 그리기 위한 씨앗이다.
   홈 배너가 이미 같은 보드를 받아 두므로 새 요청이 아니라 '이미 있는 것의 재사용'이다.
   ⚠ myTickets 는 **사용자별** 값이다. 로그인/로그아웃 뒤에도 들고 있으면 다음 사람 화면에
     이전 사람의 참여권 숫자가 한 프레임 스친다 — 그래서 auth 가 바뀌면 버린다.
     TOKEN_REFRESHED 는 같은 사람이라 남긴다(주기적으로 오므로 버리면 씨앗이 늘 없다).
   ⚠ 씨앗은 '즉시 그릴 첫 화면'일 뿐이고, 화면은 열리자마자 항상 다시 받아 갱신한다
     (그 사이 다른 사람이 카드를 열었을 수 있다 — 낡은 채로 두면 헛클릭이 된다). */
let lastBoard: EventBoard | null = null;
export const cachedEventBoard = (): EventBoard | null => lastBoard;
supabase.auth.onAuthStateChange((e) => { if (e !== 'TOKEN_REFRESHED') lastBoard = null; });

export async function getEventBoard(slug: string = CARD_EVENT_SLUG): Promise<EventBoard | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('event_board', { p_slug: slug });
  if (error) throw new Error(error.message);
  lastBoard = (data as EventBoard | null) ?? null;
  return lastBoard;
}

/** 카드 열기 — 참여권 1장을 쓰고 그 자리를 확정한다. 실패는 그대로 던진다(카드는 닫힌 채 남는다). */
export async function openEventCard(idx: number, slug: string = CARD_EVENT_SLUG): Promise<OpenResult> {
  const { data, error } = await supabase.rpc('open_event_card', { p_slug: slug, p_idx: idx });
  if (error) throw new Error(error.message);
  return data as OpenResult;
}
