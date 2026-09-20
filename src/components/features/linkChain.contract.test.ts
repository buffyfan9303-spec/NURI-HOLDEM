// 2026-09-17 연결 감사 A~G — "페이지마다 연결성이 없다"(오너) 막다른 골목 13건의 **배선**을 잠근다.
//
// 왜 소스 계약인가: 전부 App.tsx(4팀 공용 셸)가 prop 을 안 넘겨 생긴 결함이라 렌더 트리 테스트로는 auth·supabase·
//   lazy 청크·keep-alive 때문에 세울 수 없고, 목 환경(IS_MOCK)엔 진행 중 클락·예약·팔로우가 없어 e2e 도 못 본다.
//   homeLiveFreshness / postNavWiring 과 같은 결 — "문장이 있는가" 를 본다. 도달 여부는 각 항목 옆 실측 메모가 말한다.
// 음성 대조(2026-09-17 실행): App 의 `onDisplay={openDisplay}` 를 빼면 B 가, `onVenueClick={openVenueFromSchedule}` 를
//   `handleVenueClick` 으로 되돌리면 C 가, LiveGamesTab 팔로우 이펙트 deps 를 `[]` 로 되돌리면 E 가 각각 빨개진다.
// 실행: npx vitest run src/components/features/linkChain.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (...p: string[]) => strip(readFileSync(join(__dirname, ...p), 'utf-8'));
const APP = read('..', '..', 'App.tsx');
const ME = read('CustomerDashboardPage.tsx');
const SDM = read('ScheduleDetailModal.tsx');
const LIVE = read('LiveGamesTab.tsx');
const NOTIF = read('NotificationPanel.tsx');
const VENUE = read('VenuePage.tsx');
const REG = read('..', '..', 'lib', 'regStatus.ts');

