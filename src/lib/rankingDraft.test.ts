// 순위 입력 초안 — 저장 전 입력분이 통째로 사라지던 사고를 막는 안전망.
//
// 이 로직은 양방향으로 위험하다:
//  · 못 지키면 → 20명 친 입력분이 칩 오탭 한 번에 사라진다(원래 결함).
//  · 과하게 되살리면 → 저장이 (날짜+게임) 전체 교체라, 낡은 초안이 이미 저장된 순위를 덮어쓴다.
// 그래서 '무엇을 저장하고 무엇을 버리는가'의 경계를 테스트로 고정한다.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  rankDraftKey, readRowsDraft, writeRowsDraft, clearRowsDraft, pruneRowsDrafts,
  hasRowContent, moveRankRow, RANK_DRAFT_TTL_MS, type RankRow,
} from './rankingDraft';

// vitest environment 가 'node' 라 localStorage 가 없다 — 최소 스텁을 깐다.
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const row = (over: Partial<RankRow> = {}): RankRow =>
  ({ nickname: '', realName: '', prize: '', voucher: '', note: '', ...over });

const K = (event = '') => rankDraftKey('v1', '2026-07-26', event);

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  // 모듈 스코프 메모리 Map 은 테스트 간에 남으므로 이번 테스트가 쓰는 키를 명시적으로 비운다
  [K(''), K('사이드1'), K('사이드2')].forEach(clearRowsDraft);
});

describe('키 — 무엇을 입력 중인지가 (매장·날짜·게임)으로 정의된다', () => {
  it('게임이 다르면 다른 초안이다(칩을 바꿔도 서로 안 섞인다)', () => {
    writeRowsDraft(K(''), [row({ nickname: '메인선수' })]);
    writeRowsDraft(K('사이드1'), [row({ nickname: '사이드선수' })]);
    expect(readRowsDraft(K(''))![0].nickname).toBe('메인선수');
    expect(readRowsDraft(K('사이드1'))![0].nickname).toBe('사이드선수');
  });

  it('🔴 잘못 누른 칩에서 되돌아오면 그대로 살아 있다', () => {
    const typed = Array.from({ length: 20 }, (_, i) => row({ nickname: `선수${i + 1}` }));
    writeRowsDraft(K(''), typed);          // 20명 입력
    expect(readRowsDraft(K('사이드1'))).toBeNull(); // 사이드 칩 오탭 — 그쪽은 비어 있음
    expect(readRowsDraft(K(''))).toHaveLength(20);  // 메인으로 복귀 → 전부 복원
  });
});

describe('무엇을 초안으로 남기는가', () => {
  it('빈 줄만 있으면 초안을 남기지 않는다(복원이 오히려 방해된다)', () => {
    writeRowsDraft(K(''), [row(), row()]);
    expect(readRowsDraft(K(''))).toBeNull();
  });

  it('어느 칸이든 값이 하나라도 있으면 내용으로 본다', () => {
    expect(hasRowContent([row()])).toBe(false);
    expect(hasRowContent([row({ nickname: 'a' })])).toBe(true);
    expect(hasRowContent([row({ prize: '100' })])).toBe(true);
    expect(hasRowContent([row({ voucher: '1' })])).toBe(true);
    expect(hasRowContent([row({ note: '메모' })])).toBe(true);
  });

  it('내용이 사라지면(전부 지움) 초안도 함께 지워진다', () => {
    writeRowsDraft(K(''), [row({ nickname: 'a' })]);
    expect(readRowsDraft(K(''))).not.toBeNull();
    writeRowsDraft(K(''), [row()]); // 다 지운 상태로 재커밋
    expect(readRowsDraft(K(''))).toBeNull();
  });
});

