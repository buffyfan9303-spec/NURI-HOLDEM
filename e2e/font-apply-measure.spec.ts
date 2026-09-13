// 폰트 — **받는 만큼 그려지는가.** (N03 · 2026-09-13 양성 검사로 갱신)
//
// 이력: 2026-08-26 self-host 도입부터 2026-09-12 까지 Pretendard 는 단 한 픽셀도 적용된 적이 없었다
//   (dynamic-subset 92 face × `font-display: optional` — 13개 파일이 optional 의 블록 구간(~100ms)을 못 맞춰
//   그 로드에서 교체를 포기했다). 그래서 09-12 에 로딩을 멈췄고, 이 스펙은 "받지 않는다(요청 0건)" 를 계약으로 잠갔다.
// 2026-09-13 리드 결정(N03): **켠다** — index.html 의 켜는 법 그대로: ① CSS 의 optional → fallback ② <head> 정적 <link>.
//   (유휴 지연 주입은 금지 — 그것이 CLS 0.132 를 만든 원인이었다. 정적 <head> 는 콜드 LCP 652→948ms · CLS 0.0775→0.0791.)
//   문서 §8.3-2: 이 스펙은 삭제하지 않고 **정상 폰트 응답 · 실제 렌더 · 불필요 요청 방지** 의 양성 검사로 바꾼다.
//
// 이 파일이 보는 것
//   ① 폰트 응답이 정상이다 — Pretendard woff2 요청이 1건 이상, 전부 /fonts/pretendard/woff2-dynamic-subset/ 자기 출처, 200 응답.
//   ② 불필요 요청이 없다 — 같은 URL 을 두 번 받지 않고(중복 0), 페이지가 실제로 쓴 유니코드 범위 밖의 face 까지 다 받지 않는다(≤ 13개 · 92 face 전량 금지).
//   ③ 실제 렌더 — CDP `CSS.getPlatformFontsForNode` 로 한글·영문·숫자 실물 노드가 Pretendard 로 그려진다.
//      ⚠ `document.fonts.check()`(없는 폰트에도 true) 와 고립 span 폭 비교(프로브가 로드를 유발)는 거짓 양성이 실측돼 **쓰지 않는다**.
//   ④ 방식 계약 — <head> 에 정적 <link> 가 있고, 지연 주입(requestIdleCallback 로 link 추가)이 없다. NuriMarks 폴백이 스택에 남아 있다.
// 음성 대조: CSS 의 `fallback` 을 `optional` 로 되돌리면 ③ 이(콜드 로드에서 Malgun Gothic), index.html 의 <link> 를 지우면 ①·④ 가 실패한다.
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/font-apply-measure.spec.ts
import { test, expect } from './_fixtures';

const PRETENDARD = /pretendard/i;
const SUBSET_DIR = /\/fonts\/pretendard\/woff2-dynamic-subset\/PretendardVariable\.subset\.\d+\.woff2$/;

test('🔴 폰트 응답 정상 · 불필요 요청 없음 — 자기 출처 woff2 만, 중복 0, 13개 이하', async ({ page, baseURL }) => {
  const asked: string[] = [];
  const statuses: number[] = [];
  page.on('request', (r) => { if (PRETENDARD.test(r.url())) asked.push(r.url()); });
  page.on('response', (r) => { if (PRETENDARD.test(r.url()) && /\.woff2/.test(r.url())) statuses.push(r.status()); });

  await page.goto('/');
  await page.waitForTimeout(4000);

  const woff2 = asked.filter((u) => /\.woff2/.test(u));
  expect(woff2.length, 'Pretendard woff2 요청이 0건 — 켜지지 않았다(index.html 의 <link>·CSS 확인)').toBeGreaterThan(0);
  const origin = new URL(baseURL!).origin;
  for (const u of woff2) {
    expect(u.startsWith(origin), `자기 출처가 아닌 폰트 요청: ${u}`).toBe(true);
    expect(new URL(u).pathname, `서브셋 디렉터리 밖의 폰트 요청: ${u}`).toMatch(SUBSET_DIR);
  }
  expect(new Set(woff2).size, `같은 파일을 두 번 받았다: ${woff2.length}건 / 고유 ${new Set(woff2).size}`).toBe(woff2.length);
  expect(woff2.length, '첫 화면에 92 face 를 다 받고 있다 — dynamic-subset 이 유니코드 범위로 좁히지 못한다').toBeLessThanOrEqual(13);
  expect(statuses.every((s) => s === 200 || s === 304), `폰트 응답 상태: ${statuses.join(',')}`).toBe(true);
  // CSS 는 한 번
  expect(asked.filter((u) => /\.css/.test(u)).length).toBe(1);
});

test('🔴 실제 렌더 — 한글·영문·숫자 실물 노드가 Pretendard 로 그려진다(CDP getPlatformFontsForNode)', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);

  // 화면에 실제로 있는 노드를 고른다(합성 span 금지 — 프로브 자체가 로드를 유발해 판정을 오염시킨다)
  const found = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,p,span,button,a,b,strong'));
    const vis = (e: HTMLElement) => e.getBoundingClientRect().width > 10 && e.getBoundingClientRect().height > 8;
    const own = (e: HTMLElement) => Array.from(e.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('');
    const pick = (re: RegExp, key: string) => {
      const e = all.find((x) => re.test(own(x)) && vis(x));
      if (e) e.setAttribute('data-font-probe', key);
      return e ? own(e).trim().slice(0, 24) : null;
    };
    return { ko: pick(/[가-힣]{2,}/, 'ko'), en: pick(/[A-Za-z]{4,}/, 'en'), num: pick(/\d{2,}/, 'num') };
  });
  expect(found.ko, '한글 노드를 못 찾았다').toBeTruthy();
  expect(found.en, '영문 노드를 못 찾았다').toBeTruthy();

  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const rendered: Record<string, string[]> = {};
  for (const key of ['ko', 'en', 'num'] as const) {
    if (!found[key]) continue;
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-font-probe="${key}"]` });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    rendered[key] = fonts.map((f) => f.familyName);
  }
  console.log('[CDP 실제 렌더 폰트]', JSON.stringify({ found, rendered }));
  for (const key of ['ko', 'en'] as const) {
    expect(rendered[key]?.join(','), `${key} "${found[key]}" 가 Pretendard 로 그려지지 않았다: ${rendered[key]?.join(', ')}`).toMatch(/pretendard/i);
  }
  if (found.num) expect(rendered.num?.join(','), `숫자 "${found.num}": ${rendered.num?.join(', ')}`).toMatch(/pretendard/i);
});

test('🔴 방식 계약 — <head> 정적 <link>, 지연 주입 없음, NuriMarks 폴백 유지', async ({ page }) => {
  await page.goto('/');
  const g = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.getAttribute('href') ?? '');
    const head = document.head.innerHTML;
    return {
      pretendardLinks: links.filter((h) => /pretendard/i.test(h)),
      idleInject: /requestIdleCallback[\s\S]{0,400}pretendard/i.test(head),
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(g.pretendardLinks, 'Pretendard 스타일시트 <link> 가 정확히 하나여야 한다').toHaveLength(1);
  expect(g.pretendardLinks[0]).toBe('/fonts/pretendard/pretendardvariable-dynamic-subset.css');
  expect(g.idleInject, '유휴 지연 주입이 있다 — CLS 0.132 의 원인이었다').toBe(false);
  expect(g.bodyFamily).toMatch(/Pretendard Variable/);
  expect(g.bodyFamily, 'NuriMarks 폴백이 스택에서 빠졌다').toMatch(/NuriMarks/);
});
