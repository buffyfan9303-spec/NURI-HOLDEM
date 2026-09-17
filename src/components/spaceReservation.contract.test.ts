// "자리를 안 잡아 화면이 튄다" 재발 방지 계약 (2026-09-17 반응형 전수 감사)
//
// 무엇을 막는가
//   데이터·청크가 도착하기 **전에 그 자리를 미리 잡지 않으면**, 도착하는 순간 아래가 통째로 밀린다.
//   이 저장소는 같은 병을 이미 여러 번 앓았다 — 2026-09-10 '툭'의 최대 단일 원인으로 지목됐고,
//   2026-09-17 전수 감사에서 **네 곳이 더** 나왔다. 개별 수치가 아니라 **조리법**을 잠근다.
//
// 실측 근거 (2026-09-17 · 라이브 · 탭 직접 진입 직후 · 스크롤 전 · CLS 0.1 양호 / 0.25 불량)
//   ① LazyFallback 이 스피너 높이(≈228px)만 잡아 **첫 화면에 사업자 푸터가 떴다가 밀렸다**
//      tools 0.63 · market 0.53 · home 0.32 · browse 0.32 · live 0.30+0.30 · community 0.19
//   ② 홈 '추천 대회' 레일은 `rail.length > 0` 일 때만 그려 로딩 중 자리가 **0**(실제 274.8px)
//   ③ 일정 탐색 스켈레톤이 토큰을 안 쓰고 6행 고정(642.5px) — 실제는 232.9px
//   ④ 같은 토큰을 `min-h`(border 박스)와 `contain-intrinsic-size`(**content 박스**)가 공유해
//      화면 밖 행이 행마다 +22.1px 과대평가됐다(긴 목록에서 스크롤바가 튄다)
//
// 이 검사가 못 보는 것
//   · 실제 CLS 값(브라우저 실측 몫). 여기서는 **조리법이 자리에 있는지**만 본다.
//   · 예약한 높이가 '정확한지'. 그건 `e2e/theme-tokens-v7.spec.ts` ⑦ 이 폭별로 잰다.
// 실행: npx vitest run src/components/spaceReservation.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const APP = readFileSync(join(root, 'src', 'App.tsx'), 'utf8');
const HOME = readFileSync(join(root, 'src', 'components', 'features', 'HomeTab.tsx'), 'utf8');
const CSS = readFileSync(join(root, 'src', 'index.css'), 'utf8');

describe('① 지연 로딩 폴백이 화면 높이를 예약한다', () => {
  it('LazyFallback 이 뷰포트 기준 min-h 를 갖는다 — 푸터가 첫 화면 위로 못 올라온다', () => {
    const m = APP.match(/function LazyFallback\(\)[\s\S]{0,600}?\n}/);
    expect(m, 'LazyFallback 이 사라졌다 — 계약을 같이 고쳐라').not.toBeNull();
    expect(m![0], '스피너 높이만 잡고 있다(예전 py-24). 화면 높이를 예약해야 푸터가 안 올라온다')
      .toMatch(/min-h-\[calc\(100svh/);
  });

  // ⚠ '동적 뷰포트 단위 금지'는 여기서 **다시 검사하지 않는다.**
  //   `dynamicViewportUnit.contract.test.ts` 가 이미 src 전체를 훑고 있고, 같은 규칙을 두 벌로 두면
  //   한쪽만 고쳐지는 날이 온다. 게다가 그 판정기는 **주석을 지우고 코드만** 보므로, 금지 단위를
  //   단언에 문자 그대로 적으면 이 파일 자신이 그 계약에 걸린다(2026-09-17 실제로 걸렸다 —
  //   CLAUDE.md 가 Tailwind 쪽에서 경고하는 '금지하려는 이름을 그대로 쓰지 마라'와 같은 부류).
});

describe('②③ 목록 스켈레톤은 개수와 높이를 둘 다 실제와 맞춘다', () => {
  it('일정 탐색 스켈레톤 행이 카드 높이 토큰을 쓴다', () => {
    const m = APP.match(/function ScheduleSkeletonGrid[\s\S]{0,2600}?\n}/);
    expect(m, 'ScheduleSkeletonGrid 가 사라졌다').not.toBeNull();
    expect(m![0], '행이 내용 높이만 차지한다 — 실제 카드 높이(--card-h-list)를 예약해야 한다')
      .toMatch(/min-h-\[var\(--card-h-list\)\]/);
  });

  it('일정 탐색 스켈레톤 개수가 고정이 아니라 지난 방문 기준이다', () => {
    expect(APP, 'rows 를 안 받는다 — 6행 고정이면 실제가 2행일 때 그만큼 위로 당겨진다')
      .toMatch(/ScheduleSkeletonGrid[\s\S]{0,200}rows\?: number/);
    expect(APP).toMatch(/readSeenCount\(BROWSE_SEEN/);
    expect(APP, '이번에 그린 줄 수를 기억하지 않으면 다음 방문도 기본값으로 튄다')
      .toMatch(/writeSeenCount\(BROWSE_SEEN/);
  });

  it('홈 추천 레일도 로딩 중 자리를 잡는다', () => {
    expect(HOME, '레일이 rail.length>0 일 때만 그려지면 로딩 중 예약이 0 이다')
      .toMatch(/railSeenCount\(\) > 0/);
    expect(HOME).toMatch(/writeSeenCount\(RAIL_SEEN/);
  });

  it('줄 수 조리법이 한 곳에 있다 — 홈과 일정 탐색이 같은 함수를 쓴다', () => {
    // 두 벌이 되면 한쪽만 고쳐지는 날이 온다(nuri-single-source).
    for (const [name, src] of [['App.tsx', APP], ['HomeTab.tsx', HOME]] as const) {
      expect(src, `${name} 가 공용 헬퍼를 안 쓴다`).toMatch(/from '\.{1,2}\/(\.\.\/)?lib\/seenCount'/);
    }
  });
});

describe('④ 같은 토큰을 border 박스와 content 박스가 공유하지 않는다', () => {
  it('contain-intrinsic-size 쪽에서 padding 을 뺀다', () => {
    // cis 는 **콘텐츠 박스** 크기라 padding 이 그 위에 더 붙는다(이 파일 머리말의 +22.1px).
    // 토큰 자체는 min-h(=border 박스)가 쓰므로, 빼는 쪽은 cis 여야 한다.
    expect(CSS, '.cv-card-list 가 토큰을 그대로 써서 화면 밖 카드를 과대평가한다')
      .toMatch(/\.cv-card-list\s*\{[^}]*contain-intrinsic-size:\s*auto\s+calc\(var\(--card-h-list\)\s*-/);
    expect(CSS, '.cv-row-sm 도 같은 함정이다')
      .toMatch(/\.cv-row-sm\s*\{[^}]*contain-intrinsic-size:\s*auto\s+calc\(var\(--row-h-sm\)\s*-/);
  });
});
