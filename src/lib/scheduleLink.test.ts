import { describe, expect, it } from 'vitest';
import { resolveScheduleLink } from './scheduleLink';

const list = [{ id: 'a', title: '메인' }, { id: 'b', title: '사이드' }];

describe('resolveScheduleLink', () => {
  it('목록에 있으면 그 대회를 그대로 연다', () => {
    const r = resolveScheduleLink(list, 'b');
    expect(r).toEqual({ kind: 'open', schedule: list[1] });
  });

  it('목록에 없으면 단건 조회로 넘긴다 — 없다고 단정하지 않는다', () => {
    expect(resolveScheduleLink(list, 'zzz')).toEqual({ kind: 'lookup', id: 'zzz' });
  });

  it('단건 조회가 돌려주면 연다', () => {
    const fetched = { id: 'zzz', title: '뒤늦게 찾은 대회' };
    expect(resolveScheduleLink(list, 'zzz', fetched)).toEqual({ kind: 'open', schedule: fetched });
  });

  it('단건 조회에도 없으면(내려감·승인 전 = 권한 없음) 확인 불가', () => {
    expect(resolveScheduleLink(list, 'zzz', null)).toEqual({ kind: 'unavailable' });
  });

  it('id 가 비어 있으면 확인 불가 — 목록 첫 행으로 흘러가지 않는다', () => {
    expect(resolveScheduleLink(list, '')).toEqual({ kind: 'unavailable' });
    expect(resolveScheduleLink(list, null)).toEqual({ kind: 'unavailable' });
    expect(resolveScheduleLink(list, '   ')).toEqual({ kind: 'unavailable' });
  });

  it('제목이 같아도 id 가 다르면 연결하지 않는다', () => {
    const same = [{ id: 'a', title: '메인' }, { id: 'c', title: '메인' }];
    expect(resolveScheduleLink(same, 'd')).toEqual({ kind: 'lookup', id: 'd' });
  });

  it('요청한 id 와 다른 행이 돌아오면 열지 않는다', () => {
    expect(resolveScheduleLink(list, 'zzz', { id: 'a', title: '메인' })).toEqual({ kind: 'unavailable' });
  });
});
