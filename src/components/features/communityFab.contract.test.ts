// 게시판 글쓰기 FAB 위치 계약 (오너 2026-10-04 15시 "글쓰기가 너무 중간 — 우측 하단으로").
//
// 무엇을 막는가
//   · FAB 는 하단 탭바 바로 위(간격 15px)·오른쪽 16px 에 떠 있어야 한다. 예전 bottom 은 '탭바 위 떠 있는 요소' 공용 변수
//     (--tabbar-float ≈ 109.75px) + 4rem ≈ 178px 이라 탭바 위 ~104px — 오너 실기기 캡처의 "목록 한가운데" 가 그것이었다.
//   · 위치가 뷰포트 높이(vh 계열 단위·innerHeight·visualViewport)에 기대면 하단 주소창(삼성 인터넷 등)이 접히고 펴질 때
//     탭바(fixed bottom-0)와 따로 논다. 하네스(Pixel 7)는 주소창 접힘이 없어 **재현이 안 되므로** 소스에서 막는다.
//   · 탭바 nav 의 safe-area 항(App.tsx nav paddingBottom)과 **같은 식**을 써야 홈 인디케이터 기기에서도 간격이 유지된다.
//   · sticky 여야 한다 — 피드 끝에서 제 칸에 내려앉아 아래 푸터(법정 고지·사업자 정보)를 덮지 않는다(board-oneline ⑧).
//   · 게시판에서 '맨 위로'(같은 right-4 열)가 FAB 왼쪽 같은 줄로 비켜서는 신호(위로 비키면 피드 끝에서 sticky FAB 가 쓸려 올라와 겹쳤다 — PR #155 검토 P1)(html[data-board-fab])와 그 CSS 규칙이 짝으로 있어야 한다.
// 실측(2026-10-04, 390×640 · 운영 데이터): 수정 전 FAB–탭바 간격 112px → 수정 후 15px. 실화면 단언은 e2e/board-oneline.spec.ts ⑤·⑫.
// 실행: npx vitest run src/components/features/communityFab.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TAB = readFileSync(new URL('./CommunityTab.tsx', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

// FAB 칸 = data-board-fab-slot 이 붙은 div 의 여는 태그(style·className 포함)
const slot = TAB.match(/<div data-board-fab-slot=""[^>]*>/)?.[0] ?? '';
const bottom = slot.match(/bottom:\s*'([^']+)'/)?.[1] ?? '';
const SAFE = "min(env(safe-area-inset-bottom), 0.5rem)";

