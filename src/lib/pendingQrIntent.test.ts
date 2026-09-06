// 보류된 QR 의도 — '한 번만, 그리고 짧게' 를 고정한다.
//
// 이 로직은 양방향으로 위험하다:
//  · 못 지우면 → 30분(TTL) 안에 앱을 다시 열 때 의도가 되살아나 check_in 이 한 번 더 불린다.
//    서버의 4시간 중복 방지에 걸려 **앱을 켜자마자 빨간 토스트**가 뜬다(30분 < 4시간이라 확률이 아니라 확정).
//  · 너무 오래 살려두면 → 며칠 뒤 우연한 로그인에 출석 도장이 찍힌다. 출석은 '지금 그 매장에 있다'는
//    기록이라 그건 거짓 기록이다.
//
// 2026-09-07 결함: 소비 여부를 **URL 에 파라미터가 남아 있는지**로 판단했는데, 체크인은 URL 을 비동기로
// (RPC 응답 뒤 .finally) 지우고 바인은 동기로 지워서 양쪽으로 어긋났다 — 하나는 의도가 남고,
// 하나는 같은 커밋에서 두 번 소비됐다. 조율 신호를 저장소 자신으로 옮긴 것이 clearQrIntent 다.
import { describe, it, expect, beforeEach } from 'vitest';
import { rememberQrIntent, takeQrIntent, clearQrIntent } from './pendingQrIntent';

// vitest environment 가 'node' 라 localStorage 가 없다 — 최소 스텁(rankingDraft.test 와 같은 문법).
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const KEY = 'nuri:qr-intent';
const store = new MemStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage = store as unknown as Storage;

beforeEach(() => store.clear());

describe('보류된 QR 의도', () => {
  it('적어 둔 의도를 그대로 돌려준다', () => {
    rememberQrIntent({ kind: 'checkin', venueId: 'V1', gameSeq: null });
    expect(takeQrIntent()).toEqual({ kind: 'checkin', venueId: 'V1', gameSeq: null });
  });

  it('한 번만 소비된다 — 두 번 소비되면 출석이 두 번 찍힌다', () => {
    rememberQrIntent({ kind: 'checkin', venueId: 'V1', gameSeq: null });
    expect(takeQrIntent()).not.toBeNull();
    expect(takeQrIntent(), '두 번째 소비는 반드시 null').toBeNull();
  });

  it('🔴 clearQrIntent 로 버리면 남지 않는다 — URL 파라미터를 직접 처리한 경로가 이걸 부른다', () => {
    rememberQrIntent({ kind: 'checkin', venueId: 'V1', gameSeq: null });
    clearQrIntent();
    expect(takeQrIntent(), '남아 있으면 30분 내 재실행에서 중복 체크인이 된다').toBeNull();
  });

  it('clearQrIntent 는 적어 둔 것이 없어도 안전하다', () => {
    expect(() => clearQrIntent()).not.toThrow();
    expect(takeQrIntent()).toBeNull();
  });

  it('바인 의도는 게임 번호까지 보존한다', () => {
    rememberQrIntent({ kind: 'buyin', venueId: 'V2', gameSeq: 3 });
    expect(takeQrIntent()).toEqual({ kind: 'buyin', venueId: 'V2', gameSeq: 3 });
  });

  it('🔴 30분이 지난 의도는 버린다 — 며칠 뒤 로그인에 도장이 찍히면 거짓 기록이다', () => {
    const old = Date.now() - (30 * 60 * 1000 + 1);
    store.setItem(KEY, JSON.stringify({ kind: 'checkin', venueId: 'V1', gameSeq: null, at: old }));
    expect(takeQrIntent()).toBeNull();
  });

  it('29분 된 의도는 살아 있다 — 경계를 너무 좁히면 정상 로그인 왕복이 깨진다', () => {
    const recent = Date.now() - 29 * 60 * 1000;
    store.setItem(KEY, JSON.stringify({ kind: 'checkin', venueId: 'V1', gameSeq: null, at: recent }));
    expect(takeQrIntent()?.venueId).toBe('V1');
  });

  it('망가진 값·모르는 종류는 조용히 버린다(앱이 죽지 않는다)', () => {
    store.setItem(KEY, '{{{');
    expect(takeQrIntent()).toBeNull();
    store.setItem(KEY, JSON.stringify({ kind: 'signup', venueId: 'V1', at: Date.now() }));
    expect(takeQrIntent(), 'checkin·buyin 만 실행 대상이다').toBeNull();
    store.setItem(KEY, JSON.stringify({ kind: 'checkin', at: Date.now() }));
    expect(takeQrIntent(), 'venueId 없는 의도는 실행할 수 없다').toBeNull();
  });

  it('시각(at)이 없는 옛 형식은 버린다 — 수명을 알 수 없으면 신뢰할 수 없다', () => {
    store.setItem(KEY, JSON.stringify({ kind: 'checkin', venueId: 'V1', gameSeq: null }));
    expect(takeQrIntent()).toBeNull();
  });
});
