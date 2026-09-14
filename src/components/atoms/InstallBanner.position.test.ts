// 홈 화면 추가 배너 위치 회귀 게이트 (2026-09-14 오너 지시: "하단 메뉴바쪽으로 조금 더 내려줘").
//
// 왜: `--tabbar-float`(index.css)는 이 배너·Toast·맨 위로 버튼(App.tsx) 셋이 공유하는 변수라
//   값 자체를 낮추면 셋 다 낮아진다. 오너 지시는 이 배너 하나만이었으므로, 변수는 그대로 두고
//   이 배너의 bottom 값에만 더 작은 rem 상수(4.5rem, 종전 5.75rem)를 하드코딩했다 —
//   safe-area(env(safe-area-inset-bottom))와 삼성 보정(--tabbar-lift) 항은 그대로 물려받는다.
//   실측(390×844·360×740, safe-area 0): 탭바까지 여백이 35.5px → 14.25px 로 줄었고, 탭 버튼
//   히트 영역(elementFromPoint)과 설치/닫기 버튼 모두 서로 가리지 않음을 확인했다.
//
// 못 보는 것: 실제 렌더 위치(위 실측이 그 증거 — design 재확인 몫). 이 테스트는 소스 계약만 잠근다.
// 음성 대조(2026-09-14 실행 확인): InstallBanner.tsx 의 모바일 bottom 을 다시 `var(--tabbar-float)`
//   로 되돌리면 첫 번째 테스트가, `env(safe-area-inset-bottom)` 나 `--tabbar-lift` 를 지우면
//   두 번째 테스트가 빨개진다.
// 실행: npx vitest run src/components/atoms/InstallBanner.position.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src', 'components', 'atoms', 'InstallBanner.tsx'), 'utf8');
const CSS = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

describe('InstallBanner 위치 — 하단 탭바 쪽으로 낮췄지만 공유 변수는 안 건드림', () => {
  it('모바일 bottom 이 종전 --tabbar-float(5.75rem) 대신 더 작은 4.5rem 을 쓴다', () => {
    const m = SRC.match(/className="fixed bottom-\[([^\]]+)\]/);
    expect(m, 'InstallBanner 의 fixed bottom 클래스를 찾지 못했다').toBeTruthy();
    expect(m![1], '--tabbar-float 를 그대로 쓰면 다시 35.5px 여백으로 돌아간다').not.toContain('var(--tabbar-float)');
    expect(m![1]).toContain('4.5rem');
  });

  it('safe-area(env)·삼성 보정(--tabbar-lift) 항은 그대로 물려받는다', () => {
    const m = SRC.match(/className="fixed bottom-\[([^\]]+)\]/);
    expect(m![1]).toContain('env(safe-area-inset-bottom)');
    expect(m![1]).toContain('var(--tabbar-lift)');
  });

  it('PC(lg:bottom-3)는 손대지 않았다', () => {
    expect(SRC).toContain('lg:bottom-3');
  });

  it('--tabbar-float 공유 변수 자체와 그 값을 쓰는 다른 소비처(Toast·scroll-top-fab)는 그대로다', () => {
    expect(CSS).toMatch(/--tabbar-float:\s*calc\(5\.75rem/);
    const toast = readFileSync(join(process.cwd(), 'src', 'components', 'atoms', 'Toast.tsx'), 'utf8');
    expect(toast).toContain('bottom-[var(--tabbar-float)]');
    const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(app).toContain('bottom-[var(--tabbar-float)]');
  });
});
