// 글꼴 스택 순서 계약 — Pretendard 에 없는 글자가 크기 맞춤 폴백('Pretendard FB Win/Android')까지 걸어가지 않는다 (M3-04, 2026-10-04).
//
// 무엇을 보증하나(동작): Chrome 은 Pretendard 에 없는 글자를 그릴 때 스택을 걸으며 지나는 local() face 를 범위와 상관없이 실체화한다.
//   FB Android 의 local('Noto Sans KR') 가 Windows 의 10MB 가변 글꼴에 맞아 게시판 첫 진입이 400ms 멈췄다(audit3-motion-1004.md#M3-04).
//   그래서 앱이 그리는 이모지·기호는 **FB 보다 앞의** 전용 face(NuriMarks·NuriEmojiFB·NuriSymFB)가 범위로 받아야 한다.
//   런타임 확인은 e2e/font-fallback-shortcut.spec.ts(트레이스로 FB Android 글꼴 생성 0회).
// 그리고 이모지 face 가 '글자 모양(text presentation)' 기호를 가로채면 ❤·☀·⚠·♠ 가 색 그림으로 바뀐다 — 그 경계도 잠근다.
// 음성 대조: 수정 전 index.css(스택에 NuriEmojiFB·NuriSymFB 없음)에서 첫 테스트가 FAIL — 2026-10-04 확인.
// 실행: npx vitest run src/fontFallbackOrder.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(process.env.INDEX_CSS_PATH ?? resolve(__dirname, 'index.css'), 'utf-8');

type Face = { family: string; ranges: [number, number][] };
const faces: Face[] = (CSS.match(/@font-face\s*\{[^}]*\}/g) ?? []).map((f) => ({
  family: /font-family:\s*'([^']+)'/.exec(f)?.[1] ?? '',
  ranges: (/unicode-range:\s*([^;]+);/.exec(f)?.[1] ?? '').split(',').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [a, b] = r.replace(/^U\+/i, '').split('-');
    return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
  }),
}));
const covers = (family: string, cp: number) => faces.some((f) => f.family === family && f.ranges.some(([a, b]) => cp >= a && cp <= b));
// 앱의 Pretendard 스택 3곳: @theme --font-sans · preflight html · body
const STACKS = [...CSS.matchAll(/(?:--font-sans|font-family):\s*('Pretendard Variable'[^;]*);/g)].map((m) => m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')));

// 앱이 실제로 그리는 글자(게시판 공지 이모지 · 사용자 글 이모지 · GTO 카드 무늬 · 확인/닫기 기호).
// − ▾ ↺ 는 일부러 뺐다 — Cambria Math local face 가 레인지 차트 첫 열기를 오히려 늦췄다(index.css 'NuriSymSegoe' 위 주석).
const MUST_SHORTCUT = ['🎉', '👍', '🏆', '✅', '⭐', '♠', '♣', '♦', '✓', '✕'];
// 기본이 글자 모양인 기호 — 이모지 글꼴에 걸리면 색 그림이 된다(VS16 이 붙을 때만 이모지)
const TEXT_PRESENTATION = ['❤', '☀', '⚠', '♠', '♣', '♥', '♦', '✓', '✕', '★', '▲', '▼', '→', '©', '™'];

describe('글꼴 스택 — 이모지·기호는 크기 맞춤 폴백 앞에서 끝난다', () => {
  it('Pretendard 스택 3곳을 모두 읽었고 순서가 같다', () => {
    expect(STACKS.length, '--font-sans·html·body 의 Pretendard 스택을 못 찾았다 — 형식이 바뀌었으면 여기를 고쳐라').toBe(3);
    expect(new Set(STACKS.map((s) => s.join('|'))).size, '스택 3곳의 순서가 다르다').toBe(1);
  });

  it('🔴 앱이 그리는 이모지·기호마다 FB 보다 앞의 face 가 범위로 받는다', () => {
    const bad: string[] = [];
    for (const stack of STACKS) {
      const fb = stack.indexOf('Pretendard FB Win');
      expect(fb, "스택에 'Pretendard FB Win' 이 없다").toBeGreaterThan(0);
      for (const ch of MUST_SHORTCUT) {
        const cp = ch.codePointAt(0)!;
        const at = stack.findIndex((fam) => !/^Pretendard/.test(fam) && covers(fam, cp));
        if (at < 0 || at > fb) bad.push(`${ch} U+${cp.toString(16).toUpperCase()} → ${at < 0 ? '받는 face 없음' : stack[at] + '(FB 뒤)'}`);
      }
    }
    expect(bad, '이 글자는 FB 를 지나며 local 폴백 글꼴을 깨운다(Windows 10MB Noto VF) — NuriEmojiFB/NuriSymFB 범위·스택 순서 확인').toEqual([]);
  });

  it('이모지 face 는 글자 모양 기호를 가로채지 않는다(색 그림으로 바뀌지 않게)', () => {
    const hit = TEXT_PRESENTATION.filter((ch) => covers('NuriEmojiFB', ch.codePointAt(0)!));
    expect(hit).toEqual([]);
  });
});
