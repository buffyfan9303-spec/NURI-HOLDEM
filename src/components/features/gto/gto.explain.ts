// src/components/features/gto/gto.explain.ts
// Gemini 기반 GTO 해설 — Edge Function 'gto-explain' 프록시 클라이언트.
//
// 왜 다시 생겼나(2026-08-29):
//   9054226 에서 붙었던 AI 해설이 22e19ad('프리플랍 뷰어 완전 제거')에서 호스트 화면과 함께
//   사라졌다. 화면에는 'AI 액션 해설' 이라는 이름의 시트가 남았지만 내용은 에퀴티로 계산한
//   **규칙 기반**이라 실제 AI 는 한 줄도 돌지 않고 있었다(오너 지적). 지금 UI 에 다시 잇는다.
//
// 키는 서버 시크릿(GEMINI_API_KEY)에만 있다. Vite 앱의 VITE_* 는 번들에 그대로 실려
// 누구나 볼 수 있으므로 **API 키를 클라이언트에 두면 안 된다** — 그래서 엣지 함수를 경유한다.
import { supabase, IS_MOCK } from '../../../lib/supabase';
import type { Card } from './gto.types';

export interface DeepExplainInput {
  heroCards: readonly Card[];
  villainCards: readonly Card[];
  board: readonly Card[];
  /** 스트릿별 히어로 승률(0..1). 계산 못 한 스트릿은 넣지 않는다. */
  equities: { pre?: number | null; flop?: number | null; turn?: number | null; river?: number | null };
}

// Card 는 { rank, suit } 객체다 — String(c) 는 "[object Object]" 가 되고 tsc 는 그걸 못 잡는다.
// 모델에는 사람이 읽는 표기로 보낸다(As, Kd 대신 A♠ K♦ — 프롬프트가 한국어라 기호가 더 잘 읽힌다).
const SUIT_GLYPH: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardText = (c: Card): string => `${c.rank}${SUIT_GLYPH[c.suit]}`;

/**
 * 실패하면 throw 한다 — 호출부는 기존 규칙 기반 표를 그대로 두고 안내만 바꾼다.
 * (AI 는 '덤' 이지 이 화면의 전제가 아니다. 죽어도 화면이 비면 안 된다.)
 */
export async function explainDeepSpot(input: DeepExplainInput): Promise<string> {
  if (IS_MOCK) throw new Error('데모 모드');
  const { data, error } = await supabase.functions.invoke('gto-explain', {
    body: {
      heroCards: input.heroCards.map(cardText),
      villainCards: input.villainCards.map(cardText),
      board: input.board.map(cardText),
      equities: {
        pre: input.equities.pre ?? undefined,
        flop: input.equities.flop ?? undefined,
        turn: input.equities.turn ?? undefined,
        river: input.equities.river ?? undefined,
      },
    },
  });
  if (error) throw error;
  const text = (data as { text?: string } | null)?.text?.trim();
  if (!text) throw new Error('빈 응답');
  return text;
}
