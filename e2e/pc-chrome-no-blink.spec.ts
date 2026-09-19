// PC 에서 대메뉴를 오갈 때 **안 바뀌는 부분이 깜빡이지 않는다.**
//
// 오너 리포트(2026-09-19): "PC 버젼에서 내 웹의 대메뉴들을 왔다갔다 할 때 좌우에 빈 공간을
// 매꾸기 위해 채워놓은 공간들 있잖아 거기가 깜빡거려. 메뉴를 이동할 때 움직일 필요가 없는 부분
// ex) header, footer 등 동일한 것이 계속 표기되는 부분은 고정시켜도 되지 않아?"
//
// 🔴 원인은 리렌더가 아니라 **View Transition** 이었다(`src/index.css` 1240행대).
//   PC 에서 `::view-transition-old(root)` 를 죽이고 새 스냅샷을 0.12s 페이드인하는데,
//   이름이 붙은 것만 그 크로스페이드에서 빠진다. 헤더·탭바·GNB 셋만 있었고
//   **좌우 채움 배경(.aura-bg)과 사업자 푸터**는 매 전환마다 사라졌다 나타났다.
//   `memo` 로는 안 멈춘다 — 층이 다르다.
//
// ⚠ 이 검사는 "이름이 붙어 있나" 를 소스에서 보지 않는다. 그건 CSS 가 실제로 적용됐는지를
//   증명하지 못한다(미디어쿼리·우선순위·오버레이 조건에 걸릴 수 있다). **전환이 도는 동안
//   실제 화면에서 그 요소가 계속 보이는지**를 프레임 단위로 잰다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const PC = { width: 1440, height: 900 };

test('🔴 PC 대메뉴 전환 — 좌우 채움 배경과 푸터가 깜빡이지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize(PC);
  await page.goto('/?tab=browse');
  await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });

  // 두 탭을 한 번씩 방문해 둔다 — 전환 연출은 **이미 방문한 탭**으로 돌아갈 때 돈다.
  for (const t of ['live', 'browse']) {
    await page.evaluate((tab) => { window.location.hash = ''; window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: tab })); }, t);
    await page.waitForTimeout(700);
  }

  // 🔴 무엇을 재는가 — `element.opacity` 는 **아무것도 안 잡는다.**
  //   전환이 도는 동안 원본 요소는 그대로 있고, 페이드는 top layer 의 `::view-transition-*`
  //   의사요소에서 일어난다. 그래서 요소의 computed opacity 는 내내 1 이다.
  //   (2026-09-19 음성 대조로 확인: 수정을 빼도 opacity 단언이 통과했다 — 빈 검사였다.)
  // → `document.getAnimations()` 로 **실제로 돌고 있는 애니메이션의 의사요소 이름**을 본다.
  const probe = await page.evaluate(async () => {
    const bg = document.querySelector('.aura-bg') as HTMLElement | null;
    const ft = document.querySelector('footer') as HTMLElement | null;
    if (!bg || !ft) return { ok: false, why: '.aura-bg 또는 footer 를 못 찾았다' };

    const seen = new Set<string>();
    let stop = false;
    const tick = () => {
      if (stop) return;
      for (const a of document.getAnimations()) {
        const pe = (a.effect as KeyframeEffect | null)?.pseudoElement;
        if (pe) seen.add(pe);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'live' }));
    await new Promise((r) => setTimeout(r, 600));
    stop = true;

    return {
      ok: true,
      pseudos: [...seen],
      vtNames: {
        bg: getComputedStyle(bg).viewTransitionName,
        ft: getComputedStyle(ft).viewTransitionName,
      },
    };
  });

  expect(probe.ok, probe.why ?? '').toBe(true);
  const pseudos = probe.pseudos!;

  // ① 전환이 **실제로 돌았나.** 안 돌았으면 아래 단언들이 공짜로 통과한다.
  expect(pseudos.some((p) => p.includes('view-transition')),
    `전환이 아예 안 돌았다 — 이 검사가 아무것도 재지 않았다. 잡힌 의사요소: ${JSON.stringify(pseudos)}`).toBe(true);

  // ② 좌우 채움 배경과 푸터는 **애니메이션 대상이 아니어야 한다.**
  //    이름이 붙고 `animation:none` 이 먹으면 이 둘의 old/new 의사요소에는 애니메이션이 안 생긴다.
  for (const [name, label] of [['app-chrome-bg', '좌우 채움 배경(.aura-bg)'], ['app-footer', '사업자 푸터']] as const) {
    const animated = pseudos.filter((p) => p.includes(`(${name})`) && !p.includes('group'));
    expect(animated,
      `${label}가 전환 중 애니메이션을 탄다 — 오너가 "깜빡거려" 라고 한 자리다. 잡힌 것: ${JSON.stringify(animated)}`)
      .toEqual([]);
  }

  // ③ 이름이 실제 화면에서 적용됐나(소스 문자열이 아니라 computed style 로 본다).
  expect(probe.vtNames!.bg, '.aura-bg 에 view-transition-name 이 안 붙었다').not.toBe('none');
  expect(probe.vtNames!.ft, 'footer 에 view-transition-name 이 안 붙었다').not.toBe('none');
});
