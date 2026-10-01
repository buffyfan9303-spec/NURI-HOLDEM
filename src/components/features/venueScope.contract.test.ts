// 내 매장 판의 '요청 시점 매장 = 응답 시점 매장' 계약 (audit-link-1002 L-05·L-06, 2026-10-02)
//
// 왜: 판은 매장 A→B 전환에 다시 마운트되지 않는다(VenueManageTab keep-alive). `getX(venueId).then(setX)` 는
//   A 응답이 늦게 오면 B 화면에 A 값을 그린다 — 프리셋 목록(B 폼에 A 구조 적용) · 장부 직전 설정(B 새 게임에 A 참가비) ·
//   취소 비밀번호 유무 · 클락 시드/프리셋 · 킬스위치 상태 · 이벤트 신청 목록. 매장 경계 확인은 lib/useVenueScope 한 곳이 한다.
// 이 계약은 구조만 잠근다. 실제 전환 동작은 e2e/store-link-1002.spec.ts 가 늦은 응답으로 재현해 잰다.
// 실행: npx vitest run src/components/features/venueScope.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const F = join(__dirname);
const read = (p: string) => readFileSync(join(F, p), 'utf8');
const FILES = [
  'PresetManager.tsx', 'PresetPicker.tsx', 'NuriPosLedger.tsx', 'clock/TournamentClock.tsx',
  'KillSwitch.tsx', 'LedgerStatsPanel.tsx', 'VenueEventRequestPanel.tsx',
];
/** 매장 id 를 첫 인자로 받는 조회의 결과를 setter 에 바로 꽂는 모양 — 가드 없는 매장 응답. */
const RAW = /\b\w+\(\s*venueId\b[^;\n]*?\)\s*\.then\(\s*set[A-Z]\w*\s*\)/g;

describe('매장 판의 늦은 응답 가드', () => {
  for (const f of FILES) {
    it(`🔴 ${f}: 가드 없는 getX(venueId).then(setX) 가 0곳이다`, () => {
      expect(read(f).match(RAW) ?? []).toEqual([]);
    });
    it(`${f}: 매장 경계는 useVenueScope 한 곳으로 확인한다`, () => {
      expect(read(f)).toMatch(/useVenueScope\(venueId\)/);
    });
  }

  it('🔴 PresetManager: 매장이 바뀌는 렌더에서 편집 중 상태를 비운다(A 프리셋 폼이 B 로 넘어가 저장되지 않게)', () => {
    const src = read('PresetManager.tsx');
    const block = /if \(shownVenue !== venueId\) \{([\s\S]*?)\n\s*\}/.exec(src);
    expect(block, '매장 전환 리셋 블록이 없다').not.toBeNull();
    expect(block![1]).toMatch(/setEditing\(null\)/);
    expect(block![1]).toMatch(/setPresets\(null\)/);
  });
});
