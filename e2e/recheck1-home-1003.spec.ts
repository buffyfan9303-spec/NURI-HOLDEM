// 전체 재점검 1회차(2026-10-03) 화면 결과 중 home-team 몫 — N-5 · L1-1 · L1-12(관리자 '정지 중')
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\recheck1-screens-1003.md
//
// 세션은 가짜(로컬), 데이터는 전부 page.route — 운영 DB 에 읽기도 쓰기도 보내지 않는다.
// 폭은 유저 화면 기준 390 · 360(모바일).
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';
import { kstDay } from './_schedules';
import { LEGAL_VERSION } from '../src/lib/legalVersion';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000c103';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const SESSION = {
  access_token: [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.'),
  refresh_token: 'e2e-rc1', token_type: 'bearer', expires_in: 3600, expires_at: exp(),
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'rc1@example.com', app_metadata: { provider: 'email' }, user_metadata: { name: 'RC1' }, created_at: '2026-01-01T00:00:00Z' },
};
const PROFILE = { id: UID, name: 'RC1', nickname: 'RC1', role: 'user', approved: true, status: 'active', activity_points: 0,
  agreed_to_terms: true, consented_legal_version: LEGAL_VERSION, created_at: '2026-01-01T00:00:00Z' };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 포괄 목킹을 먼저, 개별 목킹을 뒤에(나중에 등록한 route 가 먼저 돈다). */
async function mockAll(page: Page, loggedIn: boolean) {
  if (loggedIn) {
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }, [KEY, JSON.stringify(SESSION)] as [string, string]);
  }
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/(?!rpc\/)/, (r: Route) => (['GET', 'HEAD'].includes(r.request().method()) ? r.fulfill(json([])) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json(null)));
  if (loggedIn) {
    await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PROFILE)) : r.abort()));
    await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(SESSION.user)));
  }
}

