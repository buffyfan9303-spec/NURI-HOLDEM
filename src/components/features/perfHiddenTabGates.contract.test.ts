// §5-A(2026-09-12) — keep-alive 숨은 탭에서 계속 도는 구독/폴링 + 절대 안 히트하는 memo.
// App.tsx 의 최상위 탭은 언마운트되지 않는다(visitedTabs + display 토글) — 화면에 안 보여도
// 구독·타이머가 계속 돌면 브라우저가 유령 리소스를 문다. 렌더 트리 테스트로 잡기 어려운
// 항목들이라(auth·supabase·다단 prop) 저장소가 이미 쓰는 소스 계약 테스트 방식으로 잠근다
// (NuriPosLedgerRace.contract.test.ts · StoreDashboardRace.contract.test.ts 와 같은 결).
// 실행: npx vitest run src/components/features/perfHiddenTabGates.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('C09 · LedgerStatsPanel 의 당일 실시간 구독은 이 판이 보일 때만(active) 걸린다', () => {
  const code = strip(readFileSync(join(__dirname, 'LedgerStatsPanel.tsx'), 'utf-8'));

  it('StatsView 가 active prop 을 받는다', () => {
    expect(code).toMatch(/function StatsView\(\{ venueId, active \}: \{ venueId: string; active: boolean \}\)/);
  });

  it('LedgerStatsPanel(default export) 이 active 를 받아 StatsView 로 내려준다', () => {
    expect(code).toMatch(/export default function LedgerStatsPanel\(\{ venueId, active = true \}/);
    expect(code).toMatch(/<StatsView venueId=\{venueId\} active=\{active\} \/>/);
  });

  it('subscribeLedger 구독이 active 없이는 걸리지 않는다', () => {
    const m = code.match(/if \(tabPeriod !== 'day'\) return;\s*if \(!active\) return;\s*return subscribeLedger\(venueId, \(\) => setLiveTick/);
    expect(m, '당일 실시간 구독의 active 게이트를 찾지 못했다').not.toBeNull();
  });

  it('다시 보일 때(active 상승) 한 번 재검증해 숨은 동안 놓친 변경을 메운다', () => {
    expect(code).toMatch(/const prevActiveRef = useRef\(active\);/);
    expect(code).toMatch(/if \(active && !prevActiveRef\.current\) setLiveTick\(\(t\) => t \+ 1\);/);
  });
});

describe('C09 · VenueManageTab 이 stats 섹션에 active 를 실제로 넘긴다', () => {
  const code = strip(readFileSync(join(__dirname, 'VenueManageTab.tsx'), 'utf-8'));

  it("LedgerStatsPanelM 마운트부가 active(renderSection === 'stats') 를 받는다", () => {
    const m = code.match(/box\('stats', <LedgerStatsPanelM venueId=\{venueId\} active=\{([^}]+)\} \/>\)/);
    expect(m, 'LedgerStatsPanelM 마운트부를 찾지 못했다').not.toBeNull();
    expect(m![1]).toBe("tabActive && renderSection === 'stats'");
  });
});

describe("C09 · TournamentClock 의 클락 광고 30초 폴링은 이 판이 보일 때만(active) 돈다", () => {
  const code = strip(readFileSync(join(__dirname, 'clock', 'TournamentClock.tsx'), 'utf-8'));

  it('setInterval(loadAd, 30_000) 이 active 가드 뒤에 있다(같은 파일의 1초 틱과 같은 형태)', () => {
    const idx = code.indexOf('const t = setInterval(loadAd, 30_000);');
    expect(idx, 'setInterval(loadAd, 30_000) 을 찾지 못했다').toBeGreaterThan(-1);
    const before = code.slice(Math.max(0, idx - 200), idx);
    expect(before, 'active 게이트가 없다').toMatch(/if \(!active\) return off;/);
  });

  it('그 effect 가 active 를 deps 에 둔다(다시 보일 때 loadAd 가 다시 실행되어 재검증된다)', () => {
    const idx = code.indexOf('const t = setInterval(loadAd, 30_000);');
    const after = code.slice(idx, idx + 200);
    expect(after).toMatch(/\}, \[active\]\);/);
  });
});

describe('C09 · LedgerVoucherRail 의 useMemo 가 매 렌더 새 Date.now() 로 깨지지 않는다', () => {
  const code = strip(readFileSync(join(__dirname, 'LedgerVoucherRail.tsx'), 'utf-8'));

  it("now 가 매 렌더 Date.now() 가 아니라 마지막 데이터 시각(at)에서 온다", () => {
    expect(code).not.toMatch(/const now = Date\.now\(\);/);
    expect(code).toMatch(/const now = at \?\? Date\.now\(\);/);
  });

  it('rows useMemo 는 여전히 [vs, now] 에 의존한다(계약 자체는 그대로)', () => {
    expect(code).toMatch(/const rows = useMemo\(\(\) => \(vs \? toFeedRows\(vs, now\) : \[\]\), \[vs, now\]\);/);
  });
});

// 2026-09-12 독립 검증에서 드러난 **구멍**: 위 검사들은 각 컴포넌트 **안쪽**의 게이트만 본다.
// 그런데 `active` 는 optional 이고 기본값이 `true` 라, **마운트부에서 prop 을 빼 버리면**
// 게이트가 전부 무력화되는데도 타입 검사도 이 계약들도 아무것도 잡지 못한다(실제로 시험해 통과했다).
// `react-hooks/exhaustive-deps` 도 warning 이라 게이트(0 error)를 막지 못한다.
// 그래서 **넘기는 쪽**을 따로 잠근다 — 게이트는 '거는 곳'과 '넘기는 곳'이 모두 있어야 성립한다.
describe('🔴 §5-A · 마운트부가 active 를 실제로 넘긴다 (빼도 기본값 true 로 조용히 무력화된다)', () => {
  const code = strip(readFileSync(join(__dirname, 'VenueManageTab.tsx'), 'utf-8'));

  it('NuriPosLedger — 장부 단계에서만 활성', () => {
    expect(code, 'NuriPosLedgerM 에 active 가 없다 — 숨은 장부가 구독 4개를 계속 문다')
      .toMatch(/<NuriPosLedgerM[^>]*\sactive=\{tabActive && renderSection === 'game' && renderGameStep === 'ledger'\}/);
  });

  it('TournamentClock — 클락 단계에서만 활성', () => {
    expect(code, 'TournamentClockM 에 active 가 없다 — 광고 폴링이 상시 부활한다(시간당 240요청)')
      .toMatch(/<TournamentClockM[^>]*\sactive=\{tabActive && renderSection === 'game' && renderGameStep === 'clock'\}/);
  });

  it('LedgerStatsPanel — 통계 섹션에서만 활성', () => {
    expect(code, 'LedgerStatsPanelM 에 active 가 없다')
      .toMatch(/<LedgerStatsPanelM[^>]*\sactive=\{tabActive && renderSection === 'stats'\}/);
  });
});
