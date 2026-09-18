// 일정 목록 줄의 **격자 골격** 재발 방지 계약
// (2026-09-17 신설 · 09-18 2차 개정 · 09-18 3차 개정에서 flex 3열 → grid 로 갈아탐)
//
// 무엇을 막는가
//   ① 정보가 한쪽에 몰리고 반대쪽이 비는 것 — 오너 리포트(2026-09-17):
//      "공백이 너무 많고 좌측에는 정보가 너무 많아 일부러 이렇게 해놓은거야?"
//   ② 좌우 값이 **서로 다른 줄에 떠 있는 것** — 오너 리포트(2026-09-18 12차):
//      "참가비 10T 와 오른쪽 1,000만 하고 아래줄 날짜·시간쪽 줄 맞춰줘".
//
// 🔴 왜 flex 를 버렸나 (2026-09-18 3차 개정)
//   flex 3열은 **열마다 따로 쌓인다** — 행이라는 개념이 없어서 좌우 값이 같은 줄에 설 보장이 없다.
//   실측(390): 제목 top 328 / GTD top 308.4 · 참가비 345 / 날짜·시각 340.3 로 어긋나 있었다.
//   고정 오프셋으로 맞추는 것도 불가능했다 — 매장 줄이 320px 에서 3줄로 접혀 17.5 → **59.5px** 가 된다.
//   grid 는 행을 격자가 정하므로 [제목|GTD]·[참가비·메타|날짜·시각]이 **항상** 같은 줄에 선다.
//
//   덤으로 '3열 접힘'이라는 사고 부류가 통째로 사라졌다. flex-wrap 은 1.9px 만 모자라도 마지막 열을
//   통째로 다음 줄로 내렸고(2026-09-18 실측: 행 113.8 → 176.8px), 그걸 피하려고 320px 폭 예산 여유
//   3.5px 를 손으로 관리하고 있었다. **grid 열은 wrap 하지 않는다.**
//
// 지금 골격
//   행1  [로고]  매장명 · 지역 · TOP        (2·3열을 가로지름)
//   행2  [로고]  대회명            |  GTD 1,000만
//   행3  [로고]  참가비 · 등록마감 … |  9/18(금) 18:00
//   로고는 1열에서 3행을 세로로 관통한다(row-span-3).
//
// 이 검사가 못 보는 것: 실제 렌더 폭·줄 맞음 여부(브라우저 실측 몫).
//   **줄이 실제로 맞는지는 `e2e/schedule-card-fit.spec.ts` 가 밑선으로 잰다.** 여기서는 구조만 잠근다.
// 실행: npx vitest run src/components/features/scheduleCardColumns.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ScheduleCard.tsx'), 'utf8');

