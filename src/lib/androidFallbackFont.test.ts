// R-04 — 'Pretendard FB Android' 는 Noto CJK 가 **실제로 있는 기기에서만** 등록된다(src/lib/androidFallbackFont.ts).
//   ① 글꼴이 있으면(probe load 성공) 옛 CSS 와 같은 값의 face 2개(한글 95.5% · 라틴 99.87%)를 붙인다 — 안드로이드 효과 유지.
//   ② 없으면(PC·iOS) 하나도 붙이지 않는다 — 글자마다 local() 재조회(장부 첫 진입 652ms)가 사라진다.
//   ③ 공용 폰트 CSS 에 그 face 가 다시 들어오지 않았다(두 벌이 되면 ②가 무력화된다).
// 음성 대조: CSS 에 face 를 되살리면 ③, probe 실패에도 등록하게 바꾸면 ② 가 빨개진다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAndroidFallbackFont, ANDROID_FALLBACK_FAMILY } from './androidFallbackFont';

type Desc = Record<string, string>;
function setup(hasNoto: boolean) {
  const added: { family: string; src: string; desc: Desc }[] = [];
  class FakeFontFace {
    family: string; src: string; desc: Desc;
    constructor(family: string, src: string, desc: Desc = {}) { this.family = family; this.src = src; this.desc = desc; }
    load() { return hasNoto ? Promise.resolve(this) : Promise.reject(new Error('NetworkError: no local font')); }
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('document', { fonts: { add: (f: FakeFontFace) => { added.push({ family: f.family, src: f.src, desc: f.desc }); } } });
  return added;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Pretendard FB Android — 글꼴이 있을 때만', () => {
  it('① 있으면 옛 CSS 와 같은 값의 face 2개를 붙인다', async () => {
    const added = setup(true);
    await expect(registerAndroidFallbackFont()).resolves.toBe(true);
    expect(added.map((a) => a.family)).toEqual([ANDROID_FALLBACK_FAMILY, ANDROID_FALLBACK_FAMILY]);
    expect(added[0].src).toContain("local('Noto Sans CJK KR')");
    // 'Noto Sans KR' 는 Windows 11 에 기본으로 있어(NotoSansKR-VF) PC 에서도 맞아 버린다 — 안드로이드 CJK 이름만.
    expect(added[0].src).not.toContain("local('Noto Sans KR')");
    expect(added.map((a) => a.desc.sizeAdjust)).toEqual(['95.5%', '99.87%']);
    expect(added[0].desc.unicodeRange).toContain('U+AC00-D7AF');
    for (const a of added) {
      expect(a.desc).toMatchObject({ display: 'swap', ascentOverride: '95%', descentOverride: '24%', lineGapOverride: '0%' });
    }
  });
  it('② 없으면(PC·iOS) 하나도 붙이지 않는다', async () => {
    const added = setup(false);
    await expect(registerAndroidFallbackFont()).resolves.toBe(false);
    expect(added).toEqual([]);
  });
  it('③ 공용 폰트 CSS 에 그 face 가 없다(스택 이름은 index.css 에 그대로)', () => {
    const css = readFileSync(join(process.cwd(), 'public', 'fonts', 'pretendard', 'pretendardvariable-dynamic-subset.css'), 'utf8');
    expect(css).not.toMatch(/font-family:\s*'Pretendard FB Android'/);
    expect(css, 'FB Win 은 그대로여야 한다').toMatch(/font-family:\s*'Pretendard FB Win'/);
    expect(readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')).toContain("'Pretendard FB Android'");
  });
});
