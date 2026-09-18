// 멀티웨이 에퀴티(빌런 A~E) — 2026-09-19.
//
// 잠그는 것
//  ① 공동 1등은 1/승자수로 나눈다 — 무승부를 히어로 몫에 통째로 얹거나 0 으로 만들지 않는다
//  ② 상대 카드를 다 알고 잔여 보드가 2장 이하면 **전수**다 — 1빌런 결과가 computeEquity 와 소수점까지 같다
//  ③ 카드를 모르는 상대가 한 장이라도 있으면 표본이고, 그 사실(kind·unknownCards)을 결과가 말한다
//  ④ seed 를 주면 재현된다 — 무작위 테스트가 어쩌다 실패하지 않게
// 실행: npx vitest run src/components/features/gto/equityMulti.test.ts
import { describe, it, expect } from 'vitest';
import { computeEquity, computeEquityMulti, computeOuts, hasDuplicateCards } from './equityEngine';
import { equityMultiAsync, MULTI_FALLBACK_ITERATIONS } from './equityClient';
import { equityHalfWidthPct } from './equityRequest';
import type { Card } from './gto.types';

// 🔴 몬테카를로 테스트 전용 타임아웃 — vitest 기본값 5,000ms 로는 **CI 에서 터진다**.
//   실측(2026-09-19 · 12코어): 20,000회 1건이 4.0~5.9초, 10,000회×6인이 8.1초. 로컬에서도 전체 suite 를
//   병렬로 돌리면 5초를 넘겨 5건이 빨개졌다. CI(ubuntu-latest)는 코어가 더 적어 더 느리다.
//   `npm test` 가 CI 게이트라 여기서 터지면 **빌드가 죽고 배포가 옛 커밋에 멈춘다** — 실제로 그럴 뻔했다.
//
//   ⚠ 반복 횟수를 줄이는 쪽으로 도망가지 마라. 아래 ⑤ 는 표본을 **독립 전수계산 평균**과 대조하는
//     편향 검사다. n 을 줄이면 σ 가 커져 허용폭을 같이 넓혀야 하고, 그러면 배분 순서·부분 셔플
//     버그를 놓친다. 늘리는 것은 **벽시계 허용치**일 뿐 검출력이 아니다 — 단언은 그대로다.
//   ⚠ 이 상수를 올려서 초록을 만들고 싶어지면, 그건 엔진이 느려졌다는 신호다. 먼저 왜 느려졌는지 봐라.
const MC_TIMEOUT = 30_000;

const C = (s: string): Card => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] });
const H = (a: string, b: string): [Card, Card] => [C(a), C(b)];
const B = (...cs: string[]) => cs.map(C);

const AKs = H('As', 'Ks');
const AKh = H('Ah', 'Kh');
const QQ = H('Qh', 'Qd');
const NN = H('9c', '9h');
const DRY = B('2c', '7d', 'Jh');

