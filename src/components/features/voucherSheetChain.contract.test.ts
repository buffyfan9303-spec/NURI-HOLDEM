// FINAL-UX#SHEET · FINAL-QR#CHECKIN-REFRESH (2026-09-21)
//
// 왜 소스 계약인가 — 정직하게 적는다.
//   이 저장소에는 **컴포넌트 렌더 테스트 인프라가 없다**(jsdom·happy-dom·@testing-library 전부 미설치,
//   vitest `environment: 'node'`). 그래서 "손가락으로 끌면 닫힌다"·"이벤트를 쏘면 홈이 다시 읽는다"는
//   여기서 재현할 수 없다. 실제 제스처는 CDP `Input.dispatchTouchEvent` 로만 재현되고(Playwright
//   click/tap 은 누름 0ms 라 못 잡는다), 이용권 사용 뒤 서버 자동 출석은 실업주·실회원 계정이 필요하다.
//   그 축들은 보고서에 NOT_RUN 으로 남긴다.
//   이 파일이 하는 일은 하나다: **배선이 옛 모양으로 되돌아가면 빨개지는 것.**
//   경합의 행동 검증은 형제 파일 venueQrPrint.test.ts 가 실제 deferred Promise 로 한다.
//
// 음성 대조(실행함):
//   · MyVoucherSheet 의 `dragToClose={!scanOpen && !plan}` 를 지우면 ①이,
//   · `dragToClose` 를 무조건 `true` 로 바꾸면 ②가,
//   · VoucherWallet 의 `data-no-drag-close` 를 지우면 ③이,
//   · 출석 성공의 `nuri:checkin-done` 을 지우면 ④가,
//   · 이용권 사용 두 경로의 dispatch 를 지우면 ⑤⑥이 각각 빨개진다.
// 실행: npx vitest run src/components/features/voucherSheetChain.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), 'utf-8'));

const SHEET = read('./MyVoucherSheet.tsx');
const WALLET = read('./VoucherWallet.tsx');
const MODAL = read('../atoms/Modal.tsx');

