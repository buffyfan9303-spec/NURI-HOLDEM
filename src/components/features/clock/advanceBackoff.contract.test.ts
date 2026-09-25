// FULL-RECHECK-2/C #7 — 자동 전진 쓰기(saveClockLevel)를 부르는 두 곳 모두 실패 백오프를 탄다.
//   끝난 클락에서 네트워크가 끊기자 1초 틱마다 같은 CAS PATCH 가 나갔다(실측 31회/10초).
//   e2e/clock-recheck2.spec.ts #7 이 클락 화면 쪽을 요청 수로 재고, 이 계약은 장부 백업 전진자까지 호출부 전부를 묶는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const callers = {
  TournamentClock: strip(readFileSync(join(root, 'components/features/clock/TournamentClock.tsx'), 'utf-8')),
  NuriPosLedger: strip(readFileSync(join(root, 'components/features/NuriPosLedger.tsx'), 'utf-8')),
};

describe('자동 전진 쓰기 — 실패 백오프', () => {
  it('saveClockLevel 호출부는 이 두 곳뿐이다(새 호출부가 생기면 여기에 더한다)', () => {
    for (const [name, code] of Object.entries(callers)) expect(code.match(/saveClockLevel\(/g)?.length, name).toBe(1);
  });
  for (const [name, code] of Object.entries(callers)) {
    it(`${name} — 쓰기 전에 blocked() 로 건너뛰고, 실패하면 fail(), 성공하면 ok()`, () => {
      const at = code.indexOf('saveClockLevel(');
      const before = code.slice(Math.max(0, at - 1500), at);
      const after = code.slice(at, at + 1200);
      expect(before, '쓰기 앞에 백오프 확인이 없다 — 실패해도 1초마다 다시 쓴다').toMatch(/\.blocked\(\)\)\s*return/);
      expect(after, 'catch 에서 실패를 기록하지 않는다').toMatch(/\.catch\([\s\S]{0,200}\.fail\(\)/);
      expect(after, '성공 뒤 백오프를 풀지 않는다 — 한 번 끊긴 뒤 30초 주기에 갇힌다').toMatch(/\.then\([\s\S]{0,120}\.ok\(\)/);
    });
  }
});
