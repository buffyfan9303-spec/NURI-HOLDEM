// 내 매장 점검 1001 수정분의 순수 규칙 — S-06 · S-10 · S-12 · S-15 (audit-store-1001.md).
import { describe, expect, it } from 'vitest';
import { mainEventChip, rankingSaveTarget } from './rankingGame';
import { voucherLeftover } from './buyinApproval';
import { venueHiddenFromGuests } from './venueHidden';
import { encodeImage, extOf } from './storage';

describe('S-10 mainEventChip — 메인 게임 칩은 하나, 저장 이름은 클락 END 와 같다', () => {
  const T = '수요 딥스택 1000만 GTD';
  it('저장분이 없으면 제목으로 저장', () => {
    expect(mainEventChip(T, [])).toEqual({ label: T, target: T, split: false });
  });
  it("옛 저장분이 ''(기본)에만 있으면 그 이름으로 저장 — 새 이름으로 두 벌을 만들지 않는다", () => {
    expect(mainEventChip(T, ['', ''])).toEqual({ label: T, target: '', split: false });
  });
  it('두 이름 모두에 행이 있으면 split — 정리할 수 있게 두 칩을 보인다', () => {
    expect(mainEventChip(T, ['', T])?.split).toBe(true);
  });
  it('제목을 모르면 null(종전 메인(기본) 칩)', () => {
    expect(mainEventChip('  ', [''])).toBeNull();
  });
  it('클락 END 의 저장 이름과 항상 같다', () => {
    for (const saved of [[], [''], [T], ['', T], ['사이드1']]) {
      expect(mainEventChip(T, saved)?.target).toBe(rankingSaveTarget({ gameSeq: 1, title: T }, saved).eventName);
    }
  });
});

describe('S-15 voucherLeftover — 같은 손님·같은 날의 남은 이용권 요청만 센다', () => {
  const a = { id: 'a', userId: 'u1', voucherId: 'v1', sessionDate: '2026-10-01' };
  it('남은 이용권 요청 수', () => {
    expect(voucherLeftover(a, [
      { id: 'a', userId: 'u1', voucherId: 'v1', sessionDate: '2026-10-01' },           // 방금 승인한 것
      { id: 'b', userId: 'u1', voucherId: 'v2', sessionDate: '2026-10-01' },           // 남음
      { id: 'c', userId: 'u1', voucherId: null, sessionDate: '2026-10-01' },           // 현금 요청
      { id: 'd', userId: 'u2', voucherId: 'v3', sessionDate: '2026-10-01' },           // 다른 손님
      { id: 'e', userId: 'u1', voucherId: 'v4', sessionDate: '2026-09-30' },           // 다른 날
      { id: 'f', userId: 'u1', voucherId: 'v5', sessionDate: '2026-10-01', status: 'rejected' },
    ])).toBe(1);
  });
  it('이용권 요청이 아니거나 회원이 아니면 0', () => {
    expect(voucherLeftover({ ...a, voucherId: null }, [{ ...a, id: 'b' }])).toBe(0);
    expect(voucherLeftover({ ...a, userId: null }, [{ ...a, id: 'b', userId: null }])).toBe(0);
  });
});

describe('S-06 venueHiddenFromGuests — 서버 venue_is_hidden(status ≠ active)과 같은 판정', () => {
  it.each([['active', false], [undefined, false], [null, false], ['hidden', true], ['suspended', true], ['inactive', true]] as const)('%s → %s', (s, want) => {
    expect(venueHiddenFromGuests(s)).toBe(want);
  });
});

describe('S-12 encodeImage — webp 를 못 만드는 브라우저(PNG 를 돌려줌)는 jpeg 로 바꾼다', () => {
  const fakeCanvas = (supportsWebp: boolean) => {
    const calls: string[] = [];
    const c = { toBlob: (cb: (b: Blob | null) => void, type: string) => {
      calls.push(type);
      const out = type === 'image/webp' && !supportsWebp ? 'image/png' : type;
      cb(new Blob(['x'], { type: out }));
    } } as unknown as HTMLCanvasElement;
    return { c, calls };
  };
  it('webp 지원: 한 번에 webp', async () => {
    const { c, calls } = fakeCanvas(true);
    const b = await encodeImage(c, 0.8);
    expect([b?.type, calls]).toEqual(['image/webp', ['image/webp']]);
    expect(extOf(b!)).toBe('webp');
  });
  it('webp 미지원: PNG 대신 jpeg, 확장자 jpg', async () => {
    const { c, calls } = fakeCanvas(false);
    const b = await encodeImage(c, 0.8);
    expect([b?.type, calls]).toEqual(['image/jpeg', ['image/webp', 'image/jpeg']]);
    expect(extOf(b!)).toBe('jpg');
  });
});
