// 하단 탭바 회피 예약은 **정확히 한 곳**이다 — 문서 끝(BusinessFooter).
//
// 왜 계약이 필요한가 (2026-09-17)
//   모바일에서 떠 있는 하단 탭바 뒤로 문서 끝이 들어가지 않게 자리를 비워 둬야 한다.
//   그런데 그 예약이 **두 곳**에 있었다:
//     ① index.css  `main { padding-bottom: var(--tabbar-safe) !important }`
//     ② BusinessFooter.tsx `pb-[calc(var(--tabbar-safe)+0.5rem)]`
//   ①은 '문서의 마지막 요소가 main 이던 시절' 의 것이다. 지금은 PG·카카오 심사 요건으로
//   BusinessFooter 가 전 화면 하단에 상시 렌더되고(App.tsx, main 의 형제이자 뒤) ②가 같은 일을 한다.
//   두 번 비워 두니 본문 끝과 사업자정보 사이에 죽은 띠가 생겼다 —
//   라이브 실측(375px · 홈 · 문서 끝): 본문 끝 → 푸터 시작 **131.0px**, 푸터 끝 → 탭바 윗변 **128.3px**.
//   문서 끝에서는 탭바가 의도적으로 숨기까지 한다 → 비워 둔 자리를 쓸 것이 아예 없다.
//   오너 결정(2026-09-17): **본문 쪽 예약만 없앤다.**
//
// 그래서 이 파일이 지키는 것은 **양쪽**이다.
//   · ①이 되살아나면 → 죽은 띠가 다시 생긴다(사람 눈에는 '그냥 여백'이라 아무도 신고하지 않는다)
//   · ②가 사라지면 → 문서 끝이 탭바 뒤로 들어간다(진짜 가림 = 되돌아온 원래 버그)
//   하나만 단언하면 반대쪽으로 굴러떨어진다.
//
// ⚠ 이 예약의 단일 소스는 `--tabbar-safe` 다. 임의 상수(110px 등)를 새로 만들지 마라.
// ⚠ `scroll-margin-bottom: var(--tabbar-safe)` 는 **별개**다(포커스 스크롤은 뷰포트만 보고 떠 있는 탭바를 모른다).
//    레이아웃을 한 픽셀도 바꾸지 않으므로 이 계약의 대상이 아니다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const CSS = read('../../index.css');
const FOOTER = read('./BusinessFooter.tsx');
const APP = read('../../App.tsx');

const SAFE = '--tabbar-safe';

describe('하단 탭바 회피 — 예약은 문서 끝 한 곳뿐이다', () => {
  it('정규식이 죽으면 조용히 통과하는 것을 막는다 — 재료가 실제로 있다', () => {
    expect(CSS.length).toBeGreaterThan(10_000);
    expect(CSS).toContain(`${SAFE}:`);              // 토큰 정의가 있다
    expect(FOOTER).toContain('<footer');
    expect(APP).toContain('BusinessFooter');
  });

  it('🔴 예약을 하는 쪽: BusinessFooter 가 아래쪽에 --tabbar-safe 를 비워 둔다', () => {
    // 루트 <footer …> 한 줄만 본다 — 안쪽 요소의 pb 는 이 계약과 무관하다.
    const root = FOOTER.match(/<footer[^>]*>/)?.[0] ?? '';
    expect(root, 'BusinessFooter 루트를 못 찾았다').not.toBe('');
    expect(root, `BusinessFooter 루트가 아래쪽에 ${SAFE} 를 예약하지 않는다 — 문서 끝이 탭바 뒤로 들어간다`)
      .toMatch(new RegExp(`pb-\\[[^\\]]*${SAFE}[^\\]]*\\]`));
  });

  it('🔴 예약을 하지 않아야 하는 쪽: main 에 --tabbar-safe 하단 패딩이 없다(이중 예약 = 죽은 띠)', () => {
    // `main { … padding-bottom: var(--tabbar-safe) … }` 형태를 잡는다. 주석은 제외한다.
    const noComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const mainBlocks = [...noComments.matchAll(/(^|[\s,}])main\s*\{([^}]*)\}/g)].map((m) => m[2]);
    const offenders = mainBlocks.filter((b) => /padding-bottom\s*:[^;]*--tabbar-safe/.test(b));
    expect(offenders, `main 의 하단 패딩이 ${SAFE} 를 다시 예약한다 — 푸터가 이미 한다(본문 끝과 사업자정보 사이에 죽은 띠)`)
      .toEqual([]);
  });

  it('BusinessFooter 는 main 뒤에 있어야 한다 — 그래야 푸터의 예약이 문서 끝을 덮는다', () => {
    const iMain = APP.indexOf('<main');
    const iFooter = APP.indexOf('<BusinessFooter');
    expect(iMain, 'App.tsx 에서 <main 을 못 찾았다').toBeGreaterThan(-1);
    expect(iFooter, 'App.tsx 에서 <BusinessFooter 를 못 찾았다').toBeGreaterThan(-1);
    expect(iFooter, 'BusinessFooter 가 main 보다 앞에 있다 — 문서 끝을 덮지 못한다').toBeGreaterThan(iMain);
  });

  it('예약 값의 단일 소스를 쓴다 — 푸터가 임의 px 상수로 갈아타지 않았다', () => {
    const root = FOOTER.match(/<footer[^>]*>/)?.[0] ?? '';
    // pb-[숫자px] 같은 하드코딩이 루트에 들어오면 토큰과 어긋나 조용히 틀어진다.
    expect(root, '푸터 루트가 하단 여백을 px 상수로 박았다 — --tabbar-safe 를 써라')
      .not.toMatch(/pb-\[\d+(\.\d+)?px\]/);
  });
});
