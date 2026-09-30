import { describe, it, expect } from 'vitest';
import {
  slideSegments, slideAt, sheetCount, adIndexAt, teamStandings, parsePlaces, clampExtraPages, visibleExtraPages,
  PAGE_MS, AD_MS, PRIZE_SHEET_MS, EXTRA_PAGES_MAX, EXTRA_ROWS_MAX, EXTRA_TITLE_MAX, EXTRA_CONTENT_MAX, clockUserTexts,
} from './clockSlides';

describe('K단계 슬라이드 순서표 — 시상 → 추가 A → 추가 B → 광고', () => {
  it('평소: 시상 30초 → 광고 10초', () => {
    const s = slideSegments({ prizeSheets: 1, extraCount: 0, hasAd: true });
    expect(s.map((x) => [x.kind, x.ms])).toEqual([['prize', PAGE_MS], ['ad', AD_MS]]);
    expect(slideAt(s, 0).sheet).toBe(0);
    expect(slideAt(s, 29_999).sheet).toBe(0);
    expect(slideAt(s, 30_000).sheet).toBe(1);     // 광고
    expect(slideAt(s, 39_999).sheet).toBe(1);
    expect(slideAt(s, 40_000)).toMatchObject({ sheet: 0, cycle: 1 });
  });
  it('바운티 게임: 시상 30 → 추가 30 → 광고 10 (광고는 매장이 못 바꾸는 10초)', () => {
    const s = slideSegments({ prizeSheets: 1, extraCount: 1, hasAd: true });
    expect(s.map((x) => [x.kind, x.ms])).toEqual([['prize', 30_000], ['extra', 30_000], ['ad', 10_000]]);
    expect(slideAt(s, 45_000)).toMatchObject({ seg: 1, sheet: 1, msLeft: 15_000 });
    expect(slideAt(s, 65_000)).toMatchObject({ seg: 2, sheet: 2, msLeft: 5_000 });
  });
  it('없는 것은 건너뛴다 — 시상 없음 · 추가 2장 · 광고 없음', () => {
    const s = slideSegments({ prizeSheets: 0, extraCount: 2, hasAd: false });
    expect(s.map((x) => x.kind)).toEqual(['extra', 'extra']);
    expect(slideAt(s, 31_000).sheet).toBe(1);
  });
  it('추가 페이지는 최대 2장', () => {
    expect(slideSegments({ prizeSheets: 1, extraCount: 5, hasAd: false }).filter((x) => x.kind === 'extra')).toHaveLength(EXTRA_PAGES_MAX);
  });
  it('한 장뿐이면 정지(msLeft = Infinity)', () => {
    expect(slideAt(slideSegments({ prizeSheets: 1, extraCount: 0, hasAd: false }), 123_456).msLeft).toBe(Infinity);
    expect(slideAt(slideSegments({ prizeSheets: 0, extraCount: 0, hasAd: true }), 5).msLeft).toBe(Infinity);
    expect(slideAt([], 0).seg).toBe(-1);
  });
  it('시상 2장만 — 종전과 같은 7초 순환이 칸 경계에서 끊기지 않는다', () => {
    const s = slideSegments({ prizeSheets: 2, extraCount: 0, hasAd: false });
    expect(s[0].ms % (2 * PRIZE_SHEET_MS)).toBe(0);
    const seq = Array.from({ length: 20 }, (_, i) => slideAt(s, i * PRIZE_SHEET_MS + 1).sheet);
    expect(seq).toEqual(Array.from({ length: 20 }, (_, i) => i % 2));
    expect(slideAt(s, 0).msLeft).toBe(PRIZE_SHEET_MS);
  });
  it('시상 2장 + 광고 — 시상 장 뒤에 광고 장(트랙 장 번호 2)', () => {
    const s = slideSegments({ prizeSheets: 2, extraCount: 0, hasAd: true });
    expect(sheetCount(s)).toBe(3);
    expect(slideAt(s, 7_001).sheet).toBe(1);
    expect(slideAt(s, s[0].ms + 1).sheet).toBe(2);
  });
  it('여러 TV 가 같은 서버 시각이면 같은 장 · 음수 시각도 바르게 돈다', () => {
    const s = slideSegments({ prizeSheets: 1, extraCount: 2, hasAd: true });
    const t = 1_727_654_321_000;
    expect(slideAt(s, t)).toEqual(slideAt(s, t));
    expect(slideAt(s, -1).seg).toBe(s.length - 1);
  });
  it('광고는 한 바퀴에 하나씩 순번', () => {
    expect([0, 1, 2, 3, 4].map((c) => adIndexAt(3, c))).toEqual([0, 1, 2, 0, 1]);
    expect(adIndexAt(0, 7)).toBe(-1);
    expect(adIndexAt(2, -1)).toBe(1);
  });
});

