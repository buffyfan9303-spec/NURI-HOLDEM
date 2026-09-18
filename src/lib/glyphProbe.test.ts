// glyphProbe 의 상점 마크 목록이 **실제 상점 카탈로그와 어긋나지 않는지** 대조한다.
//
// 왜 필요한가: `glyphProbe.ts` 는 Playwright(node) 에서 읽히므로 `shopMarks.ts` 를 임포트할 수 없다
// (그 파일이 supabase → import.meta.env 를 끌고 온다). 그래서 값을 손으로 적어 둘 수밖에 없는데,
// 손으로 적은 사본은 **반드시 낡는다** — 상점에 마크가 하나 늘면 두부 검사만 조용히 그 마크를 빼먹는다.
// vitest 는 vite 문맥이라 양쪽을 다 임포트할 수 있다. 대조는 여기서 한다.
//
// 실행: npx vitest run src/lib/glyphProbe.test.ts
import { describe, it, expect } from 'vitest';
import { SHOP_MARK_CP, SUIT_CP } from './glyphProbe';
import { FALLBACK_CATALOG } from './shopMarks';

/** 실제 카탈로그의 글자 → 코드포인트. 변이 선택자·ZWJ 는 그 자체로 그려지지 않아 대상이 아니다. */
const catalogCps = () => new Set(
  FALLBACK_CATALOG.flatMap((m) => [...m.emoji].map((ch) => ch.codePointAt(0)!))
    .filter((cp) => cp !== 0xfe0f && cp !== 0xfe0e && cp !== 0x200d),
);

describe('두부 검사 목록 — 상점 마크 사본', () => {
  it('🔴 카탈로그에 있는 마크가 검사 목록에서 빠지지 않았다', () => {
    // ⚠ 카탈로그에는 **카드 수트 마크(♠♦ 등)도 있다** — 그건 SUIT_CP 가 이미 검사한다.
    //   두 목록을 합쳐서 대조하지 않으면 "빠졌다"는 거짓 실패가 난다(2026-09-18 실측).
    const missing = [...catalogCps()].filter((cp) => !SHOP_MARK_CP.has(cp) && !SUIT_CP.has(cp));
    expect(
      missing.map((cp) => `U+${cp.toString(16).toUpperCase()} ${String.fromCodePoint(cp)}`),
      'src/lib/glyphProbe.ts 의 SHOP_MARK_CP 에 이 코드포인트를 더해라 — ' +
      '안 그러면 새 마크가 두부(□)로 떨어져도 e2e/emoji-glyphs 가 못 잡는다',
    ).toEqual([]);
  });

  it('검사 목록에만 있고 카탈로그에 없는 값은 없다 — 죽은 항목을 남기지 않는다', () => {
    const cps = catalogCps();
    const stale = [...SHOP_MARK_CP].filter((cp) => !cps.has(cp));
    expect(
      stale.map((cp) => `U+${cp.toString(16).toUpperCase()} ${String.fromCodePoint(cp)}`),
      '상점에서 내린 마크다 — SHOP_MARK_CP 에서도 지워라',
    ).toEqual([]);
  });
});
