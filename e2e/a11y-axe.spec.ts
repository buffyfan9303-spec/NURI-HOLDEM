// axe 접근성 스캔 — 대비·라벨·role 누락을 기계로 잡는다(2026-09-28 도구 도입).
//
// 왜: 기존 a11y-modal.spec.ts 는 포커스·ESC·44px 히트영역만 보는 **수제 계약**이라
//   색 대비·aria-label 누락·중복 id 같은 부류는 못 잡는다. Tailwind v4 이관으로 색이
//   CSS 변수 → oklab 경유로 바뀌는 중이라(index.css) 대비 회귀가 조용히 들어올 수 있다.
//
// 방식: **기준선 대비**로만 실패시킨다(오너 CLAUDE.md — e2e 대부분이 운영 데이터를 목킹 없이 읽는다).
//   운영 배너 1장이 위반을 늘릴 수 있어 "위반 0개"를 요구하면 코드와 무관하게 빨개진다.
//   `a11y-baseline.json` 의 화면별 위반 수보다 **늘면** 실패, 그대로거나 줄면 통과.
//   이미지 콘텐츠(배너·포스터)는 오너가 올리는 운영 자산이라 제외하고 시작한다(연구 보고서 권고).
//
// 언제 재는가: 탭 전환 애니메이션이 **정착한 뒤**(진입 애니메이션 중 프레임을 재면 반투명 상태가 걸린다).
import { test, expect } from './_fixtures';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, 'a11y-baseline.json');
const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

const TABS: [label: string, tab: string][] = [
  ['홈', 'home'],
  ['라이브', 'live'],
  ['커뮤니티', 'community'],
  ['GTO', 'tools'],
  ['캘린더', 'calendar'],
];

const nav = (page: Page) => page.getByRole('navigation', { name: '하단 내비게이션' });

/** 진입 애니메이션이 끝난 뒤로 스캔을 미룬다 — CLAUDE.md 참고 메모: 전환 중에 재면 반투명 프레임을 잰다. */
async function settle(page: Page) {
  await page.waitForTimeout(400);
}

test.describe('a11y: 주요 탭 axe 스캔(wcag2a·wcag2aa, 기준선 대비)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-schedule-title')).toBeVisible();
    await settle(page);
  });

  for (const [label, tab] of TABS) {
    test(`${label}(${tab}) — 위반 수가 기준선을 넘지 않는다`, async ({ page }) => {
      if (tab !== 'home') {
        const btn = nav(page).getByRole('button', { name: new RegExp(`^${label}`) });
        if (await btn.count() === 0) {
          test.info().annotations.push({ type: 'skip-leg', description: `${label} 칸 없음(매장 계정 등)` });
          test.skip();
        }
        await btn.first().click();
        await expect(page.locator(`[data-tab="${tab}"]`)).toBeVisible({ timeout: 10_000 });
        await settle(page);
      }

      const results = await new AxeBuilder({ page })
        .include(`[data-tab="${tab}"]`)
        .withTags(['wcag2a', 'wcag2aa'])
        // 운영 배너·포스터 이미지 콘텐츠 제외 — 오너 자산이라 코드 회귀와 분리한다(기준선 도입 1단계).
        .exclude('img')
        .analyze();

      const count = results.violations.length;
      const known = baseline[tab] ?? 0;
      if (count > known) {
        const detail = results.violations
          .map((v) => `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}곳)`)
          .join('\n');
        expect(count, `${tab} 위반 ${count}건 > 기준선 ${known}건:\n${detail}`).toBeLessThanOrEqual(known);
      } else {
        expect(count).toBeLessThanOrEqual(known);
      }
    });
  }
});
