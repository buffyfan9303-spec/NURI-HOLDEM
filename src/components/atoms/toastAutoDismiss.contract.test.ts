// 첫 제스처 전 토스트도 자동으로 닫혀야 한다(2026-09-29).
// show() 안의 진동 분기가 활성화 전 `return` 하므로, 자동 닫힘 예약이 그보다 뒤에 있으면 영영 안 닫힌다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./Toast.tsx', import.meta.url), 'utf8');
const body = src
  .slice(src.indexOf('const show = useCallback'), src.indexOf('}, [dismiss, load]);'))
  .replace(/\/\/.*$/gm, ''); // 주석 속 'return' 단어는 코드가 아니다

describe('Toast show() 자동 닫힘', () => {
  it('자동 닫힘 예약이 첫 조기 return 보다 먼저 걸린다', () => {
    const timer = body.indexOf('setTimeout(() => { dismiss(id); }');
    const firstReturn = body.search(/\breturn\b/);
    expect(timer).toBeGreaterThan(-1);
    if (firstReturn !== -1) expect(timer).toBeLessThan(firstReturn);
  });
});
