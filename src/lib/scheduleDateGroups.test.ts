// 날짜 그룹 머리말 — 경계 판정 단위 테스트.
//
// 오너 지시(2026-09-20): 카드에서 날짜를 뺀 뒤 목록에 날짜 구분이 없어졌다 → 그룹 머리말 추가.
// 이 파일은 **판정 규칙**만 본다. 실제로 화면에 붙는지는 `scheduleCardColumns.contract.test.ts`
// (호출부가 dateHeaderAt 을 쓰는지)와 e2e 가 본다 — 셋이 각자 다른 층을 본다.
import { describe, it, expect } from 'vitest';
import { dateHeaderLabel, dateHeaderAt, countDateHeaders } from './scheduleDateGroups';

const d = (date: string) => ({ date });

describe('날짜 머리말 — 라벨', () => {
  it('오너가 고른 목업 표기 그대로다 — `9/20 (일)`', () => {
    expect(dateHeaderLabel('2026-09-20')).toBe('9/20 (일)');
    expect(dateHeaderLabel('2026-09-21')).toBe('9/21 (월)');
  });

  it('🔴 시간대에 영향받지 않는다 — `new Date(iso)` 는 UTC 자정이라 KST 에서 하루가 밀린다', () => {
    // 이 저장소는 CI 시간대 때문에 픽스처가 하루 어긋난 적이 있다(ci.yml 의 TZ 주석).
    // 문자열을 직접 쪼개므로 실행 환경 TZ 와 무관하게 같은 답이 나와야 한다.
    for (const iso of ['2026-01-01', '2026-03-01', '2026-12-31']) {
      const [y, m, dd] = iso.split('-').map(Number);
      const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, dd).getDay()];
      expect(dateHeaderLabel(iso)).toBe(`${m}/${dd} (${dow})`);
    }
  });

  it('형식이 아닌 값은 그대로 돌려준다(빈 화면 대신 원문)', () => {
    expect(dateHeaderLabel('')).toBe('');
    expect(dateHeaderLabel('없음')).toBe('없음');
  });
});

describe('날짜 머리말 — 경계', () => {
  const list = [d('2026-09-20'), d('2026-09-20'), d('2026-09-21'), d('2026-09-21'), d('2026-09-22')];

  it('첫 항목에는 **항상** 붙는다 — 없으면 첫 그룹만 이름이 없다', () => {
    expect(dateHeaderAt(list, 0)).toBe('9/20 (일)');
  });

  it('날짜가 바뀌는 자리에만 붙는다', () => {
    expect(dateHeaderAt(list, 1)).toBeNull();
    expect(dateHeaderAt(list, 2)).toBe('9/21 (월)');
    expect(dateHeaderAt(list, 3)).toBeNull();
    expect(dateHeaderAt(list, 4)).toBe('9/22 (화)');
  });

  it('🔴 enabled=false 면 하나도 안 붙는다 — `가까운 순` 정렬에서 이걸로 끈다', () => {
    // 거리 우선 정렬은 날짜를 비단조로 만든다 → 같은 날짜 머리말이 중간에 여러 번 반복된다.
    for (let i = 0; i < list.length; i++) expect(dateHeaderAt(list, i, false)).toBeNull();
  });

  it('🔴 날짜가 뒤섞인 배열에서는 같은 날짜가 여러 번 나온다 — 끄지 않으면 이렇게 된다', () => {
    // 이 동작이 '버그'가 아니라 **날짜순이 아닌 배열에 쓰면 안 되는 이유**라는 것을 고정한다.
    const mixed = [d('2026-09-20'), d('2026-09-22'), d('2026-09-20')];
    expect([0, 1, 2].map((i) => dateHeaderAt(mixed, i))).toEqual(['9/20 (일)', '9/22 (화)', '9/20 (일)']);
    expect(countDateHeaders(mixed)).toBe(3);
  });

  it('빈 배열·범위 밖 인덱스는 null', () => {
    expect(dateHeaderAt([], 0)).toBeNull();
    expect(dateHeaderAt(list, 99)).toBeNull();
    expect(countDateHeaders([])).toBe(0);
  });

  it('countDateHeaders 가 그룹 수를 센다', () => {
    expect(countDateHeaders(list)).toBe(3);
    expect(countDateHeaders([d('2026-09-20')])).toBe(1);
    expect(countDateHeaders(list, false)).toBe(0);
  });
});
