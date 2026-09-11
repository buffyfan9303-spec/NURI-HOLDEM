// 돈 계산기의 **배선** 계약 — 함수가 존재하는 것과 화면이 그 함수를 부르는 것은 다르다.
//
// 2026-09-11 연동 감사에서 나온 네 건은 전부 같은 부류였다:
//   · splitMismatch  — 정의·문서·단위테스트까지 있는데 **프로덕션 호출부가 0곳**이었다.
//     그래서 10만 게임에 현금 4만 + 카드 4만을 넣어도 저장됐고, buyinFinance 가 그 8만을
//     value 로 받아 엔트리 0.8 로 셌다. 미수 칸은 0이라 사라진 2만은 어디에도 흔적이 없다.
//   · 인건비 조회 실패 — catch(() => {}) 라 시급이 빈 채로 남아 **'총 인건비 0원'이
//     정상 숫자처럼** 떴다. 돈 화면에서 '못 불러옴'과 '정말 0원'이 같아 보이면 안 된다.
//   · 딜러 급여   — dealer_shifts 는 행마다 시급이 붙은 **두 번째 급여 시스템**인데
//     '총 인건비' 합계에 전혀 반영되지 않았다.
//
// 단위테스트는 이 부류를 못 잡는다. splitMismatch 의 산술은 ledger.money / ledgerAgg /
// ledgerGolden 세 곳에서 이미 통과하고 있었다 — 틀린 것은 식이 아니라 **아무도 안 불렀다는 것**이다.
// 그래서 이 파일은 값이 아니라 '호출부가 살아 있는가'를 소스에서 확인한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEAT = join(__dirname);
const read = (f: string) => readFileSync(join(FEAT, f), 'utf8');

/** 주석·문서를 빼고 **실행되는 코드**만 남긴다 — 주석에 이름이 적혀 있다고 배선된 게 아니다. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 블록 주석
    .replace(/^\s*\/\/.*$/gm, ' ')       // 줄 주석
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' '); // JSX 주석
}

describe('분납 저장 게이트 — splitMismatch 가 실제로 걸려 있는가', () => {
  const src = code(read('NuriPosLedger.tsx'));

  it('splitMismatch 를 호출한다', () => {
    expect(src, 'splitMismatch 호출부가 사라졌습니다 — 분납 합계 검증이 다시 죽습니다')
      .toMatch(/splitMismatch\s*\(/);
  });

  it('저장 가능 판정에 그 결과가 들어간다', () => {
    // canSaveSplit 이 mismatch 를 보지 않으면, 경고만 뜨고 저장은 되는 '보여주기 검증'이 된다.
    const m = /const\s+canSaveSplit\s*=([^;]+);/.exec(src);
    expect(m, 'canSaveSplit 정의를 찾지 못했습니다').not.toBeNull();
    expect(m![1], 'canSaveSplit 이 mismatch 를 보지 않습니다 — 경고만 뜨고 저장은 됩니다')
      .toMatch(/mismatch/);
  });
});

describe('인건비 — 조회 실패를 0원으로 위장하지 않는다', () => {
  for (const f of ['StaffPayroll.tsx', 'StoreDashboard.tsx']) {
    it(`${f}: 시급 조회 실패를 삼키지 않는다`, () => {
      const src = code(read(f));
      // getStaffWages(...) 의 catch 가 빈 블록이면 실패가 '시급 0원'으로 둔갑한다.
      const swallowed = /getStaffWages\([^)]*\)[\s\S]{0,200}?\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.exec(src);
      expect(swallowed?.[0], '시급 조회 실패를 빈 catch 로 삼키고 있습니다 — 총 인건비가 0원으로 보입니다')
        .toBeUndefined();
    });
  }
});

describe('인건비 — 급여 시스템 두 벌을 모두 센다', () => {
  for (const f of ['StaffPayroll.tsx', 'StoreDashboard.tsx']) {
    it(`${f}: 딜러 로테이션(dealer_shifts) 급여가 합계에 들어간다`, () => {
      const src = code(read(f));
      expect(src, '딜러 시프트를 조회하지 않습니다 — 딜러 급여가 총 인건비에서 통째로 빠집니다')
        .toMatch(/getDealerShifts\s*\(/);
      expect(src, '딜러 근무시간을 계산하지 않습니다 — 조회만 하고 합산하지 않는 상태입니다')
        .toMatch(/shiftHours\s*\(/);
    });
  }
});
