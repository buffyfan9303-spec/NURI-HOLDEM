// 열 때 번쩍이지 않는가 — **부류 게이트**(2026-09-15 오너 리포트: "출석 이벤트를 클릭하면 한번 번쩍이면서 들어가줘").
//
// ── 왜 이 파일이 따로 있나 ─────────────────────────────────────────────────────
// `click-paths.spec.ts` 는 "눌렀을 때 **어디로** 가는가"(목적지)를 본다. 이 파일은 다른 축이다:
// **거기까지 가는 동안 무엇이 보이는가.** 목적지가 맞아도 가는 길에 화면이 갈아끼워지면 손님은 "번쩍였다"고 말한다.
//
// ── 무엇을 재나: 이진값 둘. 휘도 임계는 **일부러 안 쓴다** ─────────────────────
// 진단할 때는 CDP 스크린캐스트로 프레임별 평균 휘도를 쟀다(그래서 원인을 찾았다). 게이트로는 못 쓴다:
//   · 문서가 갈리는 순간 스크린캐스트가 **끊긴다**(실측 314ms 프레임 공백) — 제일 중요한 구간이 안 찍힌다.
//   · 다크에서 '빈 이벤트 판' L=8 은 최종 화면 L=11 과 **3밖에** 차이가 안 난다(라이트는 35).
//     그 지표로 임계를 잡으면 **이 실제 결함이 통과하는 게이트**가 된다. 없느니만 못하다.
// 그래서 증상 대리값이 아니라 **원인 부류**를 잰다.
//   G1  문서 재로딩 0 — 앱 안 목적지를 여는데 문서가 새로 로드되면 앱이 통째로 재부팅된다.
//       (실측 2026-09-15: 홈 배너의 내부 링크가 `location.assign` 이라 홈→**홈 스켈레톤**→홈→**빈 판**→이벤트.
//        번쩍임 2회 · 열림 267ms. 앱 안 전환으로 바꾸니 중간 프레임 0 · 61ms.)
//   G2  중간 화면 0 — 출발 화면과 도착 화면 사이에 **다른 화면이 커밋되지 않는다.**
//       특히 `OverlayFallback`(불투명 전면 오버레이)은 한 프레임도 뜨면 안 된다.
//       (실측: 로그인이 19프레임·363ms 동안 그걸 띄웠다. `lazy(async …)` 는 청크가 캐시에 있어도
//        첫 렌더에 한 번 서스펜드하므로, 여는 setState 가 트랜지션이 아니면 리액트가 폴백을 커밋하고 ~300ms 붙잡는다.)
//
// ── 표를 사람이 관리하지 않는다 ────────────────────────────────────────────────
// `src/App.tsx` 의 `lazyWithReload(...)` 목록을 **테스트 시점에 읽어** 아래 표와 대조한다.
// 새 오버레이를 추가하고 표에 안 적으면 그 순간 빨개진다 — "조용히 빠짐"이 이 저장소의 반복된 사고 형태다.
// 도달할 수 없는 것은 `unreachable` 에 **사유와 함께** 적는다(빈칸으로 넘어가지 못하게).
//
// 라이브 DB 에 쓰지 않는다 — `_fixtures` 가드 + 필요한 응답만 page.route 로 만든다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';

const APP_TSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.tsx');

/** 운영에 실제로 등록된 배너와 같은 모양 — 이 한 행이 2026-09-15 오너 리포트의 재현 조건이다. */
const EVENT_BANNER = [{
  id: '11111111-1111-1111-1111-111111111111',
  title: '출석 이벤트 배너', subtitle: '출석하고 카드 뽑기',
  image_url: '/banners/nuri.webp', link_url: '/?event=card-open-2026-09',
  sort_order: 1, starts_at: null, ends_at: null, active: true,
}];
const TAB_BANNER = [{ ...EVENT_BANNER[0], id: '22222222-2222-2222-2222-222222222222', title: '탭 배너', link_url: '/?tab=live' }];

type Row = {
  /** 화면 이름(보고용) */
  name: string;
  /** 이 경로가 마운트하는 lazy 컴포넌트 — 아래 완전성 검사가 이 이름으로 표를 대조한다 */
  lazy: string;
  /** 진입 준비(배너 목킹·탭 이동 등) */
  setup?: (page: Page) => Promise<void>;
  /** 누를 것 */
  open: (page: Page) => Promise<void>;
  /** 도착 판정 — **그 화면에만 있는 것**으로 한다 */
  arrive: string;
  /** 이미 알려진 결함이 있어 G2 를 아직 못 거는 행. 사유와 실측치를 반드시 적는다(빈 문자열 금지). */
  knownFlash?: string;
};

const nav = (page: Page) => page.getByRole('navigation', { name: '하단 내비게이션' });

