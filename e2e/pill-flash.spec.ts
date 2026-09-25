// PILL-FLASH (오너 2026-09-26) — "내 매장에서 대메뉴 pill 을 눌러 이동하면 검정색이 됐다가 다시 콘텐츠가 나와 깜빡인다.
//   이런 부분 전부 다 찾아서 디버깅해."
//
// 원인(root-cause-debugger 실측, 프로덕션 빌드 · 목킹 업주 · 1440/1280/390 · 다크/라이트 · CPU 1/4배):
//   src/lib/tabCover.ts 의 '덮개' — 목적지 판 위에 지면색 한 장을 opacity 1 로 깔고, 판이 준비된 뒤(높이 정지 두 프레임)
//   50ms 머문 다음 280ms 에 걷었다. **판이 이미 완성된 재방문에서도** 그 순서를 탔으므로 이미 그려진 콘텐츠가
//   ~100ms(재방문 94~123ms · 첫 방문 98~471ms) 빈 지면으로 가려졌다. 판 영역 평균 휘도가 다크 7.9(지면색 그대로),
//   라이트 247.4(흰 판)까지 갔다. 메인 탭·하위 탭 25곳이 같은 함수를 타서 앱 전체가 같은 증상이었다.
//   반증: Suspense 폴백 프레임 0 · 재방문 스켈레톤 0(재마운트·재조회·청크 스로틀 아님) · 동작 줄이기(덮개 꺼짐) 대조군은 지면색 판 0.
// 고침: 덮개를 그리지 않는다(tabCover.ts 5차). 재방문은 0ms, 첫 방문은 판의 스켈레톤·이전 판이 보인다.
//
// 계약(이동마다 · CPU 4배 · 실제 입력 — PC 마우스 70ms 누름, 모바일 CDP 터치 홀드):
//   ① 덮개 요소([data-tab-cover]·[data-sub-cover])가 보이는(opacity > 0.05) 프레임 0 — DOM 표본(rAF)
//   ② 판 영역이 **평평한 한 색**(휘도 표준편차 < 2.5 — 빈 지면 판)인 화면 프레임 0 — CDP 스크린캐스트 픽셀.
//      ②는 덮개가 아닌 다른 방식으로 '빈 판' 을 다시 만들어도 잡는다. 공허 방지: 정착 판은 평평하지 않아야 한다.
// 음성 대조(2026-09-26 실행): 옛 tabCover.ts 빌드(덮개 있음)에 이 스펙을 돌리면 ①② 가 세 조건 모두 빨갛다.
//
// ⚠ bootOwner 는 매장·권한만 목킹하고 나머지 읽기는 운영으로 간다(쓰기는 _fixtures 가드가 끊는다).
// ⚠ 하네스 Chromium 만 본다 — 삼성 인터넷 GPU·실기기 밝기는 재현하지 못한다(재현 못 함 ≠ 없음).
// 실행: E2E_BASE_URL=http://localhost:43xx npx playwright test e2e/pill-flash.spec.ts
import type { Page, CDPSession } from '@playwright/test';
import { test, expect } from './_fixtures';
import sharp from 'sharp';
import { bootOwner, openMyStore } from './_mockOwner';

const STEPS = ['포스터', '장부', '클락', '순위', '정산', '이용권', '요약'] as const;
const WIN_MS = 900;
const FLAT_STD = 2.5;

type Shot = { ts: number; data: string };
type Row = { label: string; visit: string; coverMax: number; flat: number[]; frames: number; lastStd: number };

async function lumStats(b64: string, rect: { x: number; y: number; w: number; h: number }, vw: number) {
  const buf = Buffer.from(b64, 'base64');
  const meta = await sharp(buf).metadata();
  const sx = (meta.width ?? vw) / vw;
  const left = Math.max(0, Math.round(rect.x * sx)); const top = Math.max(0, Math.round(rect.y * sx));
  const width = Math.min((meta.width ?? 0) - left, Math.round(rect.w * sx)); const height = Math.min((meta.height ?? 0) - top, Math.round(rect.h * sx));
  if (width < 8 || height < 8) return null;
  const { data, info } = await sharp(buf).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  let s = 0; let s2 = 0; const n = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) { const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; s += y; s2 += y * y; }
  const mean = s / n;
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
}

