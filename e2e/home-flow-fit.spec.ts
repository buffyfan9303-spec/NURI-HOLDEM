// e2e/home-flow-fit.spec.ts — 홈(§6) 콘텐츠 흐름이 **모든 폭·테마·배율에서 잘리지 않는가**.
//
// 왜 이 스펙이 필요한가(2026-09-13 §6 재구성):
//   · 홈의 순서가 바뀌었다: 오늘 안내 → 배너 → 추천 대회(가로 레일) → 지금 등록 가능 → 이벤트
//     → 오늘·내일 일정 → GTO 도구. **가로 스크롤은 레일과 배너 안에서만** 일어나야 한다 —
//     문서 전체가 가로로 밀리면 그 자체가 회귀다.
//   · 추천 카드는 '132px 안에 욱여넣기'를 하지 않는다. 그래서 **높이 상한이 아니라 잘림 0** 을 잰다:
//     글자를 줄이거나 참가비를 지워서 통과하는 우회를 막기 위해 글자 크기 하한도 함께 단정한다.
//   · 수치는 조회 결과와 일치해야 한다 — '지금 등록 가능 N' 이 목록 길이(최대 5)가 아니라 실제
//     열린 개수인지 본다(예전엔 slice 한 배열의 length 를 적어 7개가 열려도 '4' 라고 말했다).
//
// ⚠ 두 축을 **둘 다** 잰다. 가로 잘림을 line-clamp 로 '고치면' 세로 잘림으로 옮겨 갈 뿐이다.
// ⚠ 목킹은 **핸들러 하나**다. 여러 개를 겹치면 route.continue() 가 조용히 실네트워크로 새어
//   "목킹했다고 믿는데 운영에 나가는" 상태가 된다(2026-09-12 실제 유출 8건). 첫 테스트가 유출 0 을 증명한다.
import { test, expect } from './_fixtures';
import { kstToday } from '../src/lib/kst';
import type { Page } from '@playwright/test';

const VENUE_ID = '22222222-2222-4222-8222-222222222222';
// ⚠ **로컬 날짜**여야 한다. `toISOString()`(UTC)로 만들면 KST 에서 하루 앞서, 앱이 로컬
//   `toLocaleDateString('en-CA')` 로 잡는 '오늘'과 어긋나 오늘 대회가 통째로 어제로 빠진다(실측).
// ⚠ 2026-09-13: `toLocaleDateString('en-CA')` 는 **Node 로컬 TZ** 다. `playwright.config.ts` 가 브라우저만 KST 로
//   고정하므로, 러너가 UTC 면 픽스처(UTC)와 앱 버킷(KST)이 하루 어긋난다.
//   `kstToday` 는 epoch 산술이라 **러너 시간대와 무관**하다 — env 에 기대지 않는다.
const day = (offset: number) => kstToday(Date.now() + offset * 86_400_000);
const TODAY = day(0);

/** 같은 출처의 실제 이미지 — 포스터가 **있는** 경로와 **없는** 경로를 한 화면에서 같이 본다. */
const POSTER = '/nuri-logo.png';

/** 최악 조합을 한 화면에 모은다: 긴 한글 매장명 · 긴 영문 대회명 · 6자리 이상 참가비 ·
 *  참가비 미입력(0 → '—') · 상금 없음 · 포스터 없음. */