const ROWS: Row[] = [
  {
    name: '이벤트 판 — 홈 배너의 내부 링크(오너 리포트 원본 경로)',
    lazy: 'EventPage',
    setup: async (page) => {
      await page.route(/\/rest\/v1\/home_banners\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENT_BANNER) }));
      await page.goto('/');
      await dismissOverlays(page);
    },
    open: async (page) => { await page.getByRole('button', { name: /출석 이벤트 배너/ }).first().click(); },
    arrive: '[role="dialog"][aria-label="이벤트"]',
  },
  {
    name: '라이브 탭 — 홈 배너의 내부 링크(?tab=)',
    lazy: 'LiveGamesTab',
    setup: async (page) => {
      await page.route(/\/rest\/v1\/home_banners\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TAB_BANNER) }));
      await page.goto('/');
      await dismissOverlays(page);
    },
    open: async (page) => { await page.getByRole('button', { name: /탭 배너/ }).first().click(); },
    arrive: '[data-tab="live"]',
  },
  {
    // 2026-09-18 오너 지시로 **이벤트 탭은 목록을 연다**(딥링크만 보드 직행).
    //   그래서 이 행의 도착지가 보드 다이얼로그 → 목록 다이얼로그로 바뀐다.
    //   보드로 바로 가는 경로는 위 '홈 배너의 내부 링크' 행이 계속 지킨다(그 축은 안 바뀌었다).
    name: '이벤트 목록 — PC GNB 이벤트 칸',
    lazy: 'EventListPage',
    setup: async (page) => { await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/'); await dismissOverlays(page); },
    open: async (page) => { await page.locator('[data-stack-tabbar]').getByRole('tab', { name: /이벤트/ }).first().click(); },
    arrive: '[data-testid="event-list-page"]',
  },
  {
    name: '로그인 창',
    lazy: 'AuthModal',
    setup: async (page) => { await page.goto('/'); await dismissOverlays(page); },
    open: async (page) => { await page.getByRole('button', { name: '로그인' }).first().click(); },
    arrive: '[role="dialog"], form',
  },
  {
    name: '약관(법적 문서)',
    lazy: 'LegalDocsModal',
    setup: async (page) => { await page.goto('/'); await dismissOverlays(page); },
    open: async (page) => { await page.getByRole('button', { name: '이용약관' }).first().click(); },
    arrive: '[role="dialog"]',
  },
  {
    name: '고객센터 문의',
    lazy: 'SupportInquiryModal',
    setup: async (page) => { await page.goto('/'); await dismissOverlays(page); },
    open: async (page) => { await page.getByRole('button', { name: '고객센터 문의' }).first().click(); },
    arrive: '[role="dialog"]',
  },
  { name: '커뮤니티 탭', lazy: 'CommunityTab', setup: async (p) => { await p.goto('/'); await dismissOverlays(p); }, open: async (p) => { await nav(p).getByRole('button', { name: /^커뮤니티/ }).first().click(); }, arrive: '[data-tab="community"]' },
  { name: 'GTO 탭', lazy: 'ToolsPanel', setup: async (p) => { await p.goto('/'); await dismissOverlays(p); }, open: async (p) => { await nav(p).getByRole('button', { name: /^GTO/ }).first().click(); }, arrive: '[data-tab="tools"]' },
  { name: '캘린더 탭', lazy: 'CalendarPanelLazy', setup: async (p) => { await p.goto('/'); await dismissOverlays(p); }, open: async (p) => { await nav(p).getByRole('button', { name: /^캘린더/ }).first().click(); }, arrive: '[data-tab="calendar"]' },
];

/** 표에 없는 lazy 컴포넌트는 **여기 사유와 함께** 적는다. 빈 사유는 아래 검사가 거절한다.
 *  ⚠ 여기로 옮기는 것은 '검사 안 함' 이 아니라 '왜 아직 못 하는지 적어 둠' 이다. 사유가 해소되면 표로 올려라. */
