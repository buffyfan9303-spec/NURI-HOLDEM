// 업주 화면 → 손님 화면 **배선** 계약 (2026-09-17 독립 감사의 막다른 골목 2건).
//
//   A. 장부 세션 요약의 '대회 …' 는 글자로만 있었고(NuriPosLedger), 포스터 행 액션은
//      예약관리/장부/순위/수정/삭제뿐이라(MyPostersTab) 업주가 **자기 포스터의 손님 화면**을 열 길이 없었다.
//   B. '내 매장 링크' 는 슬러그 **설정**일 뿐 열어 주지 않았고(VenueCustomizePanel), 대시보드 onGoto 는
//      내부 섹션 이동뿐이라 업주가 **자기 매장의 공개 페이지**를 볼 길이 없었다.
//
// 값 테스트가 아니라 배선 테스트다 — 핸들러 prop 이 정의돼 있는 것과 셸이 그것을 **실제로 내려주는 것**은 다르다
// (moneyWiring.test.ts 와 같은 부류). 셸(VenueManageTab)에서 한 줄만 빠져도 버튼이 조용히 사라진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
/** 주석을 벗긴 실행 코드만 — 주석에 이름이 적혀 있다고 배선된 게 아니다. */
const code = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

describe('A. 업주 → 자기 포스터의 손님 화면', () => {
  it('장부: 세션 요약의 대회명이 onOpenSchedule 로 열린다', () => {
    const src = code(read('NuriPosLedger.tsx'));
    expect(src, 'NuriPosLedger 에 onOpenSchedule prop 이 없습니다').toMatch(/onOpenSchedule\?:\s*\(s:\s*Schedule\)\s*=>\s*void/);
    // 대회명 자리(· 대회 …)가 버튼이어야 한다 — span 으로만 남으면 다시 글자다.
    expect(src, '장부의 「· 대회 …」 가 버튼으로 열리지 않습니다').toMatch(/<button[^>]*onClick=\{[^}]*onOpenSchedule\(s\)[^}]*\}[^>]*>·\s*대회/s);
  });

  it('포스터 행: PC 액션 줄과 모바일 바 양쪽에 손님화면 버튼이 있고 한 줄로 고정된다', () => {
    const src = code(read('MyPostersTab.tsx'));
    expect(src).toMatch(/onOpenSchedule\?:\s*\(s:\s*Schedule\)\s*=>\s*void/);
    const buttons = src.match(/<button[^>]*onClick=\{onOpenSchedule\}[^>]*>손님화면<\/button>/g) ?? [];
    expect(buttons.length, 'PC 줄 + 모바일 바 = 2곳이어야 합니다').toBe(2);
    for (const b of buttons) expect(b, '라벨이 두 줄로 접힐 수 있습니다').toMatch(/whitespace-nowrap/);
    // 행에 실제로 내려준다(정의만 있고 안 넘기면 버튼은 영원히 안 뜬다)
    expect(src).toMatch(/onOpenSchedule=\{onOpenSchedule\s*\?\s*\(\)\s*=>\s*onOpenSchedule\(p\)\s*:\s*undefined\}/);
  });

  it('셸: VenueManageTab 이 장부·포스터 양쪽에 onOpenSchedule 을 내려준다', () => {
    const src = code(read('VenueManageTab.tsx'));
    const ledger = /<NuriPosLedgerM[\s\S]*?\/>/.exec(src)?.[0] ?? '';
    const posters = /<MyPostersTabM[\s\S]*?\/>/.exec(src)?.[0] ?? '';
    expect(ledger, '장부에 onOpenSchedule 이 안 내려갑니다').toMatch(/onOpenSchedule=\{onOpenSchedule\}/);
    expect(posters, '포스터 탭에 onOpenSchedule 이 안 내려갑니다').toMatch(/onOpenSchedule=\{onOpenSchedule\}/);
  });
});

describe('B. 업주 → 자기 매장의 손님 화면', () => {
  it('VenueCustomizePanel: onOpenVenue 가 있을 때만 「손님 화면」 버튼을 렌더한다', () => {
    const src = code(read('VenueCustomizePanel.tsx'));
    expect(src).toMatch(/onOpenVenue\?:\s*\(\)\s*=>\s*void/);
    // App 배선 전에도 안전해야 한다 — 핸들러 없이 버튼이 뜨면 아무 일도 안 하는 dead button 이 된다.
    expect(src, '버튼이 onOpenVenue 게이트 없이 렌더됩니다').toMatch(/\{onOpenVenue\s*&&\s*\(\s*<button[^>]*onClick=\{onOpenVenue\}[^>]*whitespace-nowrap[^>]*>손님 화면<\/button>/s);
  });

  it('셸: VenueManageTab 이 onOpenVenue prop 을 받아 VenueCustomizePanel 로 venueId 를 묶어 내려준다', () => {
    const src = code(read('VenueManageTab.tsx'));
    expect(src).toMatch(/onOpenVenue\?:\s*\(venueId:\s*string\)\s*=>\s*void/);
    expect(src).toMatch(/<VenueCustomizePanelM[^>]*onOpenVenue=\{onOpenVenue\s*\?\s*\(\)\s*=>\s*onOpenVenue\(venueId\)\s*:\s*undefined\}/);
  });
});
