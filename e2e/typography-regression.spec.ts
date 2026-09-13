// §7 타이포그래피 회귀 — 실화면에서 확인된 두 결함이 되돌아오지 않게 한다 (2026-09-12).
//
//  ① 200% 텍스트 확대에서 GTO 도구 카드의 'NURI SPOT' 이 **통째로 사라졌다**
//     (390px·root 34px 실측: clientWidth 19 / scrollWidth 119 → 되돌리면 0 / 23).
//     원인은 글자 크기가 아니라 오른쪽 배지가 `shrink-0` 로 행을 다 먹은 것이라
//     글자를 줄이지 않고 `flex-wrap` 으로 배지를 흘려보냈다.
//  ② 사업자 정보·1336 고지가 **법정 상시 노출**인데 앱에서 가장 작고 빽빽한 블록이었다
//     (11.69px / 행간 18.99 — 권장 하한 12px 미달) → 역할 토큰 `t-desc`(12.75 / 19.13).
//
// ⚠ `textContent` 로는 절대 안 잡힌다 — CSS truncate 는 DOM 을 바꾸지 않는다.
//   반드시 `scrollWidth > clientWidth` 로 **실제 잘림**을 재야 한다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

test('§7 수정 확인 — 200% 확대 텍스트 소실 · 법정 고지 크기', async ({ page }) => {
  test.setTimeout(180_000);

  // ① 200% 확대에서 GTO 도구 카드 텍스트가 살아 있는가
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await stabilizeBackstack(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '34px'; });
  const tools = page.getByRole('button', { name: /도구|GTO/ }).filter({ visible: true }).first();
  if (await tools.count()) { await tools.click({ timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(1200); }
  const spot = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === 'NURI SPOT');
    if (!el) return null;
    return { client: el.clientWidth, scroll: el.scrollWidth, text: el.textContent };
  });
  console.log('ZOOM200 ' + JSON.stringify(spot));
  if (spot) {
    expect(spot.scroll, `200% 에서 "${spot.text}" 가 여전히 잘린다 (보이는 ${spot.client} < 필요 ${spot.scroll})`)
      .toBeLessThanOrEqual(spot.client + 1);
  }

  // ② 법정 고지(사업자 정보)의 실제 크기·행간
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.waitForTimeout(600);
  const biz = await page.evaluate(() => {
    const el = [...document.querySelectorAll('dl,details,p')]
      .find((n) => /사업자|대표|1336|통신판매/.test(n.textContent ?? ''));
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { fs: cs.fontSize, lh: cs.lineHeight };
  });
  console.log('BIZ ' + JSON.stringify(biz));
  if (biz) expect(parseFloat(biz.fs), '법정 고지가 여전히 12px 미만이다').toBeGreaterThanOrEqual(12);
});

