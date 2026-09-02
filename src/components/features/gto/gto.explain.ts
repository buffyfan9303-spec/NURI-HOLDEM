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

/* ────────────────────────────────────────────────────────────────────────────
   트레이너 오답 해설 (2026-08-29) — 같은 'gto-explain' 함수를 **서버 변경 0** 으로 재사용한다.
   엣지 함수는 두 형태를 이미 받는다:
     · heroCards.length >= 2  → 심화(보드·핸드 구조·아웃츠·블로커) 프롬프트
     · comboId                → 프리플랍(포지션·레인지·GTO 빈도) 프롬프트
   포스트플랍 문항은 앞의 형태, 프리플랍 문항은 뒤의 형태에 그대로 들어맞는다.
   ⚠ 호출 조건은 호출부가 지킨다 — **오답일 때 · 버튼을 눌렀을 때만**(자동 호출 금지).
     여기서는 같은 문항의 중복 호출만 막는다(세션 캐시 + 진행 중 요청 공유).
   ──────────────────────────────────────────────────────────────────────────── */

export type QuizExplainInput =
  | {
      kind: 'postflop';
      /** 'A♠ K♦' — 트레이너 문항의 hand 문자열 그대로 */
      hand: string;
      /** 'K♥ 7♣ 2♦ / 5♠' 또는 '(프리플랍)' — 슬래시는 스트릿 구분자라 걸러 보낸다 */
      board: string;
      /** 캐시 식별용(문항 id) */
      id: number | string;
    }
  | {
      kind: 'preflop';
      /** 'A5s' 같은 콤보 라벨 */
      hand: string;
      /** 'CO' · 'BB vs BTN 오픈' 등 포지션 라벨 */
      posLabel: string;
      /** 상황 한 줄 — 'BB vs BTN 오픈 · 버튼이 2.5bb 오픈 …'. 모드마다 다르므로 여기서 '첫 진입'을 가정하지 않는다 */
      scenarioLabel: string;
      /** 상대(오픈·3벳·올인한 사람) — 없으면 엣지 함수가 RFI(첫 오픈)로 서술한다 */
      villain?: { position: string; sizingBb: number };
      /** 유효 스택(bb) — 차트 모드는 100, 푸시폴드·올인 콜은 해당 스택 */
      stackBb: number;
      /** GTO 빈도 0..1 — 3벳·4벳·오픈·올인은 raise 로 접는다 */
      frequency: { raise: number; call: number; fold: number };
      /** 캐시 식별용(문제 키) */
      id: number | string;
    };

// 세션 캐시 — 같은 문항을 다시 만나도 재호출하지 않는다(비용 관리).
// 진행 중 Promise 를 그대로 담아 두어 더블탭에도 요청이 두 번 나가지 않는다.
const quizCache = new Map<string, Promise<string>>();

const cardsOf = (s: string): string[] => s.split(/\s+/).filter((c) => c && c !== '/' && c !== '(프리플랍)');

/** 'A5s' → 'suited' · 'AKo' → 'offsuit' · '77' → 'pair' (엣지 함수 프롬프트의 comboKind) */
function comboKind(hand: string): string {
  if (hand.endsWith('s')) return 'suited';
  if (hand.endsWith('o')) return 'offsuit';
  return 'pair';
}

async function invokeExplain(body: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gto-explain', { body });
  if (error) throw error;
  const text = (data as { text?: string } | null)?.text?.trim();
  if (!text) throw new Error('빈 응답');
  return text;
}

/**
 * 트레이너에서 틀린 문항의 심화 해설. **실패하면 throw** 한다 —
 * 호출부는 기존 규칙 기반 해설을 그대로 둔 채 안내 한 줄만 바꾼다(AI 는 덤, 화면의 전제가 아니다).
 */
export function explainQuizMiss(input: QuizExplainInput): Promise<string> {
  const cacheKey = `${input.kind}:${input.id}`;
  const hit = quizCache.get(cacheKey);
  if (hit) return hit;

  const run = (async () => {
    if (IS_MOCK) throw new Error('데모 모드');
    if (input.kind === 'postflop') {
      const board = cardsOf(input.board);
      return invokeExplain({
        heroCards: cardsOf(input.hand),
        // 트레이너 문항은 상대 카드가 특정되지 않는다 — 빈 배열을 보내면 프롬프트가 "상대 핸드: " 로
        // 비어 이상해지므로, 레인지 대결임을 한 줄로 알린다(서버 프롬프트는 그대로 join 한다).
        villainCards: ['(비공개 · 상대 레인지 전체)'],
        board,
        equities: {}, // 트레이너는 특정 매치업이 아니라 레인지 대결이라 승률 수치를 보내지 않는다
      });
    }
    return invokeExplain({
      comboId: input.hand,
      comboKind: comboKind(input.hand),
      scenarioLabel: input.scenarioLabel,
      heroPosition: input.posLabel,
      villain: input.villain,
      stackDepthBb: input.stackBb,
      frequency: input.frequency,
    });
  })();

  // 실패는 캐시하지 않는다 — 일시 오류 뒤 '다시 시도'가 먹혀야 한다.
  run.catch(() => { quizCache.delete(cacheKey); });
  quizCache.set(cacheKey, run);
  return run;
}