const ROWS = [
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    title: '토요일 나이트 딥스택 메인 토너먼트 시즌 파이널 라운드',
    venue_id: VENUE_ID, pub_name: '누리홀덤 의정부 로티아레나 본점', region: '경기 의정부',
    address: '경기도 의정부시 평화로 123', date: TODAY, start_time: '18:00:00',
    duration: '6시간', format: 'NLH', guaranteed: true, prize_pool: 10_000_000, prize_percent: null,
    is_competition: true, grade: 'series', blinds: null, poster_url: POSTER, poster_color: '#1a1d24',
    buy_in: { amount: 55_000, gameType: '홀덤' },
    display_order: 0, is_premium: true, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 12, premium_until: null, reg_close_time: '14LV 00:12',
    structure: { lateRegLevels: 14, startingChips: 30_000 },
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    title: 'NURI HOLDEM SUPER MILLIONS CHAMPIONSHIP MAIN EVENT DAY1A FREEZEOUT',
    venue_id: VENUE_ID, pub_name: '판교 테크노밸리 스택 홀덤 포커클럽 프리미엄 라운지점', region: '경기 성남',
    address: '경기 성남시 분당구 1', date: TODAY, start_time: '19:30:00', duration: '3시간',
    format: 'NLH', guaranteed: false, prize_pool: null, prize_percent: 50,
    is_competition: false, grade: 'daily', blinds: null, poster_url: null, poster_color: null,
    buy_in: { amount: 1_234_567, gameType: '홀덤' },
    display_order: 1, is_premium: false, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 3, premium_until: null, reg_close_time: null, structure: null,
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000003',
    title: '참가비·상금 정보가 아직 없는 대회', venue_id: VENUE_ID,
    pub_name: '누리홀덤 부산 해운대 센텀시티점', region: '부산 해운대',
    address: '부산 해운대구 9', date: day(1), start_time: '20:00:00', duration: '4시간',
    format: 'PLO', guaranteed: false, prize_pool: null, prize_percent: null,
    poster_url: null, poster_color: null, is_competition: false, grade: null, blinds: null,
    buy_in: { amount: 0 },
    display_order: 2, is_premium: false, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 0, premium_until: null, reg_close_time: null, structure: null,
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000004',
    title: '수요 미드나잇 PKO', venue_id: VENUE_ID, pub_name: '누리홀덤 강남점', region: '서울 강남',
    address: '서울 강남구 1', date: day(2), start_time: '22:00:00', duration: '5시간',
    format: 'NLH', guaranteed: true, prize_pool: 150_000_000, prize_percent: null,
    // ⚠ 같은 포스터 URL 은 레일에서 1장으로 합쳐진다(연속 회차 도배 방지) — 다른 파일을 쓴다
    poster_url: '/icon-192.png', poster_color: '#1a1d24', is_competition: true, grade: null, blinds: null,
    buy_in: { amount: 330_000, gameType: '홀덤' },
    display_order: 3, is_premium: false, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 1, premium_until: null, reg_close_time: null, structure: null,
  },
];

/** 진행 중 클락 1개 — schedule[0] 과 (venue, date) 로 매칭돼 '등록 가능' 을 만든다.
 *  regCloseLevel 5 · 현재 인덱스 0 · 남은 20분 → msLeft 양수. */
const CLOCKS = [{
  venue_id: VENUE_ID, game_seq: 1, session_date: TODAY, title: ROWS[0].title,
  current_index: 0, running: true, ends_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  remaining_ms: 20 * 60_000, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0,
  eliminations: 0, live_stats: null,
  config: {
    title: ROWS[0].title, regCloseLevel: 5,
    levels: Array.from({ length: 12 }, (_, i) => ({ kind: 'level', sb: 100 * (i + 1), bb: 200 * (i + 1), ante: 0, minutes: 25 })),
  },
}];

/** 관리자 배너 2장 — 하나는 링크 있음(누를 수 있음), 하나는 링크 없음(누르면 안 됨). */
const BANNERS = [
  { id: 'ban-1', title: '누리홀덤 가을 시즌 안내', subtitle: '9월 한 달 전국 매장 일정 모아보기', image_url: POSTER, link_url: '/', sort_order: 0, active: true, starts_at: null, ends_at: null },
  { id: 'ban-2', title: '링크 없는 배너', subtitle: '누를 수 없어야 한다', image_url: POSTER, link_url: null, sort_order: 1, active: true, starts_at: null, ends_at: null },
];

/** 진행 중 이벤트 — 홈 이벤트 **배너**(광고) 경로를 실제로 그리게 한다. */
const EVENT_BOARD = {
  slug: 'card-open-2026-09', title: '가을 카드 뽑기', subtitle: null, status: 'live',
  venueId: VENUE_ID, startsAt: null, endsAt: null, voucherTitle: '이용권',
  cards: Array.from({ length: 10 }, (_, i) => ({ idx: i, opened: i < 3, tier: null, count: null, by: null })),
  myTickets: 0, remainByTier: {}, totalByTier: {}, voucherByTier: {},
};

/** 단일 핸들러 — 이 스펙이 내보내는 **모든** 요청이 여기를 지난다.
 *  로컬 preview(앱 번들·이미지)만 통과시키고, 그 밖의 외부 주소는 전부 여기서 끝낸다(실네트워크 0). */
