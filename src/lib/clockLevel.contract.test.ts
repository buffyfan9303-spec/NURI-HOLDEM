// 소스 계약 — levelNumberAt · msToNextBreak 는 src/lib/clockLevel.ts 하나뿐이다 (2026-09-13)
//
// 왜: msToRegClose 가 세 벌 복제돼 F2 수정이 한 벌에만 들어간 사고(regStatus.contract.test.ts)와
//   같은 부류가 이 두 함수에도 있었다 — levelNumberAt 은 네 벌(TournamentClock·ClockDisplay·
//   ClockRemote·LiveGamesTab), msToNextBreak 은 두 벌(TournamentClock·ClockDisplay)이었고
//   시그니처까지 갈려 있었다(cfg 를 받는 판본 / levels 를 받는 판본, 2인자/3인자).
//   정의를 src/lib/clockLevel.ts 로 모으고, 다시 복제되면 여기서 걸리게 한다.
//
// 이 파일이 보는 것 ① 정의가 src/** 전체에서 clockLevel.ts 한 곳뿐인지
//   ② 네 소비처가 그 한 곳을 **실제로 배선**했는지(단위 테스트가 함수를 직접 import 하면
//   '아무도 안 부르는 함수' 도 통과한다 — 배선 앵커를 따로 둔다).
// 음성 대조: 아무 소비 파일에 `function levelNumberAt(` 나 `function msToNextBreak(` 를
//   다시 넣으면 아래 정의-단일성 테스트가 실패한다.
//
// ⚠ 이 파일이 못 보는 것(정직하게 적는다, regStatus.contract.test.ts 와 같은 한계):
//   DEF 정규식은 **이름**만 본다. 누군가 `levelNumberOf`·`nextBreakMs` 같은 **다른 이름**으로
//   같은 계산을 다시 심으면 이 파일은 잡지 못한다. TournamentClock·ClockDisplay·LiveGamesTab 은
//   6~34KB 짜리 거대한 컴포넌트 본문이라 '패턴 지문'(kind === 'level' 카운트 등)으로 잡으려 하면
//   무관한 리팩터마다 오탐이 나 결국 느슨하게 풀리게 된다 — 그게 더 나쁘다. 그래서 배선 앵커
//   (import 줄 + 정확한 호출부 정규식)로 "복제해도 화면이 그걸 실제로 쓰는가"만 못 박는다.
//
// ⚠ 2026-09-13 병합 정정(상류 03cd8bb "보드를 ClockStage 한 벌로"): 렌더가 TournamentClock·ClockDisplay 두 벌에서
//   clock/ClockStage.tsx 한 벌로 옮겨 가면서 **로컬 사본 3개(levelNumberAt·msToNextBreak·msToRegClose)가 다시 들어왔고**,
//   위 '정의는 한 곳뿐' 단언이 그것을 잡았다(11건 빨강). 리드가 사본을 지우고 lib import 로 바꿨다.
//   아래 배선 목록은 그 뒤의 현실이다: ClockStage 가 세 함수의 소비처, TournamentClock 은 levelNumberAt 만(설정 폼·자동 보정),
//   ClockDisplay 는 gameLabel 만 쓴다(세 함수 소비처 아님). 다음 리팩터에서 또 옮기면 각 it 의 "왜 이 파일인가" 줄부터 봐라.
// 실행: npx vitest run src/lib/clockLevel.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { levelNumberAt, msToNextBreak } from './clockLevel';

const SRC = join(__dirname, '..');
const CLOCK_DIR = join(SRC, 'components', 'features', 'clock');
const FEAT_DIR = join(SRC, 'components', 'features');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (code: string, re: RegExp) => (code.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const DEF_LNA = /\b(?:function\s+levelNumberAt\s*[(<]|(?:const|let|var)\s+levelNumberAt\s*=)/;
const DEF_MTB = /\b(?:function\s+msToNextBreak\s*[(<]|(?:const|let|var)\s+msToNextBreak\s*=)/;

describe('levelNumberAt · msToNextBreak — 정의는 src/lib/clockLevel.ts 하나뿐이다', () => {
  it('🔴 src/** 에서 levelNumberAt 을 정의하는 파일은 clockLevel.ts 뿐이고, 거기서도 한 번이다', () => {
    const defs = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), DEF_LNA) }))
      .filter((x) => x.n > 0);
    expect(defs, '복제본이 생겼다 — 시그니처가 갈린 채로 화면마다 다시 자란다. src/lib/clockLevel.ts 에서 import 하라').toEqual([{ file: 'lib/clockLevel.ts', n: 1 }]);
  });

  it('🔴 src/** 에서 msToNextBreak 을 정의하는 파일은 clockLevel.ts 뿐이고, 거기서도 한 번이다', () => {
    const defs = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), DEF_MTB) }))
      .filter((x) => x.n > 0);
    expect(defs, '복제본이 생겼다. src/lib/clockLevel.ts 에서 import 하라').toEqual([{ file: 'lib/clockLevel.ts', n: 1 }]);
  });
});

