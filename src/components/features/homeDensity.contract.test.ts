// HOME-DENSITY(2026-09-24 오너: "'9월 24일 (목) 일정' 글씨 크기 줄여주고 나머지 공백들도 조금 줄여서
// 한 페이지에 들어가는 콘텐츠 양을 조금 늘려줘") 재발 방지 계약.
//
// 실측(390×844 · 오늘 5건 목킹 · dev): 첫 화면에 온전히 보이는 일정 카드 3 → 4장(320: 2 → 4).
// 화면 수치는 브라우저 몫이다(scratchpad 하네스). 여기서는 그 결과를 만든 **조리법**이 자리에 있는지만 본다.
// 실행: npx vitest run src/components/features/homeDensity.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'src', 'components', 'features');
const HOME = readFileSync(join(dir, 'HomeTab.tsx'), 'utf8');
const PC = readFileSync(join(dir, 'PosterCarousel.tsx'), 'utf8');

describe('배너 제어 — 별도 줄이 아니라 프레임 안', () => {
  const ctrl = PC.slice(PC.indexOf('data-testid="home-banner-dots"') - 200, PC.indexOf('data-testid="home-banner-dots"') + 2200);
  it('제어 묶음이 프레임(relative) 안의 absolute 다 — 배너 밑에 줄을 다시 만들지 않는다', () => {
    expect(PC).toMatch(/poster-frame relative/);
    expect(ctrl).toMatch(/absolute inset-x-0 bottom-0[^"]*" data-testid="home-banner-dots"/);
  });
  it('화살표 실박스가 44×44 다(종전 32×32)', () => {
    const arrows = ctrl.match(/aria-label="(이전|다음) 배너"\s*\n\s*className="[^"]*"/g) ?? [];
    expect(arrows.length).toBe(2);
    for (const a of arrows) expect(a).toMatch(/h-\[44px\] w-\[44px\]/);
  });
  it('여러 장일 때 슬라이드 글자가 제어 띠 위로 올라간다', () => {
    expect(PC).toMatch(/multi \? 'pb-8' : 'pb-3'/);
    expect(PC.match(/multi \? 'pb-6' : ''/g)?.length).toBe(2);
  });
});

describe('일정 목록 스켈레톤 — 실제와 같은 높이', () => {
  it('행 높이를 토큰으로 고정한다(min-h 면 안쪽 막대가 토큰을 넘어 행마다 +8px)', () => {
    expect(HOME).toMatch(/className="flex h-\[var\(--card-h-list\)\] items-center gap-3 overflow-hidden px-3 py-1\.5"/);
  });
  it('끝의 "전체 일정 보기"(44px) 자리를 예약한다', () => {
    const skel = HOME.slice(HOME.indexOf('aria-busy="true"'), HOME.indexOf(') : failed ? ('));
    expect(skel).toMatch(/min-h-\[44px\]/);
  });
  it('다음 방문 행 수는 **화면에 그린** 목록 길이다(오늘+내일 수가 아니다)', () => {
    expect(HOME).toMatch(/writeSeenCount\(UPCOMING_SEEN, \(useFallback \? nextUp : dayVisible\)\.length/);
  });
});

describe('일정 제목', () => {
  it('섹션 제목이 15/22 다(종전 18/26)', () => {
    expect(HOME).toMatch(/const H3_CLS = 'font-display text-\[15px\] font-bold leading-\[22px\]/);
  });
});