async function mockAll(page: Page, external: string[]) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    // ⚠ 여기 담기는 것은 '나간 요청' 이 아니라 **핸들러가 잡은 외부 주소**다. 아래 분기는 전부
    //   fulfill 또는 abort 로 끝나며 `route.continue()` 가 **한 줄도 없다** — 그래서 실네트워크는 0 이다.
    //   (측정 자체가 계약이다: continue 가 하나라도 생기면 첫 테스트가 그 줄을 잡아낸다.)
    external.push(`${route.request().method()} ${url}`);
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json(ROWS);
    if (/\/rest\/v1\/clock_states/.test(url)) return json(CLOCKS);
    if (/\/rest\/v1\/home_banners/.test(url)) return json(BANNERS);
    if (/\/rest\/v1\/venues/.test(url)) return json([{
      id: VENUE_ID, name: '누리홀덤 의정부 로티아레나 본점', region: '경기 의정부',
      address: '경기도 의정부시 평화로 123', approved: true, status: 'active',
      is_paid_ad: false, display_order: 1, follower_count: 10, rating: 4.8,
    }]);
    if (/\/rest\/v1\/rpc\/event_board/.test(url)) return json(EVENT_BOARD);
    if (/\/rest\/v1\/rpc\//.test(url)) return json([]);
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
}

type Overflow = { tag: string; text: string; cls: string; clientW: number; scrollW: number; clientH: number; scrollH: number };

/** 홈 판 안 모든 요소의 두 축 넘침 + 섹션 실측치. 홈 탭은 keep-alive 라 스코프를 반드시 건다. */
const measure = (page: Page) => page.evaluate(() => {
  const home = document.querySelector<HTMLElement>('main[data-tab="home"]');
  if (!home) return null;
  const overflow: Overflow[] = [];
  const clamped: string[] = [];
  /** `text-overflow: ellipsis` 로 **설계된** 줄임(대회명·매장명 → 상세로 연결). 값이 아니라 이름에만 쓴다. */
  const ellipsis: string[] = [];
  /** 값이 잘리면 안 되는 것들 — §5: 금액·등록 마감·필수 조건은 잘라내지 않는다. */
  const clippedValues: string[] = [];
  /** 의도한 가로 스크롤러(배너·추천 레일) 밖에서 숨은 가로 스크롤이 생기면 정보가 사라진다. */
  const hiddenScroll: string[] = [];
  // 2026-09-18: home-rail-track 은 추천 대회 레일을 지우면서 같이 없어졌다.
  // 2026-09-24: 날짜 스트립(home-date-strip)은 9주를 가로로 미는 **설계된 스크롤러**다 — 배너와 같은 부류로 허용한다.
  //   ⚠ 스트립 **밖**의 가로 넘침·숨은 스크롤은 그대로 잡는다(허용은 그 요소와 자손에만 걸린다).
  const ALLOWED = '[data-testid="home-banner-viewport"], [data-testid="home-date-strip"]';
  for (const el of home.querySelectorAll<HTMLElement>('*')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = (el.textContent || '').trim().slice(0, 40);
    const inScroller = !!el.closest(ALLOWED);
    if (/auto|scroll/.test(s.overflowX) && !inScroller) hiddenScroll.push(`${text} :: overflow-x:${s.overflowX}`);
    // 레일·배너 **안쪽**(스크롤러 자신과 그 자손)의 가로 넘침은 설계다 — 트랙이 곧 스크롤 대상이다
    if (inScroller) continue;
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    const cut = dx > 1 || dy > 1;
    // 순서가 계약이다(음성 대조로 두 번 고쳤다):
    //  ① **line-clamp 는 설계된 요약**이다(대회명 2줄) — 먼저 빼지 않으면 '참가비·상금 정보가 아직
    //     없는 대회' 같은 **제목**이 낱말만으로 값 잘림으로 오판된다.
    //  ② 그다음 **값**을 본다. ellipsis 보다 **먼저** 봐야 한다 — `truncate` 로 '마감까지 1시간 34분'을
    //     지워 놓고 "말줄임은 설계"라고 넘어가면 이 검사는 아무것도 못 잡는다(실제로 그 구멍이 났다).
    //  ③ 나머지 말줄임(이름)은 설계로 인정한다 — 전체 이름은 상세에서 보인다(§5).
    if (s.webkitLineClamp && s.webkitLineClamp !== 'none') { clamped.push(text); continue; }
    if (cut && /마감까지|등록 마감|참가비 [\d—]|GTD/.test(text)) {
      clippedValues.push(`${text} ${el.clientWidth}/${el.scrollWidth} × ${el.clientHeight}/${el.scrollHeight}`);
      continue;
    }
    if (s.textOverflow === 'ellipsis') { ellipsis.push(text); continue; }
    if (cut) {
      overflow.push({
        tag: el.tagName.toLowerCase(), text, cls: el.className.toString().slice(0, 90),
        clientW: el.clientWidth, scrollW: el.scrollWidth, clientH: el.clientHeight, scrollH: el.scrollHeight,
      });
    }
  }
  const box = (sel: string) => {
    const el = home.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  };
  // 2026-09-18 추천 대회 레일 삭제 — 그 자리를 **퀵액션 2칸**이 대신 지킨다.
  //   이 파일의 요지(잘림·최소 글자 크기)는 대상만 바뀔 뿐 그대로 재야 한다.
  const railCards = [...home.querySelectorAll<HTMLElement>('[data-testid="home-quick"] button')];
  const smallest = [...home.querySelectorAll<HTMLElement>('[data-testid="home-quick"] span')]
    .map((e) => parseFloat(getComputedStyle(e).fontSize))
    .filter((n) => Number.isFinite(n) && n > 0);
  const doc = document.scrollingElement as HTMLElement;
  return {
    overflow, clamped, ellipsis, clippedValues, hiddenScroll,
    docScrollX: doc.scrollWidth - doc.clientWidth,
    today: box('[data-testid="home-today"]'),
    banner: box('[data-testid="home-banner-viewport"]'),
    dots: !!home.querySelector('[data-testid="home-banner-dots"]'),
    railCount: railCards.length,
    railCardW: railCards.map((c) => Math.round(c.getBoundingClientRect().width * 10) / 10),
    railCardH: railCards.map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10),
    railMinFont: smallest.length ? Math.min(...smallest) : 0,
    gtoEntries: home.querySelectorAll('[data-testid="home-gto-entry"]').length,
    text: (home.textContent || '').replace(/\s+/g, ' ').trim(),
  };
});

