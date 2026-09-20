// Q5(2026-09-21) — **QR 이미지는 자기가 어느 매장 것인지 알아야 한다.**
//
// 무엇이 문제였나: `CheckinModal`·`VoucherManageModal` 은 관리자가 '관리할 매장' 을 A→B 로 바꿔도
//   리마운트되지 않는다(어디에도 `key={venueId}` 가 없다 — 각 파일의 Q3 주석 참고). 그런데 QR 생성은
//   `QRCode.toDataURL(...).then(setQr)` 뿐이라
//     ① 전환 직후 **A 의 QR 이 B 라벨 아래 그대로** 남고
//     ② 늦게 끝난 A 의 Promise 가 **B 이미지를 덮을** 수 있었다.
//   손님이 그 QR 을 찍으면 **다른 매장**에 출석하거나 바인을 요청한다. 화면 문구로는 구별되지 않는다.
//
// 🔴 왜 이 파일이 **소스 텍스트**를 보는가 — 정직하게 적는다.
//   수용 기준("A 를 지연시키고 B 를 먼저 완료한 역순 Promise 에서 B 또는 로딩만 보인다")을 제대로 재려면
//   컴포넌트를 렌더해야 하는데, 이 저장소에는 **컴포넌트 테스트 인프라가 없다**(`@testing-library` 미설치).
//   E2E 로 가려면 매장 두 개를 가진 관리자 계정이 필요해 현재 하네스로는 닿지 않는다.
//   그래서 이 검사는 **실제 동작을 증명하지 않는다.** 하는 일은 하나다: 누군가 이 가드를 지우고
//   예전 형태로 되돌리면 **빨개지는 것**. 실동작 검증은 `docs/HANDOFF.md` 에 NOT_RUN 으로 남겼다.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf-8');

describe('Q5 — 매장에 매인 QR 이미지의 경합 가드', () => {
  const files = [
    { name: 'CheckinModal.tsx', src: read('./CheckinModal.tsx') },
    { name: 'VoucherManageModal.tsx', src: read('./VoucherManageModal.tsx') },
  ];

  for (const { name, src } of files) {
    it(`${name} — QR 상태가 venueId 와 함께 묶여 있다`, () => {
      // `{ venueId: string; src: string }` 형태로 들고 다녀야 렌더 단계에서 대조할 수 있다.
      expect(src, `${name}: QR 상태에 venueId 가 안 묶여 있다 — 늦은 응답을 구별할 방법이 없다`)
        .toMatch(/venueId:\s*string;\s*src:\s*string/);
    });

    it(`${name} — 생성 effect 가 늦은 응답을 버리는 cleanup 가드를 가진다`, () => {
      // `let alive = true` … `return () => { alive = false; }` — 앞 매장의 resolve 를 무시하는 표준 형태.
      expect(src, `${name}: QR 생성 effect 에 alive 가드가 없다`).toMatch(/let\s+alive\s*=\s*true/);
      expect(src, `${name}: cleanup 에서 alive 를 내리지 않는다 — 늦은 A 응답이 B 를 덮는다`)
        .toMatch(/alive\s*=\s*false/);
      expect(src, `${name}: resolve 를 alive 로 거르지 않는다`).toMatch(/if\s*\(\s*alive\s*\)/);
    });

    it(`${name} — 매장이 바뀌면 이전 이미지를 즉시 감춘다`, () => {
      // 새 이미지를 기다리는 동안 앞 매장 QR 이 화면에 남아 있으면 안 된다.
      expect(src, `${name}: 매장 전환 시 QR 상태를 비우지 않는다 — 앞 매장 QR 이 새 라벨 아래 남는다`)
        .toMatch(/setQr\(null\)/);
    });

    it(`${name} — 렌더가 '지금 매장의 것' 인지 한 번 더 확인한다`, () => {
      // cleanup 가드만으로는 부족하다: 렌더 단계 2차 방어가 있어야 상태가 어긋난 한 프레임도 막는다.
      expect(src, `${name}: 렌더에서 venueId 대조를 하지 않는다`)
        .toMatch(/\.venueId\s*===\s*venueId/);
    });
  }

  it('VoucherManageModal — 인쇄도 누른 순간의 매장으로 끝난다', () => {
    const src = files[1].src;
    // 비치용 인쇄는 한 번 잘못 나가면 그 매장에 계속 붙어 있는다 — 화면보다 되돌리기 어렵다.
    expect(src, '인쇄 준비 중 매장 전환을 검사하지 않는다 — 라벨과 다른 매장 QR 이 종이에 찍힌다')
      .toMatch(/forVenue\s*!==\s*venueId/);
  });

  it('회원가입 QR 은 매장에 매이지 않으므로 이 가드에서 제외된다', () => {
    const src = files[1].src;
    // 고정 주소라 venueId 가 없다. 이 줄이 매장 의존으로 바뀌면 위 가드 대상이 되어야 한다.
    expect(src, '회원가입 QR 이 더 이상 고정 주소가 아니다 — 매장 가드 대상인지 재검토하라')
      .toMatch(/signup=1/);
  });
});
