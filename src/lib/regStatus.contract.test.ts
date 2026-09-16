// 소스 계약 — msToRegClose 는 src/lib/regStatus.ts **하나뿐**이다 (2026-09-13 검증 FAIL ②)
//
// 왜: F2(마감 레벨 미설정 = 마감이 아니라 판정 불가)를 regStatus.ts 에만 고쳤는데 **복제본이 둘 더 있었다**
//   — ClockDisplay.tsx(호출부가 regLevel>0 로 막아 무해) · TournamentClock.tsx(가드도 게이트도 없음).
//   TournamentClock 은 `regClose === 0 ? '마감'` 을 렌더하므로, 마감 레벨을 비워 둔 모든 대회에
//   **TV 송출 화면이 '마감' 을 띄웠다.** "같은 대회를 화면마다 다르게 말한다" 의 네 번째 화면이었다.
//   한 카드의 절반만 고치는 재발 부류라, 정의를 한 곳으로 모으고 다시 복제되면 여기서 걸리게 한다.
//
// 이 파일이 보는 것 ① 정의가 src/** 전체에서 regStatus.ts 한 곳뿐인지 ② 두 소비처가 그 한 곳을 **실제로 배선**했는지
//   (단위 테스트가 함수를 직접 import 하면 '아무도 안 부르는 함수' 도 통과한다 — 배선 앵커를 따로 둔다)
//   ③ 임포트 방향 — regStatus 는 effectiveLevel 을 lib/clockLevel 에서 가져온다(api/clock 이면 업주 전용 장부 청크가
//   첫 화면 임계 경로로 딸려 온다 — regStatus.ts 머리말의 실측 기록) ④ TV 클락의 exact 호출 형태로 null → '—'.
// 음성 대조: ClockStage.tsx 에 `function msToRegClose(` 를 다시 넣으면 첫 테스트가 실패한다.
//
// ⚠ 2026-09-13 병합 정정(상류 03cd8bb "보드를 ClockStage 한 벌로"): 마감을 그리던 TournamentClock·ClockDisplay 의 렌더가
//   clock/ClockStage.tsx 로 옮겨 갔고, 상류는 거기에 **F2 가드가 빠진 로컬 msToRegClose**(`num >= target` → 0>=0 참 = '마감')를
//   다시 넣었다. 위 정의-단일성 단언이 그것을 잡았고(실제 회귀), 리드가 사본을 지우고 lib import 로 바꿨다.
//   아래 소비처 목록·regCloseLevel 분포는 그 뒤의 현실이다. 다음 리팩터에서 또 옮기면 각 it 의 "왜 이 파일인가" 줄부터 봐라.
// 실행: npx vitest run src/lib/regStatus.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { msToRegClose } from './regStatus';
import type { ClockState } from '../api/clock';

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

const DEF = /\b(?:function\s+msToRegClose\s*[(<]|(?:const|let|var)\s+msToRegClose\s*=)/;

describe('msToRegClose — 정의는 src/lib/regStatus.ts 하나뿐이다', () => {
  it('🔴 src/** 에서 msToRegClose 를 정의하는 파일은 regStatus.ts 뿐이고, 거기서도 한 번이다', () => {
    const defs = walk(SRC)
      .map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), n: count(strip(readFileSync(p, 'utf-8')), DEF) }))
      .filter((x) => x.n > 0);
    expect(defs, '복제본이 생겼다 — F2 같은 수정이 또 한 벌만 고쳐진다. src/lib/regStatus.ts 에서 import 하라').toEqual([{ file: 'lib/regStatus.ts', n: 1 }]);
  });

  it('regStatus.ts 는 effectiveLevel 을 lib/clockLevel 에서 가져오고, api/clock 은 타입으로만 본다(임계 경로 보호)', () => {
    const code = strip(readFileSync(join(SRC, 'lib', 'regStatus.ts'), 'utf-8'));
    expect(count(code, /^import \{ effectiveLevel \} from '\.\/clockLevel';$/m)).toBe(1);
    expect(count(code, /^import type \{ ClockState \} from '\.\.\/api\/clock';$/m)).toBe(1);
    expect(code, 'api/clock 에서 값을 가져오면 api/ledger 가 첫 화면에 딸려 온다').not.toMatch(/^import \{[^}]*\} from '\.\.\/api\/clock';$/m);
  });
});