describe('TTL — 낡은 초안이 저장된 순위를 덮어쓰지 않게', () => {
  const t0 = Date.parse('2026-07-26T12:00:00Z');

  it('48시간 안이면 살아 있다', () => {
    writeRowsDraft(K(''), [row({ nickname: 'a' })], t0);
    expect(readRowsDraft(K(''), t0 + RANK_DRAFT_TTL_MS - 1)).not.toBeNull();
  });

  it('🔴 48시간을 넘기면 되살아나지 않는다 — 저장은 (날짜+게임) 전체 교체라 위험하다', () => {
    writeRowsDraft(K(''), [row({ nickname: 'a' })], t0);
    expect(readRowsDraft(K(''), t0 + RANK_DRAFT_TTL_MS + 1)).toBeNull();
  });

  it('만료분은 읽는 김에 스토리지에서도 정리된다', () => {
    writeRowsDraft(K(''), [row({ nickname: 'a' })], t0);
    readRowsDraft(K(''), t0 + RANK_DRAFT_TTL_MS + 1);
    expect(localStorage.getItem(K(''))).toBeNull();
  });
});

describe('정리 — 키가 매장·날짜·게임마다 쌓인다', () => {
  const t0 = Date.parse('2026-07-26T12:00:00Z');

  it('만료된 것만 지우고 살아있는 초안은 남긴다', () => {
    writeRowsDraft(K(''), [row({ nickname: 'old' })], t0);
    writeRowsDraft(K('사이드1'), [row({ nickname: 'new' })], t0 + RANK_DRAFT_TTL_MS);
    const removed = pruneRowsDrafts(t0 + RANK_DRAFT_TTL_MS + 1);
    expect(removed).toBe(1);
    expect(readRowsDraft(K('사이드1'), t0 + RANK_DRAFT_TTL_MS + 1)).not.toBeNull();
  });

  it('깨진 값도 정리 대상 — 파싱 실패로 영원히 남지 않게', () => {
    localStorage.setItem(K('사이드2'), '{{{깨진 JSON');
    expect(pruneRowsDrafts(t0)).toBe(1);
    expect(localStorage.getItem(K('사이드2'))).toBeNull();
  });
});

describe('스토리지가 막힌 환경(사파리 프라이빗 등)에서도 죽지 않는다', () => {
  it('localStorage 가 예외를 던져도 같은 세션 안에서는 메모리로 지킨다', () => {
    const boom = () => { throw new Error('blocked'); };
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      get length(): number { throw new Error('blocked'); },
      key: boom, getItem: boom, setItem: boom, removeItem: boom,
    };
    expect(() => writeRowsDraft(K(''), [row({ nickname: 'a' })])).not.toThrow();
    expect(readRowsDraft(K(''))![0].nickname).toBe('a'); // 메모리 Map 에서 복원
    expect(() => pruneRowsDrafts()).not.toThrow();
  });
});

// 재배치는 초안과 한 몸이다 — 이동 방식이 조금만 달라져도(행 객체 재생성 등)
// '되돌리면 초안이 스스로 지워진다'는 성질이 깨져 배너가 영영 남는다. 그 경계를 여기서 고정한다.
describe('등수 재배치 — 배열 순서가 곧 등수다', () => {
  const three = () => [row({ nickname: 'a' }), row({ nickname: 'b' }), row({ nickname: 'c' })];

  it('한 칸 위로 = 앞 줄과 자리를 바꾼다', () => {
    expect(moveRankRow(three(), 2, 1).map((r) => r.nickname)).toEqual(['a', 'c', 'b']);
  });

  it('맨 위로 보내면 나머지는 순서를 유지한 채 한 칸씩 밀린다(등수 직접 지정)', () => {
    expect(moveRankRow(three(), 2, 0).map((r) => r.nickname)).toEqual(['c', 'a', 'b']);
  });

  it('경계 밖·제자리 이동은 같은 배열을 그대로 돌려준다 — 헛 커밋으로 초안이 갱신되면 안 된다', () => {
    const r0 = three();
    expect(moveRankRow(r0, 0, -1)).toBe(r0);
    expect(moveRankRow(r0, 0, 3)).toBe(r0);
    expect(moveRankRow(r0, 1, 1)).toBe(r0);
  });

  it('🔴 행 객체를 새로 만들지 않는다 — 원래 순서로 되돌리면 기준선(JSON)과 정확히 같아져 초안이 지워진다', () => {
    const r0 = three();
    const base = JSON.stringify(r0);
    const back = moveRankRow(moveRankRow(r0, 0, 2), 2, 0);
    expect(JSON.stringify(back)).toBe(base);
    expect(back[0]).toBe(r0[0]); // 객체 동일성까지 유지
  });
});
