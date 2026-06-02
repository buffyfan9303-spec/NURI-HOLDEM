// src/components/features/gto/gto.deep.data.ts
import type { GtoDeepSituation } from './gto.deep.types';

/**
 * 100bb 딥, UTG 2.2bb 오픈, 히어로 MP 에서 T9s(9Ts).
 * 유저가 빌런(UTG) 카드를 직접 지정하면 블로커 효과로 결과가 바뀐다.
 */
export const DEEP_SITUATION_9TS_VS_UTG: GtoDeepSituation = {
  id: 'mp-9ts-vs-utg-open-100',
  label: 'MP 9Ts vs UTG 오픈',
  description: '100bb 딥. UTG 2.2bb 오픈, 히어로 MP 에서 T9s 보유. 빌런 카드를 직접 지정해 블로커 효과를 확인.',
  street: 'preflop',
  heroPosition: 'MP',
  villainPosition: 'UTG',
  villainOpenBb: 2.2,
  heroRaiseBb: 6.5,
  stackDepthBb: 100,
  gameType: 'cash',
  heroHand: [{ rank: 'T', suit: 's' }, { rank: '9', suit: 's' }],

  baseline: {
    action: { raise: 0.40, call: 0.20, fold: 0.40 },
    heuristic_explanation:
      'UTG 오픈 레인지 전체를 가정하면 T9s 는 3-Bet 블러프 후보로 약 40% 빈도로 3-Bet 한다. 폴드 에퀴티와 수딧 커넥터의 후속 플레이 가능성이 충분하기 때문이다.',
  },

  villainAdjustments: {
    AA: {
      action: { raise: 0.05, call: 0.05, fold: 0.90 },
      baseline: { raise: 0.40, call: 0.20, fold: 0.40 },
      equity: { hero: 0.22, villain: 0.78 },
      heuristic_explanation:
        '상대의 AA 블로커로 인해 T9s 의 3-Bet 에퀴티가 폴드 에퀴티를 얻지 못한다. 빌런이 AA 를 들고 있으면 3-Bet 에 폴드하지 않으므로 블러프의 핵심 가치(폴드 유도)가 사라지고, 콜드 콜로 끌려가도 약 22% 에퀴티로 크게 불리하다. 따라서 폴드가 정석이며 3-Bet 빈도는 40%에서 5% 수준으로 급감하고 폴드는 90%까지 상승한다.',
      blockerExplanation:
        '빌런 카드를 AA 로 고정하면 폴드 에퀴티가 0 에 수렴한다. 3-Bet 의 EV 는 (폴드 유도분) 더하기 (콜 시 에퀴티)로 구성되는데, AA 상대로는 둘 다 무너진다(폴드 0%, 에퀴티 22%). 결과적으로 3-Bet 은 40 에서 5, 콜은 20 에서 5, 폴드는 40 에서 90 으로 빈도가 재편된다.',
    },
    AKs: {
      action: { raise: 0.55, call: 0.05, fold: 0.40 },
      baseline: { raise: 0.40, call: 0.20, fold: 0.40 },
      equity: { hero: 0.38, villain: 0.62 },
      heuristic_explanation:
        '빌런을 AKs 로 고정하면 상황이 반대로 흐른다. AKs 는 3-Bet 에 일부 폴드/콜로 양분되어 폴드 에퀴티가 회복되고, T9s 의 에퀴티도 약 38%로 AA 대비 크게 개선된다. 따라서 3-Bet 블러프 빈도가 오히려 기준보다 상승한다.',
      blockerExplanation:
        '빌런이 AK 라면 일부 폴드가 가능하므로 3-Bet 의 블러프 가치가 살아난다. 같은 입력에서도 빌런 핸드에 따라 결과가 정반대로 갈리는 점을 보여주는 대조 사례다.',
    },
  },
};

export const DEEP_SITUATIONS: readonly GtoDeepSituation[] = [DEEP_SITUATION_9TS_VS_UTG] as const;
