// MYSTORE-PC-TAB-JANK P2 후속(2026-09-24) — 내 매장 판은 상한 없이 keep-alive(언마운트 안 됨)라
// 실시간 구독 effect 의 정리 함수가 판을 떠나도 불리지 않는다. 숨은 판이 채널을 놓으려면
// ① 컴포넌트가 active 를 받아 effect 에서 `if (!active) return` 하고 deps 에 넣고, ② 호출부가 실제로 넘겨야 한다.
// SeasonPanel·StaffSchedule 은 VenueManageTab 주석(P2)과 달리 둘 다 빠져 있었다.
//
// 못 보는 것: 문장의 존재만 본다. 채널 수 실측은 e2e 몫.
// 음성 대조: 게이트 줄이나 호출부의 active 를 지우면 해당 검사가 실패한다.
// 실행: npx vitest run src/components/features/paneActiveSubscriptions.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const read = (f: string) => strip(readFileSync(join(__dirname, f), 'utf-8'));

describe('숨은 keep-alive 판은 실시간 채널을 놓는다', () => {
  it('🔴 SeasonPanel: subscribeRankings 가 paneActive 로 막히고 deps 에 있다', () => {
    const c = read('SeasonPanel.tsx');
    expect(c).toMatch(/active: paneActive = true/);
    expect(c).toMatch(/useEffect\(\(\) => \{ if \(!paneActive\) return; load\(\); return subscribeRankings\(venueId, load\); \}, \[venueId, paneActive\]\)/);
  });

  it('🔴 StaffSchedule: subscribeStaffSchedule 가 active 로 막히고 deps 에 있다', () => {
    const c = read('StaffSchedule.tsx');
    expect(c).toMatch(/StaffSchedule\(\{ venueId, active = true \}/);
    expect(c).toMatch(/if \(!active\) return; reload\(\); return subscribeStaffSchedule\(venueId, reload\); \}, \[venueId, from, to, active\]\)/);
  });

  it('🔴 VenueManageTab: 두 호출부가 active 를 넘긴다', () => {
    const c = read('VenueManageTab.tsx');
    expect(c).toMatch(/<SeasonPanelM [^>]*active=\{tabActive && renderSection === 'settings' && renderSettingsTab === 'page'\}/);
    expect(c).toMatch(/<StaffSchedule venueId=\{venueId\} active=\{active\} \/>/);
  });
});
