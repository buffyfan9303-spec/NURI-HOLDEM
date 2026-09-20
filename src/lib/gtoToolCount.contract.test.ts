// 홈이 말하는 "무료 GTO 도구 N개" 가 **사실인지** 원문으로 확인한다.
//
// 홈은 ToolsPanel(lazy 청크)을 import 할 수 없어 숫자를 따로 들고 있다(gtoToolCount.ts 머리말).
// 그 숫자가 조용히 거짓이 되는 것을 막는 유일한 장치가 이 테스트다 —
// 도구를 더하거나 빼면 여기가 먼저 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GTO_TOOL_COUNT } from './gtoToolCount';

const SRC = readFileSync(resolve(__dirname, '../components/features/ToolsPanel.tsx'), 'utf8');

/** `as const` 배열 리터럴에서 문자열 항목 수를 센다. */
function countKeys(varName: string): number {
  const m = SRC.match(new RegExp(`${varName}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return -1;
  return (m[1].match(/'[a-z-]+'/g) ?? []).length;
}

describe('홈의 "무료 GTO 도구 N개" 는 사실이어야 한다', () => {
  it('🔴 GTO 탭에 실제로 보이는 도구 수와 GTO_TOOL_COUNT 가 같다', () => {
    // TOOLS 배열의 항목 수 — 한 줄에 `{ key: '...'` 로 시작한다.
    const total = (SRC.match(/^\s*\{ key: '/gm) ?? []).length;
    expect(total, 'TOOLS 배열을 못 읽었다 — 파싱 방식이 깨졌다(형식이 바뀌었는지 확인)').toBeGreaterThan(10);

    // GTO 탭에서 숨기는 것: 매장 이관 + 캘린더 이관 + 오늘의 드릴(오너 지시 2026-09-14)
    const store = countKeys('STORE_TOOL_KEYS');
    const calendar = countKeys('CALENDAR_TOOL_KEYS');
    expect(store, 'STORE_TOOL_KEYS 를 못 읽었다').toBeGreaterThan(0);
    expect(calendar, 'CALENDAR_TOOL_KEYS 를 못 읽었다').toBeGreaterThan(0);
    // 🔴 G6(2026-09-20) — 종전에는 `'drill'` **한 단어만** 찾아 1 로 셌다. 그런데 2026-09-18 에
    //   `'deal'`(ICM 계산기로 병합)이 같은 `HIDDEN_SET` 에 더해졌는데도 이 식은 여전히 1 이라,
    //   실제로는 21개인 카탈로그를 22개라고 말하는 상태가 **이 테스트를 초록으로 통과**했다.
    //   이름을 박아 세지 말고 **그 집합의 리터럴 키를 전부** 읽는다 — 다음에 하나 더 숨겨도 따라온다.
    const hidden = SRC.match(/HIDDEN_SET\s*=\s*new Set<ToolKey>\(\[([^\]]*)\]\)/);
    expect(hidden, 'HIDDEN_SET 을 못 읽었다 — 선언 형식이 바뀌었는지 확인하라').not.toBeNull();
    const hiddenExtra = (hidden![1].match(/'[a-z-]+'/g) ?? []).length;
    expect(hiddenExtra, 'HIDDEN_SET 의 추가 숨김 키를 하나도 못 읽었다 — 이 검사가 빈 검사가 됐다').toBeGreaterThan(0);

    const visible = total - store - calendar - hiddenExtra;
    expect(GTO_TOOL_COUNT,
      `홈이 "무료 GTO 도구 ${GTO_TOOL_COUNT}개" 라고 말하는데 실제로 보이는 것은 ${visible}개다.\n`
      + `  전체 ${total} − 매장이관 ${store} − 캘린더이관 ${calendar} − 숨김 ${hiddenExtra}\n`
      + '  도구를 더하거나 뺐으면 src/lib/gtoToolCount.ts 의 숫자를 이 값으로 고쳐라.',
    ).toBe(visible);
  });
});
