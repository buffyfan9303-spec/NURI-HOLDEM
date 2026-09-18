// 알약이 '첫 칸으로 새는' 근본 원인의 회귀 게이트 (2026-09-10 실기기 재보고 → 계측으로 확정).
//
// 원인: 전역 프레스 물리(index.css `button:active { transform: scale(.97) }` + 0.2s 복귀 전환)가
// 방금 누른 탭 버튼에 걸려 있는 동안, Chromium 은 그 버튼(transform 있는 조상)을 span 의 offsetParent 로
// 삼는다 → SlidingPill 이 읽던 `target.offsetLeft` 가 0 → 알약이 레일 맨 왼쪽으로 간다. 600ms verify
// 타이머가 되돌릴 때까지 첫 칸에 머물고, VT 경로에선 그 틀린 값이 새 스냅샷이 되어 전환이 알약을
// 첫 칸으로 미끄러뜨린다(오너 스크린샷 그대로).
//
// 왜 기존 스펙이 못 잡았나: Playwright 의 click/tap 은 누름이 0ms 라 :active 가 렌더되기 전에 끝난다.
// 실제 손가락은 누르고 있는 시간이 있다. 그래서 여기서는 CDP 로 **눌렀다 떼는** 터치를 보내고,
// 떼고 난 +60~500ms 를 샘플링한다(verify 타이머가 가려 주기 전 구간). 운영 DB 에는 쓰지 않는다.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';

test.use({ hasTouch: true });

const SAMPLE = `(() => {
  const bar = document.querySelector('[data-community-secbar]');
  const pill = bar && bar.querySelector('[data-sliding-pill]');
  const act = bar && bar.querySelector('[data-pill-active]');
  if (!bar || !pill || !act) return null;
  const pr = pill.getBoundingClientRect(), ar = act.getBoundingClientRect();
  return {
    active: (act.textContent || '').trim(),
    pillLeft: +pr.left.toFixed(1), targetLeft: +ar.left.toFixed(1),
    dx: +Math.abs(pr.left - ar.left).toFixed(1),
    op: Number(getComputedStyle(pill).opacity),
    offsetParent: act.offsetParent ? act.offsetParent.tagName : null,
  };
})()`;
type Sample = { active: string; pillLeft: number; targetLeft: number; dx: number; op: number; offsetParent: string | null };

test('🔴 손가락으로 누르고 있다 뗀 탭 — 알약이 첫 칸으로 새지 않고 곧장 그 탭에 선다 (PILL-06)', async ({ page }) => {
  test.setTimeout(120_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2_000); // 유휴 프리마운트가 돌아 서브탭이 재방문(View Transition) 경로가 되게

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // 실기기 가까이 — 빠른 기기에선 창이 좁아진다

  const seq = ['live', 'rank', 'board', 'dealer', 'venues', 'market']; // SectionTab data-testid=sec-tab-<id>
  const failures: string[] = [];
  // 🔴 건너뛴 탭을 **센다**. 종전에는 `continue` 만 하고 넘어가서 6개가 전부 없어도 초록이었다
  //   (2026-09-19 전수 스윕이 찾아냈다). 이 저장소에서 같은 부류가 반복해서 나왔다 —
  //   `header-320` 은 `if (!count) continue` 가 가장 긴 라벨을 조용히 건너뛰어 넘침을 놓쳤다.
  //   셀렉터가 바뀌거나 화면 구조가 달라지면 **빨개져야 한다**. 조용히 통과하면 그때부터 이 파일은
  //   PILL-06(알약이 첫 칸으로 새는 회귀)을 영원히 못 잡는다.
  const skipped: string[] = [];
  const measured: string[] = [];
  for (const name of seq) {
    const btn = bar.getByTestId(`sec-tab-${name}`);
    if (await btn.count() === 0) { skipped.push(`${name}(없음)`); continue; }
    const box = await btn.boundingBox();
    if (!box) { skipped.push(`${name}(보이지 않음)`); continue; }
    const before = (await page.evaluate(SAMPLE)) as Sample | null;
    expect(before, '알약·활성 탭을 찾지 못했다').not.toBeNull();
    const target = await btn.locator('span').first().boundingBox();
    expect(target).not.toBeNull();

    // 실제 손가락: 120ms 누르고 있다가 뗀다
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const t0 = Date.now();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // 알약은 보이는 동안 언제나 [출발 칸, 도착 칸] 구간 안에 있어야 한다 — 첫 칸으로 새면 구간 밖이다.
    const lo = Math.min(before!.pillLeft, target!.x) - 3;
    const hi = Math.max(before!.pillLeft, target!.x) + 3;
    const rows: string[] = [];
    for (const at of [60, 150, 300, 500, 700]) {
      const wait = t0 + 120 + at - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      const s = (await page.evaluate(SAMPLE)) as Sample | null;
      if (!s) continue;
      rows.push(`+${at}ms pill=${s.pillLeft} target=${s.targetLeft} dx=${s.dx} op=${s.op} offsetParent=${s.offsetParent}`);
      if (s.op < 0.05) continue; // 숨긴 알약은 판정하지 않는다
      if (s.pillLeft < lo || s.pillLeft > hi) failures.push(`${name}: +${at}ms 알약이 출발·도착 구간 밖으로 샜다 — ${s.pillLeft} ∉ [${lo}, ${hi}]`);
      // 슬라이드(--dur-base ≤ .3s)가 끝난 +500ms 부터는 반드시 그 탭 자리다 — 600ms verify 타이머가
      // 가려 주기 **전**이라, measure 자체가 맞아야만 통과한다(결함 상태에선 여기서 dx≈128).
      if (at >= 500 && s.active === name && s.dx >= 3) failures.push(`${name}: +${at}ms 에도 알약이 활성 탭에서 ${s.dx}px 떨어져 있다`);
    }
    test.info().annotations.push({ type: name, description: rows.join(' | ') });
    measured.push(name);
  }
  // 🔴 잴 것이 실제로 있었는가 — 이 두 줄이 없으면 위 루프 전체가 빈 통과다.
  expect(skipped, `건너뛴 탭이 있다: ${skipped.join(', ')} — data-testid=sec-tab-* 가 바뀌었는지,`
    + ' 섹션바가 이 폭에서 안 그려지는지 확인해라. 조용히 넘어가면 PILL-06 회귀를 영영 못 잡는다.')
    .toEqual([]);
  expect(measured.length, '탭을 하나도 재지 못했다 — 이 검사는 아무것도 보고 있지 않다')
    .toBe(seq.length);
  expect(failures, failures.join('\n')).toEqual([]);
});
