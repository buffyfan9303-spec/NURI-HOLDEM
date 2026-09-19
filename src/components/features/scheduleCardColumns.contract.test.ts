// 일정 목록 줄의 **골격** 재발 방지 계약
// (2026-09-17 신설 · 09-18 2·3차 개정 · **2026-09-20 4차 개정: 오너 목업으로 재설계**)
//
// 무엇을 막는가
//   ① 정보가 한쪽에 몰리고 반대쪽이 비는 것 — 오너 리포트(2026-09-17):
//      "공백이 너무 많고 좌측에는 정보가 너무 많아 일부러 이렇게 해놓은거야?"
//   ② 좁은 폭·글자 확대에서 골격이 무너지는 것 — 이 파일이 세 번 고쳐 온 부류다.
//   ③ 리디자인이 **기능을 조용히 떨어뜨리는 것**(TOP·별점·거리·예약·♥·모핑). 전 게이트가
//      초록인 채로 기능이 사라지는 부류라, 여기서 이름으로 붙잡는다.
//
// 🔴 4차 개정에서 바뀐 것 — 옛 계약은 `grid grid-cols-[auto_minmax(0,1fr)]` 3행 격자를 잠그고 있었다.
//   오너 목업(2026-09-20)이 골격을 **3덩어리 한 줄**로 바꿨다:
//     [정사각 로고] [매장·지역 / 대회명+등급 / 3칸 지표] [시작 라벨·큰 시각 + 꺾쇠]
//   옛 단언을 지운 것이 아니라 **같은 목적을 새 골격에 다시 걸었다.** 구조가 바뀌면 계약도
//   같이 옮기는 것이지, 느슨하게 푸는 것이 아니다(푸는 순간 이 파일은 존재 이유가 없다).
//
// ⚠ 이 파일은 `src/` 안이라 **Tailwind content 스캔 대상**이다. 금지하려는 클래스명을 그대로 적으면
//   라이브 CSS 에 죽은 규칙이 실린다(CLAUDE.md 참고 메모). 그래서 금지 이름은 **쪼개서** 쓴다.
//
// 이 검사가 못 보는 것: 실제 렌더 폭·줄 맞음 여부(브라우저 실측 몫).
//   **지표 3칸이 실제로 한 줄인지는 `e2e/schedule-card-fit.spec.ts` 가 실측으로 잰다.** 여기서는 구조만 잠근다.
// 실행: npx vitest run src/components/features/scheduleCardColumns.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ScheduleCard.tsx'), 'utf8');
/** 목록 카드(ListCard) 본문만 — 아래 GridCard 는 포스터 골격이라 규칙이 다르다. */
const LIST = SRC.slice(0, SRC.indexOf('function GridCard'));

