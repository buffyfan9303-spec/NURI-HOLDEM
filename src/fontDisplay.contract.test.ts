// 폰트 표시 정책 계약 — "글자가 투명한 프레임" 재발 방지 (오너 2026-09-26 "메인화면 블링크").
//
// 무엇을 보증하나(동작): 브랜드 폰트를 기다리는 동안 글자가 **한 프레임도 투명해지지 않는다.**
//   `font-display: fallback`/`block` 은 '차단 구간'(각각 100ms·3s) 동안 글자를 투명으로 그린다. 그 구간이 첫 React 커밋
//   롱태스크(CPU 4× 500~700ms)와 겹치면 앱 첫 페인트가 차단 구간 안에 떨어져 글자 없는 프레임 11~29개가 났다(실측 2026-09-26,
//   e2e/home-cold-text-pop.spec.ts 가 픽셀로 잡는다). `swap` 은 차단 구간 0 이라 폴백 글꼴로 즉시 보인다.
//   `optional` 은 투명 프레임은 없지만 콜드 진입에 브랜드 폰트가 아예 안 붙는다(2026-08-26~09-13 실제 상태, 기각).
// 왜 소스 계약인가: e2e 게이트는 프로덕션 빌드 + CPU 4× 에서만 잡히고 러너 타이밍에 따라 0~29 프레임으로 흔들린다.
//   정책 파일 한 줄이 원인이므로 여기서 값 자체를 잠근다(스타일 규정이 아니라 '투명 프레임 0' 이라는 동작 보증).
// 이력: bbcf8408(2026-08-26 optional) → 1516e2ed(2026-09-13 fallback, 폰트 활성화) → 2026-09-26 swap(리드 결정).
// 음성 대조: FONT_CSS_PATH 로 옛 CSS(fallback) 를 가리키면 실패한다 — 2026-09-26 실행 확인.
// 실행: npx vitest run src/fontDisplay.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = process.env.FONT_CSS_PATH ?? resolve(__dirname, '../public/fonts/pretendard/pretendardvariable-dynamic-subset.css');
const HTML = resolve(__dirname, '../index.html');

describe('font-display — 브랜드 폰트를 기다리는 동안 글자가 투명해지지 않는다', () => {
  it('서브셋 @font-face 전부가 font-display: swap 이다(차단 구간 0)', () => {
    const css = readFileSync(CSS, 'utf-8');
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length, '@font-face 를 하나도 못 읽었다 — 경로·형식이 바뀌었으면 여기를 고쳐라').toBeGreaterThan(10);
    const display = faces.map((f) => /font-display\s*:\s*([a-z]+)/.exec(f)?.[1] ?? '(없음)');
    const bad = display.map((d, i) => [i, d] as const).filter(([, d]) => d !== 'swap');
    expect(bad, 'swap 이 아닌 face — fallback/block 은 차단 구간에 글자를 투명으로 그린다(FOIT), optional 은 콜드에 폰트가 안 붙는다').toEqual([]);
  });
  it('폰트 CSS 는 <head> 정적 <link> 로 들어간다(유휴 지연 주입 금지 — 늦게 붙으면 글리프 교체가 첫 화면 뒤로 밀려 CLS 0.132)', () => {
    const html = readFileSync(HTML, 'utf-8');
    expect(html).toMatch(/<link[^>]+rel="stylesheet"[^>]+href="\/fonts\/pretendard\/pretendardvariable-dynamic-subset\.css"/);
  });
});
