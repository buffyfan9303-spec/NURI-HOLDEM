// F6 재현/고정 — getDealerShifts 가 조회 실패를 빈 배열로 resolve 하던 결함 (2026-09-13).
//
// 재현: `const { data } = await supabase.from('dealer_shifts')…` 는 error 를 구조분해조차 안 해서
//   RLS 거부·네트워크 순단·타임아웃이 전부 data=null → `return []` 로 **성공처럼** 돌아왔다.
//   형제 staffSchedule.getStaffSchedule 과 같은 파일의 addDealerShift 는 `if (error) throw error` 인데 이 함수만 예외였다.
//   호출부 StaffPayroll:133 · StoreDashboard:303 의 `.catch` 는 실행될 일이 없는 죽은 코드였고, 정산 화면은
//   dealerPay=0 → `dealerPay > 0` 가드 때문에 '딜러' 분해 줄까지 사라져 빠졌다는 힌트조차 없었다.
// 고침: `const { data, error } = …; if (error) throw error;` + 호출부가 dealerErr 를 들어 '—'/배너로 표시
//   (배선은 src/components/features/laborLoadFailure.contract.test.ts 가 잠근다).
//
// 음성 대조: dealerShifts.ts 의 `if (error) throw error;`(getDealerShifts) 를 지우면 🔴 두 검사가 실패한다 —
//   실패 메시지에 `[]` 로 resolve 된 것이 그대로 찍힌다.
// 실행: npx vitest run src/api/dealerShifts.errorPropagation.test.ts
import { describe, it, expect, vi } from 'vitest';

const RLS_DENIED = { message: 'permission denied for table dealer_shifts', code: '42501' };
const NET_DOWN = { message: 'TypeError: Failed to fetch' };

function makeSupabaseMock(opts: { error?: unknown; rows?: unknown[] }) {
  return {
    IS_MOCK: false,
    supabase: {
      from: () => {
        const q = {
          select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q,
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve({ data: opts.error ? null : (opts.rows ?? []), error: opts.error ?? null }),
        };
        return q;
      },
    },
  };
}

describe('getDealerShifts — 조회 실패를 빈 배열(=딜러 인건비 0)로 위장하지 않는다', () => {
  it('🔴 RLS 거부(42501)는 그대로 던진다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ error: RLS_DENIED }));
    const { getDealerShifts } = await import('./dealerShifts');
    await expect(getDealerShifts('venue-1', '2026-09-01', '2026-09-30')).rejects.toMatchObject({ code: '42501' });
  });

  it('🔴 네트워크 끊김도 던진다 — 예전엔 [] 로 resolve 돼 정산 화면의 딜러 줄이 통째로 사라졌다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ error: NET_DOWN }));
    const { getDealerShifts } = await import('./dealerShifts');
    await expect(getDealerShifts('venue-1', '2026-09-01', '2026-09-30')).rejects.toBeTruthy();
  });

  it('성공은 행 매핑 — 실제 0건은 여전히 [] 다(실패와 구분되는 유일한 0건)', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rows: [{ id: 'd1', venue_id: 'venue-1', dealer_name: '김딜러', shift_date: '2026-09-02', start_time: '18:00', end_time: '02:00', hourly_wage: 15000 }] }));
    const { getDealerShifts } = await import('./dealerShifts');
    await expect(getDealerShifts('venue-1', '2026-09-01', '2026-09-30')).resolves.toEqual([
      { id: 'd1', venueId: 'venue-1', dealerName: '김딜러', shiftDate: '2026-09-02', startTime: '18:00', endTime: '02:00', tableNo: null, hourlyWage: 15000, memo: null },
    ]);
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rows: [] }));
    const again = await import('./dealerShifts');
    await expect(again.getDealerShifts('venue-1', '2026-09-01', '2026-09-30')).resolves.toEqual([]);
  });
});
