// 일정 카드 3열이 360~639px 에서 **한 줄에 들어간다** 재발 방지 계약 (2026-09-17)
//
// 무엇을 막는가
//   카드는 `flex flex-wrap` 위에 세 블록(시각 w-20 · 내용 flex · 참가비 shrink-0)을 올린다.
//   내용 블록의 `flex-basis` 가 조금만 크면 세 블록이 한 줄에 못 들어가고, **참가비 블록이 wrap 으로
//   내려가 시각 열(85px) 아래에 쌓인다.** 그러면 좁은 열에 정보가 몰리고 넓은 열은 아래가 통째로 빈다.
//   오너 리포트(2026-09-17): "공백이 너무 많고 좌측에는 정보가 너무 많아 일부러 이렇게 해놓은거야?"
//
// 실측 근거 (라이브 프로덕션 · 루트 폰트 17px · Playwright 로 basis 만 바꿔 가며 잼)
//   390px: 9rem → 참가비 x=13(좌측), 카드 181px, 우측 빈 공간 **95px**
//          낮추면 → 참가비 x=262(우측), 카드 **116px**(−36%)
//   360px: 9rem·8rem 접힘 / **7rem 부터 3열 유지**, 카드 181 → 141px
//   긴 제목(31자)에서도 카드가 안 늘어난다(2줄 클램프) · 가로 넘침 0
//
// 왜 7rem 이 아니라 6rem 인가
//   7rem(119px)은 가용폭(≈122px)에 **3px 차이로 붙는다** — 폰트가 조금만 달라지면 도로 접힌다(§7-⑯ 경계값).
//   basis 는 **접히는 시점만** 정하고 실제 제목 폭은 `flex-grow` 가 정하므로, 6rem 이든 7rem 이든
//   렌더 폭은 같다(실측 둘 다 122px). 낮출수록 안전하고 잃는 것이 없다.
//
// ⚠ rem 을 px 로 바꾸지 마라 — 루트 글자 200% 확대(17→34px)에서 이 블록이 **스스로 줄을 내리는**
//   접근성 축이 basis 의 rem 단위에 달려 있다(실측: 34px 에서 제목 블록 y=220, 가로 넘침 0).
//   px 미디어쿼리는 글자 확대를 감지하지 못한다.
//
// 이 검사가 못 보는 것: 실제 렌더 폭·접힘 여부(브라우저 실측 몫). 여기서는 **값의 상한만** 잠근다.
// 실행: npx vitest run src/components/features/scheduleCardColumns.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ScheduleCard.tsx'), 'utf8');

describe('일정 카드 — 360px 에서도 3열이 한 줄', () => {
  it('내용 블록의 flex-basis 가 7rem 을 넘지 않는다', () => {
    const m = SRC.match(/min-\[360px\]:flex-\[1_1_([0-9.]+)rem\]/);
    expect(m, '내용 블록의 flex 유틸 형태가 바뀌었다 — 계약을 같이 고쳐라(그리고 360px 에서 다시 재라)').not.toBeNull();
    const rem = Number(m![1]);
    expect(
      rem,
      `basis ${rem}rem 은 360px 에서 3열이 접힌다(실측: 8rem·9rem 접힘 / 7rem 부터 유지). ` +
      '참가비가 시각 열 아래로 내려가 좌측에 정보가 몰리고 우측이 빈다.',
    ).toBeLessThanOrEqual(7);
  });

  it('basis 단위가 rem 이다 — 글자 200% 확대에서 줄을 내리는 접근성 축', () => {
    expect(SRC, 'px basis 는 루트 글자 확대를 못 탄다').not.toMatch(/min-\[360px\]:flex-\[1_1_\d+px\]/);
    expect(SRC).toMatch(/min-\[360px\]:flex-\[1_1_[0-9.]+rem\]/);
  });

  it('세 블록의 역할이 유지된다 — 시각 고정폭 · 참가비 안 줄어듦', () => {
    // 이 둘이 무너지면 basis 를 아무리 낮춰도 3열이 성립하지 않는다.
    expect(SRC, '시각 열이 고정폭(w-20)·shrink-0 이 아니다').toMatch(/min-\[360px\]:w-20[\s\S]{0,80}min-\[360px\]:shrink-0/);
    expect(SRC, '참가비 열이 shrink-0 이 아니다').toMatch(/min-\[360px\]:order-3[\s\S]{0,120}min-\[360px\]:shrink-0/);
  });
});
