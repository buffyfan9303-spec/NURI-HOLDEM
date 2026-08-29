// 전역 토큰 회귀 게이트 — '전역 규칙이 유틸리티에 지는' 사고를 계산된 스타일로 못 박는다.
//
// 왜 눈이 아니라 측정인가: 이 다섯 가지는 전부 **특이도 사고**였다.
//   CSS 를 읽으면 보호가 걸려 있는 것처럼 보이는데 실제 렌더에서는 꺼져 있다.
//   소스만 보고는 절대 못 잡는 종류라, 브라우저가 최종 계산한 값을 직접 재는 수밖에 없다.
//
// 실행: npx playwright test e2e/design-tokens.spec.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    const collect = () => page.evaluate(() => {
      const hit: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; } // 교차출처·미로딩 시트는 접근 불가
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

    // ⚠ 이 검사는 링크된 스타일시트가 **파싱된 뒤**라야 성립한다. beforeEach 의 고정 800ms 는
    //   워커 2개(CI 조건)에서 가끔 모자랐고, 그러면 시트가 아직 로딩 중이라 sheet.cssRules 가
    //   던져 continue 로 빠지고 hit=0 이 된다 → '규칙이 사라졌다'는 **오탐**이 난다
    //   (2026-08-30 CI 재현에서 flaky 1건으로 관측. dist CSS 에는 규칙이 그대로 있었다).
    //   고정 대기를 늘리는 대신 조건이 성립할 때까지 기다린다 — 단언 자체는 그대로다.
    //   규칙이 진짜로 사라지면 폴링이 만료되고 **같은 실패**가 난다(게이트 완화 아님).
    await expect
      .poll(async () => (await collect()).length, {
        message: '설치형 예외 규칙(user-select:text)을 찾지 못했다 — 규칙이 사라졌거나 조건이 바뀌었다',
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    const rule = await collect();
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

  // ── 등급 토큰 대비 회귀 게이트 (2026-08-30) ────────────────────────────────
  // 왜 여기서 다시 재는가: 이 세 지점은 전부 **다크에서만 통과하던 리터럴 hex** 였다.
  //   · RankNum(4위 이하 순위 원) #7C8696 — 다크 3.82 / 라이트 3.26 양쪽 미달
  //   · ActivityBadges 획득 칩 #5FA8FF·#4FCB98·#B388FF·#FFD700 — 같은 색 14% 틴트 위
  //     다크 6.64~12.62 통과, 라이트 1.01~1.92 전멸(색이 배경에 그대로 녹는다)
  // 토큰(--tier-*)으로 옮겨 닫았고, 여기서 **토큰 자체의 계약**을 못 박는다.
  // 리터럴이 다시 기어들어오면 눈으로는 다크에서 멀쩡해 보여서 절대 안 잡힌다.
  for (const mode of ['dark', 'light'] as const) {
    test(`등급 텍스트 토큰이 칩 틴트 위에서 AA 를 넘는다 — ${mode}`, async ({ page }) => {
      // 이 describe 에는 beforeEach 가 없다 — goto 를 빠뜨리면 about:blank 에서 재게 되고
      // 커스텀 프로퍼티가 전부 빈 문자열로 나와 '측정한 척' 하는 테스트가 된다.
      await page.goto('/');
      await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
      const m = await page.evaluate((theme) => {
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(theme);
        const cs = getComputedStyle(document.documentElement);
        const trip = (v: string) => cs.getPropertyValue(v).trim().split(/\s+/).map(Number);
        const rgb = (t: number[]) => `rgb(${t[0]},${t[1]},${t[2]})`;
        // 칩 배경 = 같은 등급색 알파 0.14 를 카드 배경(surface-low) 위에 합성한 실효색
        const base = trip('--surface-low');
        const out: Record<string, { fg: string; bg: string }> = {};
        for (const v of ['--tier-blue', '--tier-green', '--tier-purple', '--tier-ace', '--tier-slate']) {
          const t = trip(v);
          out[v] = { fg: rgb(t), bg: rgb(t.map((c, i) => c * 0.14 + base[i] * 0.86)) };
        }
        // RankNum 은 틴트가 아니라 surface-high 위 투명 배경이다
        out['--tier-slate@surface-high'] = { fg: rgb(trip('--tier-slate')), bg: rgb(trip('--surface-high')) };
        return out;
      }, mode);
      // 대조군 — 계산기가 살아 있는지 스스로 증명한다(0건 반환 = 무효).
      expect(contrast('rgb(255,255,255)', 'rgb(0,0,0)')).toBeCloseTo(21, 1);
      expect(contrast('rgb(122,122,122)', 'rgb(110,110,110)')).toBeLessThan(1.3);
      expect(Object.keys(m).length).toBe(6);
      // 프로브가 '아무것도 못 읽은' 상태를 통과로 착각하지 않도록 — 빈 값은 즉시 실패시킨다.
      for (const [name, { fg, bg }] of Object.entries(m)) {
        expect(fg, `${name} fg 를 못 읽었다(about:blank/CSS 미로드)`).toMatch(/^rgb\(\d+,\d+(\.\d+)?,\d+(\.\d+)?\)$/);
        expect(bg, `${name} bg 를 못 읽었다`).toMatch(/^rgb\(\d/);
      }
      for (const [name, { fg, bg }] of Object.entries(m)) {
        expect(contrast(fg, bg), `${name} ${fg} on ${bg} (${mode})`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 등급 토큰(--tier-* / --tier-*-vivid 20종) 전량 회귀 게이트 (2026-08-30)
//
// 바로 위 블록은 5종 · 한 지면만 본다. 그 사이가 지금 무방비다:
//   라이트 칭호 칩의 최저 마진이 4.57(요구 4.50, 여유 +0.07)이라
//   --surface-float 를 한 스텝만 밝히거나 "라이트 골드가 칙칙하다"고 --tier-gold 를
//   되돌리면 조용히 AA 아래로 내려간다. 다크에서는 멀쩡해 보이므로 눈으로는 못 잡는다.
//
// 무엇을 재는가 — **토큰 값이 아니라 대비**다.
//   값을 문자열로 비교하는 검사는 색을 조금만 조정해도 무조건 실패해서, 결국
//   "기대값을 새 값으로 갈아치우는" 의식이 되고 게이트로서 죽는다. 여기서는
//   각 토큰이 **실제 컴포넌트가 만드는 지면 위에서** 임계를 지키는지만 본다.
//   색을 바꿔도 대비만 지키면 통과한다 — 그게 이 토큰들의 유일한 계약이다.
//
// 왜 컴포넌트를 화면에서 찾지 않고 지면을 재현하는가:
//   등급 10단계는 각 등급의 유저가 실제로 있어야 화면에 뜬다. 라이브 데이터에 결합하면
//   DB 상태에 따라 커버리지가 들쭉날쭉해지고, 그건 이미 한 번 CI 3건을 깬 실수다(8834ca4).
//   대신 ① 컴포넌트가 쓰는 알파·오버레이 상수를 **소스에서 직접 확인**하고(아래 소스 가드)
//        ② 그 상수로 만든 지면을 브라우저에 실제로 그려 계산된 색을 읽는다.
//   ①이 없으면 "프로브가 자기 가정을 자기가 통과시키는" 동어반복이 된다 —
//   컴포넌트가 알파를 0.102 → 0.2 로 바꿔도 프로브는 여전히 0.102 를 재며 통과한다.
// ═══════════════════════════════════════════════════════════════════════════

const TIER_FAMILIES = ['slate', 'steel', 'blue', 'green', 'purple', 'orange', 'rose', 'gold', 'ace', 'admin'] as const;

interface TierContract {
  /** 실패 메시지에 뜨는 지점 이름 */
  where: string;
  /** 'text' = 등급색이 글자, 'fill' = 등급색이 면(비텍스트 정보) */
  kind: 'text' | 'fill';
  /** 칩 배경 CSS. `%T` 는 등급 토큰명으로 치환된다. 없으면 지면 그대로(불투명 텍스트). */
  chipBg?: string;
  /** 이 지점이 실제로 얹히는 surface 토큰들 */
  surfaces: readonly string[];
  /** 임계 — 텍스트 AA 4.5 / 비텍스트 3.0 */
  min: number;
}

// ⚠ surfaces 목록은 '전부 넣으면 안전' 이 아니다. 실제로 그 지면에 얹히는 것만 넣는다.
//   근거 없이 넓히면 오늘 당장 빨간 게이트가 되고(그러면 임계를 낮추고 싶어진다),
//   좁히면 회귀를 놓친다. 각 항목의 제외 지면과 그 실측값을 주석에 남긴다.
const TIER_CONTRACTS: readonly TierContract[] = [
  {
    // TitleChip — 닉네임 옆 칭호 칩. 같은 등급색 10.2% 틴트 위의 같은 등급색 글자.
    // 지면: 커뮤니티 목록 행(low · hover high) / 카드(low) / 게시글·프로필 모달(mid) / PET 바탕(base).
    // 제외 float: 이 칩이 드롭다운·툴팁에 들어가는 곳이 없다. 넣으면 다크 3.99 로 즉시 미달이므로,
    //   float 지면에 칭호 칩을 새로 놓으려면 --tier-* 값부터 다시 유도해야 한다.
    where: '칭호 칩(TitleChip)', kind: 'text', chipBg: 'rgb(var(--tier-%T) / 0.102)',
    surfaces: ['base', 'low', 'mid', 'high'], min: 4.5,
  },
  {
    // ActivityBadges 획득 칩 — 같은 등급색 14% 틴트. 알파가 높은 만큼 마진이 얇다.
    // 지면: 프로필 뱃지 진열장 section(bg-surface-low). base·mid 는 여유 확인용으로 함께 잠근다.
    // 제외 high: 다크 4.26 으로 미달 — 이 칩을 surface-high 카드 안으로 옮기면 안 된다는 뜻이다.
    where: '획득 뱃지 칩(ActivityBadges)', kind: 'text', chipBg: 'rgb(var(--tier-%T) / 0.14)',
    surfaces: ['base', 'low', 'mid'], min: 4.5,
  },
  {
    // TierBadge 랭크 칩 — 배경이 등급색이 아니라 surface-base 90% 라 지면 영향이 거의 없다.
    where: '등급 뱃지 칩(TierBadge)', kind: 'text', chipBg: 'rgb(var(--surface-base) / 0.9)',
    surfaces: ['base', 'low', 'mid', 'high', 'float'], min: 4.5,
  },
  {
    // 불투명 등급 텍스트 — 리더보드 순위 숫자(RankNum) · 행 점수 · 포디움 라벨.
    where: '불투명 등급 텍스트(RankNum·리더보드)', kind: 'text',
    surfaces: ['base', 'low', 'mid', 'high', 'float'], min: 4.5,
  },
  {
    // --tier-*-vivid 가 '정보'를 나르는 지점(알파 1.0): 헤더·프로필 아바타 등급 링,
    // XP 진행바 fill(트랙이 surface-float·high). 등급을 색으로만 알리므로 비텍스트 3:1.
    // 알파<1 인 장식 용도(테두리 .4 / 글로우 .6 / conic 중간 스톱)는 합성상 3:1 이 물리적으로
    // 불가능하고 필요도 없어서 계약에 넣지 않는다 — index.css 등급 색 블록의 정본과 같은 구분이다.
    where: '등급 면색(아바타 등급 링·XP 진행바)', kind: 'fill', chipBg: 'rgb(var(--tier-%T-vivid))',
    surfaces: ['base', 'low', 'mid', 'high', 'float'], min: 3.0,
  },
];

test.describe('등급 토큰 20종 — 실제 지면 위 대비 계약', () => {
  // ── 소스 가드 ─────────────────────────────────────────────────────────────
  // 아래 프로브는 컴포넌트가 쓰는 알파·오버레이를 '알고 있다'고 가정한다. 그 가정이 소스와
  // 어긋나는 순간 프로브는 아무것도 지키지 않으면서 초록불을 낸다(계산된 스타일만 재면
  // 규칙을 지워도 통과한다는, 이 파일 위쪽 PWA 검사에서 이미 겪은 실패 유형이다).
  // 그래서 상수를 소스에서 직접 확인한다. 컴포넌트가 값을 바꾸면 여기서 먼저 터지고,
  // 다음 사람은 '프로브도 같이 고치고 임계를 다시 재라'는 지시를 받게 된다.
  test('프로브가 가정한 칩 상수가 컴포넌트 소스와 일치한다', async () => {
    const src = (rel: string) =>
      readFileSync(fileURLToPath(new URL(`../src/components/${rel}`, import.meta.url)), 'utf8');

    const titleChip = src('atoms/TitleChip.tsx');
    expect(titleChip, 'TitleChip 의 틴트 알파가 0.102 가 아니다 — TIER_CONTRACTS 의 chipBg 와 임계를 다시 재라')
      .toMatch(/tierCss\(\s*t\.colorVar\s*,\s*0\.102\s*\)/);

    const badges = src('atoms/ActivityBadges.tsx');
    expect(badges, 'ActivityBadges 획득 칩의 틴트 알파가 0.14 가 아니다 — chipBg 와 임계를 다시 재라')
      .toMatch(/background:\s*tierCss\(\s*colorVar\s*,\s*0\.14\s*\)/);
    expect(badges, 'ActivityBadges 진열장 지면이 bg-surface-low 가 아니다 — surfaces 목록을 다시 정하라')
      .toContain('bg-surface-low');

    const tierBadge = src('atoms/TierBadge.tsx');
    expect(tierBadge, 'TierBadge 칩 배경이 rgb(var(--surface-base) / 0.9) 가 아니다 — chipBg 를 맞춰라')
      .toContain("background: 'rgb(var(--surface-base) / 0.9)'");
    // 등급 → 토큰명 결합 지점. `--tier-<token>` / `--tier-<token>-vivid` 규칙이 깨지면
    // 프로브가 만드는 변수명이 존재하지 않는 이름이 되고, 아래 '빈 값' 가드가 잡는다.
    expect(tierBadge, '등급 토큰 네이밍(--tier-*/-vivid)이 바뀌었다 — TIER_FAMILIES 를 다시 맞춰라')
      .toMatch(/colorVar:\s*`--tier-\$\{d\.token\}`/);
  });

  // ⚠ 2026-08-30: 아래 대비 검사만으로는 **토큰이 사라진 것을 못 잡는다.**
  //   프로브가 `chip.style.color = 'rgb(var(--tier-gold))'` 로 재는데, 토큰이 없으면 그 값이
  //   computed 시점에 무효가 되어 프로퍼티가 unset → **부모 색을 상속**한다. 그러면 색은
  //   멀쩡히 읽히고(fg.length===3 가드 통과) 상속색이 우연히 대비를 넘으면 초록불이 난다.
  //   실제로 --tier-gold 를 지우고 재빌드해도 전건 통과했다(적대적 검증에서 확인).
  //   → 값이 아니라 **정의 자체**를 본다. 커스텀 프로퍼티를 루트에서 직접 읽어 3성분인지 확인한다.
  for (const mode of ['dark', 'light'] as const) {
    test(`등급 토큰 20종이 정의돼 있다 — ${mode}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
      const missing = await page.evaluate(({ mode, families }) => {
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(mode);
        const cs = getComputedStyle(document.documentElement);
        const bad: string[] = [];
        for (const t of families) {
          for (const name of [`--tier-${t}`, `--tier-${t}-vivid`]) {
            const raw = cs.getPropertyValue(name).trim();
            const n = (raw.match(/[\d.]+/g) ?? []).map(Number);
            if (n.length !== 3 || n.some((v) => !Number.isFinite(v))) bad.push(`${name} = "${raw}"`);
          }
        }
        return bad;
      }, { mode, families: [...TIER_FAMILIES] });

      expect(missing,
        `[${mode}] 등급 토큰이 사라졌거나 형식이 깨졌다 ${missing.length}건 — 이 토큰을 쓰는 화면은 ` +
        `색을 잃고 부모 색을 상속한다(대비 검사는 그걸 못 잡는다): ${missing.join(' / ')}`)
        .toEqual([]);
    });
  }

  for (const mode of ['dark', 'light'] as const) {
    test(`등급 토큰이 모든 실사용 지면에서 임계를 지킨다 — ${mode}`, async ({ page }) => {
      await page.goto('/');
      // about:blank 에서 재면 커스텀 프로퍼티가 전부 빈 문자열이라 '측정한 척' 하는 테스트가 된다.
      await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
      // 전환 중간색이 잡히면 허위 미달이 난다 — 재기 전에 전부 정지시킨다.
      await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

      const rows = await page.evaluate(
        ({ mode, families, contracts }) => {
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(mode);
          const host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:-9999px;top:0';
          document.body.appendChild(host);
          const triple = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const withAlpha = (s: string) => {
            const n = (s.match(/[\d.]+/g) ?? []).map(Number);
            return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
          };
          const out: { where: string; kind: string; tier: string; surface: string; min: number; fg: number[]; bg: number[] }[] = [];
          for (const c of contracts) {
            for (const s of c.surfaces) {
              const surf = document.createElement('div');
              surf.style.background = `rgb(var(--surface-${s}))`;
              host.appendChild(surf);
              const base = triple(getComputedStyle(surf).backgroundColor);
              for (const t of families) {
                const chip = document.createElement('span');
                chip.textContent = '등급';
                chip.style.color = `rgb(var(--tier-${t}))`;
                if (c.chipBg) chip.style.background = c.chipBg.replace('%T', t);
                surf.appendChild(chip);
                const cs = getComputedStyle(chip);
                const fg = triple(cs.color);
                const raw = withAlpha(cs.backgroundColor);
                // 알파 배경은 조상(지면)까지 거슬러 합성한 실효색으로 계산한다.
                const eff = raw.rgb.length === 3 ? raw.rgb.map((v, i) => v * raw.a + base[i] * (1 - raw.a)) : base;
                out.push({
                  where: c.where, kind: c.kind, tier: t, surface: s, min: c.min,
                  // fill 계약은 '면색 vs 지면', text 계약은 '글자색 vs 합성된 칩 배경'
                  fg: c.kind === 'fill' ? eff : fg,
                  bg: c.kind === 'fill' ? base : eff,
                });
                chip.remove();
              }
              surf.remove();
            }
          }
          host.remove();
          return out;
        },
        { mode, families: [...TIER_FAMILIES], contracts: TIER_CONTRACTS.map((c) => ({ ...c, surfaces: [...c.surfaces] })) },
      );

      // ── 대조군 — 계산기와 프로브가 살아 있음을 스스로 증명한다(0건 반환 = 무효) ──
      expect(contrast('rgb(255,255,255)', 'rgb(0,0,0)')).toBeCloseTo(21, 1);
      expect(contrast('rgb(122,122,122)', 'rgb(110,110,110)')).toBeLessThan(1.3);
      const expected = TIER_CONTRACTS.reduce((n, c) => n + c.surfaces.length * TIER_FAMILIES.length, 0);
      expect(rows.length, '프로브 표본 수가 다르다 — 계약/등급 목록이 어긋났다').toBe(expected);
      for (const r of rows) {
        expect(r.fg.length, `${r.where} · ${r.tier} · surface-${r.surface}: 색을 못 읽었다(토큰 부재/CSS 미로드)`).toBe(3);
        expect(r.bg.length, `${r.where} · ${r.tier} · surface-${r.surface}: 지면색을 못 읽었다`).toBe(3);
      }

      // ── 본 단언 ────────────────────────────────────────────────────────────
      const rgb = (t: number[]) => `rgb(${t.map((v) => Math.round(v)).join(',')})`;
      const fails = rows
        .map((r) => ({ ...r, c: contrast(rgb(r.fg), rgb(r.bg)) }))
        .filter((r) => r.c < r.min)
        .map((r) =>
          `  --tier-${r.tier}${r.kind === 'fill' ? '-vivid' : ''} · ${r.where} · surface-${r.surface}` +
          ` = ${r.c.toFixed(2)} : 1 (요구 ${r.min.toFixed(2)}, 부족 ${(r.min - r.c).toFixed(2)})` +
          ` — ${rgb(r.fg)} on ${rgb(r.bg)}`);
      expect(fails, `[${mode}] 등급 토큰 대비 미달 ${fails.length}건 — 토큰을 되돌렸거나 지면(surface) 값이 바뀌었다:\n${fails.join('\n')}\n`)
        .toEqual([]);
    });
  }
});
