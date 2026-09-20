// GTO 도구 전수 점검 — **21개 노출 + 9개 숨김/이관 딥링크**를 하나도 빠뜨리지 않는다.
//
// 왜 필요한가(2026-09-20 GTO 감사): 지금까지 도구별 검사는 몇 개만 있었고, "열리기는 하는가" 를
// 전수로 확인하는 장치가 없었다. 도구 하나가 렌더 중 터져도 카탈로그에는 타일이 그대로 보이므로
// 아무도 모른다. 카탈로그를 **소스에서 동적으로 열거**해 새 도구가 생기면 이 검사가 저절로 따라간다.
//
// ⚠ 열지 못한 이유(로그인·데이터·권한)를 PASS 로 대신하지 않는다 — 목킹 세션으로 로그인 게이트만
//   통과시키고, 그 뒤 실제로 렌더됐는지·콘솔 오류가 났는지·가로로 넘쳤는지를 각각 단언한다.
// ⚠ 이 스펙은 **화면 계약**이다. 계산의 정확성은 `src/lib/gtoAudit.counterexample.test.ts` 와
//   각 모듈 단위 테스트가 본다(여기 통과를 '수학이 맞다'의 근거로 쓰면 안 된다).
import { test, expect } from './_fixtures';
import { bootOwner } from './_mockOwner';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ⚠ e2e 는 ESM 으로 돌아 `__dirname` 이 없다(실행에서 확인). `import.meta.url` 로 받는다.
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src/components/features/ToolsPanel.tsx'), 'utf-8');

/** `TOOLS` 레지스트리의 키 — 소스에서 직접 센다(도구가 늘면 이 검사도 자동으로 늘어난다). */
const ALL_KEYS = [...SRC.matchAll(/\{ key: '([a-z]+)', cat: '([a-z]+)',/g)].map((m) => m[1]);
/** GTO 탭 카탈로그에서 숨기는 키 = 매장/캘린더 이관 + drill + deal. */
const hiddenLiteral = SRC.match(/HIDDEN_SET\s*=\s*new Set<ToolKey>\(\[([^\]]*)\]\)/)?.[1] ?? '';
const listOf = (name: string) => (SRC.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1].match(/'[a-z]+'/g) ?? []).map((s) => s.slice(1, -1));
const HIDDEN = new Set<string>([
  ...listOf('STORE_TOOL_KEYS'), ...listOf('CALENDAR_TOOL_KEYS'),
  ...(hiddenLiteral.match(/'[a-z]+'/g) ?? []).map((s) => s.slice(1, -1)),
]);
const VISIBLE = ALL_KEYS.filter((k) => !HIDDEN.has(k));

test('전제 — 카탈로그를 실제로 읽었고 노출 21 · 숨김 9 이다', () => {
  expect(ALL_KEYS.length, 'TOOLS 를 못 읽었다 — 이 스펙 전체가 빈 검사가 된다').toBe(30);
  expect(VISIBLE.length, `노출 도구가 ${VISIBLE.length}개다: ${VISIBLE.join(',')}`).toBe(21);
  expect(HIDDEN.size, `숨김/이관이 ${HIDDEN.size}개다: ${[...HIDDEN].join(',')}`).toBe(9);
});

/** 도구 화면이 실제로 그려졌는가 — 로그인 유도 화면·빈 판·에러 경계를 모두 배제한다. */
async function probeTool(page: import('@playwright/test').Page, key: string) {
  const errors: string[] = [];
  const onErr = (e: Error) => errors.push(e.message);
  const onConsole = (m: { type: () => string; text: () => string }) => {
    if (m.type() === 'error') errors.push(m.text());
  };
  page.on('pageerror', onErr);
  page.on('console', onConsole);
  await page.goto(`/?tab=tools#tool=${key}`);
  // lazy 청크 + 첫 계산까지 기다린다. 스켈레톤('불러오는 중…')이 사라질 때까지가 기준.
  await page.waitForFunction(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return false;
    return !/불러오는 중…/.test(dlg.textContent ?? '');
  }, undefined, { timeout: 30_000 }).catch(() => { /* 아래에서 실패로 잡는다 */ });
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const dlg = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dlg) return null;
    const body = dlg.querySelector<HTMLElement>('.px-page-x') ?? dlg;
    const text = (body.textContent ?? '').trim();
    return {
      로그인유도: /로그인하면 GTO 도구를 쓸 수 있어요/.test(text),
      로딩중: /불러오는 중…/.test(text),
      글자수: text.length,
      조작요소: body.querySelectorAll('button, input, select, textarea, a[href]').length,
      문서가로넘침: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // 숨겨진 것을 뺀 실제 조작 표적 중 44px 미만인 것
      작은표적: [...body.querySelectorAll<HTMLElement>('button, a[href], input[type="checkbox"], input[type="radio"]')]
        .filter((b) => b.getClientRects().length > 0)
        .map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent ?? b.getAttribute('aria-label') ?? '?').trim().slice(0, 10), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })
        .filter((x) => x.h < 44 - 0.01),
    };
  });
  page.off('pageerror', onErr);
  page.off('console', onConsole);
  // 워커·네트워크 잡음은 제외하고 **렌더를 깨는** 오류만 본다.
  const fatal = errors.filter((e) => !/Failed to load resource|net::|ResizeObserver|Download the React DevTools/.test(e));
  return { ...(m ?? {}), fatal, found: m !== null };
}