async function run(page: Page, vp: { width: number; height: number }, scheme: 'dark' | 'light', mobile: boolean): Promise<Row[]> {
  await page.addInitScript((sch) => { try { localStorage.setItem('nuri-theme', sch); } catch { /* 차단 환경 */ } }, scheme);
  await bootOwner(page, { viewport: vp, appSettings: { identity_voucher_enabled: 'on' } });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-secpanel]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-mystore-rail] button').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const shots: Shot[] = [];
  cdp.on('Page.screencastFrame', (f) => { shots.push({ ts: (f.metadata.timestamp ?? 0) * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const label of [...STEPS, ...STEPS]) {
    const visit = seen.has(label) ? 'revisit' : 'first'; seen.add(label);
    const p = await page.evaluate((l) => {
      const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button')].find((x) => x.offsetParent !== null && (x.textContent ?? '').replace(/\s+/g, '').includes(l));
      if (!b) return null;
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label);
    expect(p, `단계 알약 '${label}' 을 못 찾았다 — 측정이 공허해진다`).not.toBeNull();
    await page.waitForTimeout(200);
    await page.evaluate((win) => {
      const w = window as unknown as { __pf: number[] | null };
      const fr: number[] = []; w.__pf = null; const t0 = performance.now();
      const cov = (el: Element | null) => { if (!el) return 0; const cs = getComputedStyle(el); if (cs.display === 'none') return 0; const r = el.getBoundingClientRect(); return r.width * r.height < 1 ? 0 : Number(cs.opacity); };
      const tick = () => { fr.push(Math.max(cov(document.querySelector('[data-tab-cover]')), cov(document.querySelector('[data-sub-cover]')))); if (performance.now() - t0 < win) requestAnimationFrame(tick); else w.__pf = fr; };
      requestAnimationFrame(tick);
    }, WIN_MS);
    shots.length = 0;
    const t0 = Date.now();
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p!.x, y: p!.y }] });
      await page.waitForTimeout(110);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(p!.x, p!.y); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
    }
    await page.waitForFunction(() => (window as unknown as { __pf: number[] | null }).__pf, null, { timeout: 20_000 });
    const covs = await page.evaluate(() => (window as unknown as { __pf: number[] }).__pf);
    const rect = await page.evaluate(() => {
      const b = document.querySelector('[data-mystore-secpanel]')!.getBoundingClientRect();
      const top = Math.max(b.top, 0); return { x: b.left, y: top, w: b.width, h: Math.min(b.bottom, innerHeight) - top };
    });
    await page.waitForTimeout(150);
    const flat: number[] = []; let lastStd = -1; let n = 0;
    for (const s of shots.splice(0)) {
      const dt = s.ts - t0;
      if (dt < 0 || dt > WIN_MS) continue;
      const st = await lumStats(s.data, rect, vp.width);
      if (!st) continue;
      n++; lastStd = st.std;
      if (st.std < FLAT_STD) flat.push(Math.round(dt));
    }
    rows.push({ label, visit, coverMax: Math.max(0, ...covs), flat, frames: n, lastStd });
    await page.waitForTimeout(300);
  }
  await cdp.send('Page.stopScreencast').catch(() => {});
  if (process.env.PILL_FLASH_LOG) for (const r of rows) console.log(`[pill-flash] ${r.visit} ${r.label} cover=${r.coverMax} flat=${r.flat.join(',')} frames=${r.frames} lastStd=${r.lastStd.toFixed(1)}`);
  return rows;
}

function expectNoFlash(rows: Row[], tag: string) {
  const covered = rows.filter((r) => r.coverMax > 0.05).map((r) => `${r.visit} ${r.label} op=${r.coverMax.toFixed(2)}`);
  expect.soft(covered, `${tag}: 덮개(지면색 판)가 콘텐츠를 가렸다 — '검정 → 콘텐츠' 깜빡임`).toEqual([]);
  const flat = rows.filter((r) => r.flat.length > 0).map((r) => `${r.visit} ${r.label} @${r.flat.join(',')}ms`);
  expect.soft(flat, `${tag}: 판 영역이 한 색으로 평평한 프레임(빈 지면 판)이 화면에 나왔다`).toEqual([]);
  // 공허 방지 — 화면 프레임을 실제로 받았고, 정착한 판은 평평하지 않다(글자·카드가 있다).
  expect.soft(rows.filter((r) => r.frames > 0).length, `${tag}: 스크린캐스트 프레임을 거의 못 받았다`).toBeGreaterThanOrEqual(rows.length / 2);
  expect.soft(rows.filter((r) => r.lastStd >= 0 && r.lastStd < FLAT_STD).map((r) => r.label), `${tag}: 정착 판이 평평하다 — 측정 대상이 틀렸다`).toEqual([]);
}

test.describe('PILL-FLASH — 내 매장 단계 알약 이동에 빈 지면 판이 끼지 않는다(CPU 4배)', () => {
  test.describe.configure({ timeout: 180_000 });
  test('PC 1440 · 다크 — 첫 방문 7 · 재방문 7', async ({ page }) => {
    const rows = await run(page, { width: 1440, height: 900 }, 'dark', false);
    expect(rows, '잰 이동 수(첫 방문 7 · 재방문 7)').toHaveLength(14);
    expectNoFlash(rows, 'PC 다크');
  });
  test('PC 1440 · 라이트 — 흰 판 번쩍임도 같은 원인', async ({ page }) => {
    const rows = await run(page, { width: 1440, height: 900 }, 'light', false);
    expect(rows, '잰 이동 수(첫 방문 7 · 재방문 7)').toHaveLength(14);
    expectNoFlash(rows, 'PC 라이트');
  });
  test('모바일 390 · 다크 · 터치 홀드', async ({ page }) => {
    const rows = await run(page, { width: 390, height: 844 }, 'dark', true);
    expect(rows, '잰 이동 수(첫 방문 7 · 재방문 7)').toHaveLength(14);
    expectNoFlash(rows, '모바일 다크');
  });
});
