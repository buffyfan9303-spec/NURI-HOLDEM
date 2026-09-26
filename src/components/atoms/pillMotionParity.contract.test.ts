// 알약(SlidingPill) 인디케이터 — CSS FLIP 경로가 VT 와 겹치지 않고, 숨었다 보이는 판에서도 다시 잰다.
//
// 이 파일의 내력 (2026-09-17 오너 지시: "알약의 모션이나 이동을 모든 메뉴에서 통일시켜줘")
//   원래는 알약이 움직이는 두 길 — ① CSS FLIP(SlidingPill.tsx) · ② 하위 탭 View Transition(index.css 의
//   `*-pill` group 규칙) — 이 **같은 토큰(--dur-base·--ease-move)** 을 쓰는지와, `*-label` 이름이
//   group/old/new 세 목록에 빠짐없이 등록됐는지를 잠갔다. 실측(2026-09-17): `*-pill` 10개 전부
//   애니메이션 규칙 0건이라 ②가 브라우저 기본값(0.25s·ease)으로 돌아 같은 알약이 화면마다 다르게 움직였다.
//
//   2026-09-18 하위 탭 VT 를 걷어냈다(src/lib/subTabTransition.ts — commit() 직접 호출).
//   `html[data-vt-scope=…]` 규칙과 `*-pill`·`*-label` 이름이 전부 사라져 ② 경로가 없다 —
//   짝 맞출 상대가 없으니 토큰 동등·라벨 목록 검사는 지웠다(하위 탭 VT 를 되살리면 같이 되살릴 것).
//   남는 것은 ① 경로 자체의 두 계약이다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PILL = readFileSync(join(__dirname, './SlidingPill.tsx'), 'utf8');

describe('알약(SlidingPill) — CSS FLIP 경로', () => {
  it('첫 배치·자리 보정만 전환 없이 가고, 그 밖의 이동은 CSS FLIP 하나로 미끄러진다', () => {
    // 🔴 2026-09-26 — View Transition 을 앱에서 전부 걷었다(src/components/transitionDevices.contract.test.ts (a)).
    //   예전엔 'VT 캡처 중이면 즉시 이동' 분기가 있었다(두 경로가 겹치면 A→A 보간). 이제 경로가 하나라 그 분기는 없다 —
    //   되살아나면(VT 판정 import) 죽은 경로가 다시 생긴 것이다.
    expect(PILL).toMatch(/if \(first \|\| !prev\) \{/);
    expect(PILL).not.toMatch(/from '[^']*viewTransition'|isViewTransitionActive\(\)/);
  });

  it('숨어 있다 보이게 된 판에서도 다시 잰다 — 마운트 타이머만으로는 못 깨운다', () => {
    // 2026-09-17 라이브 재현: 커뮤니티 첫 진입 시 알약이 3초 뒤에도 opacity 0 이었다.
    // 타이머(150~5000ms)는 마운트 기준이라 숨은 동안 전부 소진된다 → IntersectionObserver 가 필요하다.
    // ⚠ toContain('IntersectionObserver') 로 쓰면 안 된다 — `IntersectionObserverX` 같은 오타도 통과한다
    //   (2026-09-17 음성 대조로 실제로 잡았다). 생성과 관찰 대상까지 정확히 본다.
    expect(PILL, 'IntersectionObserver 가닥이 빠졌다 — keep-alive 판이 켜질 때 알약이 안 나타난다')
      .toMatch(/new IntersectionObserver\(/);
    expect(PILL, 'IntersectionObserver 가 컨테이너를 관찰하지 않는다').toMatch(/io\.observe\(container\)/);
    expect(PILL, 'IntersectionObserver 를 정리하지 않는다(누수)').toMatch(/io\.disconnect\(\)/);
  });
});