test('🔴 노출 21개 도구가 전부 실제로 열린다 (390px · 목킹 로그인)', async ({ page }) => {
  test.setTimeout(600_000);
  await bootOwner(page, { viewport: { width: 390, height: 844 }, goto: false });
  const rows: Record<string, unknown>[] = [];
  const bad: string[] = [];
  for (const key of VISIBLE) {
    const r = await probeTool(page, key);
    rows.push({ key, ...r });
    if (!r.found) bad.push(`${key}: 도구 창이 안 열렸다`);
    else if (r.로그인유도) bad.push(`${key}: 로그인 유도 화면이다 — 목킹 세션이 안 먹었다`);
    else if (r.로딩중) bad.push(`${key}: 30초 뒤에도 '불러오는 중…' 이다`);
    else if ((r.글자수 ?? 0) < 20) bad.push(`${key}: 화면이 비었다(글자 ${r.글자수})`);
    // `handrank`(홀덤 족보)는 **정적 참고 표**다 — 카드 입력기가 없는 것이 설계다(설계서 §2 키별 기준).
    //   그래서 조작 요소 0 을 허용하되, 그 대신 **내용이 충분히 있는지**를 위에서 이미 확인했다(글자 수).
    //   허용 목록을 두는 이유: '조작 요소 0' 을 전부 통과시키면 다른 도구가 빈 판이 돼도 모르게 된다.
    else if ((r.조작요소 ?? 0) === 0 && key !== 'handrank') bad.push(`${key}: 조작 요소가 하나도 없다`);
    else if (r.fatal.length) bad.push(`${key}: 콘솔 오류 ${JSON.stringify(r.fatal.slice(0, 2))}`);
    else if ((r.문서가로넘침 ?? 0) > 0) bad.push(`${key}: 문서가 가로로 ${r.문서가로넘침}px 넘친다`);
  }
  console.log('[21 도구]', JSON.stringify(rows.map((r) => ({
    key: r.key, 글자: r.글자수, 조작: r.조작요소, 넘침: r.문서가로넘침, 작은표적: (r.작은표적 as unknown[]).length,
  }))));
  expect(rows.length, '한 개도 못 열었다면 이 검사는 아무것도 재지 않았다').toBe(21);
  expect(bad, `열리지 않거나 깨진 도구: ${bad.join(' | ')}`).toEqual([]);
});

test('🔴 숨김·이관 9개의 #tool= 딥링크가 여전히 살아 있다', async ({ page }) => {
  test.setTimeout(600_000);
  await bootOwner(page, { viewport: { width: 390, height: 844 }, goto: false });
  const bad: string[] = [];
  for (const key of HIDDEN) {
    const r = await probeTool(page, key);
    // 카탈로그에서 숨겼을 뿐 **딥링크는 살아 있어야 한다**(공유 링크 하위호환).
    if (!r.found || r.로그인유도 || (r.글자수 ?? 0) < 20) bad.push(`${key}: 딥링크가 죽었다(${JSON.stringify({ found: r.found, 글자: r.글자수 })})`);
    else if (r.fatal.length) bad.push(`${key}: 콘솔 오류 ${JSON.stringify(r.fatal.slice(0, 2))}`);
  }
  expect([...HIDDEN].length, '숨김 목록을 못 읽었다').toBe(9);
  expect(bad, `숨김/이관 딥링크가 깨졌다: ${bad.join(' | ')}`).toEqual([]);
});

