// NURI SPOT 밴드 계약 — 배타 렌더를 버린 뒤 **DOM 순서를 지키는 것이 관습밖에 없다.**
//
// 왜 이 파일이 필요한가(2026-09-17):
//   예전에는 `{step === 'cards' && …}` 같은 배타 렌더가 화면당 밴드 하나만 세워
//   "④ 내 선택이 ⑥ 액션 타임라인보다 먼저" 를 **구조적으로** 보장했다. 전부 렌더하는 지금은
//   그 보장이 사라지고 아래 두 게이트가 순서에 통째로 기대게 된다:
//     · e2e/nuri-spot.spec.ts:182            `레이즈`(exact) `.first()`  → ChoiceStep 이어야 한다
//     · e2e/nuri-spot-board.spec.ts:162-163  `레이즈` → `spinbutton` `.first()` → ChoiceStep 의 '이번에 추가'
//   동시에 e2e/nuri-spot.spec.ts:165-167(레일을 눌러야 '내 자리'가 보인다)은 **항상 렌더라 공허해졌다** —
//   그 자리를 여기서 메운다. 게이트 약화가 아니라 이동이다.
//
// ⚠ 순서는 **`AnalyzeTab` 의 return 블록 안 JSX 등장 순서**로만 잰다.
//   전역 indexOf 로 세면 오늘은 우연히 맞지만(사용처가 선언보다 앞) 함수 선언 하나를 위로 옮기는
//   것만으로 조용히 거짓 통과한다 — 선언 순서는 `GameStep → SeatStep → ActionTimeline → ChoiceStep`
//   으로 지금도 목표 DOM 순서의 역순이다.
//
// 왜 소스 계약인가: vitest 환경이 node 라 NuriSpotPanel 을 렌더할 수 없다(auth·toast·워커까지 붙는다).
//   같은 결: nuriSpotWiring.contract.test.ts · clock/gameSwitchContract.test.ts.
// 실행: npx vitest run src/components/features/gto/nuriSpotBands.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'NuriSpotPanel.tsx'), 'utf-8');
/** 주석을 지운 코드 — 주석에 적힌 컴포넌트 이름이 순서 판정을 오염시키지 않게. */
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** `function AnalyzeTab(...) { … }` 본문만 — 다음 최상위 `function ` 선언 직전까지. */
function analyzeTabBody(src: string): string {
  const start = src.indexOf('function AnalyzeTab(');
  if (start < 0) return '';
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(?:function|\/\*\*) /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** 문자열 안에서 각 앵커가 처음 나오는 위치. 하나라도 없으면 -1 이 남아 테스트가 실패한다. */
const posOf = (hay: string, needles: string[]) => needles.map((n) => hay.indexOf(n));

describe('밴드 DOM 순서 — 배타 렌더가 보장하던 것을 계약으로 옮긴다', () => {
  const body = analyzeTabBody(code);

  it('AnalyzeTab 본문을 찾을 수 있다', () => {
    expect(body, 'AnalyzeTab 을 찾지 못했다').not.toBe('');
    // 앵커가 본문 밖(다른 함수)까지 삼키지 않았는지 — 선언 순서상 뒤에 오는 StepBar/Row 가 들어오면 안 된다.
    expect(body).not.toContain('function Row(');
  });

  it('ChoiceStep < ActionTimeline < SeatStep < GameStep 순서로 마운트된다', () => {
    const [choice, timeline, seat, game] = posOf(body, ['<ChoiceStep', '<ActionTimeline', '<SeatStep', '<GameStep']);
    expect(choice, '<ChoiceStep 사용처가 없다').toBeGreaterThanOrEqual(0);
    expect(timeline, '<ActionTimeline 사용처가 없다').toBeGreaterThanOrEqual(0);
    expect(seat, '<SeatStep 사용처가 없다').toBeGreaterThanOrEqual(0);
    expect(game, '<GameStep 사용처가 없다').toBeGreaterThanOrEqual(0);
    // e2e:182 / board:162 의 `레이즈` exact `.first()` 가 ChoiceStep 을 집으려면 이 순서여야 한다.
    expect(choice, 'ChoiceStep 이 ActionTimeline 보다 뒤에 있다 — 레이즈/spinbutton .first() 가 엉뚱한 칸을 집는다')
      .toBeLessThan(timeline);
    // board:163 의 spinbutton .first(): ⑦ SeatStep 의 '유효 스택 직접 입력'이 앞서면 안 된다.
    expect(timeline, 'SeatStep 이 ActionTimeline 보다 앞에 있다').toBeLessThan(seat);
    expect(seat, 'GameStep 이 SeatStep 보다 앞에 있다').toBeLessThan(game);
  });

  it('리포트가 ChoiceStep 보다 **앞**이다 — 등급 배지를 첫 화면 안에 두는 유일한 순서', () => {
    // 375×667 실측: 리포트를 ④ 뒤에 두면 배지 top 840.17(화면 밖 173px), 앞에 두면 596.05.
    const [picker, report, choice] = posOf(body, ['<HandBoardPicker', '<SpotReport', '<ChoiceStep']);
    expect(picker).toBeGreaterThanOrEqual(0);
    expect(report).toBeGreaterThanOrEqual(0);
    expect(picker, 'HandBoardPicker 가 리포트보다 뒤에 있다').toBeLessThan(report);
    expect(report, '리포트가 내 선택보다 뒤에 있다 — 375×667 에서 등급 배지가 첫 화면 밖으로 나간다')
      .toBeLessThan(choice);
  });

  it('배타 렌더가 돌아오지 않았다 — 밴드는 전부 항상 렌더다', () => {
    for (const k of ['game', 'seat', 'cards', 'choice']) {
      expect(body, `step === '${k}' 조건부 렌더가 살아 있다`).not.toContain(`step === '${k}'`);
    }
  });
});

describe('앵커 레일 — 라벨·순서·배선', () => {
  it('STEPS 가 문서 순서와 같은 네 단계다', () => {
    const m = code.match(/const STEPS = \[[\s\S]*?\] as const;/);
    expect(m, 'STEPS 를 찾지 못했다').not.toBeNull();
    const keys = [...m![0].matchAll(/key: '(\w+)'/g)].map((x) => x[1]);
    const labels = [...m![0].matchAll(/label: '([^']+)'/g)].map((x) => x[1]);
    expect(keys).toEqual(['cards', 'choice', 'seat', 'game']);
    // 라벨 문자열은 e2e/nuri-spot.spec.ts:161-164 · :291-303 이 정규식으로 읽는다 — 바꾸면 같은 커밋에서 게이트도 고쳐야 한다.
    expect(labels).toEqual(['카드·액션', '내 선택', '자리·스택', '게임']);
  });

  it('레일이 role="group" aria-label="입력 단계" 안에 STEPS 를 그대로 편다', () => {
    expect(code).toContain('role="group" aria-label="입력 단계"');
    const rail = code.match(/function AnchorRail\(\{[\s\S]*?\n\}/);
    expect(rail, 'AnchorRail 을 찾지 못했다').not.toBeNull();
    expect(rail![0], '레일이 STEPS 를 돌지 않는다').toContain('STEPS.map(');
    // 접근명이 라벨 그대로여야 e2e 의 `'9인'`·`/내 선택/` 류 매칭이 산다 — 칩 안에 장식·부연을 넣지 않는다.
    expect(rail![0], '칩 안에 완료 체크가 되살아났다').not.toContain('aria-label="완료"');
  });

  it('레일 클릭이 aria-current 를 옮기고 그 밴드로 스크롤한다', () => {
    const rail = code.match(/function AnchorRail\(\{[\s\S]*?\n\}/);
    expect(rail![0], 'aria-current 배선이 없다').toMatch(/aria-current=\{on \? 'step' : undefined\}/);
    expect(rail![0], 'onStep 배선이 없다').toMatch(/onClick=\{\(\) => onStep\(s\.key\)\}/);
    const body = analyzeTabBody(code);
    expect(body, 'onStep 이 step 을 옮기지 않는다').toContain('setStep(k)');
    expect(body, 'onStep 이 밴드로 스크롤하지 않는다 — 항상 렌더라 화면이 그대로면 아무 일도 안 일어난 것처럼 보인다')
      .toMatch(/bands\.current\[k\]\?\.scrollIntoView\(/);
  });

  it('네 밴드 전부 앵커 ref 를 갖는다(눌러도 안 움직이는 칩 금지)', () => {
    const body = analyzeTabBody(code);
    // cards 는 HandBoardPicker 묶음, 나머지는 각 Step 카드.
    for (const k of ['cards', 'choice', 'seat', 'game']) {
      expect(body, `${k} 밴드에 앵커 ref 가 없다`).toContain(`bands.current.${k} = el`);
    }
  });

  it('레일은 sticky 하나뿐 — 내비 행은 올리지 않는다(겹침 금지)', () => {
    const rail = code.match(/function AnchorRail\(\{[\s\S]*?\n\}/);
    expect(rail![0]).toContain('sticky top-0');
    const hero = code.match(/function SpotHero\(\{[\s\S]*?\n\}/);
    expect(hero![0], '내비 행이 sticky 가 됐다 — 레일과 겹친다').not.toContain('sticky');
  });
});

describe('PC 2열 — sticky 리포트가 죽지 않는다', () => {
  const body = analyzeTabBody(code);

  it('lg:items-start 가 있다', () => {
    // 1280 실측: 빼면 오른쪽 열이 그리드 전체로 stretch 돼(420 → 1276.5px) sticky 가 조용히 죽는다
    // (스크롤 482px 뒤 리포트 top +176.3 → −409.8).
    expect(body, 'lg:items-start 가 없다 — sticky 리포트가 화면 밖으로 흘러간다').toContain('lg:items-start');
    expect(body).toContain('lg:grid-cols-[minmax(0,1fr)_22rem]');
  });

  it('그리드 자식 셋이 각자의 행·열을 갖는다', () => {
    expect(body).toContain('lg:col-start-1 lg:row-start-1');   // ①②③
    expect(body).toContain('lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky'); // ⑤
    expect(body).toContain('lg:col-start-1 lg:row-start-2');   // ④ 이하
  });

  it('모바일 간격이 살아 있다 — 자식 2·3 에 mt-3 lg:mt-0', () => {
    // 설계 스니펫이 mt-3 을 떨어뜨렸었다. 390 실측: 없으면 밴드 사이 간격이 0 이 된다.
    expect((body.match(/mt-3 min-w-0[^"]*lg:mt-0/g) ?? []).length,
      '자식 2·3 중 하나가 모바일 간격을 잃었다').toBe(2);
  });
});
