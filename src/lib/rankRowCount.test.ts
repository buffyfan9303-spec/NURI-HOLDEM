// 랭킹 보드별 스켈레톤 행수 저장값 계약 — TierLeaderboard 스크롤 점프 수정(2026-09-14)의 근거.
//
// 왜: 머니인·국내 순위가 `RowSkeleton rows={8}` / `rows={6}` 을 하드코딩해 왔고, 실제 행 수가 그보다
//   적으면(입상 0건이 흔하다) 응답 도착 순간 문서가 줄어드는 방향으로 튀었다(랭킹 탭 스크롤 점프 조사,
//   TierLeaderboard.tsx:228,901). 이 파일은 그 추정치를 만드는 저장값 읽기/쓰기 계약만 잠근다 —
//   실제 레이아웃 점프 여부는 단위 테스트로 못 본다(e2e/시각 실측 몫).
// 음성 대조: rankRowCount.ts 의 `v > 0 ? Math.min(30, v) : DEFAULT_ROWS[kind]` 를
//   `v >= 0 ? ... : ...` 로 바꾸면 '손상 값 0' 케이스가, DEFAULT_ROWS 매핑을 지우면 '키 없음' 케이스가 실패한다.
// 실행: npx vitest run src/lib/rankRowCount.test.ts
import { describe, it, expect } from 'vitest';
import { readRankRowCount, writeRankRowCount, type RankBoardKind } from './rankRowCount';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, dump: () => Object.fromEntries(m) };
};
const throwing = { getItem: () => { throw new DOMException('blocked', 'SecurityError'); }, setItem: () => { throw new DOMException('blocked', 'SecurityError'); } };

const KINDS: { kind: RankBoardKind; key: string; fallback: number }[] = [
  { kind: 'activity', key: 'nuri:rank-rows', fallback: 8 },          // 종전 키 그대로(하위호환) — 값을 이미 가진 브라우저를 보존
  { kind: 'moneyin', key: 'nuri:rank-rows:moneyin', fallback: 8 },
  { kind: 'domestic', key: 'nuri:rank-rows:domestic', fallback: 6 },
];

describe('readRankRowCount — 보드별 키·기본값, 손상 값·예외는 기본값으로', () => {
  for (const { kind, key, fallback } of KINDS) {
    it(`${kind}: 키 없음 → 기본값 ${fallback}`, () => {
      expect(readRankRowCount(kind, mem())).toBe(fallback);
    });
    it(`${kind}: 정상 저장값 3 → 3`, () => {
      expect(readRankRowCount(kind, mem({ [key]: '3' }))).toBe(3);
    });
    it(`${kind}: 30 초과는 30으로 클램프`, () => {
      expect(readRankRowCount(kind, mem({ [key]: '999' }))).toBe(30);
    });
    it(`🔴 ${kind}: 손상 값(0·음수·문자열·빈 문자열) → 기본값`, () => {
      for (const v of ['0', '-5', 'NaN', '', 'grid']) {
        expect(readRankRowCount(kind, mem({ [key]: v })), JSON.stringify(v)).toBe(fallback);
      }
    });
    it(`🔴 ${kind}: 저장소 접근이 throw 해도(사생활 모드·차단) 기본값 — 예외가 새지 않는다`, () => {
      expect(readRankRowCount(kind, throwing)).toBe(fallback);
    });
    it(`${kind}: 저장소가 없으면(SSR·테스트) 기본값`, () => {
      expect(readRankRowCount(kind, null)).toBe(fallback);
    });
  }

  it('보드마다 다른 키를 써서 서로의 추정치를 오염시키지 않는다', () => {
    const s = mem({ 'nuri:rank-rows': '20', 'nuri:rank-rows:moneyin': '2', 'nuri:rank-rows:domestic': '15' });
    expect(readRankRowCount('activity', s)).toBe(20);
    expect(readRankRowCount('moneyin', s)).toBe(2);
    expect(readRankRowCount('domestic', s)).toBe(15);
  });
});

describe('writeRankRowCount — 1~30 클램프, 0건도 최소 1행으로 남긴다', () => {
  for (const { kind, key } of KINDS) {
    it(`${kind}: 정상 값을 그대로 저장`, () => {
      const s = mem();
      writeRankRowCount(kind, 12, s);
      expect(s.dump()).toEqual({ [key]: '12' });
    });
    it(`${kind}: 0건(EmptyState) → 최소 1행으로 저장(다음 스켈레톤이 완전히 사라지지 않게)`, () => {
      const s = mem();
      writeRankRowCount(kind, 0, s);
      expect(s.dump()).toEqual({ [key]: '1' });
    });
    it(`${kind}: 30 초과는 30으로 클램프해 저장`, () => {
      const s = mem();
      writeRankRowCount(kind, 500, s);
      expect(s.dump()).toEqual({ [key]: '30' });
    });
  }

  it('저장소가 throw 해도 예외가 새지 않는다', () => {
    expect(() => writeRankRowCount('activity', 5, throwing)).not.toThrow();
  });
});