describe('① 공동 1등 분할', () => {
  it('리버에서 같은 패면 hero 0.5 · tie 1 · 상대 0.5', () => {
    const r = computeEquityMulti(AKs, [AKh], B('2c', '7d', 'Jh', '8s', '3c'));
    expect(r.kind).toBe('exact');
    expect(r.iterations).toBe(1);
    expect(r.hero).toBe(0.5);
    expect(r.tie).toBe(1);
    expect(r.villains).toEqual([0.5]);
  });

  it('셋 중 하나가 이기면 그 사람만 1 — 나머지는 0', () => {
    const r = computeEquityMulti(AKs, [AKh, [C('Qd'), C('Qc')]], B('2c', '7d', 'Jh', '8s', '3c'));
    expect(r.hero).toBe(0);
    expect(r.tie).toBe(0);
    expect(r.villains).toEqual([0, 1]);
  });

  it('몫의 합은 항상 1 이다 — 전수든 표본이든', () => {
    const exact = computeEquityMulti(AKs, [QQ, NN], DRY);
    const sampled = computeEquityMulti(AKs, [QQ, []], DRY, 3000, 7);
    for (const r of [exact, sampled]) {
      const sum = r.hero + r.villains.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('② 전수 — 상대 카드를 다 알고 잔여 보드 ≤ 2장', () => {
  it('1빌런 플랍은 computeEquity(전수 990) 와 소수점까지 같다', () => {
    const a = computeEquityMulti(AKs, [QQ], DRY);
    const b = computeEquity(AKs, QQ, DRY);
    expect(a.kind).toBe('exact');
    expect(a.iterations).toBe(b.iterations);
    expect(a.hero).toBeCloseTo(b.hero, 12);
    expect(a.villains[0]).toBeCloseTo(b.villain, 12);
  });

  it('2빌런 플랍은 잔여 43장에서 2장 = 903 쌍 전수', () => {
    const r = computeEquityMulti(AKs, [QQ, NN], DRY);
    expect(r.kind).toBe('exact');
    expect(r.iterations).toBe(903);
    expect(r.unknownCards).toBe(0);
    // AKs 는 오버카드 둘 — 두 포켓페어 상대로 25% 부근(실측 0.2447). 0.5 로 위장하지 않는다
    expect(r.hero).toBeGreaterThan(0.2);
    expect(r.hero).toBeLessThan(0.3);
  });

  it('턴은 44장 전수', () => {
    const r = computeEquityMulti(AKs, [QQ, NN], B('2c', '7d', 'Jh', '8s'));
    expect(r.kind).toBe('exact');
    expect(r.iterations).toBe(42);   // 52 − 2 − 4 − 4
  });
});

describe('③ 표본 — 카드를 모르는 상대가 있으면 그 사실을 말한다', () => {
  it('상대 카드가 비면 monte_carlo · unknownCards = 모자란 장수', () => {
    const r = computeEquityMulti(AKs, [[], [], QQ], [], 2000, 1);
    expect(r.kind).toBe('monte_carlo');
    expect(r.iterations).toBe(2000);
    expect(r.unknownCards).toBe(4);
  });

  it('한 장만 아는 상대도 나머지 한 장을 무작위로 채운다', () => {
    const r = computeEquityMulti(AKs, [[C('Qh')]], [], 2000, 1);
    expect(r.kind).toBe('monte_carlo');
    expect(r.unknownCards).toBe(1);
  });

  it('턴에서 상대 1장이 비면 전수화하지 않는다 — 보드·손에 섞여 들어가는 쌍은 unordered 루프로 편향된다', () => {
    const r = computeEquityMulti(AKs, [[C('Qh')]], B('2c', '7d', 'Jh', '8s'), 500, 1);
    expect(r.kind).toBe('monte_carlo');
  });

  it('6인 프리플랍(빌런 5명 모름) — AKs 는 6명 중 1/6 보다 훨씬 높고 반을 넘지 않는다', () => {
    const r = computeEquityMulti(AKs, [[], [], [], [], []], [], 10000, 42);
    expect(r.villains).toHaveLength(5);
    // 실측(2026-09-19, 12회 평균 31.0% · SD 0.51%p) — 표본 오차 여유를 넉넉히 둔다
    expect(r.hero).toBeGreaterThan(0.27);
    expect(r.hero).toBeLessThan(0.35);
  }, MC_TIMEOUT);
});

describe('④ 재현성', () => {
  it('같은 seed 는 같은 값, 다른 seed 는 표본 오차 안에서 다르다', () => {
    const a = computeEquityMulti(AKs, [[], []], DRY, 5000, 99);
    const b = computeEquityMulti(AKs, [[], []], DRY, 5000, 99);
    const c = computeEquityMulti(AKs, [[], []], DRY, 5000, 100);
    expect(a.hero).toBe(b.hero);
    expect(Math.abs(a.hero - c.hero)).toBeLessThan(0.03);
  }, MC_TIMEOUT);
});

// ── ⑤ 표본이 편향되지 않았다 — 독립 전수 평균과 대조 ──────────────────────────
// 2026-09-19 실측(스크래치 프로브, 이 파일과 다른 경로로 계산): 히어로 AsKs · 플랍 2c7dJh 에서
//   · 상대 1명 카드 모름 = 잔여 47장 1081콤보 전수 × computeEquity(플랍 전수 990) 평균 = **54.740%**
//   · QQ 앎 + 1명 모름 = 잔여 45장 990콤보 전수 × 3인 전수(903) 평균 = **21.831%**
//   · Qh 한 장만 앎 = 잔여 46장 전수 평균 = **64.337%**
// 20,000회 표본의 1σ 는 0.29~0.35%p — 여유를 두고 ±1.2%p(≈3.5σ) 안이어야 한다. 배분 순서(손→보드)나
// 부분 셔플이 어긋나면 이 셋 중 하나가 밖으로 나간다.
describe('⑤ 무작위 상대 표본이 전수 평균과 맞는다', () => {
  it('상대 1명 모름 — 54.74% 부근', () => {
    expect(Math.abs(computeEquityMulti(AKs, [[]], DRY, 20000, 11).hero - 0.5474)).toBeLessThan(0.012);
  }, MC_TIMEOUT);
  it('QQ 앎 + 1명 모름 — 21.83% 부근', () => {
    expect(Math.abs(computeEquityMulti(AKs, [QQ, []], DRY, 20000, 11).hero - 0.2183)).toBeLessThan(0.012);
  }, MC_TIMEOUT);
  it('한 장만 아는 상대 — 64.34% 부근', () => {
    expect(Math.abs(computeEquityMulti(AKs, [[C('Qh')]], DRY, 20000, 11).hero - 0.6434)).toBeLessThan(0.012);
  }, MC_TIMEOUT);
});

// ── ⑥ 화면 배선 — 워커 없는 환경의 폴백 상한 · 오차 표기 ───────────────────────
describe('⑥ 워커 폴백과 오차 표기', () => {
  it('워커가 없으면(vitest node) 2,500회로 낮춰 돈다 — 요청이 10,000이어도', async () => {
    const r = await equityMultiAsync(AKs, [[], [], [], [], []], [], 10000);
    expect(r.kind).toBe('monte_carlo');
    expect(r.iterations).toBe(MULTI_FALLBACK_ITERATIONS);
    expect(MULTI_FALLBACK_ITERATIONS).toBeLessThanOrEqual(2500);
  });

  it('95% 구간 반폭 — p=0.5·n=10000 → ±1.0%p, 전수는 0', () => {
    expect(equityHalfWidthPct({ hero: 0.5, kind: 'monte_carlo', iterations: 10000 })).toBe(1);
    expect(equityHalfWidthPct({ hero: 0.31, kind: 'monte_carlo', iterations: 10000 })).toBe(0.9);
    expect(equityHalfWidthPct({ hero: 0.5, kind: 'exact', iterations: 903 })).toBe(0);
  });
});

// ── ⑦ 겹친 카드는 있을 수 없는 핸드다 — 숫자를 만들지 않는다 (감사 2026-09-19) ──
// 손으로 적은 [[REPLAY:hero=As,As;…]] 마커가 검증 없이 엔진까지 왔고, computeOuts 가 '아웃츠 44장/46장' 을 확정처럼 냈다.
describe('⑦ 겹친 카드 방어', () => {
  it('hasDuplicateCards — 그룹 안·그룹 사이 모두 잡는다', () => {
    expect(hasDuplicateCards([C('As'), C('As')])).toBe(true);
    expect(hasDuplicateCards(AKs, [C('Kd'), C('Kc')], [C('As'), C('7s'), C('2h')])).toBe(true);
    expect(hasDuplicateCards(AKs, QQ, DRY)).toBe(false);
  });

  it('computeOuts 는 null — 존재할 수 없는 핸드의 아웃츠는 없다', () => {
    expect(computeOuts([C('As'), C('As')], [C('Kd'), C('Kc')], B('2d', '7c', '9s'))).toBeNull();
    expect(computeOuts(AKs, [C('Kd'), C('Kc')], B('As', '7c', '9s'))).toBeNull();
    expect(computeOuts(AKs, QQ, DRY)).not.toBeNull();   // 정상 입력은 그대로(양성 대조)
  });

  it('computeEquity 는 0.5 로 위장하지 않고 no_legal_combinations 를 싣는다', () => {
    const r = computeEquity([C('As'), C('As')], QQ, []);
    expect(r.kind).toBe('no_legal_combinations');
    expect(r.iterations).toBe(0);
  });

  it('computeEquityMulti 도 같은 모양 — 상대 손끼리 겹쳐도 잡는다', () => {
    const r = computeEquityMulti(AKs, [QQ, [C('Qh'), C('9c')]], DRY);
    expect(r.kind).toBe('no_legal_combinations');
    expect(r.hero).toBe(0);
    expect(r.iterations).toBe(0);
  });
});
