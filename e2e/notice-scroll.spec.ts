// 공지 상세 — **긴 글을 스크롤해도 시트가 화면 밖으로 밀리지 않는다** (2026-09-11 오너 리포트)
//
// 증상(첨부 스크린샷): 모바일에서 긴 공지를 열고 아래로 훑으면 시트가 화면 아래로 밀려나고
//   검은 딤만 남는다. 하단에 '공지사항' 헤더와 닫기 버튼 일부만 걸쳐 보인다.
//
// 확정된 원인(아래 '공용 Modal — 제스처 불변식' 이 그대로 재현한다):
//   Modal.onSheetStart 는 진행 중인 애니메이션을 취소하면서 **그 순간의 위치를 인라인 transform 으로 고정**한다.
//   진입 키프레임(animate-sheet-up 0.26s)이 도는 중에 손이 닿으면 그 값이 수백 px 이다.
//   그런데 종료 경로 둘이 되돌리지 않고 return 했다:
//     ① onSheetMove 의 '위로 = 스크롤에 양보' 분기(resetGesture 만 호출)
//     ② onSheetEnd 의 '드래그로 확정되지 않음' 분기
//   그 뒤에는 본문이 스크롤된 상태라 onSheetStart 의 anyScrolled 가드에 걸려 다시 잡히지도 않는다 — 영구 고착.
//   수정 전 실측: rect.top = 915(뷰포트 높이와 동일) · inline transform = translateY(805.188px).
//
// 터치는 CDP(Input.dispatchTouchEvent)와 실제 TouchEvent 로 보낸다 — Playwright 의 tap 은 누름 시간이 0ms 라
// 네이티브 스크롤과 제스처가 겹치는 이 버그를 만들어 내지 못한다.
// 공지 조회는 page.route 로 만든다 — 운영 DB 에는 쓰지 않는다(_fixtures 가드).
import type { CDPSession, Locator, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

/** 여러 화면 높이보다 확실히 긴 본문 */
const LONG_BODY = Array.from({ length: 90 }, (_, i) =>
  `${i + 1}. 누리홀덤 공지 본문입니다. 이 줄은 스크롤 검증을 위해 충분히 길게 반복됩니다. 참가 신청과 이용 안내를 확인해 주세요.`,
).join('\n');

const NOTICE = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  type: 'pinned', title: '긴 공지 스크롤 검증', body: LONG_BODY,
  author_name: '운영자', board: 'all', sort_order: 0,
  created_at: '2026-09-01T00:00:00Z',
};

interface Probe {
  rect: { top: number; bottom: number; height: number };
  computed: string;
  inline: string;
  scroll: { top: number; client: number; scroll: number } | null;
  innerHeight: number;
  visualHeight: number | null;
  animations: number;
  lastTouch: string;
  translateY: number;
}

/** 마지막 touch 이벤트 종류를 기록하는 프로브(원인 추적용) */
async function installTouchProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lastTouch?: string };
    w.__lastTouch = '(none)';
    for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      window.addEventListener(t, () => { w.__lastTouch = t; }, { capture: true, passive: true });
    }
  });
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!dialog) throw new Error('dialog 가 없다');
    const cs = getComputedStyle(dialog);
    const r = dialog.getBoundingClientRect();
    const scroller = dialog.querySelector('.overflow-y-auto') as HTMLElement | null;
    const m = cs.transform.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number);
    return {
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
      computed: cs.transform,
      inline: dialog.style.transform,
      scroll: scroller ? {
        top: Math.round(scroller.scrollTop),
        client: Math.round(scroller.clientHeight),
        scroll: Math.round(scroller.scrollHeight),
      } : null,
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
      animations: dialog.getAnimations().length,
      lastTouch: (window as unknown as { __lastTouch?: string }).__lastTouch ?? '(none)',
      translateY: m && m.length === 6 ? Math.round(m[5]) : 0,
    };
  });
}

/**
 * 사람 손가락에 가까운 스와이프 — 누름 유지 시간과 중간 이동이 있어야
 * 네이티브 스크롤과 제스처 판정이 실제로 경합한다.
 * @param dy 음수 = 위로 쓸어 올림(=본문을 아래로 읽음)
 */
async function swipe(cdp: CDPSession, x: number, y: number, dy: number, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: Math.round(y + (dy * i) / steps) }],
    });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 게시판까지 들어가 공지 섹션을 돌려준다(상세는 아직 열지 않는다) */