describe('A · 내 정보 → 매장(재방문 사슬)', () => {
  it('🔴 App 이 onOpenVenue 를 내려주고, 대시보드를 닫고 매장을 연 뒤 닫으면 다시 내 정보로', () => {
    expect(APP).toMatch(/onOpenVenue=\{handleMeOpenVenue\}\s+venues=\{venues\}/);
    // 거절(목록에 없음)이면 내 정보를 닫지 않는다 — handleVenueClick 의 boolean 반환이 그 분기다
    expect(APP).toMatch(/const handleMeOpenVenue = useCallback\(\(vid: string\) => \{\s*if \(!handleVenueClick\(vid\)\) return;[^\n]*\s*venueReturnRef\.current = \(\) => setVoucherWalletOpen\(true\);\s*setVoucherWalletOpen\(false\);/);
    expect(APP).toMatch(/const handleVenueClick = useCallback\(\(venueId: string\): boolean => \{/);
    expect(APP).toMatch(/if \(!venuesRef\.current\.some\(\(v\) => v\.id === venueId\)\) \{/);
  });
  it('🔴 세 자리가 전부 이어진다 — 이용권 묶음(VoucherWallet onVenue) · 이용 내역 행 · 입상 행', () => {
    expect(ME).toMatch(/<VoucherWallet onNeedVerify=\{\(\) => goTab\('security'\)\} onVenue=\{onOpenVenue\} boxed \/>/);
    expect(ME).toMatch(/data-testid="me-usage-venue" onClick=\{\(\) => onOpenVenue\?\.\(u\.venueId\)\}/);
    expect(ME).toMatch(/data-testid="me-rank-venue" onClick=\{\(\) => vid && onOpenVenue\?\.\(vid\)\}/);
    // 입상 행은 매장명뿐(getMyRankingHistory) — 전체 venues 로 이름→id 를 푼다
    expect(ME).toMatch(/for \(const v of venues \?\? \[\]\) venueIdByName\.set\(v\.name, v\.id\);/);
  });
});

describe('B · 포스터 상세(라이브 중) → 관전 클락', () => {
  it('🔴 RegInfo 가 gameSeq 를 싣고, 상세는 App.openDisplay 를 받아 같은 클락을 연다', () => {
    expect(REG).toMatch(/export interface RegInfo \{[\s\S]*?gameSeq: number;\s*\}/);
    expect(REG).toMatch(/running: g\.running, gameSeq: g\.gameSeq \}\);/);
    expect(APP).toMatch(/<ScheduleDetailModal[\s\S]{0,400}?onDisplay=\{openDisplay\}/);
    expect(SDM).toMatch(/<LiveClockPanel schedule=\{schedule\} regInfo=\{regInfo\}[^\n]*onDisplay=\{onDisplay\} \/>/);
    expect(SDM).toMatch(/data-testid="sched-live-display" onClick=\{\(\) => onDisplay\(venueId, clock\?\.gameSeq \?\? regInfo\?\.gameSeq \?\? 1\)\}/);
  });
});

describe('C · 매장을 닫으면 출발지(포스터·게시글·내 정보)로 돌아온다', () => {
  it('🔴 매장이 닫히는 세 길(뒤로가기·X·그룹 X)이 전부 closeVenue 를 지나고, closeVenue 가 복귀를 실행한다', () => {
    expect(APP).toMatch(/const closeVenue = useCallback\(\(\) => \{\s*const back = venueReturnRef\.current;\s*venueReturnRef\.current = null;\s*setOpenVenueId\(null\);\s*back\?\.\(\);/);
    expect(APP).toMatch(/useBackClose\(openVenueId !== null, closeVenue, ADOPT\);/);
    expect(APP).toMatch(/onClose=\{closeVenue\}/);
    expect((APP.match(/onClose=\{closeVenue\}/g) ?? []).length).toBe(2);
    expect(APP).not.toMatch(/onClose=\{\(\) => setOpenVenueId\(null\)\}/);
  });
  it('🔴 포스터·게시글 → 매장은 출발지를 기억한다', () => {
    expect(APP).toMatch(/onVenueClick=\{openVenueFromSchedule\}/);
    expect(APP).toMatch(/if \(!handleVenueClick\(vid\)\) return;[^\n]*\s*venueReturnRef\.current = s \? \(\) => handleScheduleSelect\(s\) : null;/);
    expect(APP).toMatch(/if \(!handleVenueClick\(vid\)\) return;[^\n]*\s*venueReturnRef\.current = \(\) => \{ setOpenPost\(p\); setPostNav\(nav\); \};\s*setOpenPost\(null\);/);
  });
  it('🔴 내 정보 → 게시글도 닫으면 내 정보로(대회에는 있던 returnToMe 가 게시글에 빠져 있었다)', () => {
    expect(APP).toMatch(/const handleMeOpenPost = useCallback\(\(pp: CommunityPost\) => \{\s*postMeReturnRef\.current = true;/);
    expect(APP).toMatch(/if \(backToMe\) setVoucherWalletOpen\(true\);/);
    expect(APP).toMatch(/useEffect\(\(\) => \{ if \(openPost === null\) postMeReturnRef\.current = false; \}, \[openPost\]\);/);
  });
});

describe('D · 알림의 쿼리·해시 링크는 앱 안에서 연다(전체 리로드는 최후)', () => {
  it('🔴 NotificationPanel 은 onInternalLink 가 true 면 location.assign 으로 가지 않는다', () => {
    expect(NOTIF).toMatch(/if \(u && onInternalLink\?\.\(u\)\) \{ handleClose\(\); return; \}\s*openBootDeepLink\(n, link\);/);
    expect(APP).toMatch(/onInternalLink=\{openInternalLink\}/);   // App → AppHeader
    expect(APP).toMatch(/onInternalLink=\{onInternalLink\}/);     // AppHeader → NotificationPanel
  });
  it('🔴 openInternalLink 가 ?s= ?v= #tool= #gto= 를 부팅 딥링크와 같은 함수로 맡는다', () => {
    expect(APP).toMatch(/if \(sid\) \{ openScheduleByIdRef\.current\(sid\); return true; \}/);
    expect(APP).toMatch(/const target = resolveVenueLink\(venuesRef\.current, vFull, vShort\);/);
    // 안정 참조 — venues·openScheduleById 를 deps 에 넣으면 AppHeader·HomeTab memo 가 매 갱신마다 깨진다
    expect(APP).toMatch(/\}, \[openEvent, changeTab, handleVenueClick\]\);/);
    expect(APP).toMatch(/new CustomEvent\('nuri:open-tool', \{ detail: u\.hash\.slice\('#tool='\.length\) \}\)/);
    expect(APP).toMatch(/window\.dispatchEvent\(new HashChangeEvent\('hashchange'\)\);[^\n]*\s*return true;/);
    // 부팅 딥링크도 같은 헬퍼 — 규칙이 둘로 갈리지 않는다
    expect(APP).toMatch(/const target = resolveVenueLink\(venues, full, short\);/);
  });
});

describe('E · 상태가 따라온다', () => {
  it('🔴 팔로우 하트는 탭이 보일 때마다 다시 읽는다(keep-alive 1회 조회 금지)', () => {
    // 🔴 2026-09-20 — 이 조리법이 `LiveGamesTab` 안에 있다가 `src/lib/useFavoriteVenues.ts` 로 **옮겨졌다.**
    //   같은 날 오너 지시로 일정 카드의 ♥ 를 살리면서 홈·일정탐색도 같은 집합이 필요해졌는데,
    //   세 탭이 각자 구현하면 그중 하나는 반드시 이 '1회 조회' 함정을 다시 밟기 때문이다
    //   (2026-09-17 에 라이브 탭에서 실제로 밟았다 — 매장 페이지에서 팔로우하고 돌아와도 하트가 영원히 안 붙었다).
    // ⚠ 계약을 **없앤 것이 아니라 옮긴 것**이다. 조리법이 사는 곳에 그대로 건다.
    const HOOK = readFileSync(join(__dirname, '../../lib/useFavoriteVenues.ts'), 'utf8');
    expect(HOOK, '훅이 active 를 의존성으로 다시 읽지 않는다 — keep-alive 탭에서 하트가 영원히 안 갱신된다')
      .toMatch(/useEffect\(\(\) => \{\s*if \(!active\) return;[\s\S]{0,400}?getMyFollowedVenueIds\(\)[\s\S]{0,400}?\}, \[active\]\);/);
    // 소비처 셋이 **그 훅을 실제로 쓰는지**까지 본다 — 훅만 있고 아무도 안 쓰면 빈 계약이다.
    expect(LIVE, '라이브 탭이 공유 훅을 안 쓴다').toMatch(/useFavoriteVenues\(active/);
    expect(APP, 'App(홈·일정탐색)이 공유 훅을 안 쓴다').toMatch(/useFavoriteVenues\(/);
  });
  it('🔴 체크인 성공 3경로가 nuri:checkin-done 을 쏘고 App 이 visitedVenues 를 다시 읽는다', () => {
    // ⚠[갱신 2026-09-21, Q6] 예전 단언: `App.tsx` 안에 이 dispatch 가 **정확히 2번**.
    //   그 2번은 `?checkin=` 딥링크 effect 와 '보류된 QR' effect 에 본문이 **복사돼 있었기** 때문이다.
    //   Q6 에서 두 경로를 `runCheckin` **한 벌**로 합치면서 dispatch 도 1곳이 됐다 —
    //   경로가 줄어든 게 아니라 **같은 코드를 공유**하게 된 것이다(오히려 한 곳만 고치면 둘 다 반영된다).
    //   그래서 '개수' 가 아니라 **"두 경로가 그 한 벌을 실제로 부르는가"** 를 단언한다. 약화가 아니라 정확화다.
    const helper = /const runCheckin = useCallback\(\(venueId: string\) => \{[\s\S]*?new Event\('nuri:checkin-done'\)/;
    expect(APP, 'App 의 출석 성공 처리(runCheckin)가 nuri:checkin-done 을 쏘지 않는다').toMatch(helper);
    // 두 경로 = ① QR 딥링크 단일 분기 ② 로그인 왕복 뒤의 '보류된 QR'. 둘 다 같은 함수를 부른다.
    expect((APP.match(/runCheckin\((?!venueId: string)/g) ?? []).length,
      'App 의 두 출석 경로(딥링크·보류 의도)가 runCheckin 을 각각 부르지 않는다').toBe(2);
    expect(VENUE).toMatch(/window\.dispatchEvent\(new Event\('nuri:checkin-done'\)\);/);
    expect(APP).toMatch(/window\.addEventListener\('nuri:checkin-done', load\);\s*return \(\) => window\.removeEventListener\('nuri:checkin-done', load\);/);
  });
});

describe('F · 예약 완료 → 매장 보기', () => {
  it('🔴 ReserveBox 가 상세와 같은 onVenueClick 을 받아 성공 패널에서 매장으로 잇는다', () => {
    expect(SDM).toMatch(/onReservationChange=\{onReservationChange\} onVenueClick=\{onVenueClick\} \/>/);
    expect(SDM).toMatch(/data-testid="reserve-done-venue" onClick=\{\(\) => onVenueClick\(venueId\)\}/);
  });
});

describe('G · 라이브 내 토너 카드에 포스터·매장 길', () => {
  it('🔴 일반 카드와 같은 세 길(onPoster/onVenue/onDisplay)을 받는다', () => {
    expect(LIVE).toMatch(/<MyTournamentCard[\s\S]{0,400}?onPoster=\{\(\(\) => \{ const sched = matchSchedule\(g, schedules\); return sched \? \(\) => onSchedule\(sched\) : undefined; \}\)\(\)\}\s*onVenue=\{\(\) => onVenue\(g\.venueId\)\} \/>/);
    expect(LIVE).toMatch(/data-testid="my-tour-poster"/);
    expect(LIVE).toMatch(/data-testid="my-tour-venue"/);
  });
});
