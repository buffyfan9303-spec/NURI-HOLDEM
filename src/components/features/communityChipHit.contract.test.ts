// 14-ⓐ — 커뮤니티 '홀덤펍' 분류칩의 **가로** 히트영역 계약.
//
// 실측(2026-09-21 · dev 5173 · Pixel 7 UA · 375×812 · elementFromPoint 격자 전수):
//   · 고치기 전 — 세로 46.75px 은 `h-11` 로 확보돼 있었지만 **가로가 '전체' 22.05px · 나머지 33.06px** 였다.
//   · 그리고 가로만 넓히면 끝이 아니었다: 칩 상자(46.75px)가 `h-6` 레일 밖으로 아래로 10.6px 넘치는데
//     그 자리에 **섹션 헤더(top 281.2)가 겹쳐** 칩 아래 6줄의 elementFromPoint 가 헤더 글자를 돌려줬다
//     ('전체'·'유튜버' 는 폭 0 까지 떨어졌다). 상자를 키우는 것만으로는 안 닫힌다 — 겹침 순서도 같이 정해야 한다.
//   · 고친 뒤 — 5칩 전부 유효 히트영역 44×46.75, 칩끼리 오탭 0(격자 전수, 건너뛴 점 0),
//     '+ 그룹 만들기'(69.33px)까지 한 줄(레일 scrollWidth==clientWidth==375, 여유 43.17px).
//
// ⚠ 넓힐 때 `.hit`(::after 오버행)을 쓰면 안 된다: 필요한 오버행이 좌우 10.97+5.47=16.44px 인데
//   칩 간격이 12.75px 라 **옆 칩을 덮어** 오탭이 난다. 그래서 상자 자체를 키우고 간격을 줄였다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./CommunityTab.tsx', import.meta.url), 'utf8');

describe('커뮤니티 분류칩 히트영역', () => {
  it('칩 상자가 가로 44px 이상이고 가운데 정렬이다', () => {
    const btn = SRC.match(/'shrink-0 inline-flex h-11[^']*'/)?.[0];
    expect(btn, '종류 필터 칩의 className 을 못 찾았다 — 계약이 대상을 놓쳤다').toBeTruthy();
    expect(btn).toContain('min-w-[44px]');   // 가로 22.05px → 44px
    expect(btn).toContain('justify-center');
    expect(btn).toContain('h-11');           // 세로 46.75px 유지
  });

  it('칩 레일이 섹션 헤더보다 위에 쌓인다(아래로 넘치는 10.6px 을 헤더가 가로채지 못하게)', () => {
    expect(SRC).toContain('<div data-main-enter className="relative z-10 h-6">');
  });

  it('간격이 줄어 6칩이 한 줄에 남는다', () => {
    const rail = SRC.match(/className="-my-2\.5 flex items-center gap-[^"]*"/)?.[0];
    expect(rail, '칩 레일 className 을 못 찾았다').toBeTruthy();
    // gap-3(12.75px)을 그대로 두면 5칩×44 + 4×12.75 + '+ 그룹 만들기' 69.33 이 375 를 넘긴다
    expect(rail).not.toContain('gap-3');
    expect(rail).toContain('gap-0.5');
  });
});