const UNREACHABLE: Record<string, string> = {
  // 이미 실측했고 **결함이 남아 있는 것** — 지금 G2 를 걸면 게이트가 날 때부터 빨갛다. 사유와 수치를 남긴다.
  VenuePage: '실측 2026-09-15: 불투명 폴백 18프레임·853ms. 여는 쪽 handleVenueClick 이 VT 모핑 때문에 flushSync(동기 커밋)라 startTransition 처방을 그대로 못 쓴다 — 별건(리드 배정 대기).',
  NoticeDetailModal: '실측 2026-09-15: 불투명 폴백 18프레임·377ms. 같은 부류(여는 setState 가 트랜지션이 아님). 별건.',
  PostDetailModal: '같은 부류로 추정되나 **운영 데이터로 재현 못 함**(게시판 첫 행이 공지라 셀렉터가 공지 상세를 열었다). 목킹 픽스처가 생기면 표로 올린다.',
  // 진입 조건이 아직 이 스펙 밖인 것
  CustomerDashboardPage: '로그인 필요(내 정보/이용권 지갑). 목킹 세션(a11y-modal 3종)을 이 스펙에 들이면 다른 축이 섞인다 — 별도 행으로 올릴 때 같이 넣는다.',
  MyVoucherSheet: '로그인 필요(헤더 [이용권·출석] 버튼이 비로그인에서 안 뜬다 — 실측).',
  VenueManageTab: '업주·직원 역할 필요 — 비로그인에서는 내 매장 탭이 없다.',
  AdminTab: '관리자 역할 필요 — 비로그인에서는 탭 자체가 없다.',
  MarketplaceTab: '커뮤니티 탭 안의 하위 탭이라 진입이 2단계 — 탭 행과 중복된다.',
  GroupPage: '그룹 데이터가 운영에 있어야 도달한다(목킹 픽스처 없음).',
  ScheduleDetailModal: '운영에 오늘·내일 대회가 0건인 날이 있어 진입점이 사라진다(2026-09-15 실측). 일정 목킹 픽스처가 생기면 올린다.',
  ListingDetailModal: '장터 글이 있어야 도달(목킹 픽스처 없음).',
  GlobalSearchModal: '헤더 검색 버튼이 제거돼(오너 지시) 진입이 Cmd/Ctrl+K 단축키뿐 — 키보드 진입은 다른 축이라 별도.',
  PostFormModal: '글쓰기는 로그인+본인인증 게이트 뒤다(drag-close.spec 의 거짓 통과 사례).',
  MarketplaceFormModal: '장터 글쓰기 — 로그인+본인인증 게이트 뒤라 비로그인으로 도달 못 한다.',
  NoticeFormModal: '관리자 전용 — 공지 작성 버튼이 비관리자에게 렌더되지 않는다.',
  PosterFormModal: '업주·관리자 전용 — 포스터 등록 버튼이 손님에게 없다.',
  GtoDeepModal: 'GTO 탭 안에서 핸드를 고른 뒤라야 열린다 — 진입이 다단계.',
  ClockDisplay: 'TV 송출 전용 화면(?display=). 대형 스크린 축이라 이 스펙(모바일 프로젝트)에서 재지 않는다.',
  ClockRemote: '클락 리모컨 — 업주 역할 + 진행 중인 게임 필요.',
};

/** 프레임마다 '지금 커밋된 화면'을 적는 기록기. _navprobe 의 currentScreen 과 같은 판정이지만
 *  왕복 없이 **페이지 안에서** 돌아야 한다 — Playwright 왕복(수십 ms)으로는 한 프레임짜리 폴백을 놓친다. */
const RECORDER = () => {
  const W = window as unknown as { __OS: { seq: string[]; fb: number; raf: number } };
  W.__OS = { seq: [], fb: 0, raf: 0 };
  const name = () => {
    // OverlayFallback = fixed inset-0 z-[45] aria-busy + 스피너. 클래스 이스케이프를 피해 속성 셀렉터로.
    if (document.querySelector('[class*="z-[45]"][aria-busy="true"]')) { W.__OS.fb++; return '폴백'; }
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed');
    if (dlgs.length) {
      const top = dlgs[dlgs.length - 1];
      const label = top.getAttribute('aria-label')
        ?? document.getElementById(top.getAttribute('aria-labelledby') ?? '')?.textContent ?? '?';
      return 'overlay:' + label.trim().slice(0, 16);
    }
    const pane = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]')).find((el) => el.style.display !== 'none');
    return 'tab:' + (pane?.dataset.tab ?? '?');
  };
  const tick = () => {
    const s = name();
    if (W.__OS.seq[W.__OS.seq.length - 1] !== s) W.__OS.seq.push(s);
    W.__OS.raf = requestAnimationFrame(tick);
  };
  W.__OS.raf = requestAnimationFrame(tick);
};

