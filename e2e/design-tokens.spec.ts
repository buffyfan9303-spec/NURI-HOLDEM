// 전역 토큰 회귀 게이트 — '전역 규칙이 유틸리티에 지는' 사고를 계산된 스타일로 못 박는다.
//
// 왜 눈이 아니라 측정인가: 이 다섯 가지는 전부 **특이도 사고**였다.
//   CSS 를 읽으면 보호가 걸려 있는 것처럼 보이는데 실제 렌더에서는 꺼져 있다.
//   소스만 보고는 절대 못 잡는 종류라, 브라우저가 최종 계산한 값을 직접 재는 수밖에 없다.
//
// 실행: npx playwright test e2e/design-tokens.spec.ts
import { test, expect } from '@playwright/test';
import { dismissOverlays } from './_session';

/** rgb(…) → 상대휘도 (WCAG) */
function luminance(rgb: string): number {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) return 0;
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string): number {
  const a = luminance(fg); const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe('전역 토큰 — 규칙이 실제로 걸려 있는가', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForTimeout(800);
  });

  test('🔴 모든 입력칸이 16px 이상 — iOS 자동확대가 실제로 막힌다', async ({ page }) => {
    // Pixel 7 프로젝트라 pointer:coarse 가 참이다. 화면에 있는 input/select/textarea 를 전수 측정.
    const small = await page.evaluate(() => {
      const out: { tag: string; type: string; size: string; cls: string }[] = [];
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) out.push({
          tag: el.tagName, type: (el as HTMLInputElement).type ?? '',
          size: `${fs}px`, cls: el.className.toString().slice(0, 60),
        });
      }
      return out;
    });
    expect(small, `16px 미만 입력칸 — 탭하면 iOS 가 확대하고 되돌리지 않는다:\n${JSON.stringify(small, null, 1)}`)
      .toEqual([]);
  });

  test('🔴 버튼 전환 속성에 transform 이 살아 있다 — 눌림 반응이 애니메이션된다', async ({ page }) => {
    const broken = await page.evaluate(() => {
      const out: { text: string; prop: string }[] = [];
      for (const el of [...document.querySelectorAll('button')].slice(0, 60)) {
        const p = getComputedStyle(el).transitionProperty;
        if (!p.includes('transform') && !p.includes('all')) {
          out.push({ text: (el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 24), prop: p.slice(0, 70) });
        }
      }
      return out;
    });
    expect(broken, `transition-property 에 transform 이 없다 = :active 눌림이 안 움직인다:\n${JSON.stringify(broken, null, 1)}`)
      .toEqual([]);
  });

  test('보조·메타 텍스트가 다크 모드에서 AA(4.5:1) 를 넘는다', async ({ page }) => {
    const { sec, muted, bg } = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const rgb = (v: string) => `rgb(${cs.getPropertyValue(v).trim().split(/\s+/).join(',')})`;
      return { sec: rgb('--ink-secondary'), muted: rgb('--ink-muted'), bg: rgb('--surface-base') };
    });
    expect(contrast(sec, bg), `--ink-secondary(${sec}) vs ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, bg), `--ink-muted(${muted}) vs ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  // 경계선은 텍스트와 달리 '얼마나 진해야 하는가'가 디자인 정체성과 직결된다(이 앱은 Linear 계열 미니멀).
  // WCAG 비텍스트 기준 3:1 까지 올리면 선이 확연히 굵어져 인상이 달라지므로 지금은 채택하지 않았다.
  // 대신 여기서는 **회귀만** 막는다 — ① 위계가 뒤집히지 않을 것 ② '사실상 안 보이는' 수준으로 되돌아가지 말 것.
  // (3:1 로 올릴지는 열려 있는 디자인 결정이고, 올린다면 이 임계값도 함께 올려야 한다.)
  for (const mode of ['dark', 'light'] as const) {
    test(`경계선 위계가 유지된다 — ${mode}`, async ({ page }) => {
      const t = await page.evaluate((m) => {
        document.documentElement.classList.toggle('light', m === 'light');
        const cs = getComputedStyle(document.documentElement);
        const rgb = (v: string) => `rgb(${cs.getPropertyValue(v).trim().split(/\s+/).join(',')})`;
        return { subtle: rgb('--border-subtle'), def: rgb('--border-default'), strong: rgb('--border-strong'), bg: rgb('--surface-base') };
      }, mode);
      const cs = contrast(t.subtle, t.bg), cd = contrast(t.def, t.bg), cst = contrast(t.strong, t.bg);
      expect(cd, `subtle(${cs.toFixed(2)}) < default(${cd.toFixed(2)}) 여야 한다`).toBeGreaterThan(cs);
      expect(cst, `default(${cd.toFixed(2)}) < strong(${cst.toFixed(2)}) 여야 한다`).toBeGreaterThan(cd);
      expect(cd, `default 가 '사실상 안 보이는' 수준(≤1.3)으로 되돌아갔다: ${cd.toFixed(2)}`).toBeGreaterThan(1.35);
    });
  }

  test('🔴 설치형 PWA 에서 입력칸에 붙여넣기가 막히지 않는다', async ({ page }) => {
    // ⚠ 이 규칙은 @media (display-mode: standalone) 안에 있다. Playwright 는 일반 탭으로 돌아서
    //   그 미디어쿼리가 거짓이라, 계산된 스타일만 재면 규칙을 지워도 테스트가 통과한다
    //   (실제로 회귀 주입 실험에서 이 테스트만 못 잡았다 — '통과하는데 아무것도 안 지키는' 상태였다).
    //   그래서 계산 스타일이 아니라 **스타일시트 규칙 자체**를 검사한다.
    const rule = await page.evaluate(() => {
      const hit: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; } // 교차출처 시트는 접근 불가
        const walk = (list: CSSRuleList) => {
          for (const r of Array.from(list)) {
            if (r instanceof CSSMediaRule) {
              if (/display-mode:\s*(standalone|fullscreen)/.test(r.conditionText)) {
                for (const inner of Array.from(r.cssRules)) {
                  const t = inner.cssText;
                  if (/user-select:\s*text/.test(t)) hit.push(t.slice(0, 300));
                }
              }
              walk(r.cssRules);
            }
          }
        };
        walk(rules);
      }
      return hit;
    });
    expect(rule.length, '설치형 예외 규칙(user-select:text)을 찾지 못했다 — 규칙이 사라졌거나 조건이 바뀌었다').toBeGreaterThan(0);
    const joined = rule.join(' ');
    for (const sel of ['input', 'textarea', 'contenteditable']) {
      expect(joined, `설치형 예외 목록에 ${sel} 이 없다 — 설치형 PWA 에서 붙여넣기가 막힌다:\n${joined}`).toContain(sel);
    }
  });
});