describe('배선 — 소비처가 그 한 곳을 실제로 부른다(2026-09-13 병합 후 지도)', () => {
  const stage = strip(readFileSync(join(CLOCK_DIR, 'ClockStage.tsx'), 'utf-8'));
  const display = strip(readFileSync(join(CLOCK_DIR, 'ClockDisplay.tsx'), 'utf-8'));
  const remote = strip(readFileSync(join(CLOCK_DIR, 'ClockRemote.tsx'), 'utf-8'));
  const tv = strip(readFileSync(join(CLOCK_DIR, 'TournamentClock.tsx'), 'utf-8'));
  const live = strip(readFileSync(join(FEAT_DIR, 'LiveGamesTab.tsx'), 'utf-8'));

  // 왜 이 파일인가: 03cd8bb 이후 TV·운영자 보드의 **단일 마크업**이 ClockStage 다 — 레벨 번호·휴식까지 계산이 전부 여기서 그려진다.
  it('🔴 ClockStage.tsx: import 1회 · levelNumberAt(lvls, eff.index) ×1 · msToNextBreak(g, eff.index, eff.remainingMs) ×2(레일·미니 보드)', () => {
    // 2026-09-19: CLOCK_PHASE_TV 는 상태 알약과 함께 보드에서 빠졌다(오너 지시 #9) — clockPhase 는 일시정지 타이머 색에 남는다.
    expect(count(stage, /^import \{ clockPhase, gameLabel, levelNumberAt, msToNextBreak \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(stage, /\blevelNumberAt\(lvls, eff\.index\)/)).toBe(1);
    expect(count(stage, /\bmsToNextBreak\(g, eff\.index, eff\.remainingMs\)/)).toBe(2);
    expect(count(stage, DEF_LNA), '상류 사본(levelNumberAt)이 되살아났다').toBe(0);
    expect(count(stage, DEF_MTB), '상류 사본(msToNextBreak)이 되살아났다').toBe(0);
  });

  // 왜 이 파일인가: ClockDisplay 는 이제 ClockStage 를 감싸는 껍데기라 gameLabel 만 쓴다 — 세 함수를 여기서 다시 부르기 시작하면 두 벌 마크업으로 되돌아가는 신호다.
  it('ClockDisplay.tsx: gameLabel 만 import · levelNumberAt/msToNextBreak 호출 0', () => {
    expect(count(display, /^import \{ gameLabel \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(display, /\blevelNumberAt\(/)).toBe(0);
    expect(count(display, /\bmsToNextBreak\(/)).toBe(0);
  });

  it('ClockRemote.tsx: import 1회 · levelNumberAt(lvls, eff.index)', () => {
    expect(count(remote, /^import \{ clockPhase, CLOCK_PHASE_LABEL, levelNumberAt \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(remote, /\blevelNumberAt\(lvls, eff\.index\)/)).toBeGreaterThanOrEqual(1);
  });

  it('LiveGamesTab.tsx: import 1회 · levelNumberAt(lvls, eff.index)', () => {
    expect(count(live, /^import \{ levelNumberAt \} from '\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(live, /\blevelNumberAt\(lvls, eff\.index\)/)).toBeGreaterThanOrEqual(1);
  });

  // 왜 이 파일인가: 운영자 클락은 보드 렌더를 ClockStage 에 넘겼고, 설정 폼·자동 보정·레벨 표에서만 levelNumberAt(cfg.levels, …) 를 쓴다.
  it('🔴 TournamentClock.tsx: import 1회(levelNumberAt 만) · cfg.levels 로 호출(로컬 cfg 시그니처가 되살아나면 여기서 걸린다)', () => {
    expect(count(tv, /^import \{ clockPhase, CLOCK_PHASE_ACTION, levelNumberAt \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(tv, /\blevelNumberAt\(cfg\.levels, /)).toBeGreaterThanOrEqual(1);
    expect(count(tv, /\blevelNumberAt\(cfg, /), '옛 cfg 시그니처 호출이 남아 있다').toBe(0);
  });

  // 왜 이 파일인가: '휴식까지' 계산은 03cd8bb 로 ClockStage 가 맡았다 — 운영자 클락이 다시 계산하기 시작하면 두 벌이 갈리는 첫 신호다.
  it('🔴 TournamentClock.tsx: msToNextBreak 호출 0 (보드가 한다) · 옛 2인자 로컬 시그니처 0', () => {
    expect(count(tv, /\bmsToNextBreak\(/), '운영자 클락이 휴식 계산을 다시 들고 왔다 — ClockStage 한 벌이 답이다').toBe(0);
    expect(count(tv, /\bmsToNextBreak\(state, remaining\)/), '옛 2인자 로컬 시그니처가 되살아났다').toBe(0);
  });
});

describe('함수 동작 회귀(단위) — cfg/levels 두 시그니처를 하나로 합친 뒤에도 계산은 같다', () => {
  const L = (minutes: number, kind: 'level' | 'break' = 'level') => ({ kind, minutes });

  it('levelNumberAt: 브레이크는 세지 않는다', () => {
    const levels = [L(20), L(20), L(0, 'break'), L(20)];
    expect(levelNumberAt(levels, 0)).toBe(1);
    expect(levelNumberAt(levels, 1)).toBe(2);
    expect(levelNumberAt(levels, 2)).toBe(2); // 브레이크는 안 늘어난다
    expect(levelNumberAt(levels, 3)).toBe(3);
  });

  it('msToNextBreak: 다음 브레이크까지 현재 잔여 + 중간 레벨 합', () => {
    const s = { config: { levels: [L(20), L(20), L(0, 'break'), L(20)] } };
    expect(msToNextBreak(s, 0, 5 * 60_000)).toBe((5 + 20) * 60_000);
    expect(msToNextBreak(s, 2, 5 * 60_000)).toBeNull(); // 브레이크 다음엔 브레이크가 더 없다
  });

  it('msToNextBreak: config/levels 가 없어도 던지지 않는다(null-safe)', () => {
    expect(msToNextBreak({ config: null }, 0, 1000)).toBeNull();
    expect(msToNextBreak({}, 0, 1000)).toBeNull();
  });
});
