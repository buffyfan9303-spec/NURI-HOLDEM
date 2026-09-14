// '지금 열려 있는 캠페인' 고르기 + 홈 중복 제거 — 2026-09-15 오너 보고("이벤트가 있는데 PC 이벤트 탭엔 없음")의 계약.
//
// 무엇을 잠그나
//   ① 고정 slug 로 돌아가지 않는다 — 진행 중인 판이 있으면 그걸 고른다.
//   ② 경계는 서버와 같다: 시작 시각 **포함**, 종료 시각 **미포함**(evaluateEvent 하나만 쓴다).
//   ③ 초안·숨김·종료는 고르지 않는다. 진행 중이 없으면 **가장 먼저 시작할 예정**인 판.
//   ④ 홈 중복 제거는 '이벤트 링크가 있으면' 이 아니라 '**같은 캠페인**이면'.
import { describe, expect, it } from 'vitest';
import { pickCurrentEvent, type EventCampaignRow } from './events';
import { bannerCoversEvent, eventParamOf } from '../lib/eventSlug';

const NOW = Date.parse('2026-09-15T00:00:00Z');
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const row = (over: Partial<EventCampaignRow> & { slug: string }): EventCampaignRow => ({
  status: 'live', hidden_at: null, starts_at: at(-24), ends_at: at(24), ...over,
});

describe('pickCurrentEvent — 지금 열려 있는 캠페인', () => {
  it('🔴 진행 중인 판을 고른다(고정 slug 로 돌아가지 않는다)', () => {
    expect(pickCurrentEvent([row({ slug: 'rotiarena-attend' })], NOW)).toBe('rotiarena-attend');
  });

  it('🔴 아무것도 없으면 null — 옛 기본 캠페인을 지어내지 않는다', () => {
    expect(pickCurrentEvent([], NOW)).toBeNull();
    expect(pickCurrentEvent(null, NOW)).toBeNull();
  });

  it('🔴 시작 시각은 포함, 종료 시각은 미포함(서버 open_event_card 와 같은 경계)', () => {
    const r = [row({ slug: 'edge', starts_at: at(0), ends_at: at(1) })];
    expect(pickCurrentEvent(r, NOW), '시작 정각인데 안 열린다').toBe('edge');
    expect(pickCurrentEvent(r, NOW + 3_600_000), '종료 정각에 아직 열려 있다').toBeNull();
  });

  it('🔴 초안·숨김·종료·기간만료는 고르지 않는다', () => {
    expect(pickCurrentEvent([row({ slug: 'draft', status: 'draft' })], NOW)).toBeNull();
    expect(pickCurrentEvent([row({ slug: 'hidden', hidden_at: at(-1) })], NOW)).toBeNull();
    expect(pickCurrentEvent([row({ slug: 'over', status: 'ended' })], NOW)).toBeNull();
    expect(pickCurrentEvent([row({ slug: 'past', starts_at: at(-48), ends_at: at(-24) })], NOW)).toBeNull();
  });

  it('🔴 진행 중이 여럿이면 가장 최근에 시작한 것', () => {
    const rows = [row({ slug: 'old', starts_at: at(-48) }), row({ slug: 'newer', starts_at: at(-2) })];
    expect(pickCurrentEvent(rows, NOW)).toBe('newer');
    expect(pickCurrentEvent([...rows].reverse(), NOW), '순서에 따라 답이 달라진다').toBe('newer');
  });

  it('🔴 진행 중이 없으면 가장 먼저 시작할 예정인 것(홈이 "곧 시작"을 말할 수 있게)', () => {
    const rows = [
      row({ slug: 'later', starts_at: at(48), ends_at: at(72) }),
      row({ slug: 'sooner', starts_at: at(2), ends_at: at(72) }),
    ];
    expect(pickCurrentEvent(rows, NOW)).toBe('sooner');
  });

  it('🔴 진행 중이 예정보다 먼저다', () => {
    const rows = [row({ slug: 'soon', starts_at: at(1), ends_at: at(48) }), row({ slug: 'now' })];
    expect(pickCurrentEvent(rows, NOW)).toBe('now');
  });

  it('🔴 이상한 slug 는 고르지 않는다(주소에 그대로 실리는 값이다)', () => {
    expect(pickCurrentEvent([{ slug: '../x', status: 'live', starts_at: at(-1), ends_at: at(1) }], NOW)).toBeNull();
  });
});

describe('bannerCoversEvent — 홈 이벤트 슬라이드 중복 제거', () => {
  it('🔴 같은 캠페인 배너는 중복이다', () => {
    expect(bannerCoversEvent(['/?event=rotiarena-attend'], 'rotiarena-attend', false)).toBe(true);
  });

  it('🔴 **다른** 캠페인 배너는 중복이 아니다 — 이게 진입을 지우던 버그였다', () => {
    expect(bannerCoversEvent(['/?event=spring-2027'], 'rotiarena-attend', false)).toBe(false);
  });

  it('🔴 옛 링크 ?event=1·true 는 "지금 열려 있는 판" 이라 늘 중복이다', () => {
    expect(bannerCoversEvent(['/?event=1'], 'rotiarena-attend', false)).toBe(true);
    expect(bannerCoversEvent(['/?event=true'], null, true)).toBe(true);
  });

  it('🔴 아직 어느 판인지 모르면 중복으로 본다(같은 곳으로 가는 칸을 둘 그리지 않는다)', () => {
    expect(bannerCoversEvent(['/?event=whatever'], undefined, true)).toBe(true);
  });

  it('🔴 이벤트 링크가 아니면 관여하지 않는다', () => {
    expect(bannerCoversEvent(['/?tab=live', null, undefined, '', '/?event='], 'x', true)).toBe(false);
  });

  it('🔴 eventParamOf — 값만 꺼낸다', () => {
    expect(eventParamOf('/?a=1&event=abc#top')).toBe('abc');
    expect(eventParamOf('/?eventual=1')).toBeNull();
  });
});