describe('게시판 글쓰기 FAB 는 탭바 바로 위 오른쪽에 선다', () => {
  it('FAB 칸을 찾는다(대상 소실 방지)', () => {
    expect(slot, 'data-board-fab-slot 칸을 못 찾았다 — 계약이 대상을 놓쳤다').not.toBe('');
    expect(bottom, 'FAB 칸의 inline bottom 을 못 찾았다').not.toBe('');
    expect(TAB).toMatch(/data-board-fab-slot=""[^>]*>\s*<button type="button" data-testid="board-write"/);
  });

  it('위치가 뷰포트 높이에 기대지 않는다(주소창 접힘/펼침에 탭바와 따로 놀지 않게)', () => {
    expect(bottom).not.toMatch(/\d(?:d|s|l)?v(?:h|b|min|max)\b/);
    expect(bottom).not.toMatch(/innerHeight|visualViewport|clientHeight/);
    // 탭바 위 '떠 있는 요소' 공용 기준(≈109.75px)은 탭바 윗변보다 44px 높다 — 그걸 기준 삼으면 다시 중간에 뜬다
    expect(bottom).not.toContain('--tabbar-float');
  });

  it('탭바 nav 와 같은 safe-area 항 + 탭바 높이 위 12~16px', () => {
    expect(APP, 'App.tsx 탭바 nav 의 safe-area 식이 바뀌었다 — FAB 식도 같이 바꿔라').toContain(`paddingBottom: '${SAFE}'`);
    expect(bottom).toContain(SAFE);
    const rem = Number(bottom.match(/calc\(([\d.]+)rem\s*\+/)?.[1]);
    // 탭바 nav 높이 65.75px(safe-area 0, 2026-10-04 실측) · 루트 글자 17px
    const gap = rem * 17 - 65.75;
    expect(gap, `탭바 위 간격 ${gap}px`).toBeGreaterThanOrEqual(12);
    expect(gap, `탭바 위 간격 ${gap}px`).toBeLessThanOrEqual(16);
  });

  it('sticky 로 선다(피드 끝에서 제 칸에 내려앉아 푸터를 덮지 않는다) · 하위 탭 바(z-30) 밑 · PC 숨김', () => {
    expect(slot).toMatch(/className="[^"]*\bsticky\b/);
    expect(slot).not.toMatch(/className="[^"]*\bfixed\b/);
    expect(slot).toMatch(/\bz-20\b/);
    expect(slot).toMatch(/\blg:hidden\b/);
  });

  it("게시판에서 '맨 위로'가 FAB 왼쪽 같은 줄로 비켜선다 — 신호와 규칙이 짝으로 있다", () => {
    expect(TAB).toMatch(/const boardFab = active && section === 'board'/);
    // M5-03: 신호는 '게시판이 보임' 만이 아니라 'FAB 가 떠 있음' — 피드 끝에서 FAB 가 올라가 자리를 떠나면 '맨 위로'가 원래 기둥으로 돌아온다
    // PR #171 P3: 판정은 scroll 이벤트 안에서 칸의 실제 위치로 **동기** 한다(IO→React 상태 경로는 8프레임 늦어 빠른 플링에서 겹쳤다).
    //   오른쪽 기둥 복귀 기준 = FAB_RISEN_PX + 방금 프레임 스크롤 거리 × FAB_LEAD_FRAMES (빨리 튕길수록 더 멀리 떠난 뒤에만)
    const block = TAB.slice(TAB.indexOf('const boardFab = active'), TAB.indexOf('}, [boardFab]);'));
    expect(block.length, '신호 effect 블록을 못 찾았다').toBeGreaterThan(200);
    expect(block).not.toMatch(/IntersectionObserver/);
    expect(TAB).not.toMatch(/setFabRisen/);
    expect(TAB).toMatch(/window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
    expect(TAB).toMatch(/const lift = r && r\.height > 0 && Number\.isFinite\(stuck\) \? root\.clientHeight - stuck - r\.bottom : 0/);
    expect(TAB).toMatch(/root\.toggleAttribute\('data-board-fab', !\(lift > FAB_RISEN_PX \+ FAB_LEAD_FRAMES \* dy\)\)/);
    expect(TAB).toMatch(/const FAB_LEAD_FRAMES = [2-9]/);
    expect(TAB).toMatch(/settle = window\.setTimeout\(\(\) => sync\(0\), \d+\)/);   // 멈춘 자리에서 속도 0 으로 다시 판정
    const m = CSS.match(/@media \(max-width: 1023\.98px\) \{ html\[data-board-fab\] \.scroll-top-fab \{ transition: ([^;]+); transform: ([^;]+); \} \}/);
    // 왼쪽(FAB 옆)으로 가는 움직임은 즉시여야 한다 — transform 전환이 남으면 미끄러지는 동안 FAB 와 겹친다
    expect(m?.[1] ?? '', "게시판 '맨 위로' 규칙의 transition 은 opacity 만이다").toMatch(/^opacity [^,]+$/);
    const rule = m?.[2] ?? '';
    expect(rule, "게시판 '맨 위로' 규칙을 못 찾았다").not.toBe('');
    // 옆 칸: 가로로 FAB 지름(3rem)+간격만큼 왼쪽 — 세로로만 비키면 피드 끝에서 sticky FAB 가 쓸려 올라와 겹친다(PR #155 P1)
    expect(rule).toMatch(/^translate\(-3\.5rem, /);
    // 세로 중심 맞춤 — 두 버튼의 safe-area 항(맨 위로 = max(…,12px), FAB = min(…,0.5rem))을 같이 따라간다
    expect(rule).toContain('max(env(safe-area-inset-bottom), 12px)');
    expect(rule).toContain(`- ${SAFE}`);
  });
});
