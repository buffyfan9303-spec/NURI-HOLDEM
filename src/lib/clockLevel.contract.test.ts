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

describe('배선 — 네 소비처가 그 한 곳을 실제로 부른다', () => {
  const display = strip(readFileSync(join(CLOCK_DIR, 'ClockDisplay.tsx'), 'utf-8'));
  const remote = strip(readFileSync(join(CLOCK_DIR, 'ClockRemote.tsx'), 'utf-8'));
  const tv = strip(readFileSync(join(CLOCK_DIR, 'TournamentClock.tsx'), 'utf-8'));
  const live = strip(readFileSync(join(FEAT_DIR, 'LiveGamesTab.tsx'), 'utf-8'));

  it('ClockDisplay.tsx: import 1회 · levelNumberAt(lvls, eff.index) · msToNextBreak(g, eff.index, eff.remainingMs)', () => {
    expect(count(display, /^import \{ clockPhase, CLOCK_PHASE_TV, levelNumberAt, msToNextBreak \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(display, /\blevelNumberAt\(lvls, eff\.index\)/)).toBeGreaterThanOrEqual(1);
    expect(count(display, /\bmsToNextBreak\(g, eff\.index, eff\.remainingMs\)/)).toBeGreaterThanOrEqual(1);
  });

  it('ClockRemote.tsx: import 1회 · levelNumberAt(lvls, eff.index)', () => {
    expect(count(remote, /^import \{ clockPhase, CLOCK_PHASE_LABEL, levelNumberAt \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(remote, /\blevelNumberAt\(lvls, eff\.index\)/)).toBeGreaterThanOrEqual(1);
  });

  it('LiveGamesTab.tsx: import 1회 · levelNumberAt(lvls, eff.index)', () => {
    expect(count(live, /^import \{ levelNumberAt \} from '\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(live, /\blevelNumberAt\(lvls, eff\.index\)/)).toBeGreaterThanOrEqual(1);
  });

  it('🔴 TournamentClock.tsx: import 1회 · cfg.levels 로 호출(로컬 cfg 시그니처가 되살아나면 여기서 걸린다)', () => {
    expect(count(tv, /^import \{ clockPhase, CLOCK_PHASE_LABEL, CLOCK_PHASE_ACTION, levelNumberAt, msToNextBreak \} from '\.\.\/\.\.\/\.\.\/lib\/clockLevel';$/m)).toBe(1);
    expect(count(tv, /\blevelNumberAt\(cfg\.levels, /)).toBeGreaterThanOrEqual(1);
    expect(count(tv, /\blevelNumberAt\(cfg, /), '옛 cfg 시그니처 호출이 남아 있다').toBe(0);
  });

  it('🔴 TournamentClock.tsx: msToNextBreak 는 state.currentIndex 를 실효 인덱스로 넘긴다(운영자 클락은 자기 state 가 권위)', () => {
    expect(count(tv, /\bmsToNextBreak\(state, state\.currentIndex, remaining\)/)).toBe(1);
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