describe('일정 목록 줄 — 격자 골격', () => {
  it('카드가 3열 격자다 — 가운데만 늘어나고 좌우는 내용 크기', () => {
    expect(SRC, '격자 선언이 없다 — flex 로 되돌아갔다면 좌우 값이 다시 어긋난다')
      .toMatch(/grid grid-cols-\[auto_minmax\(0,1fr\)\]/);
    // minmax(0,1fr): 가운데가 **0까지 줄 수 있어야** 긴 제목이 격자를 밀어내지 않는다.
    //   1fr 만 쓰면 최소 크기가 auto 라 긴 한글 제목이 열을 부풀려 오른쪽 값을 밀어낸다.
    expect(SRC, '가운데 열이 0까지 줄지 못한다 — 긴 제목이 오른쪽 값을 밀어낸다')
      .toContain('minmax(0,1fr)');
  });

  it('🔴 밑선 정렬이다 — 행마다 글자 크기가 달라 위쪽 정렬로는 눈에 안 맞는다', () => {
    // 제목 15.9px vs GTD 19.1px. 사람은 글자 **밑선**으로 줄을 읽는다.
    expect(SRC, '격자가 items-baseline 이 아니다 — 줄이 맞아 보이지 않는다')
      .toMatch(/grid grid-cols-\[[^\]]+\] items-baseline/);
  });

  it('🔴 좌우가 **같은 flex 컨테이너의 형제**다 — 제목↔GTD · 메타↔날짜시각', () => {
    // 🔴 여기가 이 계약의 핵심이다. 3열 격자로 나란히 두는 방법도 써 봤는데, 그건 글자 200% 확대에서
    //   **탈출구가 없었다** — grid 열은 wrap 하지 않아 오른쪽 값이 가운데를 24~57px 까지 쥐어짜
    //   값이 잘렸다(실측). 행을 각자 flex 컨테이너로 만들면 폭이 모자랄 때 값이 아랫줄로 내려간다.
    // 두 행 모두 `justify-between` 이라야 값이 오른쪽 끝에 붙어 줄끼리 세로로도 맞는다.
    const rows = [...SRC.matchAll(/col-start-2 row-start-([23]) ([^"]*)/g)];
    expect(rows.length, '2·3행 컨테이너를 못 찾았다 — 격자 배치가 바뀌었으면 계약도 같이 고쳐라').toBe(2);
    for (const m of rows) {
      expect(m[2], `${m[1]}행이 flex 가 아니다 — 좌우가 같은 줄에 설 수 없다`).toContain('flex');
      expect(m[2], `${m[1]}행에 justify-between 이 없다 — 값이 오른쪽 끝에 안 붙는다`).toContain('justify-between');
      expect(m[2], `${m[1]}행이 items-baseline 이 아니다 — 크기가 다른 글자가 눈에 안 맞는다`).toContain('items-baseline');
      expect(m[2], `${m[1]}행에 flex-wrap 이 없다 — 200% 확대에서 값이 잘린다(탈출구 상실)`).toContain('flex-wrap');
    }
  });

  it('매장 줄이 내용 열 전체를 쓴다 — 좁은 폭에서 매장명이 세 줄로 접히던 자리다', () => {
    // 320px 실측: 좁은 가운데 열에 갇혔을 때 59.5px(3줄) → 열 전체를 쓰면 19.1px(1줄).
    expect(SRC, '매장 줄이 1행 2열이 아니다').toMatch(/col-start-2 row-start-1/);
  });

  it('로고가 1열에서 3행을 관통한다 — 줄마다 같은 자리·같은 크기', () => {
    expect(SRC, '로고 칸이 row-span-3 이 아니다').toMatch(/col-start-1 row-start-1 row-span-3/);
  });

  it('🔴 대회명이 자기 줄을 온전히 쓴다 — 좌우 값 사이에 끼지 않는다', () => {
    // 오너가 지적한 ①번(타이틀 잘림)의 근본이다. 제목이 값들과 **같은 칸**에 있으면 폭이 사라진다.
    expect(SRC, '제목이 2줄 클램프가 아니다 — 한글 제목은 한 줄로는 자주 잘린다')
      .toMatch(/<h3[^>]*line-clamp-2/);
    // 격자 칸은 기본 min-width:auto 라 긴 낱말이 칸을 부풀린다 — 제목 쪽에서 막는다.
    expect(SRC, '제목에 [overflow-wrap:anywhere] 가 없다 — 긴 낱말이 칸을 부풀린다')
      .toMatch(/<h3[^>]*\[overflow-wrap:anywhere\]/);
  });

  it('카드→상세 모핑의 출발점(vt-poster)이 매장 로고에 남아 있다', () => {
    // 로고를 옮기거나 크기를 바꿀 때 **이름을 흘리기 쉬운 자리**다.
    // 이름이 사라지면 모핑이 조용히 없어진다(index.css 는 그대로 초록이라 아무도 모른다).
    const logo = SRC.match(/<PosterArea[\s\S]{0,900}?\/>/);
    expect(logo, 'PosterArea(매장 로고)를 못 찾았다').not.toBeNull();
    expect(logo![0], 'vt-poster 가 매장 로고에 없다 — 카드→상세 모핑이 사라진다')
      .toMatch(/vtName=\{vtActive \? 'vt-poster' : undefined\}/);
  });
});