test.describe('재점검 1회차 home-team 수정', () => {
  // ── N-5 ────────────────────────────────────────────────────────────────────
  test('N-5 내 정보 › 보안의 비밀번호 보기 버튼 누름면 44×44 · 값이 버튼 밑으로 안 들어간다 (390·360)', async ({ page }) => {
    await mockAll(page, true);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.getByRole('button', { name: 'RC1 메뉴' }).click({ timeout: 20_000 });
      await page.getByRole('button', { name: '내 정보 열기' }).click();
      const tab = page.locator('[data-profile-tabbar]').getByRole('tab', { name: '보안', exact: true });
      await tab.evaluate((b) => (b as HTMLElement).click());
      await expect(tab).toHaveAttribute('aria-selected', 'true');

      const toggles = page.getByRole('button', { name: '비밀번호 보기' });
      await expect(toggles.first()).toBeVisible();
      const n = await toggles.count();
      expect(n, '보안 탭의 비밀번호 칸(새 비밀번호·확인)').toBeGreaterThanOrEqual(2);
      for (let i = 0; i < n; i++) {
        const m = await toggles.nth(i).evaluate((b) => {
          b.scrollIntoView({ block: 'center' });   // elementFromPoint 는 화면 밖 좌표에 null 을 준다
          const r = b.getBoundingClientRect();
          const input = b.parentElement!.querySelector('input')!;
          const cs = getComputedStyle(input);
          const ir = input.getBoundingClientRect();
          // 누름면 네 변의 가운데 안쪽 1px 이 실제로 이 버튼(또는 자손)에 떨어지는가 — 덮개·잘림 배제.
          // (모서리는 쓰지 않는다: Chromium 히트 테스트는 border-radius 를 따르므로 둥근 모서리 1px 은 부모에 떨어진다)
          const cxm = r.left + r.width / 2, cym = r.top + r.height / 2;
          const pts = [[cxm, r.top + 1], [cxm, r.bottom - 1], [r.left + 1, cym], [r.right - 1, cym]];
          const hits = pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)); }).length;
          const cx = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const at = JSON.stringify({ r: [r.left, r.top, r.width, r.height].map(Math.round), vh: innerHeight, center: cx ? `${cx.tagName}.${cx.className.toString().slice(0, 60)}` : null });
          return { w: r.width, h: r.height, hits, at, textRight: ir.right - parseFloat(cs.paddingRight), btnLeft: r.left };
        });
        expect(m.w, `${width}px 토글 ${i} 폭`).toBeGreaterThanOrEqual(44);
        expect(m.h, `${width}px 토글 ${i} 높이`).toBeGreaterThanOrEqual(44);
        expect(m.hits, `${width}px 토글 ${i} 네 변 끝이 버튼에 닿아야 한다 ${m.at}`).toBe(4);
        expect(m.textRight, `${width}px 토글 ${i} 입력 글자 영역이 버튼 밑으로 들어간다`).toBeLessThanOrEqual(m.btnLeft + 0.5);
      }
      // 닫고 다음 폭으로
      await page.keyboard.press('Escape');
    }
  });

  // ── L1-1 ───────────────────────────────────────────────────────────────────
  for (const qrFails of [false, true]) {
    // 정상: QR 이 늦게 와도 · 실패(하-1): QR 이 끝내 안 만들어져도 — 어느 쪽이든 버튼이 한 픽셀도 움직이면 안 된다.
    test(`L1-1 오늘 대회 포스터 상세 — QR 이 ${qrFails ? '만들어지지 않아도 자리가 남아서' : '늦게 와도'} '꾹 눌러 참가 신청' 줄이 움직이지 않는다 (390)`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockAll(page, false);
      // 하-1 QR 생성 실패 흉내 — qrcode 라이브러리는 canvas.toDataURL 로 이미지를 만든다(이게 던지면 .catch → setQr(null))
      if (qrFails) {
        await page.addInitScript(() => {
          const w = window as unknown as { __qrFail: number };
          w.__qrFail = 0;
          HTMLCanvasElement.prototype.toDataURL = () => { w.__qrFail++; throw new Error('e2e: QR 생성 실패 흉내'); };
        });
      }
      const SID = 'e2e-rc1-today';
      const row = {
        id: SID, title: '재점검 오늘 대회', venue_id: 'e2e-rc1-venue', pub_name: '재점검 홀덤펍', region: '서울', address: '서울시 강남구',
        date: kstDay(0), start_time: '23:30:00', duration: '6시간', format: 'MTT', guaranteed: true, prize_pool: 1_000_000,
        prize_percent: null, is_competition: false, grade: null, blinds: null, reg_close_time: null, buy_in: { amount: 50_000 },
        seats: null, structure: null, description: null, side_events: null, ranking_prizes: null, partners: null, promotions: null,
        payment_methods: null, rules: null, poster_url: null, poster_color: null, display_order: 1, is_premium: false,
        premium_until: null, owner_id: 'e2e-rc1-owner', unread_qna_count: 0, approved: true, view_count: 0, rejected_at: null, reject_reason: null,
      };
      await page.route(/\/rest\/v1\/schedules\?/, (r) => {
        const single = /vnd\.pgrst\.object\+json/.test(r.request().headers()['accept'] ?? '');
        return r.fulfill(json(single ? row : [row]));
      });
      // '꾹 눌러 참가 신청' 버튼이 처음 생긴 프레임부터 매 프레임 위치를 적는다(포스터 상세는 lazy 라 언제 뜰지 모른다)
      await page.addInitScript(() => {
        const w = window as unknown as { __hold: { t: number; left: number; top: number; boxH: number }[] };
        w.__hold = [];
        let t0 = 0;
        const tick = () => {
          const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('꾹 눌러 참가 신청'));
          if (btn) {
            if (!t0) t0 = performance.now();
            const box = btn.closest('.rounded-aura') as HTMLElement | null;
            const r = btn.getBoundingClientRect();
            w.__hold.push({ t: Math.round(performance.now() - t0), left: r.left, top: r.top - (box?.getBoundingClientRect().top ?? 0), boxH: box?.getBoundingClientRect().height ?? 0 });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goto(`/?s=${SID}`);
      await expect(page.getByRole('button', { name: /꾹 눌러 참가 신청/ })).toBeVisible({ timeout: 20_000 });
      if (qrFails) {
        // 실패 처리(.catch → setQr(null))가 끝난 뒤부터 잰다 — 라이브러리가 toDataURL 을 실제로 불렀는지로 확인
        await page.waitForFunction(() => (window as unknown as { __qrFail?: number }).__qrFail! > 0, undefined, { timeout: 20_000 });
      } else {
        await expect(page.getByRole('img', { name: '바인 요청 QR' })).toBeVisible();
      }
      await page.waitForTimeout(1200);
      const frames = await page.evaluate(() => (window as unknown as { __hold: { t: number; left: number; top: number; boxH: number }[] }).__hold);
      expect(frames.length, '버튼 프레임을 하나도 못 잡았다(측정 무효)').toBeGreaterThan(10);
      const first = frames[0];
      const moved = frames.filter((f) => Math.abs(f.left - first.left) > 0.5 || Math.abs(f.top - first.top) > 0.5 || Math.abs(f.boxH - first.boxH) > 0.5);
      expect(moved.length ? `첫 프레임 ${JSON.stringify(first)} → ${JSON.stringify(moved[0])}` : 'stable').toBe('stable');
      // 실패해도 자리는 남고 작은 안내가 보인다(빈 칸이 아니라 이유를 알려 준다)
      if (qrFails) {
        const slot = page.getByTestId('buyin-qr-slot');
        await expect(slot).toHaveText('QR을 만들지 못했어요');
        // 72×72 안에 안내가 다 들어간다(잘리지 않는다)
        const m = await slot.evaluate((e) => ({ w: e.clientWidth, h: e.clientHeight, sw: e.scrollWidth, sh: e.scrollHeight }));
        expect(m, '안내 칸 크기·잘림').toEqual({ w: 72, h: 72, sw: 72, sh: 72 });
      }
    });
  }

  // ── L1-12(관리자 › 회원 관리 '정지 중') ────────────────────────────────────
  test('L1-12 라이트 모드 text-orange-400 상태 글자 대비 ≥ 4.5 (surface-high 카드 · 주황 배지)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAll(page, false);
    await page.goto('/');
    await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); });
    const ratios = await page.evaluate(() => {
      const el = (tag: string, cls: string, parent: HTMLElement, id = '', text = '') => {
        const e = document.createElement(tag); e.className = cls; if (id) e.id = id; if (text) e.textContent = text; parent.appendChild(e); return e;
      };
      // UserManagementTab SummaryCard('정지 중')와 상태 배지(bg-orange-500/15)를 같은 클래스로 만든다
      const host = el('div', '', document.body);
      const cardBox = el('div', 'rounded-input border bg-surface-high py-2 text-orange-400 border-orange-500/30', host, 'rc1-card');
      el('p', 'text-2xs', cardBox, '', '정지 중');
      const badgeBase = el('div', 'bg-surface-low', host);
      el('span', 'bg-orange-500/15 text-orange-400 border-orange-500/30', badgeBase, 'rc1-badge', '정지 중');
      const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const over = (fg: number[], bg: number[]) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
      const cr = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const cardEl = document.querySelector('#rc1-card p')!;
      const card = cr(rgb(getComputedStyle(cardEl).color), rgb(getComputedStyle(document.getElementById('rc1-card')!).backgroundColor));
      const badgeEl = document.getElementById('rc1-badge')!;
      const base = rgb(getComputedStyle(badgeEl.parentElement!).backgroundColor);
      const badge = cr(rgb(getComputedStyle(badgeEl).color), over(rgb(getComputedStyle(badgeEl).backgroundColor), base));
      host.remove();
      return { card: Math.round(card * 100) / 100, badge: Math.round(badge * 100) / 100 };
    });
    expect(ratios.card, `정지 중 카드 대비 ${ratios.card}`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.badge, `정지 배지 대비 ${ratios.badge}`).toBeGreaterThanOrEqual(4.5);
  });

  // ── L1-8 · L1-9 · L1-10(정적 문서 줄바꿈) ─────────────────────────────────
  // 정적 HTML 이라 앱 목킹과 무관하다. 문구는 그대로 두고 줄바꿈 자리만 본다.
  for (const width of [360, 390]) {
    test(`L1-8·9·10 정적 문서 — 숫자·단위가 안 갈리고 표 칸이 한 글자씩 안 쌓인다 (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      /** root 안에서 needle 문자열이 차지하는 줄 수 */
      const linesOf = (sel: string, needle: string) => page.evaluate(([s, nd]) => {
        const root = document.querySelector(s); if (!root) return -1;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n: Node | null;
        while ((n = tw.nextNode())) {
          const i = (n.nodeValue ?? '').indexOf(nd); if (i < 0) continue;
          const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + nd.length);
          const tops: number[] = [];
          for (const rc of rg.getClientRects()) { if (rc.width < 0.5) continue; if (!tops.some((t) => Math.abs(t - rc.top) < 3)) tops.push(rc.top); }
          return tops.length;
        }
        return 0;
      }, [sel, needle] as [string, string]);

      for (const doc of ['terms', 'marketing', 'privacy', 'licenses']) {
        await page.goto(`/legal/${doc}.html`);
        await page.evaluate(() => document.fonts.ready);
        expect.soft(await linesOf('footer', '1336(24시간·무료)'), `${doc} 하단 1336 고지`).toBe(1);
        expect.soft(await linesOf('footer', '525-20-02937'), `${doc} 하단 사업자등록번호`).toBe(1);
      }
      await page.goto('/legal/marketing.html');
      await page.evaluate(() => document.fonts.ready);
      const dateLine = await page.evaluate(() => {
        const p = [...document.querySelectorAll('.doc p')].find((e) => (e.textContent ?? '').startsWith('시행일')); if (!p) return null;
        // '30일'·'8월' 처럼 숫자+단위 묶음이 두 줄에 걸쳤는가
        const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n: Node | null; const split: string[] = [];
        while ((n = tw.nextNode())) {
          const re = /\d+[년월일]/g; let m: RegExpExecArray | null;
          while ((m = re.exec(n.nodeValue ?? ''))) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top)));
            if (tops.size > 1) split.push(m[0]);
          }
        }
        return split;
      });
      expect.soft(dateLine, '마케팅 동의 시행일 줄').toEqual([]);

      // 사용설명서: 한 글자씩 쌓인 칸 0 · 페이지 가로 넘침 0
      await page.goto('/guide/manual.html');
      await page.evaluate(() => document.fonts.ready);
      const man = await page.evaluate(() => {
        const stacked: string[] = [];
        for (const c of document.querySelectorAll('td, th')) {
          const t = (c.textContent ?? '').replace(/\s+/g, ''); if (t.length < 2) continue;
          const rg = document.createRange(); rg.selectNodeContents(c);
          const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top / 3)));
          if (tops.size >= t.length) stacked.push(t);
        }
        return { stacked, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect.soft(man.stacked, '사용설명서 표에서 한 글자씩 세로로 쌓인 칸').toEqual([]);
      expect.soft(man.overflowX, '사용설명서 가로 넘침').toBeLessThanOrEqual(0);

      // 개인정보처리방침 국외 이전 표(6열): 글이 있는 칸의 줄당 글자 수 최소 3 이상
      await page.goto('/legal/privacy.html');
      await page.evaluate(() => document.fonts.ready);
      const cpl = await page.evaluate(() => {
        let worst = 99;
        for (const t of document.querySelectorAll('.doc table')) {
          if ((t.querySelector('tr')?.children.length ?? 0) < 5) continue;
          for (const c of t.querySelectorAll('td')) {
            const txt = (c.textContent ?? '').replace(/\s+/g, ''); if (txt.length < 6) continue;
            const rg = document.createRange(); rg.selectNodeContents(c);
            const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top / 3)));
            worst = Math.min(worst, txt.length / tops.size);
          }
        }
        return Math.round(worst * 10) / 10;
      });
      expect.soft(cpl, '국외 이전 표 줄당 최소 글자 수').toBeGreaterThanOrEqual(3);
    });
  }

  // ── 하-2 · 하-3: 본문(표·하단 고지 밖)의 1336 과 사용설명서의 숫자+단위 ─────────────
  for (const width of [360, 390]) {
    test(`하-2·3 약관·청소년보호 본문의 1336 이 한 줄 · 사용설명서 본문의 숫자와 단위가 줄 끝에서 안 갈린다 (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const doc of ['terms', 'anti-gambling']) {
        await page.goto(`/legal/${doc}.html`);
        await page.evaluate(() => document.fonts.ready);
        const lines = await page.evaluate(() => {
          const out: string[] = [];
          const tw = document.createTreeWalker(document.querySelector('.doc')!, NodeFilter.SHOW_TEXT); let n: Node | null;
          while ((n = tw.nextNode())) {
            for (const nd of ['1336(24시간·무료)', '1336 (24시간·무료)']) {
              const i = (n.nodeValue ?? '').indexOf(nd); if (i < 0) continue;
              const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + nd.length);
              const rows = new Set([...rg.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top))).size;
              out.push(`${nd}=${rows}줄`);
            }
          }
          return out;
        });
        expect(lines.length, `${doc} 본문에서 1336 고지를 하나도 못 찾았다(측정 무효)`).toBeGreaterThan(0);
        expect.soft(lines.filter((l) => !l.endsWith('=1줄')), `${doc} 본문 1336 고지가 줄을 넘는다`).toEqual([]);
      }

      await page.goto('/guide/manual.html');
      await page.evaluate(() => document.fonts.ready);
      const split = await page.evaluate(() => {
        const out: string[] = [];
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n: Node | null;
        while ((n = tw.nextNode())) {
          const t = n.nodeValue ?? '';
          // 숫자(와 / ~ . 로 이어진 숫자 묶음) + 바로 붙은 첫 단위 글자 — '3/7/14/30일'·'25분'·'1~15레벨'
          const re = /\d[\d.,~/]*[^\s\d.,~/]/g; let m: RegExpExecArray | null;
          while ((m = re.exec(t))) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            const rows = new Set([...rg.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top))).size;
            if (rows > 1) out.push(m[0]);
          }
        }
        return { out, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect.soft(split.out, '사용설명서 본문에서 줄 끝에 갈린 숫자+단위').toEqual([]);
      expect.soft(split.overflowX, '사용설명서 가로 넘침').toBeLessThanOrEqual(0);
    });
  }
});