async function gotoNotices(page: Page): Promise<Locator> {
  await installTouchProbe(page);
  await page.route(/\/rest\/v1\/marketplace_notices\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([NOTICE]) }));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('tab', { name: '커뮤니티', exact: true })
    .or(page.getByRole('button', { name: '커뮤니티', exact: true })).first().click();
  await page.getByRole('tab', { name: '게시판', exact: true })
    .or(page.getByRole('button', { name: '게시판', exact: true })).first().click();
  const sec = page.locator('section').filter({ has: page.getByRole('heading', { name: '공지사항' }) }).first();
  await expect(sec, '게시판 위 공지 섹션이 없다').toBeVisible({ timeout: 15_000 });
  return sec;
}

async function openDetail(page: Page, sec: Locator, settle = true): Promise<Locator> {
  await sec.getByRole('listitem').first().getByRole('button').first().click();
  const dialog = page.getByRole('dialog').filter({ hasText: '긴 공지 스크롤 검증' }).first();
  await expect(dialog, '공지 상세가 안 열렸다').toBeVisible({ timeout: 15_000 });
  if (settle) await page.waitForTimeout(600);   // 진입 애니메이션(animate-sheet-up 0.26s) 정착
  return dialog;
}

test.describe('공지 상세 — 긴 글 스크롤', () => {
  for (const vp of [{ w: 360, h: 800 }, { w: 412, h: 915 }]) {
    test(`🔴 ${vp.w}×${vp.h} — 반복 스크롤해도 시트가 화면 밖으로 밀리지 않는다`, async ({ page }) => {
      // 5회 × 5스와이프 × 450ms 정착 대기 ≈ 12s 가 본문이라, 전체 스위트 6워커 부하에서는 기본 30s 를 넘긴다
      // (2026-09-11 격리 게이트 실측: 마지막 '닫기' 클릭에서 만료). 스와이프 수는 재현 조건이라 줄이지 않는다.
      test.setTimeout(90_000);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const sec = await gotoNotices(page);
      const dialog = await openDetail(page, sec);
      const cdp = await page.context().newCDPSession(page);

      const start = await probe(page);
      expect(start.scroll, '스크롤러를 못 찾았다').not.toBeNull();
      expect(start.scroll!.scroll, '본문이 화면보다 길지 않다 — 이 픽스처로는 재현이 안 된다')
        .toBeGreaterThan(start.scroll!.client * 2);
      expect(start.translateY, `열자마자 시트가 밀려 있다: ${JSON.stringify(start)}`).toBeLessThanOrEqual(1);

      const x = Math.round(vp.w / 2);
      // 5회 반복 — 아래로 세 번 훑어 최하단까지 갔다가 위로 되돌린다
      for (let round = 0; round < 5; round++) {
        for (const dy of [-260, -260, -260, 240, 240]) {
          await swipe(cdp, x, Math.round(vp.h * 0.6), dy);
          await page.waitForTimeout(450);   // 스프링 정착까지 기다린 뒤 잰다
          const p = await probe(page);

          // ① 드래그 중이 아니면 translateY 는 0(또는 transform: none)이어야 한다
          expect(p.translateY, `[r${round} dy${dy}] 시트가 ${p.translateY}px 밀렸다: ${JSON.stringify(p)}`)
            .toBeLessThanOrEqual(1);
          // ② 헤더·본문이 화면 안에 남아 있다 — 검은 딤만 보이는 상태가 아니다
          expect(p.rect.top, `[r${round} dy${dy}] 시트 상단이 화면 밖(${p.rect.top}px)`).toBeLessThan(vp.h - 80);
          expect(p.rect.bottom, `[r${round} dy${dy}] 시트 하단이 화면 위(${p.rect.bottom}px)`).toBeGreaterThan(80);
        }
      }
      // 훑기가 헛돌았으면 이 스펙은 아무것도 증명하지 못한다 — 실제로 스크롤됐는지 확인
      const scrolled = await probe(page);
      expect(scrolled.scroll!.top, '본문이 스크롤되지 않았다').toBeGreaterThan(0);

      // ③ 헤더와 닫기 버튼이 계속 보인다
      await expect(dialog.getByRole('heading', { name: '공지사항' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '닫기' })).toBeVisible();

      // ④ X 로 정상 종료된다
      await dialog.getByRole('button', { name: '닫기' }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // ⑤ 다시 열면 0 에서 시작한다
      await openDetail(page, sec);
      const again = await probe(page);
      expect(again.translateY, `다시 열었더니 ${again.translateY}px 밀린 채 시작한다`).toBeLessThanOrEqual(1);
    });
  }

  test('🔴 본문 스크롤 중 touchCancel 이 와도 시트가 제자리로 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);
    const x = 206, y = 550;

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 25 }] });
      await new Promise((r) => setTimeout(r, 16));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForTimeout(700);

    const p = await probe(page);
    expect(p.translateY, `touchCancel 뒤에도 ${p.translateY}px 밀려 있다: ${JSON.stringify(p)}`).toBeLessThanOrEqual(1);
    expect(p.lastTouch).toBe('touchcancel');
  });

  test('🔴 scrollTop>0 에서 아래로 쓸면 본문만 스크롤되고 시트는 안 움직인다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    await swipe(cdp, 206, 550, -300);          // 먼저 아래로 내려가 scrollTop > 0 을 만든다
    await page.waitForTimeout(400);
    const mid = await probe(page);
    expect(mid.scroll!.top, '본문이 스크롤되지 않았다').toBeGreaterThan(50);

    await swipe(cdp, 206, 400, 200);           // 그 상태에서 아래로 쓸기 — 시트가 아니라 본문이 움직여야 한다
    await page.waitForTimeout(400);
    const after = await probe(page);
    expect(after.translateY, `스크롤 중인데 시트가 ${after.translateY}px 끌렸다`).toBeLessThanOrEqual(1);
    expect(after.scroll!.top, '아래로 쓸었는데 본문이 위로 안 갔다').toBeLessThan(mid.scroll!.top);
  });

  // ⚠ drag-close.spec.ts 의 같은 취지 테스트는 폐기된 E2E 계정 로그인이 필요해 현재 환경에서 못 돈다.
  //    끌어 내려 닫기는 이번 수정이 건드린 코드 바로 옆이라, 계정 없이 도는 경로로 여기서 한 번 더 잠근다.
  test('🔴 맨 위에서 아래로 끌면 여전히 닫힌다 — 원형 동작 보존', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const dialog = await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    await swipe(cdp, 206, 300, 420, 12);   // scrollTop 0 에서 아래로 크게 — 닫기 제스처
    await expect(dialog, '끌어 내려 닫기가 죽었다').toBeHidden({ timeout: 10_000 });
  });

  test('🔴 scrollTop=0 에서 위로 쓸면 시트는 안 움직이고 본문만 스크롤된다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    await swipe(cdp, 206, 600, -250);
    await page.waitForTimeout(500);
    const p = await probe(page);
    expect(p.translateY, `맨 위에서 위로 쓸었는데 시트가 ${p.translateY}px 움직였다`).toBeLessThanOrEqual(1);
    expect(p.scroll!.top, '본문이 스크롤되지 않았다').toBeGreaterThan(0);
  });
});

