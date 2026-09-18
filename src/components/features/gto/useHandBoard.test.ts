// F10 회귀 ⑪ — 저장 스팟 '다시 열기' 뒤 카드 그리드와 리포트가 **같은 스팟**이어야 한다.
// vitest 환경이 `node` 라 훅을 렌더할 수 없어, `setAll` 이 쓰는 순수 규칙(initialHandBoard)을 잠근다.
import { describe, it, expect } from 'vitest';
import { initialHandBoard, parseCardId } from './useHandBoard';
import { cardId } from './useDeepGto';
import type { Card } from './gto.types';

const ids = (cards: readonly (Card | null)[]) => cards.filter((c): c is Card => c !== null).map(cardId);

const SPOT_A = { hero: ['As', 'Kd'], villain: ['Qs', 'Qh'], board: ['2c', '7h', 'Jd'] };
const SPOT_B = { hero: ['9c', '9d'], villain: ['Ah', 'Th'], board: ['3s', '4s', '5s', 'Kc'] };

describe('⑪ setAll — 외부 스팟으로 통째 교체', () => {
  it('연 스팟(B)의 카드가 그대로 들어간다 — A 의 잔재가 남지 않는다', () => {
    const a = initialHandBoard(SPOT_A, 5);
    expect(ids(a.hero)).toEqual(SPOT_A.hero);

    const b = initialHandBoard(SPOT_B, 5);
    expect(ids(b.hero)).toEqual(SPOT_B.hero);
    expect(ids(b.villain)).toEqual(SPOT_B.villain);
    expect(ids(b.board)).toEqual(SPOT_B.board);
    // A 의 카드가 한 장도 살아남지 않는다.
    const survivors = [...ids(b.hero), ...ids(b.villain), ...ids(b.board)]
      .filter((x) => [...SPOT_A.hero, ...SPOT_A.villain, ...SPOT_A.board].includes(x));
    expect(survivors).toEqual([]);
  });

  it('교체 결과의 id 가 스팟과 정확히 같다 → 동기화 이펙트가 early-return 해 street 가 보존된다', () => {
    // NuriSpotPanel 의 동기화 이펙트는 hero/villain/board 문자열 비교가 모두 같으면 setSpot 을 건너뛴다.
    // 그래야 보드 장수에서 다시 유도한 street 가 저장 스팟의 street 를 덮지 않는다.
    const b = initialHandBoard(SPOT_B, 5);
    expect(ids(b.hero).join()).toBe(SPOT_B.hero.join());
    expect(ids(b.villain).join()).toBe(SPOT_B.villain.join());
    expect(ids(b.board).join()).toBe(SPOT_B.board.join());
  });

  it('보드 슬롯은 항상 boardSlots 칸이고 빈칸은 뒤에 몰린다(중간 구멍 금지)', () => {
    const b = initialHandBoard(SPOT_B, 5);
    expect(b.board).toHaveLength(5);
    expect(b.board.slice(4)).toEqual([null]);
    const firstNull = b.board.findIndex((c) => c === null);
    expect(b.board.slice(firstNull).every((c) => c === null)).toBe(true);
  });

  it('빈 스팟으로 교체하면 전부 비고 대상이 hero 로 돌아간다', () => {
    const e = initialHandBoard(undefined, 5);
    expect(ids(e.hero)).toEqual([]);
    expect(ids(e.villain)).toEqual([]);
    expect(ids(e.board)).toEqual([]);
    expect(e.target).toBe('hero');
  });

  it('다음 입력 대상은 처음 비어 있는 칸을 따른다', () => {
    expect(initialHandBoard({ hero: ['As'] }, 5).target).toBe('hero');
    expect(initialHandBoard({ hero: SPOT_A.hero }, 5).target).toBe('villain');
    expect(initialHandBoard(SPOT_A, 5).target).toBe('board');
  });

  it('깨진 카드 문자열은 조용히 버린다 — 딥링크·옛 스냅샷 방어', () => {
    expect(parseCardId('Zz')).toBeNull();
    const s = initialHandBoard({ hero: ['As', 'Zz', 'Kd'] }, 5);
    expect(ids(s.hero)).toEqual(['As', 'Kd']);
  });
});

// 2026-09-19 빌런 B~E 슬롯 — 아웃츠·리플레이는 extra 를 안 주므로 옛 규칙이 그대로여야 한다.
describe('빌런 B~E 슬롯(extra)', () => {
  it('extra 가 없으면 예전과 같다 — 슬롯 [] · 대상 규칙 불변', () => {
    const s = initialHandBoard(SPOT_A, 5);
    expect(s.extra).toEqual([]);
    expect(s.target).toBe('board');
  });

  it('B 가 덜 찼으면 대상이 v1 이고, B 까지 다 찼으면 보드로 간다', () => {
    const half = initialHandBoard({ ...SPOT_A, extra: [['Jc']] }, 5);
    expect(ids(half.extra[0])).toEqual(['Jc']);
    expect(half.extra[0]).toHaveLength(2);       // 2칸 패딩
    expect(half.target).toBe('v1');
    const full = initialHandBoard({ ...SPOT_A, extra: [['Jc', 'Js'], []] }, 5);
    expect(full.target).toBe('v2');
    expect(initialHandBoard({ ...SPOT_A, extra: [['Jc', 'Js']] }, 5).target).toBe('board');
  });

  it('5명째부터는 버린다 — 빌런 A 포함 5명 상한', () => {
    const s = initialHandBoard({ ...SPOT_A, extra: [[], [], [], [], []] }, 5);
    expect(s.extra).toHaveLength(4);
  });
});
