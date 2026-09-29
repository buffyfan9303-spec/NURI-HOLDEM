// D1(2026-09-29, docs/handoff-2026-09-29/store-deep.md) — 통계 '당일'은 매장 영업일이다.
// 왜: LedgerStatsPanel 이 `new Date().toLocaleDateString('en-CA')`(기기 시간대 달력 오늘)로 당일을 잡아,
//   자정을 넘긴 토너(00:30)에 대시보드·장부·정산은 어제 장부를, 통계만 오늘(거의 빈 날)을 셌다.
// 보는 것: 영업일 훅 배선 · 기기 달력 '오늘' 식 0개 · 날짜 입력의 max/빈 값 폴백.
// 못 보는 것: 훅이 실제로 서버 영업일을 받아 오는지(lib/businessDate.test.ts 몫) · 렌더(이 저장소 vitest 는 node 환경).
// 음성 대조: `const date = pickedDate ?? biz;` 를 `const [date, setDate] = useState(todayStr);` 로 되돌리면 ①이 빨개진다.
// 실행: npx vitest run src/components/features/ledgerStatsBusinessDate.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(readFileSync(join(__dirname, 'LedgerStatsPanel.tsx'), 'utf-8'));

describe('LedgerStatsPanel — 당일은 영업일', () => {
  it('🔴 ① 당일 날짜는 영업일 훅에서 오고, 사장님이 고른 날짜가 있으면 그것을 쓴다', () => {
    expect(code).toMatch(/const biz = useBusinessDate\(venueId, active\);/);
    expect(code).toMatch(/const date = pickedDate \?\? biz;/);
  });
  it('② 기기 시간대 달력 오늘 식이 남아 있지 않다', () => {
    expect(code).not.toMatch(/new Date\(\)\.toLocaleDateString\('en-CA'\)/);
    expect(code).not.toMatch(/\btodayStr\b/);
  });
  it('③ 날짜 입력: max 는 KST 오늘, 비우면 영업일로 돌아간다', () => {
    expect(code).toMatch(/max=\{kstToday\(\)\} onChange=\{\(e\) => setPickedDate\(e\.target\.value \|\| null\)\}/);
  });
});