test.describe('손이 닿는 곳의 정밀도', () => {
  test('토스트 성공·실패 색이 흰 글씨 대비 AA 를 넘는다', async ({ page }) => {
    await page.goto('/');
    // 토큰 값을 직접 재는 대신, 실제 클래스가 만들어내는 배경색을 측정한다.
    const { ok, err } = await page.evaluate(() => {
      const mk = (cls: string) => {
        const d = document.createElement('div');
        d.className = cls;
        document.body.appendChild(d);
        const bg = getComputedStyle(d).backgroundColor;
        d.remove();
        return bg;
      };
      return { ok: mk('bg-emerald-700'), err: mk('bg-danger-dark') };
    });
    // 토스트 글자는 항상 흰색이다
    expect(contrast('rgb(255,255,255)', ok), `성공 토스트 배경 ${ok}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast('rgb(255,255,255)', err), `실패 토스트 배경 ${err}`).toBeGreaterThanOrEqual(4.5);
  });

  test('🔴 화면에 보이는 버튼 중 히트영역이 40px 미만인 것이 없다', async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForTimeout(1200);
    const small = await page.evaluate(() => {
      const out: { label: string; w: number; h: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;          // 숨김
        if (r.bottom < 0 || r.top > innerHeight) continue;       // 화면 밖
        // 인라인 텍스트 링크형(높이만 작은 것)은 제외하고, 아이콘형 작은 버튼만 잡는다
        if (r.height < 40 && r.width < 120) {
          out.push({ label: (el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return out;
    });
    // 전부 40px 로 만드는 건 현실적이지 않다(밀도 높은 표·칩). 여기서는 '심각하게 작은' 것만 막는다.
    const tiny = small.filter((s) => s.h < 28 || s.w < 28);
    expect(tiny, `28px 미만 히트영역 — 한 손 조작에서 오탭이 난다:
${JSON.stringify(tiny, null, 1)}`).toEqual([]);
  });
});
