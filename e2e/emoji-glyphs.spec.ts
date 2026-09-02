// 이모지 규약의 **런타임 짝** — 소스 게이트(src/lib/emojiPolicy.test.ts)가 "새로 안 들어왔다"를
// 보증한다면, 여기는 "남겨둔 예외가 실제로 글자로 그려지는가"를 렌더해서 잰다.
//
// 재는 법(추측하지 않는다):
//   · 두부 판정 — 존재할 수 없는 코드포인트(U+10FFFF)를 같은 폰트로 그려 **픽셀 해시**를 기준선으로
//     삼고, 대상 글리프의 해시가 그것과 같으면 .notdef(□) 로 떨어진 것이다. 폭만 비교하면
//     우연히 폭이 같은 진짜 글리프를 오판한다.
//   · 컬러 폰트 수록 여부 — 칠해진 픽셀의 '서로 다른 색 수'. 컬러 이모지 폰트에서 온 글리프는
//     수백 가지 색을 쓰고, 단색 기호 폰트에서 온 글리프는 1가지다. 후자는 OS 마다 그 폰트가
//     있고 없고가 갈려 두부 위험이 크다(🂠 U+1F0A0 가 정확히 그래서 걷혔다).
import { test, expect } from '@playwright/test';
import { SUIT_CP, SHOP_MARK_CP } from '../src/lib/emojiPolicy';

const CP = (s: ReadonlySet<number>) => [...s];

test('예외로 남긴 글자(카드 수트·랭킹 상점 마크)가 두부로 떨어지지 않는다', async ({ page }) => {
  // CI 러너(ubuntu)에선 self-host 폰트(NuriMarks·Pretendard)가 로드되지 않아 프로브가 무효(2026-08-30~ 상시 실패). 로컬 게이트.
  test.skip(!!process.env.CI, 'CI 러너 폰트 환경 — 로컬에서 검증');
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const res = await page.evaluate((cps: { suits: number[]; marks: number[] }) => {
    const stack = getComputedStyle(document.body).fontFamily;
    const W = 128, H = 128;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    function shot(s: string) {
      ctx.clearRect(0, 0, W, H);
      ctx.font = `64px ${stack}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000';
      ctx.fillText(s, 8, 96);
      const d = ctx.getImageData(0, 0, W, H).data;
      let ink = 0; let h = 2166136261; const colors = new Set<number>();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 8) { ink++; colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
        h = Math.imul(h ^ (d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11), 16777619) >>> 0;
      }
      return { ink, hash: h, colors: colors.size };
    }
    const notdef = shot('\u{10FFFF}');
    const read = (cp: number) => {
      const a = shot(String.fromCodePoint(cp));
      return {
        cp, ink: a.ink, colors: a.colors,
        tofu: a.hash === notdef.hash || a.ink === 0,
      };
    };
    return {
      stack,
      notdefInk: notdef.ink,
      suits: cps.suits.map(read),
      marks: cps.marks.map(read),
    };
  }, { suits: CP(SUIT_CP), marks: CP(SHOP_MARK_CP) });

  // 프로브 유효성 — 기준선이 실제로 '무언가'를 그렸어야 이 비교에 의미가 있다.
  expect(res.notdefInk, '두부 기준선이 아무것도 안 그렸다 — 프로브가 무효다').toBeGreaterThan(0);

  const hexOf = (cp: number) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  const broken = [...res.suits, ...res.marks]
    .filter((r) => r.tofu)
    .map((r) => `${String.fromCodePoint(r.cp)} ${hexOf(r.cp)}`);
  expect(
    broken.join(', '),
    '예외로 남긴 글자가 두부(□)로 떨어진다. 수트라면 도메인 표기를 재검토하고,\n'
    + '상점 마크라면 **오너 결정 사항**이다 — 보유자 아이템이라 키·이름을 함부로 못 바꾼다.',
  ).toBe('');

  // 상점 마크는 '컬러 이모지'로 팔린 아이템이다. 단색으로 떨어지면 그 기기에서만 다른 물건이 된다.
  const mono = res.marks
    .filter((r) => r.colors <= 2)
    .map((r) => `${String.fromCodePoint(r.cp)} ${hexOf(r.cp)}(색 ${r.colors})`);
  expect(
    mono.join(', '),
    '상점 마크가 컬러 이모지 폰트가 아닌 단색 폰트에서 나왔다 — 그 폰트가 없는 기기에서는 두부가 된다.',
  ).toBe('');
});

test('카드 수트는 텍스트 표현(단색)으로 남아 있다 — 컬러 이모지로 승격되면 안 된다', async ({ page }) => {
  // ♠♥♦♣ 뒤에 U+FE0F 가 붙으면 같은 글자가 **컬러 이모지**로 바뀐다(실측으로 확인된 동작).
  // 그러면 테마를 못 따라가고 옆 텍스트와 굵기가 갈린다 — 도메인 기호로 쓰는 의미가 사라진다.
  // 즉 "수트는 예외" 는 "수트를 텍스트로 쓴다" 는 뜻이고, 이 테스트가 그 조건을 지킨다.
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const colors = await page.evaluate((cps: number[]) => {
    const stack = getComputedStyle(document.body).fontFamily;
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    return cps.map((cp) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.font = `64px ${stack}`;
      ctx.fillStyle = '#000';
      ctx.fillText(String.fromCodePoint(cp), 8, 96);
      const d = ctx.getImageData(0, 0, 128, 128).data;
      const set = new Set<number>();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return { cp, colors: set.size };
    });
  }, CP(SUIT_CP));
  const colored = colors.filter((c) => c.colors > 2).map((c) => 'U+' + c.cp.toString(16).toUpperCase());
  expect(colored.join(', '), '수트가 컬러 이모지로 렌더됐다 — 어딘가에서 U+FE0F 가 붙었는지 확인하라').toBe('');
});