// §7 P0-C(2026-09-12 실측) — BusinessFooter 5항목: 크기·대비·320px 줄바꿈.
//   ① 약관·정책 링크가 11.69px 로, 이미 t-desc(12.75px)로 올라간 사업자 정보보다 작았다.
//   ② dt(라벨) `text-ink-muted/70` 가 실제 지면(surface-base)과 합성되면 라이트 2.81:1·다크 3.09:1 로 AA(4.5) 미달.
//   ③ 사행성 배제 고지 `text-ink-muted/80` 가 라이트 3.37:1·다크 3.72:1 로 AA 미달.
//   ④ 320px 에서 "사업장 주소" 라벨이 "사업장 / 주소" 로 줄바꿈됐다(값은 여러 줄이어도 되지만 라벨은 안 된다).
// 대비는 순백이 아니라 실제 body 배경(surface-base)과 합성한 색으로 잰다 — 그래서 다른 방식으로 재면
// 이 결함이 통과로 나온다(반투명 채널을 그대로 opaque 로 취급하면 실제보다 대비가 높게 나온다).
function relLuminance(r: number, g: number, b: number) {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(fgStr: string, bgStr: string) {
  const parse = (s: string) => { const m = s.match(/[\d.]+/g)!.map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const fg = parse(fgStr), bg = parse(bgStr);
  const r = fg.a * fg.r + (1 - fg.a) * bg.r;
  const g = fg.a * fg.g + (1 - fg.a) * bg.g;
  const b = fg.a * fg.b + (1 - fg.a) * bg.b;
  const L1 = relLuminance(r, g, b) + 0.05;
  const L2 = relLuminance(bg.r, bg.g, bg.b) + 0.05;
  return L1 > L2 ? L1 / L2 : L2 / L1;
}

for (const theme of ['light', 'dark'] as const) {
  test(`§7 P0-C 확인 — BusinessFooter 크기·대비·320px 줄바꿈 (${theme})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript((t) => { window.localStorage.setItem('nuri-theme', t); }, theme);
    await page.goto('/');
    await stabilizeBackstack(page);

    const data = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      if (!footer) return null;
      const bg = getComputedStyle(document.body).backgroundColor;
      const navLink = footer.querySelector('nav a, nav button');
      const dt = footer.querySelector('dl dt');
      const notice = [...footer.querySelectorAll('p')].find((p) => /국민체육진흥법/.test(p.textContent ?? ''));
      const bizAddrRow = [...footer.querySelectorAll('dl > div')].find((d) => /사업장/.test(d.textContent ?? ''));
      const bizAddrDt = bizAddrRow?.querySelector('dt') ?? null;
      const pick = (el: Element | null | undefined) => el ? { fs: getComputedStyle(el).fontSize, color: getComputedStyle(el).color } : null;
      let dtLabelLines: number | null = null;
      if (bizAddrDt) {
        const range = document.createRange();
        range.selectNodeContents(bizAddrDt);
        dtLabelLines = range.getClientRects().length;
      }
      return { bodyBg: bg, navLink: pick(navLink), dt: pick(dt), notice: pick(notice), dtLabelLines };
    });
    if (!data) { test.skip(true, 'footer 를 찾지 못했다'); return; }

    // ① 링크 크기 — 사업자 정보와 같은 t-desc(12.75px) 이상이어야 한다.
    if (data.navLink) {
      expect(parseFloat(data.navLink.fs), `약관·정책 링크가 여전히 12px 미만이다 (${theme})`).toBeGreaterThanOrEqual(12);
    }
    // ② dt(라벨) 대비 — 실제 지면과 합성한 색으로 AA(4.5) 이상.
    if (data.dt) {
      const ratio = contrastRatio(data.dt.color, data.bodyBg);
      expect(ratio, `사업자 정보 라벨 대비가 AA 미달이다 (${theme}, ${ratio.toFixed(2)}:1)`).toBeGreaterThanOrEqual(4.5);
    }
    // ③ 사행성 배제 고지 대비 — AA(4.5) 이상.
    if (data.notice) {
      const ratio = contrastRatio(data.notice.color, data.bodyBg);
      expect(ratio, `사행성 배제 고지 대비가 AA 미달이다 (${theme}, ${ratio.toFixed(2)}:1)`).toBeGreaterThanOrEqual(4.5);
    }
    // ④ 320px — "사업장 주소" 라벨 자체는 한 줄이어야 한다(값은 여러 줄이어도 된다).
    if (data.dtLabelLines != null) {
      expect(data.dtLabelLines, `"사업장 주소" 라벨이 320px 에서 줄바꿈됐다 (${theme})`).toBe(1);
    }
  });
}

// 360px 에서 NURI SPOT 설명이 잘리지 않는다 (§7 P1-2).
//
// 실측(2026-09-12): 360px 에서 `truncate` 로 87 < 142 로 잘렸다. 이미 11.69px 라
// **더 줄이면 안 되는 구간**이라, 글자를 건드리지 않고 두 줄까지 허용해 풀었다.
// 이 파일 388행의 옛 기록("truncate 금지 — 무슨 표인지 사라졌다")과 같은 부류다.
test('360px — NURI SPOT 설명이 말줄임으로 잘리지 않는다', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await stabilizeBackstack(page);
  const tools = page.getByRole('button', { name: /도구|GTO/ }).filter({ visible: true }).first();
  if (await tools.count()) { await tools.click({ timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(1200); }

  const m = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find((p) => p.textContent?.includes('핸드 분석 · 리플레이'));
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { client: el.clientWidth, scroll: el.scrollWidth, h: el.clientHeight, fs: cs.fontSize, text: el.textContent };
  });
  console.log('W360 ' + JSON.stringify(m));
  if (!m) return;                       // 도구 탭에 못 들어갔으면 판단하지 않는다
  expect(m.scroll, `360px 에서 "${m.text}" 가 가로로 잘린다 (보이는 ${m.client} < 필요 ${m.scroll})`)
    .toBeLessThanOrEqual(m.client + 1);
  // 글자를 줄여서 해결한 게 아님을 못박는다 — 11.69px 그대로여야 한다.
  expect(parseFloat(m.fs), '글자를 줄여서 잘림을 피했다').toBeGreaterThanOrEqual(11);
});

// ── §7 P0-A(재발) — 200% 텍스트 확대에서 GTO 탭이 기능적으로 붕괴하지 않는다 (2026-09-12) ──
//
// 1차 §7 수정은 같은 카드의 **배지 행만** 고치고 "설명 열은 재지 않았으므로 건드리지 않았다"고 적었다.
// 그 미측정 영역이 그대로 터졌다 — 390px·root 34px 실측:
//   · 프리플랍 레인지 차트 글 칸 clientWidth **19** / scrollWidth 119, 설명이 19/26 로 눌려
//     '오/픈/·/블/라/인/드' 처럼 **한 글자씩 세로로** 쌓이고 카드가 **1339px** 이 됐다
//   · 카탈로그 카드 설명 전부 108/235~285(38~46% 만 보임) · 오버플로 노드 **34곳**
//
// 원인은 글자 크기가 아니라 **행 레이아웃**이다(글자는 이미 최소 크기 11.69px 라 줄일 여지가 없다):
//   `flex`(비-wrap) 행에서 글 칸이 `flex-1`(basis 0) 이면 줄바꿈 계산에 0 으로 잡혀
//   오른쪽 `shrink-0` 배지·CTA 를 **절대 아래로 못 내린다** — 글 칸만 0 에 수렴한다.
//
// 그래서 이 계약은 "특정 문구가 몇 px" 이 아니라 **탭 전체에 가로 잘림·세로 잘림이 0 곳**임을 잠근다.
// 한 곳을 고치고 옆 칸을 안 재는 실수가 다시 나오지 않게 하는 것이 이 테스트의 목적이다.
//
// ⚠ 두 가지를 **함께** 봐야 한다:
//   ① scrollWidth > clientWidth  = 가로 잘림(truncate·ellipsis)
//   ② overflow:hidden/line-clamp 인데 scrollHeight > clientHeight = **세로 잘림**
//   ①만 재면 `truncate` 를 `line-clamp-2` 로 바꾸는 것이 '수정'으로 통과한다 —
//   실제로는 가로 잘림을 세로 잘림으로 옮겼을 뿐이고, 1차 수정이 정확히 그 상태로 남아 있었다
//   (320px·100% 에서 'NURI SPOT' 설명이 clientHeight 32 / scrollHeight 48 로 이미 한 줄 잘려 있었다).
for (const { w, root, label } of [
  { w: 390, root: 34, label: '390px · 200% 확대' },
  { w: 320, root: 34, label: '320px · 200% 확대' },
  { w: 320, root: 17, label: '320px · 100%' },
]) {
  test(`GTO 탭 — ${label} 에서 잘리는 글자가 없다`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/?tab=tools');
    await stabilizeBackstack(page);
    await page.waitForSelector('[data-tools-lanebar]', { timeout: 30_000 });
    await page.waitForSelector('[data-testid="spot-hero"]', { timeout: 30_000 });
    await page.evaluate((fs) => { document.documentElement.style.fontSize = `${fs}px`; }, root);
    await page.waitForTimeout(900);

    const found = await page.evaluate(() => {
      const bar = document.querySelector('[data-tools-lanebar]');
      const scope = bar?.closest('.hero-aurora');
      if (!scope) return null;
      const cut: { kind: string; cls: string; c: number; s: number; t: string }[] = [];
      for (const el of [...scope.querySelectorAll('*')] as HTMLElement[]) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const t = (el.textContent ?? '').trim().slice(0, 24);
        if (!t) continue;
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
          cut.push({ kind: '가로', cls: el.className.toString().slice(0, 60), c: el.clientWidth, s: el.scrollWidth, t });
        }
        const clamped = cs.overflow === 'hidden' || cs.webkitLineClamp !== 'none';
        if (clamped && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) {
          cut.push({ kind: '세로', cls: el.className.toString().slice(0, 60), c: el.clientHeight, s: el.scrollHeight, t });
        }
      }
      return cut;
    });
    expect(found, 'GTO 탭(도구 패널)을 찾지 못했다 — 측정 자체가 성립하지 않는다').not.toBeNull();
    const cut = found!;
    if (cut.length) console.log('CUT ' + JSON.stringify(cut.slice(0, 12)));
    expect(cut.length,
      `잘린 글자 ${cut.length}곳: ${cut.slice(0, 6).map((x) => `[${x.kind}] "${x.t}" ${x.c}<${x.s}`).join(' / ')}`)
      .toBe(0);

    // 글자를 줄여서 회피하는 우회를 막는다 — 도구 카드 설명은 역할 토큰 하한(11.69px) 이상이어야 한다.
    const minFs = await page.evaluate(() => {
      const el = document.querySelector('[data-testid^="tool-"] span span:last-child');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
    if (minFs !== null) expect(minFs, '글자를 줄여서 잘림을 피했다').toBeGreaterThanOrEqual(11 * (root / 17));
  });
}
