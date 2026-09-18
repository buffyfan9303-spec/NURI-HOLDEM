// Icon.tsx 밖에 손으로 그린 <svg> 의 **실제 화면 굵기**를 집 규격 안으로 묶는다.
//
// ⚠ 이 검사를 처음 쓸 때 `strokeWidth` 숫자만 비교했다가 **틀렸다**(2026-09-18).
//   strokeWidth 는 **viewBox 좌표계** 값이라 그 숫자만으로는 화면 굵기를 알 수 없다:
//       화면 굵기 = strokeWidth × (렌더 크기 ÷ viewBox 크기)
//   그래서 9px 배지 체크마크의 `strokeWidth="3.5"`(viewBox 24)는 규격 위반이 아니라
//   **크기 보정**이다 — 실제로는 3.5 × 9/24 = 1.3px 로, 24px 아이콘의 2px 보다 오히려 얇다.
//   겉보기 숫자로 세면 "굵기가 11가지나 된다" 는 **거짓 결론**이 나온다(실제로 그렇게 오판했다).
//   실측으로 다시 재니 65개 중 60개가 1.1~2.3px 밴드 안에 이미 들어 있었다.
//
// 그래서 이 검사는 **곱한 값**을 본다. 밴드는 1.1~2.5px:
//   Icon.tsx 규격(stroke 2 · viewBox 24)을 14~28px 로 그리면 1.17~2.33px 가 나온다 — 그 범위다.
//
// 무엇을 못 보나: `width` 를 안 적고 CSS(className)로 크기를 정하는 svg 는 정적으로 계산할 수 없다.
//   그런 것은 건너뛴다 — 재지 못하는 것을 통과로 위장하지 않으려고 아래에서 **잰 개수를 단언**한다.
//
// 실행: npx vitest run src/components/atoms/inlineSvgStroke.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

/** 아이콘이 아닌 것 — 자기 좌표계를 갖는 그림이라 아이콘 굵기 규격을 적용할 수 없다. */
const EXEMPT = new Set([
  'atoms/NuriHoldemLogo.tsx',
  'atoms/NuriMark.tsx',
  'atoms/RotiArenaLogo.tsx',
  'atoms/EmptyState.tsx',                 // 빈 상태 일러스트
  'features/PostAttachments.tsx',         // 카드 그래픽
  'features/EventPage.tsx',               // 장식 패턴
  'features/CustomerDashboardPage.tsx',   // 순위 추이 차트
  'features/VoucherWallet.tsx',           // 88px 전체화면 확인 체크마크(아이콘 아님)
]);

/** 화면 굵기 밴드(px). 벗어나면 옆 아이콘과 두께가 달라 보인다. */
const MIN = 1.1;
const MAX = 2.5;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** 따옴표 안 값을 통째로 — viewBox="0 0 24 24" 처럼 공백이 든 값이 있다. */
function attr(tag: string, key: string): string | null {
  for (const re of [
    new RegExp(`${key}\\s*=\\s*"([^"]*)"`),
    new RegExp(`${key}\\s*=\\s*\\{\\s*([0-9.]+)\\s*\\}`),
  ]) {
    const m = tag.match(re);
    if (m) return m[1];
  }
  return null;
}

interface Hit { file: string; line: number; sw: number; vb: number; w: number; eff: number }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const p of walk(ROOT)) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    if (rel === 'atoms/Icon.tsx' || EXEMPT.has(rel)) continue;
    const s = readFileSync(p, 'utf8');
    for (const m of s.matchAll(/<svg\b[^>]*?>/gs)) {
      const tag = m[0];
      const vbRaw = attr(tag, 'viewBox');
      const wRaw = attr(tag, 'width');
      let swRaw = attr(tag, 'strokeWidth');
      if (!swRaw) {
        // 자식 path 에 붙은 경우 — 태그 바로 뒤에서만 찾는다(다른 svg 것을 주워오지 않게)
        const near = s.slice(m.index! + tag.length, m.index! + tag.length + 400);
        swRaw = near.match(/strokeWidth\s*=\s*["{]\s*"?([0-9.]+)/)?.[1] ?? null;
      }
      if (!vbRaw || !wRaw || !swRaw) continue;      // 정적으로 못 재는 것은 건너뛴다
      const vb = Number(vbRaw.trim().split(/\s+/)[2]);
      const w = Number(wRaw);
      const sw = Number(swRaw);
      if (!vb || !w || !sw) continue;
      hits.push({ file: rel, line: s.slice(0, m.index).split('\n').length, sw, vb, w, eff: (sw * w) / vb });
    }
  }
  return hits;
}

describe('인라인 SVG — 실제 화면 굵기', () => {
  it('🔴 검사가 실제로 재고 있다 — 대상이 0개면 통과가 아니다', () => {
    // 정규식이 깨지면 조용히 빈 배열을 통과시킨다. 오늘 emoji-glyphs 가 import 깨짐으로
    // E2E 전체를 멈춰 세운 것과 같은 계열의 사고다 — 검사가 안 도는 것이 빨간 것보다 나쁘다.
    expect(scan().length, '인라인 svg 를 하나도 못 쟀다 — attr 정규식이 깨졌다').toBeGreaterThan(40);
  });

  it(`화면 굵기가 ${MIN}~${MAX}px 밴드 안이다`, () => {
    const bad = scan().filter((h) => h.eff < MIN || h.eff > MAX);
    expect(
      bad.map((h) => `${h.file}:${h.line} ${h.eff.toFixed(2)}px (sw ${h.sw} · viewBox ${h.vb} · width ${h.w})`),
      '옆 아이콘과 두께가 달라 보인다.\n' +
      '고치는 법: strokeWidth 를 바꾸지 말고 **곱한 값**을 밴드 안으로 맞춰라 — ' +
      `목표 = strokeWidth × (width ÷ viewBox) 가 ${MIN}~${MAX}.\n` +
      '아이콘이 아니라 그림(로고·차트·패턴·대형 확인 표시)이면 EXEMPT 에 넣어라.',
    ).toEqual([]);
  });
});
