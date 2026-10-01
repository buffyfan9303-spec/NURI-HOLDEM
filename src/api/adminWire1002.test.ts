// L-03 (audit-link-1002) — 서버만 고쳐졌던 관리자 호출부 3곳이 **서버 함수를 부르는가**.
//   ① 광고 순서 교환  → swap_community_ad_slots (20261001g)  — 두 요청(비우기→upsert) 금지
//   ② 가입 거절       → admin_reject_signup (20261001f)      — profiles.status='banned' 직접 저장 금지
//   ③ 매장 삭제       → 기록 있는 매장은 admin_set_venue_archived (20261001d) 로 안내
// 정규식 계약은 문장의 존재만 보고 도달은 못 본다 — 여기서는 supabase 를 mock 해 **실제로 나간 호출**을 본다.
// 실행: npx vitest run src/api/adminWire1002.test.ts --maxWorkers=4
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
let rpcError: { message: string } | null = null;
let deleteError: { message: string } | null = null;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn: () => {},
  clearAuthStorage: () => {},
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}:${JSON.stringify(args)}`);
      return { data: null, error: rpcError };
    },
    // 옛 직접 쓰기 경로가 살아 있으면 여기에 흔적이 남는다
    from: (table: string) => {
      const q = {
        update: () => { calls.push(`update:${table}`); return q; },
        upsert: () => { calls.push(`upsert:${table}`); return q; },
        delete: () => { calls.push(`delete:${table}`); return q; },
        eq: () => q,
        select: () => Promise.resolve({ data: deleteError ? null : [{ id: 'v1' }], error: deleteError }),
        then: (res: (v: { error: unknown }) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return q;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'admin' } } }, error: null }) },
    functions: { invoke: async (fn: string) => { calls.push(`fn:${fn}`); return { data: { sent: true }, error: null }; } },
  },
}));
vi.mock('./_session', () => ({ currentUser: async () => ({ id: 'admin' }) }));

const { swapAdSlots } = await import('./ads');
const { adminRejectSignup } = await import('./auth');
const { adminSetVenueArchived, isVenueHasRecordsError } = await import('./community');
const { removeOrArchiveVenue } = await import('../lib/venueRemove');

const slot = (n: number) => ({ slot: n, postId: `p${n}`, active: true, startsAt: '', expiresAt: '' }) as never;

beforeEach(() => { calls.length = 0; rpcError = null; deleteError = null; vi.unstubAllGlobals(); });

describe('① swapAdSlots — RPC 한 번, 직접 쓰기 없음', () => {
  it('swap_community_ad_slots 하나만 부르고 community_ads 에 직접 쓰지 않는다', async () => {
    await swapAdSlots(slot(1), slot(2));
    expect(calls).toEqual(['rpc:swap_community_ad_slots:{"p_slot_a":1,"p_slot_b":2}']);
  });
  it('서버가 실패하면 던진다(부분 성공으로 말하지 않는다)', async () => {
    rpcError = { message: '교환할 두 슬롯(1~5, 서로 다름)이 필요합니다' };
    await expect(swapAdSlots(slot(1), slot(2))).rejects.toThrow('교환할 두 슬롯');
  });
});

describe('② adminRejectSignup — admin_reject_signup 만 부른다', () => {
  it('RPC 로만 나가고 profiles 직접 update·거절 메일은 없다', async () => {
    await adminRejectSignup('u-1', '가입 심사 거절');
    expect(calls).toEqual(['rpc:admin_reject_signup:{"p_user_id":"u-1","p_reason":"가입 심사 거절"}']);
  });
  it('서버가 거부하면(대기 회원 아님) 던진다', async () => {
    rpcError = { message: '가입 심사 대기 중인 회원이 아닙니다' };
    await expect(adminRejectSignup('u-1')).rejects.toThrow('대기 중인 회원이 아닙니다');
  });
});

describe('③ 매장 삭제 — 기록이 있으면 숨김(보관)으로 안내', () => {
  const venue = { id: 'v-1', name: '테스트펍', status: 'active' as const };
  const HAS_RECORDS = { message: '장부·이용권·출석 등 기록이 있는 매장은 삭제할 수 없습니다 — 숨김(보관)으로 전환하세요 (ledger_buyins)' };

  it('adminSetVenueArchived 는 admin_set_venue_archived 를 부른다', async () => {
    await adminSetVenueArchived('v-1', true, '사유');
    expect(calls).toEqual(['rpc:admin_set_venue_archived:{"p_venue_id":"v-1","p_archived":true,"p_reason":"사유"}']);
  });
  it('isVenueHasRecordsError 는 서버 메시지만 알아본다(Error·PostgREST 객체 둘 다)', () => {
    expect(isVenueHasRecordsError(new Error(HAS_RECORDS.message))).toBe(true);
    expect(isVenueHasRecordsError(HAS_RECORDS)).toBe(true);
    expect(isVenueHasRecordsError(new Error('네트워크 오류'))).toBe(false);
    expect(isVenueHasRecordsError(null)).toBe(false);
  });
  it('기록 없는 매장은 지금처럼 삭제된다(기능 보존) — 보관 RPC 는 안 부른다', async () => {
    vi.stubGlobal('confirm', () => true);
    expect(await removeOrArchiveVenue(venue)).toBe('deleted');
    expect(calls).toEqual(['delete:venues']);
  });
  it('기록 있는 매장: 삭제가 거부되면 보관을 권하고, 승낙하면 admin_set_venue_archived 로 간다', async () => {
    deleteError = HAS_RECORDS;
    const prompts: string[] = [];
    vi.stubGlobal('confirm', (m: string) => { prompts.push(m); return true; });
    expect(await removeOrArchiveVenue(venue)).toBe('archived');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('기록이 있어 삭제할 수 없습니다');
    expect(calls.filter((c) => c.startsWith('rpc:'))).toEqual([expect.stringContaining('rpc:admin_set_venue_archived:{"p_venue_id":"v-1","p_archived":true')]);
  });
  it('보관 제안을 거절하면 아무것도 바꾸지 않는다', async () => {
    deleteError = HAS_RECORDS;
    let n = 0;
    vi.stubGlobal('confirm', () => (++n === 1));   // 첫 확인(삭제)만 승낙
    expect(await removeOrArchiveVenue(venue)).toBe('cancelled');
    expect(calls.some((c) => c.startsWith('rpc:'))).toBe(false);
  });
  it('이미 숨김인 매장은 이유를 던지고 보관 RPC 를 또 부르지 않는다', async () => {
    deleteError = HAS_RECORDS;
    vi.stubGlobal('confirm', () => true);
    await expect(removeOrArchiveVenue({ ...venue, status: 'hidden' })).rejects.toThrow('이미 숨김');
    expect(calls.some((c) => c.startsWith('rpc:'))).toBe(false);
  });
  it('다른 삭제 실패는 숨김으로 위장하지 않고 그대로 던진다', async () => {
    deleteError = { message: 'permission denied' };
    vi.stubGlobal('confirm', () => true);
    await expect(removeOrArchiveVenue(venue)).rejects.toMatchObject({ message: 'permission denied' });
    expect(calls.some((c) => c.startsWith('rpc:'))).toBe(false);
  });
  it('첫 확인을 취소하면 삭제 요청도 나가지 않는다', async () => {
    vi.stubGlobal('confirm', () => false);
    expect(await removeOrArchiveVenue(venue)).toBe('cancelled');
    expect(calls).toEqual([]);
  });
});
