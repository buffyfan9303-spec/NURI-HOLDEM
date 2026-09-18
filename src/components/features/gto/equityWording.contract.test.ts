// src/components/features/gto/equityWording.contract.test.ts
// 확률·승률을 **말하는 방식**의 계약 (2026-09-17).
//
// 이 파일이 막는 것은 계산 버그가 아니라 **표기 거짓말**이다. 셋 다 실제로 라이브에 있었다:
//  ① 같은 라벨('브레이크이븐 팟 오즈')이 모드마다 다른 기준으로 다른 답을 냈다
//     (직접 입력 = 2장 기준 · 카드로 세기 = 1장 기준). ⅓팟 벳에서 한쪽은 콜, 한쪽은 폴드라고 말했다.
//  ② 근사식을 화면에서 "정확값" 이라 불렀다. 실측 오차가 화면이 그리는 상태 표본의 23% 에서 5%p 이상,
//     최악 48%p 였다(44 vs JTs · 2c 8s Qs → "정확값" 86.3% vs 실제 38.0%).
//  ③ 전수계산 결과에 "돌릴 때마다 달라진다" 고 적고, 표본 추정치는 소수점까지 찍었다.
//
// 렌더 테스트 인프라가 없어(vitest environment=node) 저장소 관행대로 소스를 읽어 계약을 건다.
// 숫자 근거는 소스 정규식이 아니라 **엔진을 실제로 돌려** 붙인다 — 정규식만 있으면 "왜" 가 사라진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeEquity, computeOuts } from './equityEngine';
import type { Card } from './gto.types';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8');
const OUTS_CALC = read('src/components/features/tools/OutsCalc.tsx');
const OUTS_CARDS = read('src/components/features/gto/OutsFromCards.tsx');
const REPORT = read('src/components/features/gto/SpotReport.tsx');
const SPOT_PANEL = read('src/components/features/gto/NuriSpotPanel.tsx');

const C = (s: string): Card => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] });
/** 삭제된 근사식 — 되살아나면 무엇이 틀리는지 보여주려고 테스트 안에만 남긴다 */
const twoCardProb = (o: number, T: number) => (T < 2 || o <= 0) ? 0 : 1 - ((T - o) / T) * ((T - 1 - o) / (T - 1));

describe('① 브레이크이븐 팟 오즈는 두 모드에서 같은 기준(다음 1장)을 쓴다', () => {
  it('직접 입력 모드가 1장 확률로 브레이크이븐을 낸다 — 2장 확률(exact)로 되돌리면 실패한다', () => {
    expect(OUTS_CALC, '브레이크이븐이 oneCard 기준이 아니다').toMatch(/const breakeven = oneCard > 0 && oneCard < 1/);
    expect(OUTS_CALC, '2장 확률(exact)로 브레이크이븐을 내고 있다').not.toMatch(/const breakeven = exact >/);
  });

  it('카드로 세기 모드도 1장 확률(outs.prob)로 낸다', () => {
    expect(OUTS_CARDS).toMatch(/const breakeven = oneCard > 0 && oneCard < 1/);
    expect(OUTS_CARDS).toMatch(/const oneCard = outs\?\.prob \?\? 0;/);
  });

  it('두 모드 다 "다음 1장 기준" 이라고 적는다 — 기준을 숨기지 않는다', () => {
    expect(OUTS_CALC).toMatch(/다음 1장/);
    expect(OUTS_CARDS).toMatch(/다음 1장 기준/);
  });

  it('왜 갈리면 안 되는가 — 같은 9아웃이 기준에 따라 1.9:1 과 4.2:1 로 갈린다(실측)', () => {
    const o = 9, unseen = 47;
    const oneCard = o / unseen;
    const twoCard = twoCardProb(o, unseen);
    const be = (p: number) => (1 - p) / p;
    expect(be(twoCard)).toBeCloseTo(1.86, 1);   // 예전 직접 입력 모드가 띄우던 값
    expect(be(oneCard)).toBeCloseTo(4.22, 1);   // 한 스트리트 콜 판단에 맞는 값
    // ⅓팟 벳은 3:1 을 준다 — 두 값이 그 경계를 사이에 두고 갈린다(콜 vs 폴드)
    expect(be(twoCard)).toBeLessThan(3);
    expect(be(oneCard)).toBeGreaterThan(3);
  });
});