describe('배선 — 클락 보드가 그 한 곳을 실제로 부른다(2026-09-13 병합 후 지도)', () => {
  const stage = strip(readFileSync(join(CLOCK_DIR, 'ClockStage.tsx'), 'utf-8'));
  const display = strip(readFileSync(join(CLOCK_DIR, 'ClockDisplay.tsx'), 'utf-8'));
  const tv = strip(readFileSync(join(CLOCK_DIR, 'TournamentClock.tsx'), 'utf-8'));
  const IMPORT = /^import \{ msToRegClose \} from '\.\.\/\.\.\/\.\.\/lib\/regStatus';$/m;

  // 왜 이 파일인가: 03cd8bb 이후 TV·운영자 보드의 단일 마크업이 ClockStage 다 — 손님 앞 TV 의 '등록 마감' 레일과 미니 보드 둘 다 여기서 그린다.
  it('🔴 ClockStage.tsx: import 1회 · regLevel > 0 게이트 뒤에 실효 index/remaining 으로 2회(레일·미니 보드) 부른다', () => {
    expect(count(stage, IMPORT)).toBe(1);
    expect(count(stage, /const reg = regLevel > 0 \? msToRegClose\(g, eff\.index, eff\.remainingMs\) : null;/)).toBe(2);
    expect(count(stage, DEF), '상류 사본(F2 가드 없는 msToRegClose)이 되살아났다 — 마감 레벨을 비운 대회가 TV 에서 "마감" 이 된다').toBe(0);
  });

  // 왜 이 파일인가: 두 화면은 이제 ClockStage 를 감싸는 껍데기다 — 여기서 msToRegClose 를 다시 부르기 시작하면 두 벌 마크업(F2 의 온상)으로 되돌아가는 신호다.
  it('TournamentClock.tsx · ClockDisplay.tsx: msToRegClose import/호출 0 (보드에 위임)', () => {
    for (const [name, code] of [['TournamentClock', tv], ['ClockDisplay', display]] as const) {
      expect(count(code, IMPORT), `${name} 이 마감 계산을 다시 들고 왔다`).toBe(0);
      expect(count(code, /\bmsToRegClose\(/), `${name}: 호출이 있다`).toBe(0);
    }
  });

  // ── 나머지 두 소비처(2026-09-13 재검증 B2b) ────────────────────────────────────
  // ⚠ 이 파일이 **못 보는 것을 먼저 적는다**: 위 DEF 검사는 `msToRegClose` 라는 **이름**만 본다.
  //   누군가 `regCloseMs` 같은 **다른 이름**으로 같은 계산을 다시 쓰면 잡지 못한다. 시도해 봤고 못 한다 —
  //   지문 후보(`regCloseLevel` + `60_000` 근접 / 같은 최상위 스코프)는 LiveGamesTab·ScheduleDetailModal·
  //   TournamentClock 의 **거대한 컴포넌트 본문**에서 전부 참이라(각 6~34KB) 오탐이 기본값이 된다.
  //   무리해서 넣으면 무관한 편집마다 터지고 결국 느슨하게 풀린다 — 그게 더 나쁘다.
  // 그래서 방향을 바꾼다: '복제본이 없는가'(정규식으로 판정 불가) 대신 **'마감을 말하는 화면이 전부 그 한 곳에서
  //   답을 읽는가'** 를 못 박는다. F2 가 실제로 났던 경로가 바로 '호출이 로컬 복제본을 보고 있었다' 다.
  // ⚠ 단, 배선 고정만으로는 **새 화면**을 막지 못한다 — 아래 `regCloseLevel` 참조 고정이 그 몫을 맡는다(근거는 거기 적었다).
  it('🔴 마감을 렌더하는 화면은 넷뿐이고, 넷 다 lib/regStatus 에서 가져온다 — 새 화면이 생기면 앵커를 추가해야 한다', () => {
    const consumers = walk(SRC)
      .filter((p) => /\bmsToRegClose\b/.test(strip(readFileSync(p, 'utf-8'))))
      .map((p) => relative(SRC, p).replace(/\\/g, '/'))
      .sort();
    // 2026-09-13 병합(03cd8bb): ClockDisplay·TournamentClock 의 마감 렌더가 ClockStage 한 벌로 합쳐져 넷→넷(파일이 바뀜, 수는 같음).
    expect(consumers).toEqual([
      'components/features/LiveGamesTab.tsx',
      'components/features/ScheduleDetailModal.tsx',
      'components/features/clock/ClockStage.tsx',
      'lib/regStatus.ts',
    ]);
  });

  // ⚠ 2026-09-13 독립 검증 정정: 위 피벗의 **근거가 거짓**이었다. 나는 *"복제본을 만들어도 호출을 바꾸지 않으면
  //   죽은 코드라 화면이 거짓말하지 않는다"* 고 적었는데, 검증자가 **다섯 번째 화면에 이름 바꾼 복제본을 넣고
  //   '마감' 을 렌더**해도 위 테스트 전부가 통과하는 것을 실증했다. 새 화면은 기존 호출을 바꿀 필요가 없다.
  //
  //   내가 지문 후보 둘(`60_000` 근접 / 같은 최상위 스코프)을 실측해 버린 것은 맞지만, **셋째 후보를 놓쳤다**:
  //   `regCloseLevel` 은 **DB 컬럼명**이라 계산을 재구현하는 코드는 **이름을 바꿀 수 없다**. 그래서 그 토큰의
  //   **파일별 참조 수를 통째로 고정**한다. 새 파일이 이 계산에 손대면 목록에 없어서, 기존 파일 안에서 늘어나면
  //   개수가 달라져서 걸린다 — 어느 쪽이든 **사람이 한 번 보게** 된다.
  //
  //   한계(정직하게): 이건 '복제를 막는' 것이 아니라 '복제가 생길 수 있는 자리를 전부 리뷰로 끌어내는' 장치다.
  //   `regCloseLevel` 을 새로 참조하지 않고(예: 이미 뽑아 둔 지역 변수를 받아) 재구현하면 이것도 못 본다.
  it('🔴 regCloseLevel 참조는 파일별로 고정돼 있다 — 이 계산에 손대면 목록이 어긋나 사람이 본다', () => {
    const EXPECT: Record<string, number> = {
      'api/clock.ts': 5,                                   // 타입 정의 · 기본값 · generateBlinds
      'api/presets.ts': 1,                                 // 프리셋 타입
      'components/features/LiveGamesTab.tsx': 1,           // regLevel > 0 게이트
      'components/features/ScheduleDetailModal.tsx': 1,    // regLv 표시
      // 2026-09-13 병합(03cd8bb): ClockDisplay 의 regLevel 게이트(1)가 ClockStage 로 옮겨 갔고, TournamentClock 의 표시 1건도 보드로 갔다(9→8).
      'components/features/clock/ClockStage.tsx': 1,       // regLevel > 0 게이트(레일·미니 보드 공통)
      'components/features/clock/TournamentClock.tsx': 8,  // 설정 폼 · 자동 생성(표시는 ClockStage 로 이동)
      // 2026-09-17: 7→8. presetFromPosterForm 이 clock.regCloseLevel 을 잃던 것을 고치며 regCloseLevelOf 호출이 하나 늘었다.
      //   계산을 다시 구현한 것이 아니라 **같은 판정기(regStatus.ts)를 한 번 더 부른 것**이라 아래 'lib/regStatus.ts': 1 은 그대로다.
      'lib/gameInherit.ts': 8,                             // 포스터 ↔ 클락 상속 매핑
      'lib/regStatus.ts': 1,                               // ← 계산은 여기 하나뿐이다
    };
    const TOKEN = /\bregCloseLevel\b/g;
    const actual: Record<string, number> = {};
    for (const p of walk(SRC)) {
      const n = count(strip(readFileSync(p, 'utf-8')), TOKEN);
      if (n > 0) actual[relative(SRC, p).replace(/\\/g, '/')] = n;
    }
    expect(actual, [
      'regCloseLevel 참조 분포가 달라졌다. 등록 마감 계산을 다시 구현한 것이 아니라면 위 숫자를 고쳐라.',
      '다시 구현한 것이라면 **src/lib/regStatus.ts 의 msToRegClose 를 써라** — 복제본은 한쪽만 고쳐져 화면마다 다른 답을 말한다(F2).',
    ].join('\n')).toEqual(EXPECT);
  });

  it('🔴 LiveGamesTab.tsx(라이브 카드): 그 한 곳을 실효 index/remaining 으로 부른다', () => {
    const live = strip(readFileSync(join(FEAT_DIR, 'LiveGamesTab.tsx'), 'utf-8'));
    expect(count(live, /^import \{ matchClockSchedule as matchSchedule, msToRegClose \} from '\.\.\/\.\.\/lib\/regStatus';$/m)).toBe(1);
    expect(count(live, /\bmsToRegClose\(g, eff\.index, eff\.remainingMs\)/)).toBe(1);
    // null(마감 레벨 미설정)을 CLOSED 로 그리지 않는다 — F2 가 화면에 새는 마지막 관문.
    expect(count(live, /const regClosed = regMs === 0;/), 'null 까지 CLOSED 가 되면 미설정 대회가 마감으로 보인다').toBe(1);
  });

  it('🔴 ScheduleDetailModal.tsx(일정 상세): 그 한 곳을 부르고, null 을 "마감" 으로 그리지 않는다', () => {
    const det = strip(readFileSync(join(FEAT_DIR, 'ScheduleDetailModal.tsx'), 'utf-8'));
    expect(count(det, /msToRegClose[^)]*\} from '\.\.\/\.\.\/lib\/regStatus';/)).toBe(1);
    expect(count(det, /\bmsToRegClose\(clock, eff\.index, eff\.remainingMs\)/)).toBe(1);
    // 렌더 분기 순서가 계약이다: null 을 **먼저** 걸러야 0(마감)과 섞이지 않는다.
    const nullIdx = det.search(/regMs === null/);
    const zeroIdx = det.search(/regMs === 0/);
    expect(nullIdx, 'regMs === null 분기가 없다').toBeGreaterThan(-1);
    expect(zeroIdx, 'regMs === 0 분기가 없다').toBeGreaterThan(-1);
    expect(nullIdx, 'null 검사가 0 검사보다 뒤에 있으면 미설정 대회가 마감으로 보인다').toBeLessThan(zeroIdx);
  });

  // 왜 이 파일인가: 그 렌더는 03cd8bb 로 ClockStage 에 갔다 — 미니 보드는 null 을 먼저 거르고(표시 없음), 0 만 '마감'; TV 레일은 regLevel > 0 게이트 뒤라 null 이 못 들어온다.
  it('🔴 ClockStage.tsx: null 은 "마감" 이 아니다 — 미니 보드 `reg === null ? null : reg === 0 ? \'마감\'` 1회 · 레일 `reg === 0 ? \'마감\'` 1회', () => {
    expect(count(stage, /const regText = reg === null \? null : reg === 0 \? '마감'/)).toBe(1);
    expect(count(stage, /value=\{reg === 0 \? '마감' : hms\(reg\)\}/)).toBe(1);
    expect(count(stage, /reg === null \? '마감'|reg == null \? '마감'/), 'null 을 마감으로 그린다').toBe(0);
  });
});

