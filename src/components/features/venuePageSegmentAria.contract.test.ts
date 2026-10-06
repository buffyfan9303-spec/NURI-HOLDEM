// VenuePage 분할 버튼의 상태 노출(P3, 2026-10-06) — 색만으로 선택을 알리던 두 묶음에 aria-pressed, 탭바에 tablist.
//   · 채팅|게시판(VenueCommunitySection) · 순위 보드 토글(metrics.map) → 눌림 상태가 보조기기에 읽혀야 한다.
//   · 상단 탭바는 role=tab + aria-selected 만 있고 부모 tablist 가 없어 ARIA 가 성립하지 않았다.
// 음성 대조: 아래 세 속성 중 하나를 VenuePage.tsx 에서 지우면 해당 줄이 실패한다.
// 실행: npx vitest run src/components/features/venuePageSegmentAria.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./VenuePage.tsx', import.meta.url), 'utf8');

describe('VenuePage 세그먼트·탭 접근성 속성', () => {
  it('상단 탭바는 role=tablist + 이름이 있다', () => {
    expect(src).toMatch(/<div role="tablist" aria-label="매장 상세 탭" className="relative grid grid-cols-5 lg:flex">/);
  });
  it('채팅|게시판 토글 버튼은 aria-pressed={sub === t}', () => {
    expect(src).toMatch(/onClick=\{\(\) => setSub\(t\)\} aria-pressed=\{sub === t\}/);
  });
  it('순위 보드 토글 버튼은 aria-pressed={cur === id}', () => {
    expect(src).toMatch(/onClick=\{\(\) => setMetric\(id\)\} aria-pressed=\{cur === id\}/);
  });
});
