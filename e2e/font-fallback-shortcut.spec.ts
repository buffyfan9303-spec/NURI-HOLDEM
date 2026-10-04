// Pretendard 에 없는 글자(이모지·카드 무늬·기호)를 처음 그릴 때 크기 맞춤 폴백 'Pretendard FB Android' 의 글꼴을 만들지 않는다 — M3-04(2026-10-04).
//
// 무엇을 지키나(동작): 그런 글자를 처음 그릴 때 Chrome 은 font-family 스택을 걸으며 지나는 local() face 를 **범위와 상관없이** 실체화한다.
//   Windows 에서 'Pretendard FB Android' 의 local('Noto Sans KR') 가 설치된 NotoSansKR-VF.ttf(10MB 가변 글꼴)에 맞아, 글자 하나마다
//   그 글꼴을 2번씩 새로 만들었다(CPU1 20~30ms · CPU4 게시판 첫 진입 214ms — audit3-motion-1004.md#M3-04). 그 글꼴은 이 글자들을 그리지 않는다.
//   src/index.css 의 'NuriEmojiFB'·'NuriSymSegoe·NuriSymMalgun' 가 FB 앞에서 받아 걷기를 끝낸다(스택 순서 계약: src/fontFallbackOrder.contract.test.ts).
// 재는 법: ① 별도 컨텍스트(새 렌더러)에서 'Pretendard FB Android' 만으로 한글을 그려 그 글꼴의 스트림 크기를 알아낸다.
//   ② 새 페이지에서 앱 스택으로 글자를 하나씩 그리며 트레이스 FontDataManager::onMakeFromStreamArgs 를 모아, ①의 크기가 나오면 실패.
// 판정 불가: ①에서 글꼴이 안 만들어지면(Noto Sans KR 이 없는 기기 · 리눅스 러너는 그 글꼴이 실제로 그릴 수도 있어 제외) skip.
// 음성 대조(2026-10-04, Windows 11): 수정 전 빌드 FAIL(🎉·♠♣ 에서 NotoSansKR-VF 10415532B ×2) → 수정 후 PASS(0회).
// − ▾ ↺ 는 검사하지 않는다 — 지름길을 일부러 안 걸었다(index.css 'NuriSymSegoe' 위 주석의 레인지 차트 실측).
import { test, expect } from './_fixtures';
import type { CDPSession, Page } from '@playwright/test';

type Ev = { name: string; ph: string; dur?: number; args?: { size?: number } };
async function streamsWhile(page: Page, cdp: CDPSession, draw: () => Promise<unknown>) {
  const evs: Ev[] = [];
  // 이벤트 payload 의 공식 타입은 value: {[key:string]:string}[] 이지만 실제 트레이스 이벤트는 args 가 객체다 — 안에서 좁힌다.
  const on = (e: { value: unknown[] }) => { for (const v of e.value as Ev[]) if (v.name === 'FontDataManager::onMakeFromStreamArgs' && v.ph === 'X') evs.push(v); };
  cdp.on('Tracing.dataCollected', on);
  const done = new Promise<void>((r) => cdp.once('Tracing.tracingComplete', () => r()));
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['fonts'] }, transferMode: 'ReportEvents' });
  await draw();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await cdp.send('Tracing.end');
  await done;
  cdp.off('Tracing.dataCollected', on);
  return evs.map((e) => e.args?.size ?? -1);
}
const settle = async (p: Page) => { await p.goto('/'); await p.waitForLoadState('load'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1000); };
const drawP = (p: Page, text: string, style: string) => p.evaluate(([t, s]) => { const e = document.createElement('p'); e.textContent = t; e.setAttribute('style', s); document.body.appendChild(e); void e.offsetWidth; }, [text, style] as const);

test('🔴 이모지·카드 무늬·기호를 처음 그려도 크기 맞춤 폴백(FB Android) 글꼴을 만들지 않는다', async ({ page, browser, browserName }) => {
  test.skip(browserName !== 'chromium', '트레이스는 Chromium 전용');
  test.skip(process.platform !== 'win32', 'FB Android(local Noto Sans KR)가 실제 글자를 그리지 않는다는 전제는 Windows 에서만 성립 — 리눅스는 Noto CJK 가 기호를 그릴 수 있다');
  await settle(page);
  // ① FB Android 글꼴의 스트림 크기(별도 컨텍스트 = 새 렌더러, 앱 페이지의 글꼴 캐시를 데우지 않는다)
  const ctx = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const probe = await ctx.newPage();
  await settle(probe);
  const pcdp = await probe.context().newCDPSession(probe);
  const fbSizes = new Set((await streamsWhile(probe, pcdp, () => drawP(probe, '가나다', "font-family:'Pretendard FB Android';font-weight:400"))).filter((s) => s > 0));
  await ctx.close();
  test.skip(fbSizes.size === 0, '이 기기에는 FB Android 가 맞는 local 글꼴이 없다 — 판정 불가');

  // ② 앱 스택(body 상속)으로 글자를 처음 그린다 — 게시판 공지 제목·GTO 족보·캘린더/도구의 기호
  const cdp = await page.context().newCDPSession(page);
  const bad: string[] = [];
  for (const [name, text, w] of [['이모지 🎉', '🎉', 700], ['카드 무늬 ♠♣', '♠♣', 400], ['카드 무늬 ♦·확인 ✓', '♦✓', 400]] as const) {
    const sizes = await streamsWhile(page, cdp, () => drawP(page, text, `font-weight:${w}`));
    const hit = sizes.filter((s) => fbSizes.has(s));
    if (hit.length) bad.push(`${name}: FB Android 글꼴(${[...fbSizes].join(',')}B)을 ${hit.length}번 만들었다 — 전체 생성 ${sizes.join(',')}`);
  }
  expect(bad, "그리지 않는 크기 맞춤 폴백 글꼴을 깨웠다 — src/index.css 스택에서 NuriEmojiFB·NuriSymSegoe·NuriSymMalgun 가 'Pretendard FB Win' 앞에 있는지, 범위에 그 글자가 있는지 확인").toEqual([]);
});