test.describe('열 때 번쩍이지 않는다 — 문서 재로딩 0 · 중간 화면 0', () => {
  for (const row of ROWS) {
    test(`🔴 ${row.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await stabilizeBackstack(page);
      await row.setup?.(page);
      // 청크 프리페치(warm)가 유휴에 돌 시간을 준다 — 이 게이트는 '데워진 뒤에도 남는' 번쩍임을 본다.
      //   (로그인은 9초를 데워도 19프레임이 그대로였다 — 네트워크가 아니라 리액트 스로틀이라는 증거였다.)
      await page.waitForTimeout(3_000);

      await page.evaluate(RECORDER);
      // 🔴 센티넬은 **클릭 직전 evaluate 로만** 심는다. addInitScript 로 심으면 리로드 뒤 다시 심겨
      //    판정이 조용히 무의미해진다(2026-09-15 실제로 밟았다 — 그때 전부 '리로드 없음'으로 보였다).
      await page.evaluate(() => { (window as unknown as { __alive?: number }).__alive = 1; });

      const t0 = Date.now();
      await row.open(page);
      await expect(page.locator(row.arrive).first(), `'${row.name}' 이 안 열린다 — 죽은 진입점`).toBeVisible({ timeout: 20_000 });
      const 열림ms = Date.now() - t0;
      await page.waitForTimeout(400); // 정착 프레임까지

      const r = await page.evaluate(() => {
        const W = window as unknown as { __OS: { seq: string[]; fb: number; raf: number }; __alive?: number };
        cancelAnimationFrame(W.__OS.raf);
        return { seq: W.__OS.seq, fb: W.__OS.fb, alive: W.__alive ?? null };
      });
      console.log(`[${row.name}] 열림 ${열림ms}ms · 화면 ${r.seq.join(' → ')}`);

      // ── G1: 문서 재로딩 0 ────────────────────────────────────────────────
      expect(r.alive, `'${row.name}' 을 여는데 **문서를 새로 받았다**(앱 재부팅).
  같은 오리진이라도 location.assign / href 이동은 전체 리로드다 — 홈이 스켈레톤으로 되돌아갔다가
  다시 차오르고 그 뒤에 빈 판이 뜬다(실측 번쩍임 2회 · 열림 4~5배). 앱 안 전환으로 열어라
  (App.tsx 의 openInternalLink 가 그 자리다).`).toBe(1);

      if (row.knownFlash) {
        test.info().annotations.push({ type: 'known-flash', description: `${row.name}: ${row.knownFlash}` });
        return;
      }

      // ── G2: 중간 화면 0 ──────────────────────────────────────────────────
      expect(r.fb, `'${row.name}' 을 여는 동안 불투명 폴백(OverlayFallback)이 ${r.fb}프레임 떴다.
  원인은 대개 **여는 setState 가 트랜지션이 아닌 것**이다 — lazyWithReload 는 lazy(async …)라
  청크가 캐시에 있어도 첫 렌더에 한 번 서스펜드하고, 그러면 리액트가 폴백을 커밋한 뒤 ~300ms 붙잡는다.
  startTransition 으로 감싸라(App.tsx 의 openLogin·openEvent 가 그 처방이다).`).toBe(0);

      const 전환 = r.seq.length - 1;
      expect(전환, `'${row.name}' 진입 한 번에 화면이 ${전환}번 갈아끼워졌다: ${r.seq.join(' → ')}
  출발 → 도착, 한 번이어야 한다. 그 사이에 낀 화면이 곧 손님이 말하는 '번쩍'이다.`).toBeLessThanOrEqual(1);
    });
  }

  // ── 표를 소스가 정한다 ──────────────────────────────────────────────────────
  test('🔴 완전성 — App.tsx 의 lazy 오버레이가 전부 표에 있다(새로 추가하고 안 적으면 여기서 빨개진다)', () => {
    const src = readFileSync(APP_TSX, 'utf8');
    const declared = [...src.matchAll(/^const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*lazyWithReload\(/gm)].map((m) => m[1]);
    expect(declared.length, 'App.tsx 에서 lazyWithReload 선언을 하나도 못 찾았다 — 정규식이 소스와 어긋났다').toBeGreaterThan(10);

    const covered = new Set(ROWS.map((r) => r.lazy));
    const missing = declared.filter((n) => !covered.has(n) && !(n in UNREACHABLE));
    expect(missing, `새 lazy 오버레이가 이 스펙의 표에도 UNREACHABLE 에도 없다: ${missing.join(', ')}
  열리는 화면을 추가했으면 ROWS 에 진입 방법을 적거나, 아직 못 여는 이유를 UNREACHABLE 에 **사유와 함께** 적어라.
  (빠뜨린 것이 다음 사고다 — 이 검사가 있는 이유다.)`).toEqual([]);

    // 사유 없는 면제는 면제가 아니다.
    const 빈사유 = Object.entries(UNREACHABLE).filter(([, why]) => !why || why.trim().length < 10).map(([n]) => n);
    expect(빈사유, `UNREACHABLE 에 사유가 비었거나 너무 짧다: ${빈사유.join(', ')}`).toEqual([]);

    // 사라진 컴포넌트를 표에 남겨 두면 다음 사람이 있는 줄 안다.
    const 유령 = [...covered, ...Object.keys(UNREACHABLE)].filter((n) => !declared.includes(n));
    expect(유령, `표에 있는데 App.tsx 에는 없는 이름: ${유령.join(', ')} — 지웠거나 이름이 바뀌었다`).toEqual([]);

    console.log(`[완전성] lazy ${declared.length}개 = 표 ${covered.size}종 + 면제 ${Object.keys(UNREACHABLE).length}종`);
  });
});
