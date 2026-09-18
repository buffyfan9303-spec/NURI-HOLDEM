// 일정 목록 줄의 3열 골격 재발 방지 계약 (2026-09-17 신설 · 2026-09-18 두 번째 개정)
//
// 무엇을 막는가
//   줄은 `flex flex-wrap` 위에 세 블록을 올린다. 어느 한 블록이 조금만 커지면 세 블록이 한 줄에
//   못 들어가고 **한 블록이 wrap 으로 내려가** 좁은 열에 정보가 몰리고 넓은 열 아래가 통째로 빈다.
//   오너 리포트(2026-09-17): "공백이 너무 많고 좌측에는 정보가 너무 많아 일부러 이렇게 해놓은거야?"
//
// 🔴 2026-09-18(2차) — 오너가 **레퍼런스 스크린샷 2장**을 주며 구조를 다시 정했다.
//   두 이미지가 같은 골격이다: [상태·시각 고정] [매장/대회명/등록정보] [참가비 라벨/금액/GTD]
//     1차(오전): [매장 로고 w-12/14] [내용 flex] [참가비 shrink-0]
//     2차(지금): [상태·시각 w-46/52] [내용 flex-[1_1_7rem]] [참가비·GTD w-74/80]
//   왜 바꿨나 — 오너가 지적한 네 가지 중 ①②가 1차 구조로는 안 풀렸다:
//     ① 대회명이 로고와 금액 **사이에 끼어** 실제 가용 폭이 없어 말줄임이 났다.
//     ② 시각(가운데 중단)과 금액(우측 상단)이 갈라져 시선이 지그재그로 움직였다.
//   지금은 시각이 **왼쪽 고정 열**, 금액이 **오른쪽 고정 열**이라 시선이 위아래로만 움직이고,
//   대회명은 가운데 열을 온전히 쓴다.
//   매장 로고는 48px 타일 → **18px 인라인 아이콘**(매장명 앞)으로 줄었다 — 레퍼런스가 그렇고,
//   그래야 가운데 폭이 대회명에게 돌아간다.
//
// 실측 근거 (2026-09-18 2차 · 로컬 프로덕션 빌드 · 루트 폰트 17px · 라이브 데이터)
//   320px: 열 46 / 121.5 / 74 · 제목 폭 121.5(1차 약 100) · 2줄 · 가로 넘침 0 · 행 높이 121.4
//   360px: 열 52 / 153.8 / 80 · 잘린 요소 0 · 가로 넘침 0 · 행 높이 123.0
//   640·768px: 행 높이 123.0 (열이 넓어져도 줄 수가 같다)
//
// ⚠ rem 을 px 로 바꾸지 마라 — 루트 글자 200% 확대(17→34px)에서 내용 블록이 **스스로 줄을 내리는**
//   접근성 축이 basis 의 rem 단위에 달려 있다. px 미디어쿼리는 글자 확대를 감지하지 못한다.
// ⚠ 양옆 열의 폭은 **px** 다(rem 아님). 확대 때 좌우 크롬까지 같이 불면 가운데가 먼저 죽는다 —
//   확대되어야 하는 것은 글자이고, 그때는 basis(rem) 가 줄을 내려 해결한다.
//
// 이 검사가 못 보는 것: 실제 렌더 폭·접힘 여부(브라우저 실측 몫). 여기서는 **구조와 상한만** 잠근다.
// 실행: npx vitest run src/components/features/scheduleCardColumns.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ScheduleCard.tsx'), 'utf8');

describe('일정 목록 줄 — 3열 골격', () => {
  it('가운데(내용) 블록의 flex-basis 가 7rem 을 넘지 않는다', () => {
    const m = SRC.match(/flex-\[1_1_([0-9.]+)rem\]/);
    expect(m, '내용 블록의 flex 유틸 형태가 바뀌었다 — 계약을 같이 고쳐라(그리고 320·360 에서 다시 재라)').not.toBeNull();
    const rem = Number(m![1]);
    expect(
      rem,
      `basis ${rem}rem 은 좁은 폭에서 3열이 접힌다(실측: 8rem·9rem 접힘 / 7rem 부터 유지). ` +
      '금액이 아래로 내려가면 좌측에 정보가 몰리고 우측이 빈다.',
    ).toBeLessThanOrEqual(7);
  });

  it('basis 단위가 rem 이다 — 글자 200% 확대에서 줄을 내리는 접근성 축', () => {
    expect(SRC, 'px basis 는 루트 글자 확대를 못 탄다').not.toMatch(/flex-\[1_1_\d+px\]/);
    expect(SRC).toMatch(/flex-\[1_1_[0-9.]+rem\]/);
  });

  it('양옆이 고정폭이다 — 시각 열 · 참가비 열 둘 다 shrink-0', () => {
    // 이 둘이 무너지면 basis 를 아무리 낮춰도 3열이 성립하지 않는다.
    expect(SRC, '시각 열이 고정폭·shrink-0 이 아니다')
      .toMatch(/order-1 min-w-\[\d+px\] shrink-0/);
    expect(SRC, '참가비 열이 고정폭·shrink-0 이 아니다')
      .toMatch(/order-3 w-\[\d+px\] shrink-0 text-right/);
  });

  it('순서가 [시각] [내용] [참가비] 다 — 금액이 오른쪽 끝', () => {
    // 🔴 1차에서 실측으로 걸렸던 것: order 를 안 주면 DOM 순서대로 그려져 금액이 왼쪽으로 붙었다.
    //   레퍼런스는 금액이 항상 오른쪽 끝이다.
    expect(SRC, '시각 열이 order-1 이 아니다').toMatch(/order-1 min-w-\[\d+px\]/);
    expect(SRC, '내용 블록이 order-2(가운데)가 아니다').toMatch(/order-2 min-w-0 flex-\[1_1_[0-9.]+rem\]/);
    expect(SRC, '참가비 열이 order-3(오른쪽 끝)이 아니다').toMatch(/order-3 w-\[\d+px\]/);
  });

  it('🔴 대회명이 자기 줄을 온전히 쓴다 — 좌우 열 사이에 끼지 않는다', () => {
    // 오너가 지적한 ①번(타이틀 잘림)의 근본이다. 제목이 시각·금액과 **같은 flex 줄**에 있으면
    // 가용 폭이 다시 사라진다. 제목은 가운데 열 **안에서** 블록으로 서야 한다.
    const mid = SRC.match(/order-2 min-w-0 flex-\[[\s\S]{0,2600}?<h3[\s\S]{0,300}?>/);
    expect(mid, '제목(h3)이 가운데 열 안에 없다 — 좌우 열 사이에 끼면 잘림이 돌아온다').not.toBeNull();
    expect(SRC, '제목이 2줄 클램프가 아니다 — 한글 제목은 한 줄로는 자주 잘린다')
      .toMatch(/<h3[^>]*line-clamp-2/);
  });

  it('카드→상세 모핑의 출발점(vt-poster)이 매장 로고에 남아 있다', () => {
    // 로고를 48px 타일에서 18px 인라인으로 줄이면서 **이름을 흘리기 쉬운 자리**다.
    // 이름이 사라지면 모핑이 조용히 없어진다(index.css 는 그대로 초록이라 아무도 모른다).
    const logo = SRC.match(/<PosterArea[\s\S]{0,900}?\/>/);
    expect(logo, 'PosterArea(매장 로고)를 못 찾았다').not.toBeNull();
    expect(logo![0], 'vt-poster 가 매장 로고에 없다 — 카드→상세 모핑이 사라진다')
      .toMatch(/vtName=\{vtActive \? 'vt-poster' : undefined\}/);
  });
});
