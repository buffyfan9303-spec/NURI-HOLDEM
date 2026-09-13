// 소스 계약 — 포스터 `regCloseTime` 의 레벨 파싱은 src/lib/regClose.ts 하나뿐이다 (2026-09-13)
//
// 왜: 이 파싱은 이미 두 벌로 갈려 있었고 **규칙까지 달랐다**.
//   ScheduleCard.regCloseText 는 `/(\d+)\s*LV/i`(LV 형태만), ScheduleDetailModal.BlindStructure 는
//   `/\d+/`(아무 숫자나 — 시각만 적힌 '22:00' 을 22레벨로 읽었다). PosterFormModal 은 같은 정규식을
//   세 번 따로 들고 있었다. 그리고 네 번째 소비처(gameInherit 의 포스터→클락 상속)가 또 하나를 만들 뻔했다.
//   msToRegClose 가 세 벌 복제돼 F2 수정이 한 벌에만 들어간 사고와 같은 부류다(regStatus.contract.test.ts).
//
// 이 파일이 보는 것 ① 정의가 src/** 전체에서 regClose.ts 한 곳뿐인지
//   ② 원본 정규식(`\s*LV`)이 regClose.ts 밖에 남아 있지 않은지(이름만 다른 인라인 복제 차단)
//   ③ 네 소비처가 그 한 곳을 **실제로 배선**했는지(단위 테스트가 함수를 직접 import 하면
//      '아무도 안 부르는 함수'도 통과한다 — 배선 앵커를 따로 둔다).
// 음성 대조: 아무 소비 파일에 `rc.match(/(\d+)\s*LV/i)` 를 다시 넣으면 ②가 실패한다.
//
// ⚠ 이 파일이 못 보는 것(정직하게 적는다 — clockLevel.contract.test.ts·regStatus.contract.test.ts 와 같은 한계):
//   DEF 정규식은 **이름**만 본다. 누군가 `parseRegLevel`·`lateRegOf` 같은 **다른 이름**으로 같은 계산을
//   다시 심으면 잡지 못한다. ②의 정규식 지문도 `[Ll][Vv]`·`match(/(\d+)\s*(?:LV)/)` 처럼 **모양을 바꾼**
//   복제는 놓친다. 거대한 컴포넌트 본문을 '패턴 지문'으로 잡으려 하면 무관한 리팩터마다 오탐이 나
//   결국 계약을 느슨하게 풀게 되고, 그게 더 나쁘다 — 그래서 배선 앵커로
//   "복제해도 화면이 실제로 그 한 곳을 쓰는가"만 못 박는다.
// 실행: npx vitest run src/lib/regClose.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const FEAT = join(SRC, 'components', 'features');
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

const DEF = /\b(?:function\s+regCloseLevelFromText\s*[(<]|(?:const|let|var)\s+regCloseLevelFromText\s*=)/;
/** 원본 정규식 지문 — 소스 텍스트의 `\s*LV`(대소문자 무관). */
const RAW = /\\s\*[Ll][Vv]/;

describe('regCloseLevelFromText — 정의는 src/lib/regClose.ts 하나뿐이다', () => {
  it('🔴 src/** 에서 정의하는 파일은 regClose.ts 뿐이고, 거기서도 한 번이다', () => {
    const defs = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), DEF) }))
      .filter((x) => x.n > 0);
    expect(defs, '복제본이 생겼다 — 규칙이 갈린 채로 화면마다 다시 자란다. src/lib/regClose.ts 에서 import 하라').toEqual([{ file: 'lib/regClose.ts', n: 1 }]);
  });

  // 우선순위(regCloseTime 이 lateRegLevels 를 이긴다)도 정의가 한 곳이어야 한다 —
  // 이 규칙이 소비처마다 복제돼 갈렸던 것이 2026-09-13(2차) 결함의 본체다.
  it('🔴 regCloseLevelOf 의 정의도 regClose.ts 한 곳뿐이다', () => {
    const DEF2 = /\b(?:function\s+regCloseLevelOf\s*[(<]|(?:const|let|var)\s+regCloseLevelOf\s*=)/;
    const defs = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), DEF2) }))
      .filter((x) => x.n > 0);
    expect(defs).toEqual([{ file: 'lib/regClose.ts', n: 1 }]);
  });

  it('🔴 원본 정규식(`\\s*LV`)이 regClose.ts 밖에 남아 있지 않다', () => {
    const hits = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), RAW) }))
      .filter((x) => x.n > 0);
    expect(hits, '인라인 파싱 복제다 — regCloseLevelFromText 를 부르라').toEqual([{ file: 'lib/regClose.ts', n: 1 }]);
  });
});

