// 탭을 오가도 다시 그릴 이유가 없는 '껍데기'(헤더·하단탭바·사업자 푸터)가 memo 로 막혀 있는지.
//
// 오너 지적(2026-09-19): "메뉴를 이동할 때 움직일 필요가 없는 부분 있잖아 ex)header, footer등
// 동일한 것이 계속 표기되는 부분 이건 굳이 새로고침해서 거기까지 안불러오고 고정시켜도 되지 않아?"
// → 조사 결과 헤더·하단탭바는 이미 memo 였고 **사업자 푸터만 빠져 있었다.**
//
// 🔴 이 계약의 진짜 목적은 memo 가 붙어 있는지가 아니라 **memo 가 무효가 되지 않았는지**다.
//   `memo` 는 prop 이 매 렌더 새 참조로 오면 **에러 없이 조용히 아무 일도 안 한다.**
//   `onOpenLegal={(d) => ...}` 같은 인라인 화살표로 바꾸는 순간 memo 는 장식이 된다 —
//   테스트도 타입도 안 깨지고, 느려진 것을 아무도 모른다. 그래서 전달부까지 같이 잠근다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** 주석을 걷어낸 코드만 — 주석에 적힌 예시가 계약을 통과시키거나 깨뜨리지 않게. */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('앱 껍데기 — 탭을 옮겨도 다시 그리지 않는다', () => {
  it('🔴 사업자 푸터가 memo 로 감싸여 있다', () => {
    const src = codeOnly(read('components/features/BusinessFooter.tsx'));
    expect(src, 'memo 를 import 하지 않았다').toMatch(/import\s*\{[^}]*\bmemo\b[^}]*\}\s*from\s*'react'/);
    expect(src, "export default 가 memo(...) 가 아니다 — memo 를 붙여도 export 가 맨몸이면 아무 효과가 없다")
      .toMatch(/export\s+default\s+memo\(\s*BusinessFooter\s*\)/);
  });

  it('🔴 헤더·하단탭바도 memo 다 (이미 그랬다 — 누가 풀면 여기서 걸린다)', () => {
    const app = codeOnly(read('App.tsx'));
    expect(app, 'AppHeader 가 memo 가 아니다').toMatch(/const\s+AppHeader\s*=\s*memo\(/);
    expect(app, 'MobileTabBar 가 memo 가 아니다').toMatch(/const\s+MobileTabBar\s*=\s*memo\(/);
  });

  it('🔴 푸터에 넘기는 콜백이 안정 참조다 — 이게 깨지면 memo 가 조용히 무효가 된다', () => {
    const app = codeOnly(read('App.tsx'));

    // ① 두 콜백이 useCallback 으로 만들어진다
    expect(app, 'openLegal 이 useCallback 이 아니다').toMatch(/const\s+openLegal\s*=\s*useCallback\(/);
    expect(app, 'openSupport 가 useCallback 이 아니다').toMatch(/const\s+openSupport\s*=\s*useCallback\(/);

    // ② 전달부가 **그 변수 그대로**여야 한다. 인라인 화살표면 매 렌더 새 참조라 memo 가 죽는다.
    const usage = app.match(/<BusinessFooter[^>]*\/>/s);
    expect(usage, 'App.tsx 에서 BusinessFooter 사용부를 찾지 못했다 — 이 계약이 아무것도 안 보고 있다').not.toBeNull();
    expect(usage![0], 'BusinessFooter 에 인라인 화살표를 넘기면 memo 가 무효가 된다 — useCallback 변수를 그대로 넘겨라')
      .not.toMatch(/=>/);
    expect(usage![0]).toMatch(/onOpenLegal=\{openLegal\}/);
    expect(usage![0]).toMatch(/onOpenSupport=\{openSupport\}/);
  });
});