describe('일정 목록 줄 — 골격', () => {
  it('가운데 덩어리가 0까지 줄 수 있다 — 긴 제목이 카드를 가로로 밀어내지 않는다', () => {
    // `min-w-0` 이 없으면 flex 항목의 최소 크기가 auto 라 긴 한글 낱말이 덩어리를 부풀리고,
    // 카드가 통째로 가로 넘침이 된다(그 상태로도 '잘림 0' 은 통과할 수 있어 여기서 못 박는다).
    expect(LIST, '가운데 덩어리에 min-w-0 + basis 가 없다 — 긴 제목이 카드를 밀어낸다')
      .toMatch(/min-w-0 grow basis-\[\d+rem\]/);
  });

  it('🔴 폭이 모자라면 시각 덩어리가 아랫줄로 내려간다 — 격자로 되돌아가면 200% 확대가 무너진다', () => {
    // 실측(320px · 글자 200%): `grid` 3열이면 양끝 auto 열이 max-content 를 먼저 가져가
    //   가운데가 **25px** 로 쭈그러들어 제목이 한 글자씩 17~25줄로 흐르고 카드가 953~1008px 이 됐다.
    //   flex-wrap 이면 시각 덩어리가 스스로 내려가 가운데가 224.5px 을 되찾는다.
    const 격자 = 'grid-cols' + '-[auto_1fr_auto]';
    expect(LIST, `카드 골격이 ${격자} 로 되돌아갔다 — 320px/200% 에서 제목이 세로로 흐른다`)
      .not.toContain(격자);
    expect(LIST, '카드 골격에 flex-wrap 이 없다 — 글자 확대에서 탈출구가 사라진다')
      .toMatch(/flex-wrap/);
  });

  it('🔴 지표 3칸이 내용 폭 flex 다 — 균등 3등분이면 320px 에서 항상 접힌다', () => {
    const m = LIST.match(/data-metrics[\s\S]{0,400}?className=\{\[([\s\S]*?)\]\.join/);
    expect(m, 'data-metrics 줄을 못 찾았다 — 손잡이가 사라졌으면 e2e 3건이 같이 빈손이 된다').not.toBeNull();
    const cls = m![1];
    expect(cls, '지표 줄이 flex 가 아니다').toContain('flex');
    // 균등 3등분 금지: 320px 에서 칸이 44px 인데 `1,000만` 이 47px 라 **항상** 접힌다(실측).
    const 균등 = 'grid-cols' + '-3';
    expect(cls, `지표 줄이 ${균등} 다 — 320px 에서 금액이 항상 접힌다. 내용 폭(flex)으로 둬라`)
      .not.toContain(균등);
    // 칸 사이 구분선. 없으면 값 셋이 붙어 읽혀 금액 오독이 난다(§28 이 막으려는 사고).
    expect(cls, '칸 사이 구분선이 없다 — 세 값이 붙어 읽힌다').toMatch(/divide-x/);
  });

  it('🔴 계측 손잡이 둘이 살아 있다 — 사라지면 e2e 가 아무것도 안 재고 통과한다', () => {
    // 이 둘은 화면에 안 보이지만 **게이트가 보는 값**이다. 지우면 검사가 빈손이 되고,
    // 빈손인 검사는 초록이라 아무도 눈치채지 못한다(2026-09-20 에 실제로 그런 일이 있었다).
    expect(LIST, 'data-metrics 가 없다 — schedule-card-fit 의 3칸 단언이 빈손이 된다')
      .toContain('data-metrics');
    expect(LIST, 'data-date 가 없다 — theme-tokens-v7 ⑦ 의 날짜 단언이 빈손이 된다')
      .toMatch(/data-date=\{schedule\.date\}/);
  });

  it('🔴 대회명이 자기 줄을 온전히 쓴다 — 좌우 값 사이에 끼지 않는다', () => {
    expect(LIST, '제목이 줄 클램프가 아니다 — 한글 제목은 한 줄로는 자주 잘린다')
      .toMatch(/<h3[^>]*line-clamp-\d/);
    // 칸은 기본 min-width:auto 라 긴 낱말이 칸을 부풀린다 — 제목 쪽에서 막는다.
    expect(LIST, '제목에 [overflow-wrap:anywhere] 가 없다 — 긴 낱말이 칸을 부풀린다')
      .toMatch(/<h3[^>]*\[overflow-wrap:anywhere\]/);
  });

  it('등급 배지가 제목 안의 인라인이다 — 형제로 빼면 제목 2줄에서 배지가 아랫줄로 밀린다', () => {
    // 실측(320·360): 형제로 두면 카드가 +18px 이 되고 목업의 '제목 오른쪽' 이 아니라 별도 줄이 된다.
    const h3 = LIST.match(/<h3[\s\S]*?<\/h3>/);
    expect(h3, '제목(h3)을 못 찾았다').not.toBeNull();
    expect(h3![0], '등급 배지가 제목 안에 없다 — 형제로 빠지면 줄이 하나 더 생긴다')
      .toMatch(/\{grade &&/);
  });

  it('🔴 리디자인이 기능을 떨어뜨리지 않았다 — TOP·별점·거리·예약·♥', () => {
    // 🔴 §8.1 기능 보존. 목업에는 매장명만 그려져 있어 **지우기 쉬운 자리**다.
    //   TOP 은 유료 노출(돈을 받은 자리)이고 나머지는 이미 있던 기능이다.
    //   리팩터 손실은 삭제된 diff 로만 보이는 부류라, 이름으로 붙잡아 둔다.
    for (const [needle, what] of [
      ['isPremium', 'TOP 배지(유료 노출)'],
      ['rating.avg', '별점'],
      ['fmtKm(distanceKm)', '거리'],
      ['reserveCount', '예약 인원'],
      ['FavoriteButton', '즐겨찾기 하트'],
    ] as const) {
      expect(LIST, `${what} 가 카드에서 사라졌다 — 목업에 없다고 지우면 안 된다(§8.1)`).toContain(needle);
    }
  });

  it('🔴 ♥ 가 **실제로 배선돼 있다** — 컴포넌트만 있고 prop 을 안 넘기면 화면에 안 뜬다', () => {
    // 🔴 이 검사가 있는 이유. 바로 위 '기능 보존' 검사는 `ScheduleCard.tsx` 소스에
    //   `FavoriteButton` 이라는 **글자가 있는지**만 본다. 그런데 2026-08-28 ~ 2026-09-20 까지
    //   **호출부 4곳 전부가 `onToggleFavorite` 를 안 넘겨서 하트가 어느 화면에도 안 떴다.**
    //   그 20일 내내 이 파일의 검사는 **초록**이었다 — 회귀를 못 잡는 계약이었던 것이다.
    //   (회귀가 아니라 미완성이었다: `git log -S FavoriteButton` 이 커밋 하나만 돌려준다.)
    // → 컴포넌트 존재가 아니라 **호출부가 실제로 넘기는지**를 본다.
    const sites = [
      ['../../App.tsx', 'App(일정 탐색 리스트·그리드 / 표모드 모바일 대체)'],
      ['./HomeTab.tsx', '홈(오늘·내일 일정)'],
      ['./LiveGamesTab.tsx', '라이브(오늘 곧 시작)'],
    ] as const;
    for (const [rel, label] of sites) {
      const src = readFileSync(join(__dirname, rel), 'utf8');
      expect(src, `${label} 가 ScheduleCard 에 onToggleFavorite 을 안 넘긴다 — 하트가 그 화면에서 사라진다`)
        .toMatch(/onToggleFavorite=\{/);
      expect(src, `${label} 가 favorited 를 안 넘긴다 — 눌러도 채워진 하트로 안 바뀐다`)
        .toMatch(/favorited=\{/);
    }
    // 세 화면이 **같은 집합**을 봐야 한다 — 각자 조회하면 '탭 재방문 시 하트가 안 갱신됨' 함정을
    // 다시 밟는다(lib/useFavoriteVenues.ts 주석에 2026-09-17 실제 사례 기록).
    for (const [rel, label] of sites) {
      const src = readFileSync(join(__dirname, rel), 'utf8');
      expect(src, `${label} 가 useFavoriteVenues 를 안 쓴다 — 탭마다 따로 조회하면 하트가 어긋난다`)
        .toMatch(/useFavoriteVenues/);
    }
  });

  it('🔴 날짜 그룹 머리말이 **세 목록 모두에** 배선돼 있다', () => {
    // 오너 지시(2026-09-20): 카드에서 날짜를 뺀 뒤 목록에 날짜 구분이 없어졌다 → 그룹 머리말 추가.
    // ⚠ 한 곳만 배선하면 같은 대회가 화면마다 다르게 보인다 — 이 저장소가 반복해 밟은 '정본 두 벌' 부류다.
    for (const [rel, label] of [
      ['../../App.tsx', 'App(일정탐색 리스트 · 표모드 모바일 대체)'],
      ['./HomeTab.tsx', '홈(오늘·내일 일정)'],
    ] as const) {
      const src = readFileSync(join(__dirname, rel), 'utf8');
      expect(src, `${label} 가 dateHeaderAt 을 안 쓴다 — 그 화면만 날짜 구분이 없어진다`)
        .toMatch(/dateHeaderAt\(/);
      expect(src, `${label} 에 data-date-header 손잡이가 없다 — e2e 가 머리말을 못 찾는다`)
        .toMatch(/data-date-header=/);
    }
    // 🔴 '가까운 순'에서는 꺼야 한다 — 거리 우선 정렬은 날짜를 비단조로 만들어 머리말이 반복된다.
    const APP = readFileSync(join(__dirname, '../../App.tsx'), 'utf8');
    expect(APP, "일정탐색이 nearSort 에서 머리말을 안 끈다 — 같은 날짜 머리말이 목록 중간에 반복된다")
      .toMatch(/dateHeaderAt\([^)]*!nearSort/);
    // 그리드 모드에서도 꺼야 한다 — CSS grid 칸 안에 전폭 머리말을 넣으면 칸이 깨진다.
    expect(APP, "그리드 모드에서 머리말을 안 끈다 — CSS grid 칸이 깨진다")
      .toMatch(/viewMode === 'list'/);
  });

  it('카드→상세 모핑의 출발점(vt-poster)이 매장 로고에 남아 있다', () => {
    // 로고를 옮기거나 크기를 바꿀 때 **이름을 흘리기 쉬운 자리**다.
    // 이름이 사라지면 모핑이 조용히 없어진다(index.css 는 그대로 초록이라 아무도 모른다).
    const logo = LIST.match(/<PosterArea[\s\S]{0,900}?\/>/);
    expect(logo, 'PosterArea(매장 로고)를 못 찾았다').not.toBeNull();
    expect(logo![0], 'vt-poster 가 매장 로고에 없다 — 카드→상세 모핑이 사라진다')
      .toMatch(/vtName=\{vtActive \? 'vt-poster' : undefined\}/);
  });
});