// ── 공용 Modal 의 제스처 불변식 ──────────────────────────────────────────────
// **드래그로 확정되지 않은 손짓이 끝난 뒤, 시트의 translateY 는 항상 0 이다.**
// 아래 둘이 수정 전 실제로 깨져 있던 경로다(공지뿐 아니라 dragToClose 시트·page 변형 전부에 해당).
test.describe('공용 Modal — 제스처 불변식', () => {
  /**
   * 진입 애니메이션이 도는 중에 손을 대고, 브라우저가 본문을 스크롤한 상황을 그대로 만든다.
   * 네이티브 스크롤은 터치 이벤트와 **독립적으로** 진행되므로 scrollTop 을 직접 올려 같은 조건을 만든다.
   */
  const runGesture = (page: Page, moveDy: number, endWith: 'touchend' | 'touchcancel', scrollTo: number) =>
    page.evaluate(([dy, endType, top]) => {
      const el = document.querySelector('[role="dialog"]') as HTMLElement;
      const scroller = el.querySelector('.overflow-y-auto') as HTMLElement;
      const target = (scroller.querySelector('p') ?? scroller) as Element;
      const fire = (type: string, clientY: number) => {
        const t = new Touch({ identifier: 1, target, clientX: 200, clientY });
        const empty = type === 'touchend' || type === 'touchcancel';
        target.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: empty ? [] : [t], targetTouches: empty ? [] : [t], changedTouches: [t],
        }));
      };
      // 진입 키프레임(0.26s)은 한산한 기기에서 제스처보다 먼저 끝난다 — 그러면 재현 조건이 사라진다.
      // 이미 끝났으면 **중간에 멈춘 대체 애니메이션**을 심는다. onSheetStart 는 어떤 애니든 취소하고
      // 그 순간의 표시 위치를 인라인으로 고정하므로, 버그 메커니즘은 실제 진입 애니와 동일하다.
      if (el.getAnimations().length === 0) {
        const a = el.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 10_000 });
        a.pause(); a.currentTime = 2_000;
      }
      const frozen = getComputedStyle(el).transform;   // 진입 애니가 걸려 있는 위치
      fire('touchstart', 600);
      scroller.scrollTop = top as number;              // 브라우저가 본문을 스크롤했다
      fire('touchmove', 600 + (dy as number));
      fire(endType as string, 600 + (dy as number));
      return { frozen, afterStart: el.style.transform };
    }, [moveDy, endWith, scrollTo] as [number, string, number]);

  test('🔴 진입 애니 중 손이 닿고 본문이 스크롤돼도 시트가 그 자리에 굳지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const sec = await gotoNotices(page);
    await openDetail(page, sec, false);            // ⚠ 정착을 기다리지 않는다 — 그게 재현 조건이다

    const g = await runGesture(page, -30, 'touchend', 120);
    expect(g.frozen, '진입 애니메이션이 이미 끝나 있어 재현 조건이 아니다').not.toBe('none');
    await page.waitForTimeout(800);

    const p = await probe(page);
    expect(p.translateY, `시트가 ${p.translateY}px 에서 굳었다(수정 전 실측 805px): ${JSON.stringify(p)}`)
      .toBeLessThanOrEqual(1);
    expect(p.rect.top, '시트 상단이 화면 밖으로 나갔다').toBeLessThan(915 - 80);
  });

  test('🔴 진입 애니 중 8px 미만 탭으로 끝나도 시트가 굳지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const sec = await gotoNotices(page);
    await openDetail(page, sec, false);

    const g = await runGesture(page, 2, 'touchend', 0);   // 히스테리시스(8px) 미만 = 드래그로 확정 안 됨
    expect(g.frozen, '진입 애니메이션이 이미 끝나 있어 재현 조건이 아니다').not.toBe('none');
    await page.waitForTimeout(800);

    const p = await probe(page);
    expect(p.translateY, `탭 한 번에 시트가 ${p.translateY}px 에서 굳었다: ${JSON.stringify(p)}`)
      .toBeLessThanOrEqual(1);
  });
});

