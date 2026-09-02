// hand.ts 단위 테스트 — 리플레이어 → 글쓰기 폼 → 글 본문 → 상세 렌더가 같은 마커를 공유한다는 계약.
// encodeReplay 로 붙인 마커를 parseAttachments 가 원본 데이터로 되돌리지 못하면 첨부가 조용히 사라진다.
import { describe, it, expect } from 'vitest';
import { encodeReplay, parseAttachments, type ReplayData } from './hand';

describe('encodeReplay ↔ parseAttachments', () => {
  it('팟·스트리트 액션(한글·구분자 포함)까지 왕복한다', () => {
    const replay: ReplayData = {
      hero: ['As', 'Ks'], villain: ['Qh', 'Qd'], board: ['Qs', '7s', '2h', '9c', 'Js'],
      pot: '12.5bb',
      actions: { pre: '내가 3벳; 상대 콜', flop: '상대 체크, 내가 벳', river: '상대 벳=올인' },
    };
    const body = '이 리버 레이즈 맞나요?';
    const encoded = encodeReplay(body, replay);
    const parsed = parseAttachments(encoded);
    expect(parsed.text).toBe(body);
    expect(parsed.hand).toBeNull();
    expect(parsed.replay).toEqual(replay);
  });

  it('보드 0장(프리플랍 질문)도 팟·프리플랍 액션을 잃지 않고 왕복한다', () => {
    const replay: ReplayData = { hero: ['Ah', 'Kd'], villain: [], board: [], pot: '40bb', actions: { pre: '상대 3벳, 내가 올인' } };
    const parsed = parseAttachments(encodeReplay('콜이 맞나요?', replay));
    expect(parsed.text).toBe('콜이 맞나요?');
    expect(parsed.replay).toEqual(replay);
  });

  it('카드가 하나도 없으면 마커를 붙이지 않는다', () => {
    const r: ReplayData = { hero: [], villain: [], board: [], actions: {} };
    expect(encodeReplay('본문', r)).toBe('본문');
    expect(parseAttachments('본문').replay).toBeNull();
  });
});
