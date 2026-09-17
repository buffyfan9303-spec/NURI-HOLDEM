// 일정 목록 줄의 3열이 360~639px 에서 **한 줄에 들어간다** 재발 방지 계약 (2026-09-17 신설 · 2026-09-18 개정)
//
// 무엇을 막는가
//   줄은 `flex flex-wrap` 위에 세 블록을 올린다. 어느 한 블록이 조금만 커지면 세 블록이 한 줄에
//   못 들어가고 **한 블록이 wrap 으로 내려가** 좁은 열에 정보가 몰리고 넓은 열 아래가 통째로 빈다.
//   오너 리포트(2026-09-17): "공백이 너무 많고 좌측에는 정보가 너무 많아 일부러 이렇게 해놓은거야?"
//
// 🔴 2026-09-18 — 줄 구조가 **바뀌었다**(오너 레퍼런스: "좌측에 매장 로고, 우측에 게임이름·GTD·
//   참가비·시작 시간·레지 마감·가능하면 지역"). 세 열의 역할이 이렇게 달라졌다:
//     이전: [시각 w-20] [내용 flex] [참가비 shrink-0]
//     지금: [매장 로고 w-12/14] [내용 flex] [참가비·GTD shrink-0]   ← 시각은 내용 블록의 정보 줄로 내려갔다
//   그래서 예전의 "시각 열이 고정폭(w-20)" 단언은 지웠다. 지키는 성질은 같다 — **양옆이 고정폭이고
//   가운데만 늘어난다.**
//
// 실측 근거 (2026-09-18 · 로컬 프로덕션 빌드 · 루트 폰트 17px · 라이브 데이터)
//   320px: 2줄로 접힘(참가비가 첫 줄, 내용이 둘째 줄) · 가로 넘침 0   ← 360 미만은 계약 대상이 아니다
//   360px: 1줄 · 로고 60 / 내용 147 / 참가비 79 · 카드 높이 130.7
//   390px: 1줄 · 로고 60 / 내용 177 / 참가비 79 · 카드 높이 130.7
//   768px: 1줄 · 내용 555 · 높이 109.4     1440px: 1줄 · 내용 686 · 높이 109.4
//   네 폭 전부 가로 넘침 0.
//
// ⚠ rem 을 px 로 바꾸지 마라 — 루트 글자 200% 확대(17→34px)에서 내용 블록이 **스스로 줄을 내리는**
//   접근성 축이 basis 의 rem 단위에 달려 있다. px 미디어쿼리는 글자 확대를 감지하지 못한다.
//
// 이 검사가 못 보는 것: 실제 렌더 폭·접힘 여부(브라우저 실측 몫). 여기서는 **구조와 상한만** 잠근다.
// 실행: npx vitest run src/components/features/scheduleCardColumns.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ScheduleCard.tsx'), 'utf8');

describe('일정 목록 줄 — 360px 에서도 3열이 한 줄', () => {
  it('내용 블록의 flex-basis 가 7rem 을 넘지 않는다', () => {
    const m = SRC.match(/min-\[360px\]:flex-\[1_1_([0-9.]+)rem\]/);
    expect(m, '내용 블록의 flex 유틸 형태가 바뀌었다 — 계약을 같이 고쳐라(그리고 360px 에서 다시 재라)').not.toBeNull();
    const rem = Number(m![1]);
    expect(
      rem,
      `basis ${rem}rem 은 360px 에서 3열이 접힌다(실측: 8rem·9rem 접힘 / 7rem 부터 유지). ` +
      '참가비가 로고 아래로 내려가 좌측에 정보가 몰리고 우측이 빈다.',
    ).toBeLessThanOrEqual(7);
  });

  it('basis 단위가 rem 이다 — 글자 200% 확대에서 줄을 내리는 접근성 축', () => {
    expect(SRC, 'px basis 는 루트 글자 확대를 못 탄다').not.toMatch(/min-\[360px\]:flex-\[1_1_\d+px\]/);
    expect(SRC).toMatch(/min-\[360px\]:flex-\[1_1_[0-9.]+rem\]/);
  });

  it('양옆이 고정폭이다 — 매장 로고 · 참가비 둘 다 shrink-0', () => {
    // 이 둘이 무너지면 basis 를 아무리 낮춰도 3열이 성립하지 않는다.
    expect(SRC, '매장 로고가 고정폭(h-12 w-12 / 360+ h-14 w-14)·shrink-0 이 아니다')
      .toMatch(/order-1 h-12 w-12 shrink-0[^"]*min-\[360px\]:h-14 min-\[360px\]:w-14/);
    expect(SRC, '참가비 열이 shrink-0 이 아니다').toMatch(/order-2 ml-auto shrink-0/);
  });

  it('참가비가 360px 이상에서 **오른쪽 끝**이다 — order 가 내용보다 뒤', () => {
    // 🔴 2026-09-18 실측으로 걸린 것: 참가비에 `min-[360px]:order-3` 을 안 주면 내용 블록과 order 가
    //   같아져 **DOM 순서**대로 [로고][참가비][내용] 으로 그려졌다(참가비 x=79, 내용 x=164).
    //   레퍼런스는 금액이 오른쪽 끝이다. 수치로 확인함: 고친 뒤 390px 에서 참가비 x=262.
    expect(SRC, '참가비 열에 min-[360px]:order-3 이 없다 — 로고 바로 옆으로 붙는다')
      .toMatch(/order-2 ml-auto shrink-0[^"]*min-\[360px\]:order-3/);
    expect(SRC, '내용 블록이 360px 이상에서 order-2(가운데)가 아니다')
      .toMatch(/order-3 w-full min-w-0 min-\[360px\]:order-2/);
  });

  it('카드→상세 모핑의 출발점이 매장 로고로 옮겨져 있다', () => {
    // 예전에는 매장명 옆 28px 포스터 썸네일이 vt-poster 를 들고 있었다. 그 썸네일이 이 줄에서
    // 사라졌으므로 이름을 로고로 옮기지 않으면 **모핑이 조용히 없어진다**(index.css 는 그대로 초록).
    const logo = SRC.match(/<PosterArea[\s\S]{0,700}?order-1 h-12 w-12[\s\S]{0,400}?\/>/);
    expect(logo, '목록 줄의 매장 로고 PosterArea 를 못 찾았다 — 계약을 같이 고쳐라').not.toBeNull();
    expect(logo![0], '매장 로고가 vt-poster 이름을 안 받는다 — 카드→상세 모핑이 사라진다')
      .toMatch(/vtName=\{vtActive \? 'vt-poster' : undefined\}/);
  });
});