// ── 닫는 동안 검은 화면이 남지 않는다 ────────────────────────────────────────
// 오너 리포트 2차(2026-09-11): "공지사항 내리면 검은 화면이 잠깐 동안 떠 있다."
// 원인은 딤(bg-black/80)이 시트와 분리돼 있던 것이었다. 실측(412×915, 수정 전):
//   시트는 652ms 에 이미 화면 밖인데 스프링은 852ms 에야 정착해 onClose 가 그때 불렸다
//   → 그 200ms 동안 화면에 검은 딤만 남았다. 스크린샷의 '시트 상단만 걸친 새까만 화면'이 그 구간이다.
// 이 스펙은 닫는 동안의 **모든 프레임**을 훑어 그런 프레임이 하나도 없음을 잠근다.
test.describe('공지 상세 — 닫는 동안 검은 화면', () => {
  /** 닫기 제스처 동안 프레임마다 (시트 위치, 화면을 덮은 검은 정도)를 기록한다 */
  const sampleClose = async (page: Page, cdp: CDPSession) => {
    await page.evaluate(() => {
      const w = window as unknown as { __tl?: { t: number; top: number | null; dim: number }[] };
      w.__tl = [];
      const t0 = performance.now();
      const alphaOf = (bg: string) => {
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (!m) return 0;
        const p = m[1].split(',').map((x) => parseFloat(x));
        return p.length >= 4 ? p[3] : 1;
      };
      const tick = () => {
        const t = Math.round(performance.now() - t0);
        const container = document.querySelector('[data-scroll-lock]') as HTMLElement | null;
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
        const backdrop = container?.firstElementChild as HTMLElement | null;
        const cs = container ? getComputedStyle(container) : null;
        const bs = backdrop ? getComputedStyle(backdrop) : null;
        const r = dialog?.getBoundingClientRect();
        // 화면을 실제로 덮은 검은 정도 = 컨테이너 opacity × 딤 opacity × 배경색 알파
        const dim = cs && bs ? parseFloat(cs.opacity) * parseFloat(bs.opacity) * alphaOf(bs.backgroundColor) : 0;
        w.__tl!.push({ t, top: r ? Math.round(r.top) : null, dim });
        if (t < 2200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // 맨 위에서 아래로 세게 끌기 = 닫기 제스처
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 206, y: 300 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 206, y: 300 + i * 35 }] });
      await new Promise((r) => setTimeout(r, 16));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(2400);
    return page.evaluate(() => (window as unknown as { __tl?: { t: number; top: number | null; dim: number }[] }).__tl ?? []);
  };

  test('🔴 끌어 내려 닫는 동안 "시트는 없고 검은 딤만" 인 프레임이 하나도 없다', async ({ page }) => {
    const H = 915;
    await page.setViewportSize({ width: 412, height: H });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    const tl = await sampleClose(page, cdp);
    expect(tl.length, '프레임 샘플러가 안 돌았다').toBeGreaterThan(30);
    // 실제로 닫혔는지 — 안 닫혔으면 이 스펙은 아무것도 증명하지 못한다
    expect(tl.some((f) => f.top === null), '닫기 제스처가 먹지 않았다').toBe(true);
    // 시트가 화면 밖(또는 없음)인데 딤이 눈에 띄게 남아 있는 프레임
    const black = tl.filter((f) => (f.top === null || f.top >= H - 4) && f.dim > 0.05);
    expect(black.map((f) => `t=${f.t} top=${f.top} dim=${f.dim.toFixed(2)}`),
      '시트는 화면 밖인데 검은 딤만 남는 구간이 있다').toEqual([]);
  });

  test('🔴 시트를 끌어 내리면 딤도 함께 걷힌다 — 뒤 화면이 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    const tl = await sampleClose(page, cdp);
    const onScreen = tl.filter((f) => f.top !== null && f.top < 915);
    const start = onScreen[0];
    // 시트가 화면의 3/4 지점까지 내려왔을 때 딤이 확실히 옅어져 있어야 한다
    const late = onScreen.filter((f) => (f.top as number) > 915 * 0.75);
    expect(late.length, '시트가 그만큼 안 내려갔다').toBeGreaterThan(0);
    expect(start.dim, '열린 상태의 딤이 예상과 다르다').toBeGreaterThan(0.5);
    expect(Math.max(...late.map((f) => f.dim)),
      `시트가 화면 아래 1/4 에 왔는데 딤이 ${Math.max(...late.map((f) => f.dim)).toFixed(2)} 로 남아 있다`)
      .toBeLessThan(0.2);
  });

  test('🔴 끌다가 놓아 되돌아오면 딤도 원래대로 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const dialog = await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    // 살짝만·천천히 끌고 놓는다 → 제자리 복귀. 임계 판정은 거리(120px)가 아니라 **투영 착지점**이라
    // sheet-spring.spec 과 같은 조리법(그립에서 60px / 400ms)을 쓴다 — 그쪽이 복귀를 실제로 만들어 내는 값이다.
    const grip = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const g = d && [...d.querySelectorAll<HTMLElement>('div')].find((x) => getComputedStyle(x).touchAction === 'none');
      const r = g?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });
    expect(grip, '그립(touch-action:none)을 못 찾았다').not.toBeNull();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip!.x, y: grip!.y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip!.x, y: grip!.y + (60 * i) / 12 }] });
      await page.waitForTimeout(400 / 12);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(900);

    await expect(dialog, '살짝 끌었을 뿐인데 닫혔다').toBeVisible();
    const back = await page.evaluate(() => {
      const container = document.querySelector('[data-scroll-lock]') as HTMLElement;
      const bd = container.firstElementChild as HTMLElement;
      const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
      const m = getComputedStyle(dialogEl).transform.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number);
      return { dimOpacity: parseFloat(getComputedStyle(bd).opacity), translateY: m && m.length === 6 ? Math.round(m[5]) : 0 };
    });
    expect(back.translateY, '시트가 제자리로 안 돌아왔다').toBeLessThanOrEqual(1);
    expect(back.dimOpacity, `딤이 ${back.dimOpacity} 로 옅어진 채 남았다 — 뒤 화면이 밝게 비친다`).toBeGreaterThan(0.95);
  });

  // ⚠ 이 아래 둘은 **제스처를 두 번** 한다. 한 번짜리 테스트로는 절대 안 잡히는 부류다:
  //   딤에 fill:'forwards' 애니가 남으면 캐스케이드에서 애니메이션 오리진이 인라인 스타일을 이겨
  //   그 뒤 setDim 이 화면에 전혀 반영되지 않는다(2026-09-11 실측: 인라인 0.03 인데 화면 1.0).
  //   무장 조건이 '앞선 제스처가 되돌아왔거나 스크롤에 뺏겼을 것' 이라 1회 제스처로는 재현되지 않는다.
  test('🔴 되돌아온 뒤 다시 끌어도 딤이 따라온다 — 남은 애니가 인라인을 이기지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    const grip = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const g = d && [...d.querySelectorAll<HTMLElement>('div')].find((x) => getComputedStyle(x).touchAction === 'none');
      const r = g?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });
    expect(grip, '그립을 못 찾았다').not.toBeNull();

    // 1차: 짧고 느리게 끌었다 놓기 → 제자리 복귀(여기서 딤 복귀 애니가 생긴다)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip!.x, y: grip!.y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip!.x, y: grip!.y + (60 * i) / 12 }] });
      await page.waitForTimeout(400 / 12);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(800);   // 복귀 애니가 끝나 'finished 인데 살아 있는' 상태가 되게 둔다

    // 2차: 깊게 끌고 **놓지 않은 채** 화면에 실제로 보이는 딤을 잰다
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip!.x, y: grip!.y }] });
    for (let i = 1; i <= 16; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip!.x, y: grip!.y + i * 45 }] });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(120);
    const held = await page.evaluate(() => {
      const container = document.querySelector('[data-scroll-lock]') as HTMLElement;
      const bd = container.firstElementChild as HTMLElement;
      const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
      return {
        shown: parseFloat(getComputedStyle(bd).opacity),   // 화면에 실제로 그려지는 값
        inline: bd.style.opacity,                          // 코드가 쓴 값
        top: Math.round(dialogEl.getBoundingClientRect().top),
        anims: bd.getAnimations().length,
      };
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    expect(held.top, '2차 드래그가 깊게 안 내려갔다 — 이 조건으로는 증명이 안 된다').toBeGreaterThan(915 * 0.6);
    expect(held.shown,
      `시트는 ${held.top}px 까지 내려갔는데 화면 딤은 ${held.shown} 다 (인라인은 "${held.inline}", 살아있는 애니 ${held.anims}개). ` +
      '남은 fill:forwards 애니가 인라인을 이기고 있다.').toBeLessThan(0.35);
  });

  test('🔴 본문 스크롤에 제스처를 뺏긴 뒤 다시 끌어도 딤이 따라온다', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDetail(page, await gotoNotices(page));
    const cdp = await page.context().newCDPSession(page);

    // 1차: 본문에서 위로 쓸어 스크롤에 뺏긴다(onSheetCancel → animateDim(1, 300))
    await swipe(cdp, 206, 600, -250);
    await page.waitForTimeout(700);
    // 다시 맨 위로 올려 두 번째 제스처가 무장되게 한다
    await swipe(cdp, 206, 300, 400, 14);
    await page.waitForTimeout(700);

    const grip = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const g = d && [...d.querySelectorAll<HTMLElement>('div')].find((x) => getComputedStyle(x).touchAction === 'none');
      const r = g?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });
    if (!grip) test.skip(true, '1차 제스처에서 시트가 닫혔다');

    // 2차: 깊게 끌고 붙든 채 화면 딤을 잰다
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip!.x, y: grip!.y }] });
    for (let i = 1; i <= 16; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip!.x, y: grip!.y + i * 45 }] });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(120);
    const held = await page.evaluate(() => {
      const bd = (document.querySelector('[data-scroll-lock]') as HTMLElement).firstElementChild as HTMLElement;
      const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
      return { shown: parseFloat(getComputedStyle(bd).opacity), inline: bd.style.opacity, top: Math.round(dialogEl.getBoundingClientRect().top) };
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    expect(held.top, '2차 드래그가 깊게 안 내려갔다').toBeGreaterThan(915 * 0.6);
    expect(held.shown, `딤이 ${held.shown} 로 남았다 (인라인 "${held.inline}")`).toBeLessThan(0.35);
  });
});
