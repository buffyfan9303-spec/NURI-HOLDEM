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

  // 🔴 2026-09-22 요구 C — **반전됐다.** 등급 배지는 이제 제목 안이 아니라 **우측 덩어리**에 있다.
  //   옛 계약("제목 안 인라인이어야 한다")의 근거는 "형제로 두면 제목 2줄에서 배지가 아랫줄로 밀린다" 였다.
  //   그 전제가 사라졌다: ① 제목이 `line-clamp-1` 로 **항상 한 줄**이고 ② 배지가 간 곳은 하트가 있던
  //   `shrink-0` 세로 덩어리라 가로 폭을 안 민다(시각 덩어리보다 좁다). 카드 높이 영향 0 이다.
  //   인라인으로 되돌리면 12자 제목의 폭을 배지가 먹어 ellipsis 가 빨라진다.
  it('등급 배지가 제목 밖 우측 덩어리에 정확히 1개 있다', () => {
    const h3 = LIST.match(/<h3[\s\S]*?<\/h3>/);
    expect(h3, '제목(h3)을 못 찾았다').not.toBeNull();
    expect(h3![0], '등급 배지가 다시 제목 안으로 들어갔다 — 12자 제목의 폭을 먹는다')
      .not.toMatch(/\{grade &&/);
    // 손잡이로 세어야 '어딘가에 있다' 가 아니라 '정확히 한 자리' 임을 잠글 수 있다.
    const badges = [...LIST.matchAll(/data-testid="schedule-grade-badge"/g)];
    expect(badges.length, `등급 배지가 ${badges.length}개다 — 목록 카드에 정확히 1개여야 한다`).toBe(1);
    // 시작시각 덩어리와 같은 컨테이너 안에 있는가(하트가 있던 그 자리).
    // 🔴 2026-09-22 R8 — 그 덩어리가 `flex flex-col items-end` 에서 **2열 grid** 로 바뀌었다
    //   (`데일리/시작/시간` centerX 정렬). 셀렉터만 새 구조로 옮기고 계약은 그대로다.
    const right = LIST.match(/<div className="grid shrink-0 grid-cols-\[auto_auto\][\s\S]*?<\/div>\s*<\/article>/);
    expect(right, '우측 덩어리(2열 grid)를 못 찾았다 — 검사가 대상에 도달하지 못했다').not.toBeNull();
    expect(right![0], '등급 배지가 우측 덩어리 밖에 있다').toContain('schedule-grade-badge');
    expect(right![0], '등급 배지가 시작시각보다 아래로 갔다 — 하트가 있던 위쪽 자리여야 한다')
      .toMatch(/schedule-grade-badge[\s\S]*시작/);
  });

  // 🔴 R8(2026-09-22) — 모바일 중심축 정렬의 **구조**를 잠근다.
  //   기하(centerX 편차 1px 이하)는 `e2e/schedule-card-fit.spec.ts` 가 실측으로 재고,
  //   여기서는 그 기하를 성립시키는 전제가 조용히 사라지지 않게 막는다.
  // 🔴 2026-09-22(2차 오너) — 1차의 '중앙 정렬' 계약을 **우측 정렬**로 교체했다.
  //   오너가 실제 화면을 보고 "화살표 기준으로 우측정렬해서 우측에 붙여" 라고 다시 정했다.
  //   구조(2열 grid)는 그대로라 구조 단언은 유지하고 정렬 단언만 뒤집는다.
  it('우측 묶음이 2열 grid 이고 시간열은 chevron 기준 우측 정렬이다', () => {
    const right = LIST.match(/<div className="grid shrink-0 grid-cols-\[auto_auto\][\s\S]*?<\/div>\s*<\/article>/);
    expect(right, '우측 2열 grid 를 못 찾았다').not.toBeNull();
    const R = right![0];
    // 시간열과 chevron 이 **다른 열**이어야 텍스트가 화살표 왼쪽에 붙는다(화살표가 정렬에 안 섞인다).
    expect(R, '시간 묶음이 1열에 있지 않다').toMatch(/data-testid="schedule-start-group"[\s\S]*?col-start-1/);
    expect(R, 'chevron 이 2열의 별도 칸이 아니다').toMatch(/chevron-right[\s\S]*?col-start-2/);
    // 우측 정렬 — 배지와 시간이 **같은 오른쪽 모서리**를 쓴다.
    expect(R, 'grid 가 우측 정렬이 아니다').toMatch(/justify-items-end/);
    expect(R, '시간 묶음이 우측 정렬이 아니다').toMatch(/schedule-start-group[\s\S]*?items-end/);
    expect(R, '배지가 우측에 붙지 않았다').toMatch(/schedule-grade-badge[\s\S]*?justify-self-end/);
    // ⚠ 배지를 두 열에 span 시키면 chevron 너머까지 밀려 나가 시간과 오른쪽 끝이 어긋난다(옛 사선).
    expect(R, '배지가 두 열을 span 한다 — 시간과 오른쪽 끝이 어긋난다').not.toMatch(/col-span-2/);
    // 오너 지시로 `시작` 라벨을 뺐다 — 그 자리를 필드 현황이 쓴다(줄 수 불변 = 카드 높이 불변).
    expect(R, '`시작` 라벨이 되살아났다 — 오너가 빼라고 한 문구다').not.toMatch(/>시작</);
    expect(R, '필드 현황(생존/엔트리) 줄이 없다').toMatch(/data-testid="schedule-field-count"/);
    expect(R, '필드 현황을 시작 전에도 그린다 — 0/0 은 아무도 없다로 읽힌다').toMatch(/regInfo\?\.hasField &&/);
    // row-gap 으로 간격을 주면 배지 없는 카드에 빈 줄이 생겨 카드가 커진다.
    expect(R, 'grid 에 row-gap 을 줬다 — 배지 없는 카드에 빈 간격이 생긴다').not.toMatch(/\bgap-y-/);
    expect(R, 'grid 에 일괄 gap 을 줬다 — gap-x 만 써야 한다').not.toMatch(/className="grid shrink-0 grid-cols-\[auto_auto\][^"]*\sgap-\d/);
  });

  it('제목은 모든 폭에서 한 줄이다 — legacy 장문이 카드 높이를 바꾸지 못한다', () => {
    const h3 = LIST.match(/<h3[\s\S]*?<\/h3>/);
    expect(h3![0], '제목이 line-clamp-1 이 아니다 — 13자 이상 legacy 제목이 2~3줄로 펴져 카드 높이가 흔들린다')
      .toMatch(/line-clamp-1/);
    expect(h3![0], 'line-clamp-2/3 이 남아 있다 — 폭에 따라 줄 수가 달라지면 --card-h-list 예약과 어긋난다')
      .not.toMatch(/line-clamp-[23]/);
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
      // 🔴 2026-09-22 — '즐겨찾기 하트'는 이 목록에서 **뺐다**(오너 요구 C). 아래 전용 계약이 대신 잠근다.
    ] as const) {
      expect(LIST, `${what} 가 카드에서 사라졌다 — 목업에 없다고 지우면 안 된다(§8.1)`).toContain(needle);
    }
  });

  // 🔴 2026-09-22 요구 C — **반전됐다.** 옛 계약은 "세 화면이 하트를 실제로 배선하는가" 였다.
  //   오너가 목록 카드의 하트를 빼고 그 자리에 등급 배지를 두라고 했으므로, 이제 잠글 것이 뒤집힌다:
  //     ① 목록 카드에 하트 흔적이 **0개**   ② 세 호출부가 favorite prop 을 **안 넘긴다**
  //     ③ 그러나 즐겨찾기 **시스템 자체는 살아 있다**(삭제와 이동을 구별한다 — 이게 핵심이다)
  it('🔴 목록 카드에서 하트가 사라졌고, 즐겨찾기 시스템은 그대로다', () => {
    expect(LIST, 'FavoriteButton 이 목록 카드에 되살아났다').not.toContain('FavoriteButton');
    // 주석에 남은 설명 문구가 단언을 거짓 통과시키지 않도록 **JSX 전달 형태**로만 센다.
    expect(LIST, '목록 카드가 아직 favorited prop 을 받는다').not.toMatch(/favorited=\{/);
    expect(LIST, '목록 카드가 아직 onToggleFavorite prop 을 받는다').not.toMatch(/onToggleFavorite=\{/);

    for (const [rel, label] of [
      ['../../App.tsx', 'App(일정 탐색 리스트·그리드 / 표모드 모바일 대체)'],
      ['./HomeTab.tsx', '홈(오늘·내일 일정)'],
      ['./LiveGamesTab.tsx', '라이브(오늘 곧 시작)'],
    ] as const) {
      const src = readFileSync(join(__dirname, rel), 'utf8');
      expect(src, `${label} 가 아직 ScheduleCard 에 onToggleFavorite 을 넘긴다`).not.toMatch(/onToggleFavorite=\{/);
      expect(src, `${label} 가 아직 ScheduleCard 에 favorited 를 넘긴다`).not.toMatch(/favorited=\{/);
    }

    // 🔴 '카드에서 뺐다' 와 '기능을 지웠다' 는 다르다. 공유 훅과 그 소비처가 남아 있는지 본다 —
    //   여기가 빠지면 다음 사람이 "안 쓰네" 하고 즐겨찾기를 통째로 지우는 리팩터 손실이 난다.
    const hook = readFileSync(join(__dirname, '../../lib/useFavoriteVenues.ts'), 'utf8');
    expect(hook.length, '공유 훅 useFavoriteVenues 가 사라졌다 — 즐겨찾기 시스템 전체가 지워졌다').toBeGreaterThan(200);
    const live = readFileSync(join(__dirname, './LiveGamesTab.tsx'), 'utf8');
    expect(live, '라이브가 useFavoriteVenues 를 더 이상 안 쓴다 — 진행 게임 줄의 단골 표시가 죽었다')
      .toMatch(/useFavoriteVenues\(/);
    expect(live, '라이브 진행 게임 줄의 단골 표시(favIds)가 사라졌다').toMatch(/favIds\.has\(/);
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