describe('W-11 팀 합산 점수 — 깐부(1st 14 … 12th 1)', () => {
  const pts = [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  it('팀원 등수 점수를 더해 팀 순위를 매긴다', () => {
    const r = teamStandings(pts, [
      { label: 'A팀', content: '2, 9', note: '김·이' },   // 12 + 4 = 16
      { label: 'B팀', content: '1, 12' },                // 14 + 1 = 15
      { label: 'C팀', content: '3·4' },                  // 10 + 9 = 19
    ]);
    expect(r.map((x) => [x.rank, x.team, x.total])).toEqual([[1, 'C팀', 19], [2, 'A팀', 16], [3, 'B팀', 15]]);
    expect(r[1].note).toBe('김·이');
  });
  it('동점은 같은 순위(1·1·3), 표 밖 등수는 0점', () => {
    const r = teamStandings(pts, [{ label: 'X', content: '1' }, { label: 'Y', content: '1' }, { label: 'Z', content: '13, 20' }]);
    expect(r.map((x) => [x.rank, x.team, x.total])).toEqual([[1, 'X', 14], [1, 'Y', 14], [3, 'Z', 0]]);
  });
  it('등수 입력 파싱', () => {
    expect(parsePlaces('1, 7')).toEqual([1, 7]);
    expect(parsePlaces('1 · 7 ')).toEqual([1, 7]);
    expect(parsePlaces('0, -3, x')).toEqual([3]);
  });
});

describe('상한 — 서버 트리거와 같은 수', () => {
  it('페이지 2장 · 줄 상한 · 글자 길이로 자른다 · 모르는 종류는 custom', () => {
    const many = Array.from({ length: 4 }, () => ({ kind: 'weird' as never, title: 'x'.repeat(99), rows: Array.from({ length: 30 }, () => ({ label: 'l'.repeat(99), content: 'c'.repeat(99) })) }));
    const c = clampExtraPages(many);
    expect(c).toHaveLength(EXTRA_PAGES_MAX);
    expect(c[0].kind).toBe('custom');
    expect(c[0].rows).toHaveLength(EXTRA_ROWS_MAX);
    expect(c[0].title.length).toBe(EXTRA_TITLE_MAX);
    expect(c[0].rows[0].content.length).toBe(EXTRA_CONTENT_MAX);
  });
  it('빈 페이지는 보이지 않는다', () => {
    expect(visibleExtraPages([{ kind: 'notice', title: 't', rows: [{ label: ' ', content: '' }] }])).toHaveLength(0);
    expect(visibleExtraPages(null)).toHaveLength(0);
  });
  it('스칼라·null 행과 숫자 이름표가 섞여도 TV 가 깨지지 않는다(critical P3)', () => {
    const bad = [{ kind: 'notice', title: 7, rows: [null, 'x', { label: 12, content: null }, { label: 'ok', content: '내용' }] }] as never;
    const v = visibleExtraPages(bad);
    expect(v).toHaveLength(1);
    expect(v[0].rows).toEqual([{ label: '12', content: '' }, { label: 'ok', content: '내용' }]);
    expect(v[0].title).toBe('7');
  });
  it('§28 검사 대상 글자 — 시상 문구·메모 + 추가 페이지 제목·이름표·내용·메모', () => {
    expect(clockUserTexts([{ text: 'a', note: 'b' }, {}], [{ kind: 'notice', title: 'c', rows: [{ label: 'd', content: 'e', note: 'f' }] }]))
      .toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('상한 = TV 왼쪽 칸에 한 줄로 다 보이는 길이(design-reviewer 2026-09-30 ②③)', () => {
  it('제목(최소 3.2cqmin)·내용(2.1)·이름표(1.7)·메모(1.3)·시상 문구(1등 2.5) 가 칸 폭 PRIZE_COL_CQ 안에 든다(한글 0.95em)', async () => {
    const { PRIZE_COL_CQ } = await import('../components/features/clock/prizeFit');
    const S = await import('./clockSlides');
    const w = (chars: number, cq: number) => chars * 0.95 * cq;
    expect(w(S.EXTRA_TITLE_MAX, 3.2)).toBeLessThanOrEqual(PRIZE_COL_CQ);
    expect(w(S.EXTRA_CONTENT_MAX, 2.1)).toBeLessThanOrEqual(PRIZE_COL_CQ);
    expect(w(S.EXTRA_LABEL_MAX + 4, 1.7)).toBeLessThanOrEqual(PRIZE_COL_CQ);   // 팀 '10. ' 포함
    expect(w(S.EXTRA_NOTE_MAX, 1.3)).toBeLessThanOrEqual(PRIZE_COL_CQ);
    expect(w(S.PRIZE_TEXT_MAX, 2.5) + 5).toBeLessThanOrEqual(PRIZE_COL_CQ);   // + 등수 칸
  });
});