// 🔴 G11·G12(2026-09-20 모바일 실측) — 이번 감사가 고친 표적을 수치로 못박는다.
//   전체 도구의 모든 버튼을 44px 로 강제하지는 않는다(기존 화면에 44 미만 보조 표시가 있고,
//   그것까지 한꺼번에 바꾸면 이 커밋의 범위를 넘는다). **고친 자리**만 계약으로 남긴다.
for (const W of [320, 360, 390, 430] as const) {
  test(`${W}px — 아웃츠 카드 선택과 ICM 증감 버튼이 44px 이상이다`, async ({ page }) => {
    test.setTimeout(180_000);
    await bootOwner(page, { viewport: { width: W, height: 844 }, goto: false });

    await page.goto('/?tab=tools#tool=outs');
    await page.waitForTimeout(2500);
    const picker = await page.evaluate(() => {
      const cells = [...document.querySelectorAll<HTMLElement>('button[data-card]')];
      if (!cells.length) return null;
      const r = cells.map((b) => b.getBoundingClientRect());
      const grid = cells[0].parentElement!;
      return {
        수: cells.length,
        폭최소: +Math.min(...r.map((x) => x.width)).toFixed(2),
        높이최소: +Math.min(...r.map((x) => x.height)).toFixed(2),
        행넘침: grid.scrollWidth - grid.clientWidth,
      };
    });
    console.log(`[카드선택 ${W}]`, JSON.stringify(picker));
    expect(picker, '52장 카드 선택기를 못 찾았다').not.toBeNull();
    expect(picker!.수, '52장이 모두 있어야 한다').toBe(52);
    // 🔴 G12 — **세로만** 계약이다. 가로는 13열 구조상 채울 수 없다(320px 에서 칸당 14.31px).
    //   높이는 29.75 → 44 로 고쳤다. 가로는 미해결로 남기고 HANDOFF 에 수치로 적었다 —
    //   여기서 폭까지 단언하면 통과할 방법이 없어 게이트가 영구히 빨갛게 된다(그건 게이트가 아니다).
    expect(picker!.높이최소, `카드 버튼 높이 ${picker!.높이최소}px — 종전 29.75px`).toBeGreaterThanOrEqual(44);
    expect(picker!.행넘침, '카드 선택기가 가로로 넘친다').toBeLessThanOrEqual(0);

    await page.goto('/?tab=tools#tool=icm');
    await page.waitForTimeout(2500);
    const icm = await page.evaluate(() => {
      const box = (label: string) => {
        const el = document.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      };
      const a = document.querySelector<HTMLElement>('button[aria-label="상금 자리 줄이기"]');
      const b = document.querySelector<HTMLElement>('button[aria-label="상금 자리 늘리기"]');
      const 겹침 = a && b
        ? +(Math.min(a.getBoundingClientRect().right, b.getBoundingClientRect().right)
          - Math.max(a.getBoundingClientRect().left, b.getBoundingClientRect().left)).toFixed(2)
        : null;
      return {
        상금줄이기: box('상금 자리 줄이기'), 상금늘리기: box('상금 자리 늘리기'),
        인원줄이기: box('플레이어 줄이기'), 인원늘리기: box('플레이어 늘리기'),
        겹침, 문서가로넘침: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    console.log(`[ICM ${W}]`, JSON.stringify(icm));
    for (const [name, b] of Object.entries(icm)) {
      if (name === '겹침' || name === '문서가로넘침' || b === null) continue;
      const box = b as { w: number; h: number };
      expect(box.w, `${name} 폭 ${box.w}px`).toBeGreaterThanOrEqual(44);
      expect(box.h, `${name} 높이 ${box.h}px`).toBeGreaterThanOrEqual(44);
    }
    expect(icm.상금줄이기, 'ICM 상금 증감 버튼을 못 찾았다 — 이 단언이 빈 검사가 됐다').not.toBeNull();
    // 두 44px 표적이 겹치면 어느 쪽이 눌렸는지 모호해진다(`.hit` 의사요소 확장을 안 쓴 이유).
    expect(icm.겹침!, `증감 버튼 히트 박스가 ${icm.겹침}px 겹친다`).toBeLessThanOrEqual(0);
    expect(icm.문서가로넘침, 'ICM 화면이 가로로 넘친다').toBeLessThanOrEqual(0);
  });
}

test('🔴 PC 1280 도 52장 격자 한 벌이다 — 커뮤니티 글쓰기·PC 흐름을 바꾸지 않았다', async ({ page }) => {
  test.setTimeout(180_000);
  await bootOwner(page, { viewport: { width: 1280, height: 900 }, goto: false });
  await page.goto('/?tab=tools#tool=outs');
  await page.waitForTimeout(2500);
  const pc = await page.evaluate(() => {
    const cells = [...document.querySelectorAll<HTMLElement>('button[data-card]')];
    const ids = new Set(cells.map((b) => b.dataset.card));
    return { 카드버튼: cells.length, 고유: ids.size };
  });
  console.log('[PC 1280 카드선택]', JSON.stringify(pc));
  expect(pc.카드버튼, 'PC 에서 52장 격자가 사라졌다').toBe(52);
  // 같은 카드가 두 번 그려지면(두 벌 렌더) 화면·테스트가 어느 쪽을 집는지 모호해진다.
  expect(pc.고유, '52장 유일성이 깨졌다').toBe(52);
});

// 🔴 2026-09-20 · 설계서 §2 `pot` 키: "팟 입력이 상대 벳 포함 후인지 **라벨로 못 박아라**."
//    라벨에 전제를 넣으면 글자가 길어진다 — 이 저장소에서 여러 번 났던 부류가 바로 **경계값 잘림**이다
//    (오너가 "한 글자만 보인다" 고 한 자리는 글자 공간 27.75px 에 placeholder 29.75px 였다).
//    ⚠ 소스 문자열 검사는 `gtoContract.test.ts` 가 한다. 여기는 **실제로 그려진 것**만 본다(둘은 다른 것을 잡는다).
//
//    🔴 처음에 `scrollWidth <= clientWidth` 로 썼다가 **빈 검사**를 만들었다(2026-09-20 실측):
//      ① MDF 의 라벨은 **인라인** span 이라 `clientWidth` 가 **0** 이다 → `0 <= 1` 로 무조건 통과.
//      ② 팟오즈의 라벨은 block 이라 글자가 길면 **잘리는 대신 줄바꿈**한다 → `scrollWidth` 가 `clientWidth` 를
//         영영 안 넘는다. 두 경우 다 "넘쳤다" 를 잡을 수 없었다.
//    그래서 **Range 의 line box 개수**로 잰다 — 한 줄이면 1, 줄바꿈하면 2 이상이다. 이건 실제로 빨개진다.
for (const W of [320, 360]) {
  test(`🔴 팟오즈·MDF 의 팟 라벨이 ${W}px 에서 넘치지 않는다`, async ({ page }) => {
    test.setTimeout(180_000);
    await bootOwner(page, { viewport: { width: W, height: 720 }, goto: false });
    const rows: Record<string, unknown>[] = [];
    for (const [key, needle] of [['pot', '상대 벳 포함'], ['mdf', '상대 벳 전']] as const) {
      await page.goto(`/?tab=tools#tool=${key}`);
      await page.waitForFunction((n: string) => {
        const dlg = document.querySelector('[role="dialog"]');
        return !!dlg && !/불러오는 중…/.test(dlg.textContent ?? '') && (dlg.textContent ?? '').includes(n);
      }, needle, { timeout: 30_000 }).catch(() => { /* 아래 null 로 잡는다 */ });
      const m = await page.evaluate((n: string) => {
        const dlg = document.querySelector<HTMLElement>('[role="dialog"]');
        const el = [...(dlg?.querySelectorAll<HTMLElement>('span') ?? [])]
          .find((s) => (s.textContent ?? '').includes(n) && s.children.length === 0);
        if (!el) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = range.getClientRects().length;   // line box 개수 — 줄바꿈하면 2 이상
        const 글자폭 = range.getBoundingClientRect().width;
        const box = (el.closest('label') ?? el.parentElement) as HTMLElement | null;
        return {
          글자: (el.textContent ?? '').trim(), 줄: lines,
          글자폭: +글자폭.toFixed(2), 칸폭: +(box?.clientWidth ?? -1).toFixed(2),
          문서가로넘침: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      }, needle);
      rows.push({ key, ...(m ?? { 없음: true }) });
      expect(m, `${key}: '${needle}' 라벨을 화면에서 못 찾았다 — 이 검사가 빈 검사가 됐다`).not.toBeNull();
      expect(m!.칸폭, `${key}: 라벨이 담긴 칸의 폭을 못 쟀다 — 이 검사가 빈 검사가 됐다`).toBeGreaterThan(0);
      expect(m!.줄, `${key} 라벨이 ${m!.줄}줄로 접혔다(칸 ${m!.칸폭}px · 글자 ${m!.글자폭}px): ${m!.글자}`).toBe(1);
      expect(m!.문서가로넘침, `${key}: 문서가 가로로 넘친다`).toBe(0);
    }
    console.log(`[팟 라벨 ${W}px]`, JSON.stringify(rows));
  });
}