describe('② 근사식을 "정확값" 이라 부르지 않는다', () => {
  it('twoCardProb 근사식이 화면 코드에서 사라졌다', () => {
    expect(OUTS_CARDS, 'twoCardProb 이 되살아났다').not.toMatch(/function twoCardProb/);
    expect(OUTS_CARDS, '근사값을 "정확값" 이라 부르는 문구가 남아 있다').not.toMatch(/정확값은 \$\{/);
  });

  it('턴+리버 확률은 전수계산된 heroEquity 로 적는다', () => {
    expect(OUTS_CARDS).toMatch(/턴\+리버까지 이길 확률/);
    expect(OUTS_CARDS).toMatch(/남은 카드를 전부 돌려 계산한 값입니다/);
  });

  it('그 근사식이 실제로 틀렸다 — 데모 핸드에서 7%p 넘게 벗어난다', () => {
    const hero: [Card, Card] = [C('As'), C('Ks')];
    const vill: [Card, Card] = [C('Qh'), C('Qd')];
    const board = [C('Qs'), C('7s'), C('2h')];   // OutsFromCards 의 DEMO 와 같은 핸드
    const ou = computeOuts(hero, vill, board)!;
    const eq = computeEquity(hero, vill, board);
    // 2♠ 는 보드를 페어시켜 상대가 풀하우스가 된다 — 스페이드 9장 중 8장만 아웃이다
    expect(ou.outs).toBe(8);
    expect(ou.total).toBe(45);
    const approx = twoCardProb(ou.outs, ou.total) * 100;
    const real = eq.hero * 100;
    expect(approx).toBeCloseTo(32.7, 0);
    expect(real).toBeCloseTo(25.6, 0);
    expect(approx - real, '근사식이 실제와 같아졌다면 이 계약의 전제가 깨진 것이다').toBeGreaterThan(7);
  });

  it('플랍 승률은 표본이 아니라 전수계산이다 — 두 번 돌려도 같은 값이다', () => {
    const hero: [Card, Card] = [C('As'), C('Ks')];
    const vill: [Card, Card] = [C('Qh'), C('Qd')];
    const board = [C('Qs'), C('7s'), C('2h')];
    const a = computeEquity(hero, vill, board);
    const b = computeEquity(hero, vill, board);
    expect(a.hero).toBe(b.hero);
    expect(a.iterations, '플랍 잔여 2장 전 조합(990)을 다 돌지 않았다').toBe(990);
  });
});

describe('③ 표본 추정치와 전수계산을 같은 문구로 뭉뚱그리지 않는다', () => {
  it('SpotReport 가 엔진의 kind 로 둘을 가른다(메타가 없을 때만 보드 장수)', () => {
    // 2026-09-19 멀티웨이: 상대 카드가 한 장이라도 비면 보드가 다 깔려도 표본이다 — 보드 장수만으로는 못 가른다.
    //   엔진이 kind 를 실어 주고 리포트는 그것을 읽는다. 옛 규칙(보드 3장 미만)은 메타가 없는 경로의 폴백이다.
    expect(REPORT).toMatch(/const sampled = meta \? meta\.kind === 'monte_carlo' : boardCount < 3;/);
    expect(REPORT, '표본일 때 정수로 적지 않는다').toMatch(/약 \$\{Math\.round\(eq\)\}%/);
    expect(REPORT, '표본이면 오차(±%p)를 같이 적는다 — 숫자만 크게 쓰고 오차를 숨기지 않는다').toMatch(/±\$\{half\}%p/);
    expect(REPORT).toMatch(/무작위 표본 .*추정치/);
    expect(REPORT).toMatch(/남은 카드를 전부 돌려 계산한 값입니다/);
    // 카드를 안 넣은 상대는 무작위 핸드라는 **가정을 화면에 적는다**(리드 결정) — 가정을 숨긴 숫자가 금지다
    expect(REPORT).toMatch(/무작위 핸드<\/b>로 계산했습니다/);
  });

  it('전수계산 결과에 "돌릴 때마다 달라진다" 고 적지 않는다', () => {
    expect(REPORT, '옛 뭉뚱그린 문구가 남아 있다').not.toMatch(/무작위 시행 추정치 — 돌릴 때마다 소수점이 조금 달라집니다/);
  });

  it('표본 수가 정수 자리를 의미 있게 만들 만큼 크다 — 소스의 상수를 직접 읽어 검사한다', () => {
    // 2026-09-19: 2인 equityAsync → 멀티웨이 equityMultiAsync. 표본 수 계약은 그대로다.
    const m = SPOT_PANEL.match(/equityMultiAsync\(h, villains, hb\.boardCards, (\d+)\)/);
    expect(m, 'NuriSpotPanel 의 equityMultiAsync 표본 수를 못 찾았다').not.toBeNull();
    const n = Number(m![1]);
    // 화면이 "1%p 안팎으로 달라집니다" 라고 약속한다 — 그 약속이 참이려면 95% 구간이 ±1%p 이내여야 한다.
    // p=0.5 가 분산 최대이므로 그 값으로 잡는다: 1.96 * sqrt(0.25/n) * 100 <= 1.0  →  n >= 9604
    const ci95 = 1.96 * Math.sqrt(0.25 / n) * 100;
    expect(ci95, `표본 ${n}회는 95% 구간이 ±${ci95.toFixed(2)}%p — 정수 자리가 흔들린다`).toBeLessThanOrEqual(1);
  });

  it('프리플랍은 실제로 표본이라 흔들린다 — 그래서 정수로 적는 것이다', () => {
    const hero: [Card, Card] = [C('As'), C('Ks')];
    const vill: [Card, Card] = [C('Qh'), C('Qd')];
    const runs = Array.from({ length: 8 }, () => computeEquity(hero, vill, [], 2500).hero * 100);
    expect(Math.max(...runs) - Math.min(...runs),
      '2500회 표본이 전혀 안 흔들린다면 몬테카를로가 아니다 — 이 계약의 전제가 깨졌다').toBeGreaterThan(0.5);
    // 8회 × 2,500 = 20,000회. vitest 기본 5,000ms 로는 CI 에서 터진다(실측 12코어 5.0초+).
    // 근거와 '반복을 줄이지 마라'는 equityMulti.test.ts 의 MC_TIMEOUT 주석에 있다.
  }, 30_000);
});