// 단위 테스트(regStatus.test.ts)는 함수를 직접 부른다 — 여기서는 **TV 클락의 exact 호출 형태**(state.currentIndex, remaining)로
// 마감 레벨 미설정이 null(→ '—')이고, 설정된 대회는 종전처럼 0(→ '마감')·양수인지 본다.
describe('TV 클락의 호출 형태로 — 마감 레벨 미설정은 null(—), 도달은 0(마감)', () => {
  const L = (minutes: number) => ({ kind: 'level' as const, minutes, sb: 100, bb: 200, ante: 0 });
  const state = (regCloseLevel: number, currentIndex = 0): ClockState => ({
    venueId: 'v1', gameSeq: 1, sessionDate: '2026-09-13', title: 't',
    config: { title: 't', levels: [L(20), L(20), L(20), L(20)], regCloseLevel },
    currentIndex, running: false, endsAt: null, remainingMs: 5 * 60_000,
  } as unknown as ClockState);

  it('🔴 regCloseLevel 0(미설정): null — 예전 로컬 복제본은 num >= 0 이 항상 참이라 0(마감)을 돌려줬다', () => {
    const s = state(0);
    expect(msToRegClose(s, s.currentIndex, 5 * 60_000)).toBeNull();
  });

  it('regCloseLevel 4 · 레벨 1: 양수(잔여 5 + 20 + 20 = 45분) — 과잉 차단이 아니다', () => {
    const s = state(4);
    expect(msToRegClose(s, s.currentIndex, 5 * 60_000)).toBe(45 * 60_000);
  });

  it('regCloseLevel 2 · 레벨 2 에 도달: 0(마감)', () => {
    const s = state(2, 1);
    expect(msToRegClose(s, s.currentIndex, 5 * 60_000)).toBe(0);
  });
});