describe('배선 — 네 소비처가 그 한 곳을 실제로 부른다', () => {
  const inherit = strip(readFileSync(join(SRC, 'lib', 'gameInherit.ts'), 'utf-8'));
  const card = strip(readFileSync(join(FEAT, 'ScheduleCard.tsx'), 'utf-8'));
  const detail = strip(readFileSync(join(FEAT, 'ScheduleDetailModal.tsx'), 'utf-8'));
  const poster = strip(readFileSync(join(FEAT, 'PosterFormModal.tsx'), 'utf-8'));

  // 🔄 2026-09-13(2차): 이 계약은 **틀린 순서를 못 박고 있었다**.
  //   `sc.structure?.lateRegLevels || regCloseLevelFromText(...)` 를 2회로 고정해 둔 탓에
  //   상속만 `lateRegLevels` 를 먼저 보고 카드·블라인드 표(둘 다 regCloseTime 기준)와 답이 갈렸다.
  //   이제 우선순위 자체를 regClose.regCloseLevelOf 한 곳에 두고, 여기서는 **그 한 곳을 부르는지**만 본다
  //   (순서를 소비처 정규식으로 박으면 같은 사고가 반복된다). 값 단언은 regClose.test.ts 가 한다.
  it('🔴 gameInherit.ts: import 1회 · 우선순위는 regCloseLevelOf 에 위임 · 키는 truthy 일 때만 만든다', () => {
    expect(count(inherit, /^import \{ regCloseLevelOf \} from '\.\/regClose';$/m)).toBe(1);
    expect(count(inherit, /regCloseLevelOf\(sc\)/)).toBe(2);
    expect(count(inherit, /lateRegLevels \|\| regCloseLevelFromText/), '옛 역전 우선순위가 되살아났다').toBe(0);
    // `if (lateReg)` 가드 — undefined 를 패치에 실으면 { ...baseCfg, ...schedPatch } 가 수기값을 덮는다
    expect(count(inherit, /\bif \(lateReg\) p\.regCloseLevel = lateReg;/)).toBe(1);
    expect(count(inherit, /p\.regCloseLevel = sc\.structure\?\.lateRegLevels;/), '옛 죽은 상속 줄이 되살아났다').toBe(0);
  });

  it('ScheduleCard.tsx: import 1회 · regCloseText 가 그 값을 쓴다', () => {
    expect(count(card, /^import \{ regCloseLevelFromText \} from '\.\.\/\.\.\/lib\/regClose';$/m)).toBe(1);
    expect(count(card, /const lv = regCloseLevelFromText\(rc\);/)).toBe(1);
  });

  it('🔴 ScheduleDetailModal.tsx: import 1회 · 블라인드 표 + 게임정보 행이 같은 규칙', () => {
    expect(count(detail, /^import \{ regCloseLevelOf \} from '\.\.\/\.\.\/lib\/regClose';$/m)).toBe(1);
    expect(count(detail, /regCloseLevelOf\(schedule\) \?\? 16/), '블라인드 표').toBe(1);
    // 게임 정보 '레이트 레지' 행 — 예전에는 lateRegLevels 를 **날것으로** 찍어 같은 화면의
    // '레지 마감'(regCloseTime) 과 서로 다른 레벨을 말했다. 표시는 유지하되 값만 정본으로 바꿨다.
    expect(count(detail, /regCloseLevelOf\(schedule\) \?\? schedule\.structure\.lateRegLevels/), '레이트 레지 행').toBe(1);
    expect(count(detail, /value=\{`\$\{schedule\.structure\.lateRegLevels\}레벨`\}/), '날것 표시가 되살아났다').toBe(0);
    expect(count(detail, /String\(schedule\.regCloseTime \?\? ''\)\.match\(/), "옛 '아무 숫자나' 파싱이 되살아났다").toBe(0);
  });

  it('PosterFormModal.tsx: import 1회 · 되읽기 3곳이 모두 그 한 곳을 쓴다', () => {
    expect(count(poster, /^import \{ regCloseLevelFromText \} from '\.\.\/\.\.\/lib\/regClose';$/m)).toBe(1);
    expect(count(poster, /const lv = regCloseLevelFromText\(rc\);/)).toBe(3);
    expect(count(poster, /setRegLevel\(lv \? lv\[1\] : ''\)/), '옛 match 결과 인덱싱이 남아 있다').toBe(0);
  });
});
