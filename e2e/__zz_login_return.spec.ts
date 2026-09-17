// 임시 계측 — 로그인 성공 직후 복귀 구간(드득·잔류·소실)을 프레임 단위로 기록한다. 끝나면 지운다.
import { test } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.ZZ_OUT ?? 'C:/Users/buffy/AppData/Local/Temp/claude/C--Users-buffy-OneDrive-----------/65749b7e-e04e-4522-be5d-3e6e64266487/scratchpad/login-return';

const UID = '00000000-0000-4000-8000-0000000000f2';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.now() / 1000) + 3600;
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: EXP })}.stub`;
const USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'zz@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const SESSION = { access_token: TOKEN, refresh_token: 'zz-refresh', token_type: 'bearer', expires_in: 3600, expires_at: EXP, user: USER };
const PROFILE = {
  id: UID, email: 'zz@example.test', name: '계측계정', nickname: '계측계정', role: 'user', approved: true, venue_id: null,
  avatar_color: '#8B5CF6', avatar_url: null, status: 'active', suspended_until: null, sanction_reason: null,
  agreed_to_terms: true, agreed_to_marketing: false, consented_legal_version: 2,
  joined_at: '2026-01-01T00:00:00Z', last_seen_at: null, name_changed_at: null,
  activity_points: 10, badges: [], staff_title: null, ci_hash: null, verified_at: null, real_name: null,
};

test('🔬 로그인 성공 → 복귀 구간 프레임 계측', async ({ page }) => {
  test.setTimeout(90_000);
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await stabilizeBackstack(page);

  const marks: Record<string, number> = {};
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const LAT = process.env.ZZ_LAT === '1';
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
  await page.route(/\/auth\/v1\/token/, async (r) => { if (LAT) await wait(320); marks.tokenResp = Date.now(); return r.fulfill(json(SESSION)); });
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(USER)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const n = (marks.profileN = (marks.profileN ?? 0) + 1);
    return (async () => { if (LAT) await wait(n === 1 ? 90 : 260); marks[`profile${n}`] = Date.now(); return r.fulfill(json(PROFILE)); })();
  });
  await page.route(/\/rest\/v1\/rpc\/claim_daily_login_point/, (r) => { marks.dailyPoint = Date.now(); return r.fulfill(json(10)); });
  await page.route(/\/rest\/v1\/rpc\/claim_pending_referral_tickets/, (r) => r.fulfill(json(null)));

  await page.goto('/');
  await dismissOverlays(page);
  const SCROLL = Number(process.env.ZZ_SCROLL ?? 0);
  if (SCROLL) { await page.evaluate((y) => scrollTo(0, y), SCROLL); await page.waitForTimeout(300); }
  const cdp0 = await page.context().newCDPSession(page);
  const CPU = Number(process.env.ZZ_CPU ?? 1);
  if (CPU > 1) await cdp0.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  marks.scrollBeforeOpen = await page.evaluate(() => scrollY);
  let reqN = 0; page.on('request', () => { reqN++; });
  await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 15_000 });
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800); // 진입 애니메이션 정착
  await dialog.locator('input[type="email"]').fill('zz@example.test');
  await dialog.locator('input[type="password"]').first().fill('password-stub');
  await page.waitForTimeout(300);

  // ── 스크린캐스트(컴포지터 프레임) ─────────────────────────────────────────
  const cdp = await page.context().newCDPSession(page);
  const shots: { ts: number; i: number }[] = [];
  let shotN = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const i = shotN++;
    shots.push({ ts: f.metadata.timestamp! * 1000, i });
    writeFileSync(join(OUT, `f${String(i).padStart(3, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });

  // ── 페이지 안 계측기 ────────────────────────────────────────────────────
  await page.evaluate(() => {
    type Rec = { epoch0: number; t0: number; frames: unknown[]; perf: unknown[]; done: boolean };
    const rec: Rec = { epoch0: performance.timeOrigin, t0: performance.now(), frames: [], perf: [], done: false };
    (window as unknown as { __rec: Rec }).__rec = rec;
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value?: number; hadRecentInput?: boolean; sources?: { node?: Element; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }[]; scripts?: { invoker?: string; duration?: number; sourceURL?: string }[]; renderStart?: number; styleAndLayoutStart?: number })[]) {
        rec.perf.push({
          type: e.entryType, start: Math.round(e.startTime), dur: Math.round(e.duration),
          value: e.value, hadRecentInput: e.hadRecentInput,
          sources: e.sources?.map((s) => ({
            node: s.node ? `${s.node.tagName}.${String((s.node as HTMLElement).className || '').slice(0, 50)}` : null,
            from: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round) : null,
            to: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) : null,
          })),
          scripts: e.scripts?.map((s) => ({ inv: s.invoker, dur: Math.round(s.duration ?? 0) })),
          renderStart: e.renderStart != null ? Math.round(e.renderStart) : undefined,
          layoutStart: e.styleAndLayoutStart != null ? Math.round(e.styleAndLayoutStart) : undefined,
        });
      }
    });
    po.observe({ entryTypes: ['longtask', 'long-animation-frame', 'layout-shift'] });
    const start = performance.now();
    const tick = (t: number) => {
      const dlg = document.querySelector<HTMLElement>('[role="dialog"]');
      const wrap = dlg?.parentElement ?? null;
      const bd = wrap?.querySelector<HTMLElement>(':scope > .absolute.inset-0') ?? null;
      const btn = dlg?.querySelector<HTMLElement>('button[aria-live]') ?? null;
      const cs = dlg ? getComputedStyle(dlg) : null;
      const hdrLogin = [...document.querySelectorAll<HTMLElement>('header button')].some((b) => b.textContent?.trim() === '로그인');
      rec.frames.push({
        t: Math.round(t - start),
        dlg: !!dlg, op: cs?.opacity, tf: cs?.transform === 'none' ? 'none' : cs?.transform?.replace(/matrix\(1, 0, 0, 1, /, '').replace(')', ''),
        an: cs?.animationName, wrapAn: wrap ? getComputedStyle(wrap).animationName : null,
        bdOp: bd ? getComputedStyle(bd).opacity : null,
        btn: btn?.textContent?.trim().slice(0, 8) ?? null, btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
        hdrLogin, toast: !!document.body.textContent?.includes('로그인되었습니다'),
        sh: document.documentElement.scrollHeight, sy: Math.round(scrollY),
        ovf: getComputedStyle(document.documentElement).overflow,
        ae: `${document.activeElement?.tagName}:${(document.activeElement as HTMLElement | null)?.getAttribute('aria-label') ?? (document.activeElement as HTMLElement | null)?.textContent?.trim().slice(0, 10)}`,
        hdrH: Math.round(document.querySelector('header')?.getBoundingClientRect().height ?? 0),
        mainH: Math.round(document.querySelector('main')?.getBoundingClientRect().height ?? 0),
        mainTop: Math.round(document.querySelector('main')?.getBoundingClientRect().top ?? 0),
        rootKids: [...document.querySelectorAll('#root > *, #root > * > *')].map((e) => Math.round(e.getBoundingClientRect().height)).join(','),
      });
      if (t - start < 3500) requestAnimationFrame(tick); else rec.done = true;
    };
    requestAnimationFrame(tick);
  });

  const btn = dialog.getByRole('button', { name: /^로그인$/ }).last();
  reqN = 0; marks.click = Date.now();
  await btn.evaluate((el) => (el as HTMLElement).click());
  await page.waitForFunction(() => (window as unknown as { __rec: { done: boolean } }).__rec.done, null, { timeout: 10_000 });
  await cdp.send('Page.stopScreencast');
  const rec = await page.evaluate(() => (window as unknown as { __rec: unknown }).__rec);
  marks.reqAfterClick = reqN; marks.scrollAfter = await page.evaluate(() => scrollY);
  writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ marks, shots, rec }, null, 1));
});
