// N07(2026-09-12) 재현·수정 검증 — 글 본문은 이미 INSERT 됐는데(postId 발급) 핸드·투표 저장이
// 실패하면 그냥 닫아버렸다. 다음에 글쓰기를 열면 폼이 초기화돼 실패한 초안이 통째로 사라지고,
// 사용자가 처음부터 다시 쓰면 본문이 한 번 더 INSERT 됐다(중복 글).
// saveAttachments 는 어떤 첨부가 실패했는지 판정하는 순수 함수 — 렌더러 없이(vitest environment: node)
// saveHand/savePoll 을 DI 로 갈아끼워 검증한다(제출 계약과 같은 관행, PostDetailModal.test.ts 참고).
import { describe, it, expect } from 'vitest';
import { saveAttachments } from './PostFormModal';
import type { HandAttachment, PollAttachment } from '../../api/postAttachments';

const hand: HandAttachment = {
  kind: 'hand', headline: '넛츠', tone: 'win', delta: undefined, meta: undefined,
  cards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'd' }],
};
const poll: PollAttachment = {
  kind: 'poll', id: '', question: '콜 vs 폴드?',
  options: [{ id: '', idx: 0, label: '콜', votes: 0 }, { id: '', idx: 1, label: '폴드', votes: 0 }],
  myOptionId: null,
};

describe('saveAttachments · N07 부분 실패 판정 계약', () => {
  it('둘 다 성공하면 handFailed·pollFailed 모두 false', async () => {
    const calls: string[] = [];
    const r = await saveAttachments('p1', hand, poll, {
      saveHand: async () => { calls.push('hand'); },
      savePoll: async () => { calls.push('poll'); },
    });
    expect(r).toEqual({ handFailed: false, pollFailed: false });
    expect(calls).toEqual(['hand', 'poll']);
  });

  it('핸드만 실패해도 투표 저장은 계속 시도한다(한쪽 실패가 다른 쪽을 막지 않는다)', async () => {
    const calls: string[] = [];
    const r = await saveAttachments('p1', hand, poll, {
      saveHand: async () => { throw new Error('DB 오류'); },
      savePoll: async () => { calls.push('poll'); },
    });
    expect(r).toEqual({ handFailed: true, pollFailed: false });
    expect(calls).toEqual(['poll']); // 투표는 실제로 호출됐다 — hand 실패가 poll 시도를 막지 않음
  });

  it('투표만 실패하면 handFailed 는 false', async () => {
    const r = await saveAttachments('p1', hand, poll, {
      saveHand: async () => {},
      savePoll: async () => { throw new Error('보기 부족'); },
    });
    expect(r).toEqual({ handFailed: false, pollFailed: true });
  });

  it('null 로 넘긴 항목은 아예 호출하지 않는다(이미 성공한 첨부를 재시도에서 건드리지 않는다는 계약)', async () => {
    const calls: string[] = [];
    // 재시도 시나리오: hand 는 1차 시도에서 이미 성공했으므로 null 을 넘겨 건드리지 않고, poll 만 재시도
    const r = await saveAttachments('p1', null, poll, {
      saveHand: async () => { calls.push('hand'); },
      savePoll: async () => { calls.push('poll'); },
    });
    expect(calls).toEqual(['poll']); // saveHand 는 호출조차 안 됐다 — null=삭제로 오인해 지우지 않는다
    expect(r).toEqual({ handFailed: false, pollFailed: false });
  });

  it('둘 다 null 이면 아무 것도 호출하지 않는다', async () => {
    const calls: string[] = [];
    const r = await saveAttachments('p1', null, null, {
      saveHand: async () => { calls.push('hand'); },
      savePoll: async () => { calls.push('poll'); },
    });
    expect(calls).toEqual([]);
    expect(r).toEqual({ handFailed: false, pollFailed: false });
  });
});
