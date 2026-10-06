// 정적 셸 다이아 인라인 계약 (2026-10-06 M9-01).
//
// index.html 정적 셸의 금색 다이아는 래스터라, 파일로 두면 글자(인라인 벡터)만 먼저 그려지고 다이아가 1~3프레임 비었다.
// 그래서 public/brand/nuri-diamond-96.webp 를 data URI 로 HTML 에 직접 박았고, React 헤더(BrandDiamond priority)가
// 셸의 그 문자열을 그대로 이어받아 셸→React 교체 때 빈 프레임이 없다.
// 이 테스트는 "HTML 의 data URI == 지금 파일" 을 잠근다 — 이미지를 바꾸고 data URI 를 안 바꾸면 셸 다이아만 옛 그림이 된다.
// 고치는 법: node 로 base64 를 다시 떠서 index.html 의 `data:image/webp;base64,…` 두 곳을 교체한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const expected = `data:image/webp;base64,${readFileSync(join(ROOT, 'public/brand/nuri-diamond-96.webp')).toString('base64')}`;

describe('정적 셸 다이아 data URI', () => {
  it('셸의 다이아 <img> 는 모바일·PC 두 곳 모두 현재 nuri-diamond-96.webp 와 같은 data URI 다', () => {
    const srcs = [...html.matchAll(/<img src="(data:image\/webp;base64,[^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBe(2);
    for (const s of srcs) expect(s).toBe(expected);
  });

  it('셸 다이아에 파일 경로(/brand/nuri-diamond-) 참조가 남아 있지 않다 — 받는 동안 비는 부류 재발 방지', () => {
    expect(html).not.toMatch(/src(set)?="[^"]*\/brand\/nuri-diamond-/);
  });

  it('BrandDiamond 헤더(priority)는 셸의 data URI 를 이어받는다', () => {
    const src = readFileSync(join(ROOT, 'src/components/atoms/BrandDiamond.tsx'), 'utf8');
    expect(src).toMatch(/#root img\[src\^="data:image\/webp"\]/);
    expect(src).toMatch(/priority && SHELL_SRC/);
  });
});
