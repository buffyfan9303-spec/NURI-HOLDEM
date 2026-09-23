// useDialogFocus.ts 의 focus() 호출부 전수 계약 — POSTER-RESERVE-SCROLL-TOP(2026-09-24) 재발 가드.
//
// 왜: 다이얼로그 안에서 포커스된 버튼이 사라지거나(unmount) disabled 되면, 이 훅의 focus() 복구가
//   `preventScroll` 없이 첫 포커스 가능 요소로 옮겨가면서 **스크롤러가 맨 위로 튄다** — 오너 신고
//   재현: 포스터 상세에서 '예약하기'를 눌렀는데 화면이 맨 위로 점프했다.
//   원인 조사: .claude/agent-memory-local/root-cause-debugger/dialog-focusout-scroll-top.md
//
// 무엇을 재는가: 이 파일 안의 모든 `X.focus(...)` 호출을 찾아, Tab 순환(키보드로 직접 이동한
//   결과라 스크롤이 따라가는 게 접근성 기본값 — first.focus()/last.focus())을 뺀 **나머지 전부**가
//   `{ preventScroll: true }` 를 갖는지 본다. 소스를 grep 하지 말고 이 계약으로 재는 이유는
//   CLAUDE.md 의 줄끝/문자열 조립 함정과 같다 — 다음에 focus() 호출이 하나 더 추가돼도 이 검사가
//   자동으로 잡는다(새 호출을 계약에 등록하는 걸 깜빡해도).
//
// 실행: npx vitest run src/components/atoms/useDialogFocus.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(__dirname, 'useDialogFocus.ts');
const RAW = readFileSync(FILE, 'utf8');

/** 주석 안의 `.focus(` 언급(설명문에 코드 예시를 인용하는 줄)이 오탐되지 않게 먼저 지운다.
 *  줄바꿈은 유지해 줄 번호가 흔들리지 않게 한다. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*/g, '');
}

interface FocusCall { line: number; text: string; hasPreventScroll: boolean; isTabCycle: boolean }

/** 괄호 균형을 직접 맞춰 `.focus(...)` 호출 전체를 잘라낸다 — 인자가 `{ preventScroll: true }` 처럼
 *  중괄호를 포함해도 여는/닫는 소괄호만 세면 정확히 끊긴다(중첩 함수 호출이 인자에 없으므로 충분하다). */
function scanFocusCalls(source: string): FocusCall[] {
  const s = stripComments(source);
  const calls: FocusCall[] = [];
  const re = /\.focus\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index;
    let depth = 1;
    let i = start + m[0].length;
    while (i < s.length && depth > 0) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      i++;
    }
    const text = s.slice(start, i);
    const before = s.slice(Math.max(0, start - 20), start).trimEnd();
    calls.push({
      line: s.slice(0, start).split('\n').length,
      text,
      hasPreventScroll: /preventScroll\s*:\s*true/.test(text),
      isTabCycle: /\b(first|last)$/.test(before),
    });
  }
  return calls;
}

describe('useDialogFocus — focus() 복구는 스크롤을 흔들지 않는다', () => {
  it('🔴 검사가 실제로 재고 있다 — 대상이 0개면 통과가 아니다', () => {
    expect(
      scanFocusCalls(RAW).length,
      '.focus( 호출을 하나도 못 찾았다 — 정규식이 깨졌거나 파일이 비었다',
    ).toBeGreaterThanOrEqual(5);
  });

  it('Tab 순환(first/last.focus())은 2건이고, 의도적으로 이 계약에서 제외된다', () => {
    const tabCycle = scanFocusCalls(RAW).filter((c) => c.isTabCycle);
    expect(
      tabCycle.map((c) => `:${c.line} ${c.text}`),
      'first.focus()/last.focus() 호출을 소스에서 못 찾았다 — exempt 목록이 소스와 어긋났다. ' +
      '사용자가 Tab 으로 직접 이동한 결과는 preventScroll 없이 스크롤을 따라가는 게 키보드 접근성 ' +
      '기본값이라 일부러 뺀다(useDialogFocus.ts onKey 주석 참고).',
    ).toHaveLength(2);
  });

  it('🔴 Tab 순환이 아닌 모든 focus() 호출은 preventScroll:true 를 가진다', () => {
    const offenders = scanFocusCalls(RAW).filter((c) => !c.isTabCycle && !c.hasPreventScroll);
    expect(
      offenders.map((c) => `:${c.line} ${c.text}`),
      'POSTER-RESERVE-SCROLL-TOP(2026-09-24) 재발 — 포커스된 요소가 사라지거나 disabled 되면 ' +
      'preventScroll 없는 focus() 복구가 다이얼로그 스크롤러를 맨 위로 되돌린다(포스터 예약하기 실측). ' +
      'Tab 순환(first/last.focus())이 아니라면 .focus({ preventScroll: true }) 로 고쳐라.',
    ).toEqual([]);
  });
});
