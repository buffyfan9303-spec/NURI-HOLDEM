// 알약(인디케이터) 모션은 **모든 메뉴에서 같다**.
//
// 왜 계약이 필요한가 (2026-09-17 오너 지시: "알약의 모션이나 이동을 모든 메뉴에서 통일시켜줘")
//   알약이 움직이는 길이 둘이다:
//     ① CSS FLIP        — SlidingPill.tsx 가 `transform var(--dur-base) var(--ease-move)` 로 직접 민다
//     ② View Transition — VT 스코프 안에서는 SlidingPill 이 최종 위치로 **즉시 점프**하고 보간을 VT 에 위임한다
//   그런데 ②에 **아무 규칙도 없었다**. 실측(2026-09-17): `*-pill` 이름 10개 전부 애니메이션 규칙 0건.
//   같은 자리의 `*-label` 은 10개 모두 정확히 3건씩이었다 — **라벨만 통일돼 있었다.**
//   결과: ②는 브라우저 기본값(0.25s · ease), ①은 0.22s · ease-move → 같은 알약인데 화면마다 다르게 움직였다.
//
// 이 파일이 지키는 것
//   · 이름이 붙은 알약은 **빠짐없이** group 규칙을 갖는다(하나라도 빠지면 그 화면만 브라우저 기본값으로 돈다)
//   · 그 규칙이 CSS FLIP 과 **같은 토큰**을 쓴다(값을 두 벌로 갈라놓지 않는다)
//   · `animation: none` 으로 꺼 버리지 않는다 — 끄면 알약이 미끄러지지 않고 순간이동한다
//
// ⚠ 이건 '이징 토큰 체계'를 다시 만드는 것이 아니다(2026-09-07 에 삭제된 그 규칙들과 다르다).
//    **한 컴포넌트의 두 실행 경로가 같은 값을 쓰는지**만 본다. 새 토큰을 만들지 않는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(__dirname, '../../index.css'), 'utf8');
const PILL = readFileSync(join(__dirname, './SlidingPill.tsx'), 'utf8');

/** index.css 가 `view-transition-name: …-pill` 로 이름을 주는 알약 전부 */
const named = [...CSS.matchAll(/view-transition-name:\s*([a-z0-9-]+-pill)\s*;/g)].map((m) => m[1]);
/** group 규칙이 걸린 알약 전부 */
const grouped = new Set([...CSS.matchAll(/::view-transition-group\(([a-z0-9-]+-pill)\)/g)].map((m) => m[1]));

describe('알약 모션 — 모든 메뉴에서 같은 값으로 움직인다', () => {
  it('정규식이 죽으면 조용히 통과하는 것을 막는다 — 이름이 여럿 잡힌다', () => {
    expect(named.length, '알약 이름을 하나도 못 찾았다(정규식이 죽었다)').toBeGreaterThanOrEqual(8);
    expect(PILL).toContain('isViewTransitionActive');
  });

  it('🔴 이름이 붙은 알약은 빠짐없이 group 규칙을 갖는다', () => {
    const missing = named.filter((n) => !grouped.has(n));
    expect(missing, `이 알약들이 브라우저 기본값(0.25s·ease)으로 돈다 — 그 화면만 모션이 다르다: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('🔴 VT 경로가 CSS FLIP 과 같은 토큰을 쓴다 — 값을 두 벌로 갈라놓지 않는다', () => {
    // SlidingPill 의 FLIP 선언에서 실제로 쓰는 토큰을 읽어 온다(하드코딩 대조가 아니라 소스 대조).
    const flip = PILL.match(/transition\s*=\s*['"`]transform (var\(--[a-z-]+\)) (var\(--[a-z-]+\))/);
    expect(flip, 'SlidingPill 의 FLIP transition 선언을 못 찾았다').not.toBeNull();
    const [, dur, ease] = flip!;

    // 그 두 토큰이 group 규칙 블록에 그대로 쓰여야 한다.
    const block = CSS.match(/::view-transition-group\([a-z0-9-]+-pill\)[\s\S]{0,700}?\{([^}]*)\}/);
    expect(block, 'group 규칙 블록을 못 찾았다').not.toBeNull();
    const body = block![1];
    expect(body, `VT 경로의 duration 이 FLIP 과 다르다 — FLIP 은 ${dur}`).toContain(`animation-duration: ${dur}`);
    expect(body, `VT 경로의 곡선이 FLIP 과 다르다 — FLIP 은 ${ease}`).toContain(`animation-timing-function: ${ease}`);
  });

  it('🔴 알약 group 을 animation:none 으로 끄지 않는다 — 끄면 미끄러지지 않고 순간이동한다', () => {
    // `::view-transition-group(…-pill) … { … animation: none … }` 형태를 잡는다.
    const offenders = [...CSS.matchAll(/::view-transition-group\(([a-z0-9-]+-pill)\)[^{]*\{([^}]*)\}/g)]
      .filter((m) => /animation:\s*none/.test(m[2]))
      .map((m) => m[1]);
    expect(offenders, `이 알약은 VT 보간이 꺼져 있어 순간이동한다: ${offenders.join(', ')}`).toEqual([]);
  });

  it('SlidingPill 은 VT 중에 CSS 전환을 끄고 위치만 확정한다 — 두 경로가 겹치면 A→A 를 보간해 안 움직인다', () => {
    expect(PILL).toMatch(/if \(first \|\| !prev \|\| isViewTransitionActive\(\)\)/);
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