describe('FINAL-UX#SHEET — 손님 이용권 시트를 끌어 닫는다', () => {
  it('🔴 ① 조회 상태에서는 본문 끌어닫기가 켜져 있다', () => {
    // sheet 변형은 **명시 true** 일 때만 켜진다(Modal.resolveBodyDrag). 안 넘기면 좁은 그립만 잡힌다.
    expect(SHEET, '손님 시트가 dragToClose 를 안 넘긴다 — 본문을 끌어도 안 닫힌다')
      .toMatch(/<Modal[^>]*title="이용권 · 출석"[^>]*dragToClose=\{[^}]+\}/);
  });

  it('🔴 ② 입력·확인 중에는 명시적으로 꺼진다(값 손실 방지)', () => {
    // `plan` = 보내기(장수/업주번호/최종확인) — 이 Modal 의 **자식**이라 터치가 본문 핸들러까지 올라온다.
    // `scanOpen` = QR 스캔 중.  무조건 true 로 바꾸면 이 단언이 빨개진다.
    expect(SHEET, '보내기/스캔 중에도 부모 시트가 끌려 내려간다 — 입력값이 날아간다')
      .toMatch(/dragToClose=\{!scanOpen\s*&&\s*!plan\}/);
  });

  it('🔴 ③ 지갑의 사용 시트·완료 오버레이는 Modal 의 옵트아웃 속성으로 막는다', () => {
    // 부모는 VoucherWallet 의 내부 상태(redeem)를 모르므로 prop 으로 끌 수 없다.
    // Modal 이 이미 가진 `[data-no-drag-close]`(EDITABLE_SEL)를 쓴다 — closest() 판정이라 자손 전부 덮는다.
    expect(MODAL, 'Modal 의 옵트아웃 훅이 사라졌다 — 지갑 시트 보호 수단이 통째로 무효다')
      .toMatch(/EDITABLE_SEL\s*=\s*'[^']*\[data-no-drag-close\]/);
    expect(MODAL, 'onSheetStart 가 EDITABLE_SEL 로 시작 지점을 거르지 않는다')
      .toMatch(/closest\?\.\(EDITABLE_SEL\)/);
    const marked = WALLET.match(/data-no-drag-close/g) ?? [];
    expect(marked.length, '지갑의 풀스크린 오버레이 2곳(사용 시트·완료 화면)에 옵트아웃이 붙어야 한다')
      .toBe(2);
    // 붙은 자리가 실제로 그 두 오버레이인지 — 아무 div 에나 붙여서 개수만 맞추지 못하게.
    expect(WALLET, '사용 시트(z-[70]) 루트에 안 붙었다').toMatch(/data-no-drag-close className=\{\['fixed inset-0 z-\[70\]/);
    expect(WALLET, '완료 오버레이(z-[80]) 에 안 붙었다').toMatch(/role="status" data-no-drag-close className="fixed inset-0 z-\[80\]/);
  });
});

describe('FINAL-QR#CHECKIN-REFRESH — 출석/이용권 사용 뒤 정본 재조회', () => {
  /** 출석 성공 처리(onScanned)의 try 블록만 잘라 본다 — 실패·취소·바인 분기를 같이 세지 않으려고. */
  const checkinTry = SHEET.slice(SHEET.indexOf('const { name, streak: served } = await checkIn(venueId);'),
    SHEET.indexOf('} catch (e) {'));

  it('🔴 ④ 인앱 카메라 직접 출석 성공이 checkin-done 을 **한 번** 쏜다', () => {
    expect(checkinTry.length, '출석 성공 블록을 못 찾았다 — 아래 개수 단언이 빈 문자열을 센다').toBeGreaterThan(100);
    expect(checkinTry, '딥링크(App runCheckin)·매장페이지와 달리 인앱 출석만 홈 방문 목록을 안 갱신한다')
      .toMatch(/window\.dispatchEvent\(new Event\('nuri:checkin-done'\)\);/);
    expect((checkinTry.match(/new Event\('nuri:checkin-done'\)/g) ?? []).length,
      '출석 1회에 checkin-done 이 두 번 이상 나간다 — 중복 재조회').toBe(1);
    expect((checkinTry.match(/new Event\('nuri:event-board-refresh'\)/g) ?? []).length,
      '이벤트 참여권 갱신 신호가 1회가 아니다').toBe(1);
  });

  it('🔴 ④-b 실패·취소·바인 경로에서는 안 쏜다', () => {
    // 바인 분기는 checkIn 앞에서 return 한다. catch 블록에는 dispatch 가 없어야 한다.
    const buyinBranch = SHEET.slice(SHEET.indexOf("if (hit?.kind === 'buyin')"),
      SHEET.indexOf('if (busy) return;'));
    expect(buyinBranch.length, '바인 분기를 못 찾았다').toBeGreaterThan(50);
    expect(buyinBranch, '바인 요청이 출석 신호를 쏜다 — 찍지도 않은 출석으로 홈이 갱신된다')
      .not.toMatch(/nuri:checkin-done/);
    const catchBlock = SHEET.slice(SHEET.indexOf('} catch (e) {'), SHEET.indexOf('} finally { setBusy(false); }'));
    expect(catchBlock.length, 'catch 블록을 못 찾았다').toBeGreaterThan(20);
    expect(catchBlock, '출석 실패에도 갱신 신호를 쏜다 — 거짓 갱신')
      .not.toMatch(/nuri:checkin-done|nuri:event-board-refresh/);
  });

  // 🔴 서버 사실(critical-reviewer, 라이브 정의 실측 2026-09-21) — 이용권 사용의 자동 출석은 **조건부**다.
  //   `trg_voucher_used_checkin`(md5 6c2c4081…) 은 status→'used' 전이 · 직전이 'used' 아님 ·
  //   holder_user_id NOT NULL · **같은 매장 최근 4시간 출석 없음** 이 전부 참일 때만 checkins 행을 만든다.
  //   점수도 `_apply_checkin` 이 그 매장 KST 오늘 출석 0일 때만 +3이다.
  //   그리고 `redeem_my_voucher_by_qr`/`_by_phone` 의 반환은 `text`(매장 이름)뿐 —
  //   **클라이언트는 출석이 생겼는지 알 수 없다.**
  //   → 그래서 이용권 사용 경로는 `nuri:checkin-done`('출석이 생겼다')을 **쏘지 않는다.**
  //     쏘면 4시간 창에 걸린 경우 거짓이 된다. 순수 재조회 하나만 남긴다.
  it('🔴 ⑤ 이용권 1장 사용 성공은 순수 재조회만 걸고, 출석 신호는 쏘지 않는다', () => {
    const onDone = WALLET.slice(WALLET.indexOf('onDone={(used) => {'), WALLET.indexOf('load().then((fresh)'));
    expect(onDone.length, 'RedeemSheet onDone 을 못 찾았다').toBeGreaterThan(50);
    expect(onDone, '1장 사용 뒤 이벤트 보드가 안 따라온다').toMatch(/new Event\('nuri:event-board-refresh'\)/);
    expect(onDone, "이용권 사용이 '출석이 생겼다' 신호를 쏜다 — 4시간 창에 걸리면 거짓 출석 표시가 된다")
      .not.toMatch(/nuri:checkin-done/);
  });

  it('🔴 ⑥ 다장 보내기도 같다', () => {
    const onDone = SHEET.slice(SHEET.indexOf('onDone={(msg, ok) => {'), SHEET.indexOf('/>\n            )}'));
    expect(onDone.length, 'SendVouchersSheet onDone 을 못 찾았다').toBeGreaterThan(50);
    expect(onDone, '다장 보내기 뒤 이벤트 보드가 안 따라온다').toMatch(/new Event\('nuri:event-board-refresh'\)/);
    expect(onDone, "다장 보내기가 '출석이 생겼다' 신호를 쏜다 — 거짓 출석 표시")
      .not.toMatch(/nuri:checkin-done/);
  });

  it('🔴 ⑥-b 이용권 사용 화면이 출석·점수를 단정하지 않는다', () => {
    // 서버가 출석을 만들었는지 클라가 모른다(반환 text). 단정하면 그 자리에서 거짓이 될 수 있다.
    // 오버레이 **블록만** 자른다. 파일 끝까지 자르면 RedeemSheet 의 '출석 QR입니다…' 안내까지 섞여
    // 엉뚱한 곳에서 빨개진다(그 문구는 오히려 출석 QR 로 이용권을 쓰지 않는다는 올바른 안내다).
    const from = WALLET.indexOf('redeemDone && (');
    const to = WALLET.indexOf('화면을 탭하면 닫힙니다');
    expect(from, 'redeemDone 오버레이 시작을 못 찾았다').toBeGreaterThan(-1);
    expect(to, 'redeemDone 오버레이 끝(안내 문구)을 못 찾았다').toBeGreaterThan(from);
    const wallet = WALLET.slice(from, to);
    expect(wallet.length, 'redeemDone 오버레이를 못 찾았다').toBeGreaterThan(100);
    expect(wallet, "이용권 사용 완료 화면이 '출석' 을 말한다 — 4시간 창에서 거짓이 된다").not.toMatch(/출석/);
    expect(wallet, "점수 증가(+3 등)를 단정한다 — KST 오늘 첫 출석이 아니면 0점이다").not.toMatch(/\+\s*3\s*점|점 획득|점수 \+/);
  });

  it('🔴 ⑦ 두 신호의 수신자는 **순수 재조회**다 — 변이 RPC 0회', () => {
    // 이 전제가 깨지면(리스너가 check_in 을 부르면) 재조회가 조용히 출석을 만들어 버린다.
    const APP = read('../../App.tsx');
    const HOME = read('./HomeTab.tsx');
    // 무해한 invalidation 이라는 전제가 깨지면(예: 리스너가 check_in 을 부르면) 이용권 사용이
    // 출석을 **만들어 버린다**. 그 전제를 여기서 잠근다.
    expect(APP, 'checkin-done 수신자가 myVisitedVenues 재조회가 아니다')
      .toMatch(/const load = \(\) => \{ myVisitedVenues\(\)\.then\(setVisitedVenues\)[\s\S]{0,40}?\};[\s\S]{0,400}?addEventListener\('nuri:checkin-done', load\)/);
    expect(HOME, 'event-board-refresh 수신자가 getEventBoard 재조회가 아니다')
      .toMatch(/const loadEventBoard = useCallback\(\(\) => \{\s*import\('\.\.\/\.\.\/api\/events'\)\.then\(\(m\) => m\.getEventBoard\(\)\)/);
  });
});
