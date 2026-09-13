// 이벤트 캠페인 slug(§4) — 씨앗은 slug 별로 격리되고, 밖에서 들어온 slug 는 허용 목록으로 좁힌다.
//
// 왜 잠그나: 씨앗이 변수 하나이던 시절엔 캠페인이 둘이 되는 순간 A 를 보고 온 사람의 B 딥링크에
//   A 의 제목·카드·참여권이 첫 프레임에 그대로 떴다. 화면은 '이미 열려 있는 카드'를 그리는데
//   서버는 다른 판이라 누르는 족족 실패한다 — 씨앗이 빈 화면을 없애려다 헛클릭을 만든 꼴이다.
import { describe, it, expect, beforeEach } from 'vitest';
import { CARD_EVENT_SLUG, cachedEventBoard, isEventSlug, rememberEventBoard, type EventBoard } from './events';

const board = (slug: string, title: string): EventBoard => ({
  slug, title, subtitle: null, status: 'live', venueId: 'v1', startsAt: null, endsAt: null,
  voucherTitle: '매장이용권', cards: [], myTickets: 0, remainByTier: {}, totalByTier: {}, voucherByTier: {},
});

beforeEach(() => {
  rememberEventBoard(CARD_EVENT_SLUG, null);
  rememberEventBoard('spring-2027', null);
});

describe('씨앗 — 캠페인마다 자기 자리', () => {
  it('넣은 slug 로만 나온다', () => {
    rememberEventBoard(CARD_EVENT_SLUG, board(CARD_EVENT_SLUG, '오픈 기념'));
    expect(cachedEventBoard(CARD_EVENT_SLUG)?.title).toBe('오픈 기념');
  });

  it('🔴 다른 캠페인의 씨앗을 내주지 않는다 — 첫 프레임에 남의 이벤트가 뜨면 헛클릭이 된다', () => {
    rememberEventBoard(CARD_EVENT_SLUG, board(CARD_EVENT_SLUG, '오픈 기념'));
    expect(cachedEventBoard('spring-2027'),
      '다른 slug 인데 씨앗이 나왔다 — 씨앗이 slug 별로 나뉘어 있지 않다').toBeNull();
  });

  it('인자를 안 주면 기본 캠페인 — 홈 배너로 들어가는 경로의 씨앗이 그대로 산다', () => {
    rememberEventBoard(CARD_EVENT_SLUG, board(CARD_EVENT_SLUG, '오픈 기념'));
    expect(cachedEventBoard(), '기본 인자 경로가 씨앗을 못 찾는다 — 배너 진입에 로딩판이 되돌아온다')
      .not.toBeNull();
  });

  it('보드가 null 로 오면 그 자리는 비운다 — 끝난 이벤트가 씨앗으로 남지 않게', () => {
    rememberEventBoard(CARD_EVENT_SLUG, board(CARD_EVENT_SLUG, '오픈 기념'));
    rememberEventBoard(CARD_EVENT_SLUG, null);
    expect(cachedEventBoard(CARD_EVENT_SLUG)).toBeNull();
  });
});

describe('🔴 slug 허용 목록 — `?event=` 로 밖에서 들어오는 값이다', () => {
  it('정상 slug 는 통과한다', () => {
    for (const ok of [CARD_EVENT_SLUG, 'spring-2027', 'a', 'A1_b-2']) {
      expect(isEventSlug(ok), `${ok} 가 막혔다`).toBe(true);
    }
  });

  it.each([
    '', '  ', '-lead', '/admin', '//evil.com', '../secret', 'a/b', 'a?b=1', 'a#f', 'a b',
    'javascript:alert(1)', '％2F', '／／evil.com', '한글', 'x'.repeat(65), null, undefined, 1, {},
  ])('%s 는 slug 가 아니다', (bad) => {
    expect(isEventSlug(bad), `${String(bad)} 가 통과했다`).toBe(false);
  });
});