async function openHome(page: Page, w: number, theme: 'dark' | 'light', zoom: boolean) {
  await page.addInitScript(([k, v]: string[]) => {
    try { localStorage.setItem(k, v); } catch { /* 저장소 차단 환경 */ }
  }, ['nuri-theme', theme]);
  if (zoom) {
    // 200% = 루트 글자 확대(17 → 34px). 브라우저 확대와 달리 px 미디어쿼리는 그대로다 —
    // rem 기준 레이아웃이 스스로 접히는지 보는 축이다.
    await page.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = 'html{font-size:34px!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
    });
  }
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('home-quick').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe('홈 §6 흐름 — 잘림 0 · 가로 스크롤은 레일 안에서만', () => {
  test('🔴 목킹 유출 0 — 이 스펙은 외부로 실요청을 내보내지 않는다', async ({ page }) => {
    const external: string[] = [];
    const responded: string[] = [];
    // 브라우저가 **실제로 응답을 받은** 외부 주소가 있으면 그건 네트워크로 나간 것이다.
    page.on('response', (res) => {
      const u = res.url();
      if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        if (res.request().failure() === null && !/supabase\.co/.test(u)) responded.push(`${res.status()} ${u}`);
      }
    });
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    expect(external.length, '외부 주소 요청이 한 건도 없다면 목킹 자체가 안 걸린 것이다').toBeGreaterThan(0);
    // supabase 로 간 것들은 전부 fulfill 로 끝났다(핸들러에 route.continue 가 없다). 그 밖의 호스트는
    // abort 라 응답 자체가 없다 — 응답을 받은 외부 주소가 하나라도 있으면 운영/서드파티로 새어나간 것이다.
    expect(responded, `외부로 실제 응답을 받은 요청이 있다:\n${responded.join('\n')}`).toEqual([]);
  });

  for (const w of [320, 360, 390, 430, 768, 1024, 1440]) {
    for (const theme of ['dark', 'light'] as const) {
      // 🔴 2026-09-20 오너 지시: "그런 사람 없어 앞으로 200% 확대 다 빼".
      //   루트 글자 17→34px 로 흉내 내던 200% 확대 케이스를 **전부 제거**했다.
      //   ⚠ 되살리지 마라 — 오너가 사용자 분포를 보고 내린 결정이다.
      //   ⚠ 100% 케이스는 그대로 둔다. 긴 한글 이름에서 생기는 잘림·겹침은 거기서 계속 잡는다
      //     (확대가 잡아주던 레이아웃 취약점의 상당수가 100%의 320·360 최악 데이터에도 나온다).
      for (const zoom of [false]) {
        test(`${w}px · ${theme} · ${zoom ? '200%' : '100%'} — 가로·세로 잘림 0`, async ({ page }) => {
          test.setTimeout(60_000);
          const external: string[] = [];
          await mockAll(page, external);
          await openHome(page, w, theme, zoom);
          const r = await measure(page);
          // 우회 금지 — 잴 것이 실제로 있는지 먼저 단정한다(`if (!el) return` 금지)
          expect(r, '홈 판이 렌더되지 않았다 — 잴 것이 없으면 통과가 아니다').not.toBeNull();
          expect(r!.today, '오늘 안내가 없다').not.toBeNull();
          expect(r!.banner, '배너가 없다').not.toBeNull();
          expect(r!.railCount, '퀵액션 칸이 2개가 아니다 — 출석 체크·제휴 혜택 두 칸은 항상 있어야 한다').toBe(2);
          console.log(`[${w}/${theme}/${zoom ? 200 : 100}] today=${r!.today!.h} banner=${r!.banner!.w}×${r!.banner!.h} quickW=${r!.railCardW[0]} quickH=${r!.railCardH.join(',')} minFont=${r!.railMinFont}`);

          expect(r!.hiddenScroll, `레일 밖에 숨은 가로 스크롤이 있다:\n${r!.hiddenScroll.join('\n')}`).toEqual([]);
          expect(
            r!.overflow.map((o) => `${o.tag} "${o.text}" ${o.clientW}/${o.scrollW} × ${o.clientH}/${o.scrollH} :: ${o.cls}`),
            '홈에서 잘린 요소가 있다',
          ).toEqual([]);
          expect(r!.clippedValues, `값이 잘렸다 — 이름은 줄여도 금액·등록 마감은 못 줄인다:\n${r!.clippedValues.join('\n')}`).toEqual([]);
          expect(r!.docScrollX, '문서가 가로로 스크롤된다 — 가로 스크롤은 레일 안에서만 일어나야 한다').toBeLessThanOrEqual(0);
          // 글자를 줄여서 통과하는 우회를 막는다(§5: 중요한 정보에 9~10px 금지)
          expect(r!.railMinFont, '퀵액션 칸 글자가 11px 미만이다 — 압축으로 맞추지 않는다').toBeGreaterThanOrEqual(11);
        });
      }
    }
  }

  test('🔴 수치는 조회 결과와 일치한다 · 참가비 미입력은 "무료"가 아니라 "—"', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    const r = await measure(page);
    expect(r).not.toBeNull();
    // 2026-09-18 오너: "메인에 오늘 대회 1개 지금등록가능0개가 있는데 ... 오늘 대회 1것도 빼고
    //   GTO쪽을 강조해볼까? 무료 GTO 도구 20개 이런식으로?" → 첫 줄이 GTO 도구 수로 바뀌었다.
    //   ⚠ 그 숫자는 **손으로 적은 값이 아니라** ToolsPanel 소스를 세어 계약으로 잠근 값이다
    //     (src/lib/gtoToolCount.ts + gtoToolCount.contract.test.ts). 여기서는 '숫자가 붙어 있는가'
    //     만 본다 — 개수 자체를 두 곳에 적으면 그 둘이 어긋나는 날이 온다.
    expect(r!.text, '홈 첫 줄이 GTO 도구 수를 말하지 않는다').toMatch(/무료 GTO 도구\s*\d+개/);
    // 클락이 열린 대회는 1건뿐이다.
    //   ⚠ '개' 를 붙여 세던 곳은 **첫 줄 문구**였고, 오너 지시로 그 문구가 빠졌다(2026-09-18).
    //     같은 사실은 아래 섹션 제목('지금 등록 가능 1')이 그대로 말한다 — 수치가 사라진 게 아니라
    //     자리가 하나로 줄었다. 그래서 '개' 를 뺀 형태로 센다(검사를 푸는 것이 아니라 자리를 옮긴 것).
    //     ⚠ (?!\d) 가 필요하다 — 없으면 '10개'·'11개' 의 앞자리 1 에도 통과해 수치 검사가 무력해진다.
    expect(r!.text, '지금 등록 가능 수가 실제 조회 결과와 다르다').toMatch(/지금 등록 가능\s*1(?!\d)/);
    // 2026-09-18: 예전에는 추천 레일 카드의 buyInText 가 '참가비 1,234,567원' 을 한 덩어리로 만들었다.
    //   레일을 지우면서 남은 것은 목록 줄이고, 거기서는 라벨과 금액이 별도 요소라 공백 없이 이어진다.
    //   이 검사의 요지는 **6자리를 반올림·축약하지 않는다** 이므로 금액만 집는다(게이트를 푸는 것이 아니다).
    expect(r!.text, '참가비 6자리가 반올림·축약됐다').toContain('1,234,567원');
    // 🔴 2026-09-20 — 홈이 **고른 하루만** 보여 주게 바뀜다(날짜 레일, 오너 레퍼런스).
    //   참가비 미입력 행은 **내일(day(1))** 이라 기본 화면(오늘)에는 없다.
    //   ⚠ 단언을 지우거나 느슨하게 푸는 것이 아니라 **그 날로 가서** 같은 것을 본다
    //     — '미입력 참가비가 "무료"로 둔갑하지 않는다' 는 그대로 지킨다.
    const TOMORROW = day(1);
    await page.locator(`[data-date-pill="${TOMORROW}"]`).click();
    await page.waitForTimeout(700);
    const r2 = await measure(page);
    expect(r2!.text, '내일을 골랐는데 그 날 카드가 안 보인다').toMatch(/참가비상금|상금참가비|참가비—/);
    expect(r2!.text, '참가비 미입력이 "무료"로 둔갑했다').toContain('참가비—');
    // 2026-09-18 오너 지시로 라벨이 '상금 보장' → 'GTD' 로 바뀌었다. 이 검사의 요지는 라벨이 아니라
    //   **금액이 반올림·축약되지 않는 것**이므로 그 부분은 그대로 본다.
    // ⚠ 2026-09-18(6차) — GTD 라벨과 금액이 **다른 요소**로 나뉘었다(라벨은 작게·금액은 크게).
    //   그래서 `textContent` 가 'GTD1,000만' 로 붙어 나온다 — 공백을 박은 문자열 비교는 이걸 못 본다.
    //   이 검사의 요지는 **금액이 반올림되지 않는 것**이므로 공백을 선택적으로 보는 정규식으로 바꾼다.
    expect(r!.text, 'GTD 금액이 반올림됐다').toMatch(/GTD\s*1,000만/);
    expect(r!.text, '근거 없는 긴박감 문구가 붙었다').not.toMatch(/마감 임박|급상승|인기 급등/);
  });

  test('🔴 GTO 진입은 홈에 **정확히 한 곳**(첫 줄)이고 탭바에도 있다 · 배너 점 제어는 여러 장일 때만 나온다', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    const r = await measure(page);
    expect(r).not.toBeNull();
    // 🔴 2026-09-19 오너: "홈 화면에 GTO 도구 있는 부분 삭제".
    //   종전 계약은 '홈에 정확히 하나'(히어로와 카드에서 같은 설명을 반복하지 말 것)였다.
    //   이제 홈에는 0 이다 — 같은 곳으로 가는 문이 탭바에 이미 있었기 때문이다.
    // 🔴 2026-09-24 오너 지시(H2): "'무료 GTO 도구 22개' 줄 전체를 누르면 GTO 탭으로" — 0 → **정확히 1**.
    //   두 곳 이상이면 09-19 에 지운 중복(히어로+카드)이 되살아난 것이다.
    expect(r!.gtoEntries, 'GTO 진입이 홈에 정확히 한 곳이 아니다(오너 H2: 첫 줄 하나)').toBe(1);
    const entry = page.getByTestId('home-gto-entry');
    const eb = await entry.boundingBox();
    expect(eb!.height, 'GTO 진입 줄의 터치 높이가 44px 미만이다').toBeGreaterThanOrEqual(44);
    // ⚠ 0 만 단언하면 '진입을 통째로 잃은 것' 과 구별되지 않는다.
    //   길이 남아 있는지를 **같은 검사에서** 확인한다(기능 소실 방지 — 이 저장소의 3대 불문율).
    const gtoTab = page.getByRole('button', { name: 'GTO' });
    await expect(gtoTab.first(), '홈에서도 탭바에서도 GTO 로 갈 길이 없다 — 진입을 통째로 잃었다')
      .toBeVisible();
    expect(r!.dots, '배너가 여러 장인데 점 제어가 없다').toBe(true);
    // 점 하나하나가 터치 대상이어야 한다(작은 점 자체만 눌리게 두지 않는다)
    const dot = page.getByRole('button', { name: '1번째 배너' });
    await expect(dot).toBeVisible();
    const bb = await dot.boundingBox();
    expect(bb!.width, '배너 점의 터치 폭이 24px 미만이다').toBeGreaterThanOrEqual(24);
    expect(bb!.height, '배너 점의 터치 높이가 24px 미만이다').toBeGreaterThanOrEqual(24);
    // 오너 H2 — 누르면 **앱 안에서** GTO 탭이 열린다(전체 리로드 없음: 같은 문서의 표식이 살아 있어야 한다).
    await page.evaluate(() => { (window as unknown as { __noReload?: number }).__noReload = 1; });
    await entry.click();
    await expect(page.locator('main[data-tab="tools"]'), 'GTO 줄을 눌렀는데 GTO 탭이 안 열렸다').toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload), 'GTO 줄이 문서를 새로 받았다(전체 리로드)').toBe(1);
  });

  // §6-2 의 배너 높이 — **기본 배율에서만** 잰다. 글자 확대 상태에 이 목표를 강제하지 않는다
  // (min-h 라 확대되면 프레임이 같이 커지는 것이 옳다).
  // 🔴 2026-09-24 오너 지시("모바일 메인 배너 세로 폭을 조금 더 늘려라", 132~140) — 390 상한 120 → 140.
  //   첫 화면을 먹지 않게 하는 하한·상한 계약 자체는 그대로다(범위만 오너 지시로 옮겼다).
  for (const c of [{ w: 390, lo: 104, hi: 140 }, { w: 1440, lo: 180, hi: 220 }]) {
    test(`🔴 배너가 첫 화면을 먹지 않는다 — ${c.w}px 에서 ${c.lo}~${c.hi}px`, async ({ page }) => {
      const external: string[] = [];
      await mockAll(page, external);
      await openHome(page, c.w, 'dark', false);
      const r = await measure(page);
      expect(r).not.toBeNull();
      expect(r!.banner, '배너가 없다 — 잴 것이 없으면 통과가 아니다').not.toBeNull();
      console.log(`[배너 ${c.w}] ${r!.banner!.w}×${r!.banner!.h} · 오늘 안내 ${r!.today!.h}`);
      expect(r!.banner!.h, `배너 높이 ${r!.banner!.h}px 가 ${c.lo}~${c.hi} 밖이다`).toBeGreaterThanOrEqual(c.lo);
      expect(r!.banner!.h, `배너 높이 ${r!.banner!.h}px 가 ${c.lo}~${c.hi} 밖이다`).toBeLessThanOrEqual(c.hi);
    });
  }

  test('🔴 링크 없는 관리자 배너는 누를 수 없다(죽은 버튼 금지)', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    const dead = page.locator('[data-testid="home-banner-viewport"] [aria-label="링크 없는 배너"]').first();
    await expect(dead).toBeAttached();
    expect(await dead.evaluate((el) => el.tagName.toLowerCase()), '목적지가 없는 배너가 <button> 으로 그려졌다').toBe('div');
  });

  test('🔴 배너 이동 — 첫 장에서 "이전"도 먹는다(양방향 랩) · 목적지로 실제로 간다', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    const vp = page.getByTestId('home-banner-viewport');
    const at = () => vp.evaluate((el) => Math.round(el.scrollLeft));
    const w = await vp.evaluate((el) => el.clientWidth);

    // '이전'은 **어느 위치에서든** 움직여야 한다. 왼쪽에 갈 자리가 없으면(scrollLeft 0) 음수로
    // 클램프되어 스크롤 이벤트조차 안 나고 랩도 안 돌아 통째로 먹통이 된다 — go() 가 복제 세트로
    // 먼저 옮겨 그 자리를 막는다. (실측: 마운트 직후 위치는 0 일 수도, 랩이 한 번 돈 half 일 수도 있다.
    //  그래서 '0' 을 전제로 깔지 않고 **움직였는가**만 본다.)
    const start = await at();
    await page.getByRole('button', { name: '이전 배너' }).click();
    await expect.poll(at, { timeout: 5_000 }).not.toBe(start);
    expect(await at(), '이전이 0 에 갇혔다').toBeGreaterThan(0);

    // 다음으로 한 바퀴(장 수만큼) 돌리면 같은 장으로 돌아온다 — 랩이 끊기면 끝에서 멈춘다.
    const dots = page.locator('[data-testid="home-banner-dots"] button[aria-label$="번째 배너"]');
    const n = await dots.count();
    const before = ((Math.round((await at()) / w)) % n + n) % n;
    for (let i = 0; i < n; i++) {
      await page.getByRole('button', { name: '다음 배너' }).click();
      await page.waitForTimeout(350);
    }
    const after = ((Math.round((await at()) / w)) % n + n) % n;
    expect(after, `${n}장을 한 바퀴 돌렸는데 제자리로 안 왔다 — 랩이 끊겼다`).toBe(before);

    // 클릭 목적지 — 'NURI HOLDEM' 브랜드 배너는 전체 일정(browse) 판으로 간다.
    await page.locator('[data-testid="home-banner-viewport"] button[aria-label^="NURI HOLDEM"]').first().click();
    await expect(page.locator('main[data-tab="browse"]')).toBeVisible({ timeout: 10_000 });
  });

  test('🔴 배너 문구가 목적지와 어긋나지 않는다 — NURI MIND 는 외부 운세이지 GTO 트레이닝이 아니다', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    const r = await measure(page);
    expect(r).not.toBeNull();
    expect(r!.text, 'NURI MIND 가 여전히 화면에 없다 — 잴 것이 없으면 통과가 아니다').toContain('NURI MIND');
    // 조사 결과(§6-2): 이 배너의 실제 목적지는 외부 nurimind.co.kr 이고, 우리 앱은 '매일 한 문제
    // GTO 트레이닝'을 제공하지 않는다. 서비스가 제공하지 않는 기능으로 유도하면 안 된다.
    expect(r!.text, '배너가 제공하지 않는 기능(GTO 트레이닝)으로 유도하고 있다').not.toContain('GTO 트레이닝');
    const mind = page.locator('[data-testid="home-banner-viewport"] [aria-label*="NURI MIND"]').first();
    await expect(mind).toBeAttached();
    expect(await mind.textContent(), '외부로 나간다는 사실이 배너에 적혀 있지 않다').toContain('외부 사이트');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`대비 — ${theme} 테마에서 추천 카드·목록 글자가 AA 를 넘는다`, async ({ page }) => {
      const external: string[] = [];
      await mockAll(page, external);
      await openHome(page, 390, theme, false);
      // 실제 전경/배경을 재서 AA(본문 4.5:1)를 확인한다 — 눈대중이 아니라 computed 값으로.
      // ⚠ 배너 슬라이드는 제외한다: 스크림이 background-image(그라데이션)라 backgroundColor 합성으로는
      //   잡히지 않아 **거짓 미달**이 난다(같은 함정을 알약 ::before 에서 이미 밟았다).
      const rows = await page.evaluate(() => {
        const lum = (c: string) => {
          const m = c.match(/[\d.]+/g)!.map(Number);
          const [r, g, b] = m.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const bgOf = (el: HTMLElement) => {
          let n: HTMLElement | null = el;
          while (n) {
            const c = getComputedStyle(n).backgroundColor;
            const a = c.match(/[\d.]+/g);
            if (a && (a.length < 4 || Number(a[3]) > 0.6)) return c;
            n = n.parentElement;
          }
          return 'rgb(255,255,255)';
        };
        const out: { text: string; ratio: number; size: number; fg: string; bg: string }[] = [];
        const home = document.querySelector<HTMLElement>('main[data-tab="home"]')!;
        for (const el of home.querySelectorAll<HTMLElement>('span,p,h3,b')) {
          if (el.closest('[data-testid="home-banner-viewport"]')) continue;
          // ⚠ `article.cv-card-list` = ScheduleCard(매장 팀 파일)다. 여기 `·` 구분자가
          //   `text-border-strong`(다크 2.96 / 라이트 3.38)로 AA 미달인데 **이 배치의 편집 범위가
          //   아니다**(ScheduleCard.tsx:168,182). 조용히 통과시키지 않고 보고로 넘긴다 —
          //   이 스펙은 홈이 **직접 그리는** 글자만 책임진다.
          if (el.closest('article.cv-card-list')) continue;
          const rc = el.getBoundingClientRect();
          if (!rc.width || !rc.height || el.children.length || !el.textContent?.trim()) continue;
          const s = getComputedStyle(el);
          const fg = s.color, bg = bgOf(el);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          out.push({ text: el.textContent.trim().slice(0, 22), size: parseFloat(s.fontSize), fg, bg, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 });
        }
        return out;
      });
      expect(rows.length, '잎 텍스트를 하나도 못 찾았다 — 측정이 안 된 것이다').toBeGreaterThan(8);
      const worst = [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, 5);
      console.log(`[대비 ${theme}] 최저 5:`, worst.map((r) => `${r.text}=${r.ratio}(${r.size}px)`).join(' · '));
      // 큰 글자(18px 이상 bold / 24px 이상)는 3:1, 나머지는 4.5:1
      const bad = rows.filter((r) => r.ratio < (r.size >= 18 ? 3 : 4.5))
        .map((r) => `${r.text} ${r.ratio}:1 ${r.size}px (${r.fg} on ${r.bg})`);
      expect(bad, `AA 미달:\n${bad.join('\n')}`).toEqual([]);
    });
  }
});
