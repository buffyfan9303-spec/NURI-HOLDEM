// 내 매장 판의 '요청 시점 매장 = 응답 시점 매장' 계약 (audit-link-1002 L-05·L-06, 2026-10-02)
//
// 왜: 판은 매장 A→B 전환에 다시 마운트되지 않는다(VenueManageTab keep-alive). `getX(venueId).then(setX)` 는
//   A 응답이 늦게 오면 B 화면에 A 값을 그린다 — 프리셋 목록(B 폼에 A 구조 적용) · 장부 직전 설정(B 새 게임에 A 참가비) ·
//   취소 비밀번호 유무 · 클락 시드/프리셋 · 킬스위치 상태 · 이벤트 신청 목록 · **장부 목록(🗑 가 B 장부를 하드 삭제)** ·
//   출근 명부(A 직원 id 가 B 시프트에) · 고객 연결 · 포인트 검색 제안. 매장 경계 확인은 lib/useVenueScope 한 곳이 한다.
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
  // review-store-link-1002 2a(2026-10-02) — 같은 부류가 남아 있던 판
  'StaffSchedule.tsx', 'CustomerAnalytics.tsx', 'VenueCustomizePanel.tsx',
];
/**
 * 매장 id 를 첫 인자로 받는 조회의 결과를 **가드 없이** 쓰는 모양 — 두 가지를 잡는다.
 *   ① `.then(setX)` — setter 를 그대로 넘김
 *   ② `.then((x) => { … })` · `.then(x => …)` — 화살표 본문의 첫 문장이 `if (` 가드가 아님(앞의 주석 줄은 건너뛴다)
 * ⚠ 2026-10-02 이전 판은 ①만 잡아서 NuriPosLedger 장부 목록(`.then((list) => { setSessionList(list); …`)이 빠졌다 —
 *   그 목록의 🗑 가 B 매장 장부를 하드 삭제하는 경로였는데도 '0곳' 으로 통과했다(review-store-link-1002 2a).
 *   가드(alive·on·my === …·isStaleResponse)가 첫 문장인 것은 허용한다 — 그 판은 자기 방식으로 막고 있다.
 */
const RAW = /\b\w+\(\s*venueId\b[^;\n]*?\)\s*\.then\(\s*(?:set[A-Z]\w*\s*[),]|(?:\([^()]*\)|\w+)\s*=>(?!\s*\{?(?:\s*\/\/[^\n]*)*\s*if\s*\())/g;

describe('매장 판의 늦은 응답 가드', () => {
  it('정규식 자체가 화살표 콜백 모양을 잡는다(거짓 통과 방지 — 양성·음성 표본)', () => {
    const hit = (t: string) => (t.match(RAW) ?? []).length;
    expect(hit('getLedgerSessionList(venueId).then((list) => {\n  setSessionList(list);')).toBe(1);
    expect(hit('getX(venueId).then(setX).catch(() => {})')).toBe(1);
    expect(hit('getX(venueId).then(x => setX(x))')).toBe(1);
    expect(hit('getX(venueId).then((s) => { if (alive) setX(s); })')).toBe(0);
    expect(hit('getX(venueId, g).then((s) => {\n  // 주석\n  if (isStaleResponse(my, ref.current)) return;')).toBe(0);
  });

  for (const f of FILES) {
    it(`🔴 ${f}: 가드 없는 getX(venueId).then(…) 가 0곳이다`, () => {
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

  it('🔴 NuriPosLedger: 매장이 바뀌는 렌더에서 장부 목록·삭제 대상을 비우고, 삭제는 누른 순간의 매장으로만 한다', () => {
    const src = read('NuriPosLedger.tsx');
    const block = /if \(listVenue !== venueId\) \{([\s\S]*?)\n\s*\}/.exec(src);
    expect(block, '매장 전환 리셋 블록이 없다').not.toBeNull();
    expect(block![1]).toMatch(/setSessionList\(\[\]\)/);
    expect(block![1]).toMatch(/setDelTarget\(null\)/);
    expect(src).toMatch(/run\('list', getLedgerSessionList,/);
    expect(src).toMatch(/deleteLedgerSession\(delTarget\.venueId,/);
    expect(src).toMatch(/delTarget\.venueId !== venueId/);
  });

  it('🔴 StaffSchedule: 매장이 바뀌는 렌더에서 직원 명부를 비운다(A 직원 id 가 B 시프트에 박히지 않게)', () => {
    const block = /if \(rosterVenue !== venueId\) \{([\s\S]*?)\}/.exec(read('StaffSchedule.tsx'));
    expect(block, '매장 전환 리셋 블록이 없다').not.toBeNull();
    expect(block![1]).toMatch(/setVenueStaff\(\[\]\)/);
  });
});
