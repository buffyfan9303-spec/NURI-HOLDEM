// 이벤트 — 세 가지 제어의 **분리**(§8-2)와 공통 판정 함수(§8-3). 마이그레이션 20260912d.
//
// 문서 §10 이 **반드시 남기라고 지정한 회귀 두 가지**가 여기 있다:
//   ① 저장 실패를 성공처럼 표시하지 않는다      → `saveEventMenuVisible` 이 던진다(성공 값을 만들지 않는다)
//   ② 종료 시각이 지나면 참여가 차단된다        → `evaluateEvent` 의 종료 경계(미포함)
//
// 실행: npx vitest run src/api/eventVisibility.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { msgOf, isDenied } from '../lib/dbError';

// ── supabase 목 ─────────────────────────────────────────────────────────────
const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
let rpcError: { message: string; code?: string; status?: number } | null = null;
let rpcData: unknown = null;
/** app_settings 읽기 결과 — `null` 값 = 미설정. */
let settingValue: string | null = null;
let settingError: { message: string } | null = null;
let settingWrites: Array<Record<string, unknown> | undefined> = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'set_app_setting') {
        settingWrites.push(args);
        return { data: null, error: rpcError };
      }
      return { data: rpcData, error: rpcError };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: settingValue == null ? null : { value: settingValue },
            error: settingError,
          }),
        }),
      }),
    }),
  },
}));

const ev = await import('./adminEvents');
const st = await import('../lib/eventState');

beforeEach(() => {
  calls.length = 0; rpcError = null; rpcData = null;
  settingValue = null; settingError = null; settingWrites = [];
  st.resetServerTimeOffset();
});

// ── ① 공통 판정 함수 (§8-3) ──────────────────────────────────────────────────
const NOW = Date.parse('2026-09-12T12:00:00Z');
const base = {
  // ⚠ `as const` 로 좁히지 않는다 — 그러면 Partial<typeof base> 가 'live' 만 받아
  //   draft/ended 를 넣는 순간 tsc 가 막는다(vitest 는 타입을 지워서 통과한다 — 빌드에서만 터진다).
  status: 'live' as string, hiddenAt: null as string | null,
  startsAt: null as string | null, endsAt: null as string | null,
  totalCards: 100, remainCards: 50,
};

describe('공통 판정 — 일곱 가지를 구분한다', () => {
  it('초안 · 시작 전 · 진행 중 · 숨김 · 종료 · 기간 만료 · 카드 소진', () => {
    const s = (o: Partial<typeof base>) => st.evaluateEvent({ ...base, ...o }, NOW).state;
    expect(s({ status: 'draft' })).toBe('draft');
    expect(s({ startsAt: '2026-09-13T00:00:00Z' })).toBe('scheduled');
    expect(s({})).toBe('live');
    expect(s({ hiddenAt: '2026-09-12T11:00:00Z' })).toBe('hidden');
    expect(s({ status: 'ended' })).toBe('ended');
    expect(s({ endsAt: '2026-09-12T11:00:00Z' })).toBe('expired');
    expect(s({ remainCards: 0 })).toBe('soldout');
  });

  it('🔴 일곱 가지가 서로 다른 값이다 — 하나라도 겹치면 화면이 구분을 못 한다', () => {
    const states = new Set([
      st.evaluateEvent({ ...base, status: 'draft' }, NOW).state,
      st.evaluateEvent({ ...base, startsAt: '2026-09-13T00:00:00Z' }, NOW).state,
      st.evaluateEvent(base, NOW).state,
      st.evaluateEvent({ ...base, hiddenAt: '2026-09-12T11:00:00Z' }, NOW).state,
      st.evaluateEvent({ ...base, status: 'ended' }, NOW).state,
      st.evaluateEvent({ ...base, endsAt: '2026-09-12T11:00:00Z' }, NOW).state,
      st.evaluateEvent({ ...base, remainCards: 0 }, NOW).state,
    ]);
    expect(states.size).toBe(7);
  });

  it('🔴 숨김은 lifecycle 이 아니다 — status 는 live 그대로인데 공개만 닫힌다', () => {
    const r = st.evaluateEvent({ ...base, hiddenAt: '2026-09-12T11:00:00Z' }, NOW);
    expect(r.state).toBe('hidden');
    expect(r.publiclyVisible).toBe(false);
    expect(r.adminPreviewOnly, '관리자 미리보기는 가능해야 한다').toBe(true);
    expect(r.canJoin, '숨김 중에는 새 참여가 멈춘다').toBe(false);
  });

  it('🔴 서버가 공개 여부를 모르면(20260912d 미적용) 숨김이 아니라 공개로 읽는다', () => {
    // `hiddenAt: undefined` = 필드 자체가 안 온다. 이걸 숨김으로 읽으면 미적용 창에서
    // 진행 중인 행사가 통째로 사라진 것처럼 보인다.
    expect(st.evaluateEvent({ ...base, hiddenAt: undefined }, NOW).state).toBe('live');
    expect(st.evaluateEvent({ ...base, hiddenAt: undefined }, NOW).canJoin).toBe(true);
  });
});

describe('🔴 시간 경계 — 서버(open_event_card)와 같아야 한다', () => {
  it('🔴 종료 시각이 지나면 참여가 차단된다 (문서 §10 지정 회귀)', () => {
    const ends = '2026-09-12T12:00:00Z';
    const after = st.evaluateEvent({ ...base, endsAt: ends }, Date.parse(ends) + 1);
    expect(after.state).toBe('expired');
    expect(after.canJoin).toBe(false);
    expect(after.blockedReason, '왜 못 하는지 말해야 한다').not.toBe('');
  });

  it('🔴 종료 시각 **정각**은 미포함 — 그 순간 이미 끝이다', () => {
    const ends = '2026-09-12T12:00:00Z';
    expect(st.evaluateEvent({ ...base, endsAt: ends }, Date.parse(ends)).canJoin).toBe(false);
    expect(st.evaluateEvent({ ...base, endsAt: ends }, Date.parse(ends) - 1).canJoin).toBe(true);
  });

  it('🔴 시작 시각 **정각**은 포함 — 1초 늦게 열리면 안 된다', () => {
    const starts = '2026-09-12T12:00:00Z';
    expect(st.evaluateEvent({ ...base, startsAt: starts }, Date.parse(starts)).canJoin).toBe(true);
    expect(st.evaluateEvent({ ...base, startsAt: starts }, Date.parse(starts) - 1).canJoin).toBe(false);
  });

  it('🔴 잘못된 날짜·로딩 중 값은 참여 불가다 — "제한 없음" 으로 읽지 않는다', () => {
    expect(st.evaluateEvent({ ...base, endsAt: '어제' }, NOW).canJoin).toBe(false);
    expect(st.evaluateEvent({ ...base, startsAt: '2026-09-20T00:00:00Z', endsAt: '2026-09-10T00:00:00Z' }, NOW).state).toBe('unknown');
    expect(st.evaluateEvent(null, NOW).canJoin).toBe(false);
    expect(st.evaluateEvent(base, Number.NaN).canJoin).toBe(false);
    expect(st.evaluateEvent({ ...base, status: 'weird' }, NOW).canJoin).toBe(false);
  });

  it('다음 경계 시각을 알려준다 — 열린 화면이 스스로 다시 판정할 수 있게', () => {
    const ends = '2026-09-12T13:00:00Z';
    expect(st.evaluateEvent({ ...base, endsAt: ends }, NOW).nextBoundaryMs).toBe(Date.parse(ends));
  });

  it('서버 시각으로 기기 시계를 보정한다 — 발급 판정을 기기 시계에만 맡기지 않는다', () => {
    const drift = 3 * 60 * 60 * 1000;
    st.noteServerTime(new Date(Date.now() - drift).toISOString());
    expect(st.isServerTimeKnown()).toBe(true);
    expect(Math.abs(st.eventNow() - (Date.now() - drift))).toBeLessThan(2000);
    st.noteServerTime('망가진 값');   // 깨진 값은 무시한다(보정을 더 망가뜨리지 않는다)
    expect(Math.abs(st.eventNow() - (Date.now() - drift))).toBeLessThan(2000);
  });
});

describe('🔴 종료·숨김 안내에서 활성 참여 버튼을 그리지 않는다', () => {
  it('참여 불가인 모든 상태가 이유 문장을 함께 준다', () => {
    for (const o of [
      { status: 'draft' as const }, { status: 'ended' as const },
      { hiddenAt: '2026-09-12T11:00:00Z' }, { endsAt: '2026-09-12T11:00:00Z' },
      { startsAt: '2026-09-13T00:00:00Z' }, { remainCards: 0 },
    ]) {
      const r = st.evaluateEvent({ ...base, ...o }, NOW);
      expect(r.canJoin, `${r.state} 인데 참여 버튼이 살아 있다`).toBe(false);
      expect(r.blockedReason, `${r.state} 의 이유 문장이 비어 있다`).not.toBe('');
    }
  });

  it('보는 사람 조건(비로그인·참여권 0)도 같은 함수가 판단한다', () => {
    expect(st.evaluateEvent(base, NOW, { signedIn: false }).canJoin).toBe(false);
    expect(st.evaluateEvent(base, NOW, { tickets: 0 }).canJoin).toBe(false);
    expect(st.evaluateEvent(base, NOW, { signedIn: true, tickets: 2 }).canJoin).toBe(true);
    // 보는 사람 조건은 **상태를 바꾸지 않는다** — 행사는 여전히 진행 중이다.
    expect(st.evaluateEvent(base, NOW, { tickets: 0 }).state).toBe('live');
  });

  it('관리자 화면도 같은 함수를 쓴다 — 두 벌로 갈리면 "공개했는데 안 보인다" 가 된다', () => {
    const row = {
      id: 'c', slug: 's', title: 't', subtitle: null, status: 'live' as const,
      hiddenAt: '2026-09-12T11:00:00Z', createdAt: '', startsAt: null, endsAt: null,
      venueId: 'v', venueName: null, ticketVenueId: null, ticketVenueName: null,
      voucherTitle: 'x', voucherExpiresAt: null, issuedBy: null, issuedByName: null,
      venueQuota: 0, venueApproved: true, totalCards: 100, openedCards: 0, remainCards: 100,
      prizeCards: 1, remainPrizeCards: 1, totalVouchers: 1, wonVouchers: 0,
      ticketsIssued: 0, ticketsUsed: 0, vouchersIssued: 0, vouchersUsed: 0,
    };
    expect(ev.eventPhase(row, NOW)).toBe('hidden');
    expect(ev.EVENT_PHASE_LABEL[ev.eventPhase(row, NOW)]).toBe('숨김');
  });
});

// ── ② 메뉴 스위치 — 저장 UX (§8-2) ──────────────────────────────────────────
describe('🔴 사이트 이벤트 메뉴 — 저장 실패를 성공처럼 표시하지 않는다 (문서 §10 지정 회귀)', () => {
  it('🔴 저장이 실패하면 던진다 — 성공 값을 만들어 돌려주지 않는다', async () => {
    rpcError = { code: '42501', message: 'permission denied' };
    await expect(ev.saveEventMenuVisible(false)).rejects.toThrow();
    // 실패했으니 읽기 재조회도 하지 않았다(성공 경로를 밟지 않았다는 뜻)
    expect(calls.map((c) => c.fn)).toEqual(['set_app_setting']);
  });

  it('🔴 성공 뒤에는 **서버가 실제로 가진 값**을 돌려준다 — 내가 보낸 값이 아니다', async () => {
    // 동시 수정: 내가 '숨김'을 보냈는데 다른 관리자가 그 사이 '표시'로 되돌린 상황
    settingValue = 'on';
    await expect(ev.saveEventMenuVisible(false)).resolves.toBe(true);
    expect(settingWrites[0]).toEqual({ p_key: 'event_menu_visible', p_value: 'off' });
  });

  it('🔴 저장 실패 문구에 서버 원문이 새지 않는다 (보안 표준 6번)', async () => {
    // 브라우저 실캡처에서 실제로 `permission denied for function set_app_setting` 이 DOM 에 그려졌다.
    // 원인은 settings.ts 가 `new Error(error.message)` 로 감싸 **code 를 버린 것**이다 —
    // code 가 없으면 dbError 의 SQLSTATE 필터가 통째로 꺼진다.
    rpcError = { code: '42501', message: 'permission denied for function set_app_setting', status: 403 };
    const e = await ev.saveEventMenuVisible(false).catch((x) => x);
    expect(e, 'Error 가 아니면 곳곳의 instanceof Error 가 깨진다').toBeInstanceOf(Error);
    expect((e as { code?: string }).code, 'code 가 버려졌다').toBe('42501');
    expect(isDenied(e), '42501 인데 권한 안내가 안 뜬다').toBe(true);
    expect(msgOf(e, '저장하지 못했습니다'), '서버 원문이 화면 문구로 새어 나온다')
      .not.toMatch(/permission denied|set_app_setting/);
  });

  it('저장값 해석 — 없는 값·깨진 값은 표시(기본 켜기), off 일 때만 숨김', () => {
    expect(ev.parseEventMenuVisible(null)).toBe(true);
    expect(ev.parseEventMenuVisible(undefined)).toBe(true);
    expect(ev.parseEventMenuVisible('')).toBe(true);
    expect(ev.parseEventMenuVisible('on')).toBe(true);
    expect(ev.parseEventMenuVisible('아무거나')).toBe(true);
    expect(ev.parseEventMenuVisible('off')).toBe(false);
  });

  it('🔴 조회 실패를 "메뉴 숨김" 으로 해석하지 않는다 — 진입 경로는 연다', async () => {
    settingError = { message: 'boom' };
    const r = await ev.loadEventMenuVisibility();
    expect(r.visible, '조회 실패가 메뉴를 지웠다').toBe(true);
    expect(r.error, '오류 안내를 띄울 수 없다').not.toBeNull();
  });

  it('진행 행사 0개와 메뉴 표시는 무관하다 — 메뉴 값은 캠페인 목록을 보지 않는다', async () => {
    settingValue = null;
    const r = await ev.loadEventMenuVisibility();
    expect(r.visible).toBe(true);
    expect(calls.filter((c) => /event_campaign/.test(c.fn)).length).toBe(0);
  });
});

// ── ③ 숨기기 RPC — 미적용 창에서의 동작 ─────────────────────────────────────
describe('숨기기/다시 공개 — 미적용 상태에서 안전하게 실패한다', () => {
  it('🔴 PGRST202 는 "알 수 없는 실패" 가 아니라 20260912d 미적용 안내다', async () => {
    rpcError = { code: 'PGRST202', message: 'Could not find the function public.admin_set_event_campaign_hidden' };
    const e = await ev.adminSetEventCampaignHidden('c1', true, '점검').catch((x) => x);
    expect(ev.isEventRpcMissing(e)).toBe(true);
    expect((e as Error).message).toMatch(/20260912d/);
    expect((e as { code?: string }).code, '전용 안내에 code 를 달면 msgOf 가 우리 문장을 덮는다').toBeUndefined();
  });

  it('실패를 삼키지 않는다 · 테이블 직접 쓰기 폴백이 없다', async () => {
    rpcError = { code: 'P0001', message: '아직 공개하지 않은 초안입니다 — 숨길 대상이 아닙니다' };
    await expect(ev.adminSetEventCampaignHidden('c1', true)).rejects.toThrow(/초안/);
    expect(calls.map((c) => c.fn)).toEqual(['admin_set_event_campaign_hidden']);
  });

  it('보내는 값은 대상·숨김 여부·사유뿐이다 — 상태(status)를 보내지 않는다', async () => {
    rpcData = { hidden: true, hiddenAt: '2026-09-12T11:00:00Z' };
    await ev.adminSetEventCampaignHidden('c1', true, '점검');
    expect(Object.keys(calls[0].args ?? {}).sort()).toEqual(['p_campaign_id', 'p_hidden', 'p_reason']);
    expect(JSON.stringify(calls[0].args)).not.toMatch(/status|draft|live|ended/);
  });

  it('목록이 공개 여부를 싣는지로 서버 적용 여부를 판단한다', () => {
    const row = { hiddenAt: null } as unknown as Parameters<typeof ev.rowsReportVisibility>[0][number];
    const old = {} as unknown as Parameters<typeof ev.rowsReportVisibility>[0][number];
    expect(ev.rowsReportVisibility([row])).toBe(true);
    expect(ev.rowsReportVisibility([old]), '옛 서버 응답인데 "공개" 라고 단정했다').toBe(false);
    expect(ev.rowsReportVisibility([]), '0건은 판단 근거가 아니다 — 경고를 띄우지 않는다').toBe(true);
  });
});

// ── ④ 서버(SQL) 계약 ────────────────────────────────────────────────────────
const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260912d_event_visibility_and_menu.sql'),
  'utf-8',
);
/** 주석을 지운 **실행되는 SQL 만**. ROLLBACK 절(전부 주석)이 금지 문자열 검사를 오탐시키던 것을 막는다. */
// 🔴 먼저 줄끝을 LF 로 통일한다. JS 정규식의 점(.)은 **CR 도 줄바꿈으로 보고 안 먹는다** —
// CRLF 파일을 개행으로 쪼개면 각 줄 끝에 CR 이 남고, 아래 --.*$ 가 문자열 끝에 닿지 못해 **매칭 자체가 실패**한다.
// 그러면 이 주석 제거기가 조용히 아무 일도 안 하고, ROLLBACK 안내 주석의 drop column 이
// “데이터 삭제”로 오판돼 계약이 거짓으로 빨개진다(2026-09-16 실측: 코드 변경 0 인데 워크트리에서 빨개졌다).
const CODE = SQL.split('\r\n').join('\n').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

/** 함수 본문만 잘라 본다 — 머리말 주석이 통과시켜 주는 착시를 막는다. */
const bodyOf = (name: string, tag = '$fn$'): string => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const open = SQL.indexOf(`as ${tag}`, start);
  return SQL.slice(start, SQL.indexOf(`${tag};`, open + 3));
};

describe('20260912d — 보안 표준과 비파괴 계약', () => {
  it('운영 적용 기록을 파일이 스스로 말한다', () => {
    expect(SQL).toContain('APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened.');
  });

  it('🔴 숨김을 lifecycle 로 구현하지 않는다 — status 를 쓰는 곳이 없다', () => {
    const b = bodyOf('admin_set_event_campaign_hidden');
    expect(b).not.toMatch(/set\s+status\s*=/);
    expect(b).toContain('hidden_at');
    // 되돌릴 수 있어야 한다(다시 공개) — 값을 지우는 분기가 있다
    expect(b).toContain('case when p_hidden then');
  });

  it('🔴 관리자 가드 NULL-safe · SECURITY DEFINER · search_path · ACL', () => {
    const b = bodyOf('admin_set_event_campaign_hidden');
    expect(b).toContain("my_role() is distinct from 'admin'::user_role");
    expect(b).not.toMatch(/my_role\(\)\s*<>\s*'admin'/);
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public, pg_temp');
    expect(SQL).toContain('revoke all on function public.admin_set_event_campaign_hidden(uuid, boolean, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.admin_set_event_campaign_hidden(uuid, boolean, text) to authenticated, service_role;');
  });

  it('🔴 create or replace 로 ACL 이 초기화될 수 있는 함수 전부에 REVOKE/GRANT 를 다시 쓴다', () => {
    for (const [sig, grant] of [
      ['public.open_event_card(text, int)', 'authenticated, service_role'],
      ['public.admin_list_event_campaigns()', 'authenticated, service_role'],
      ['public.event_board(text)', 'anon, authenticated'],
    ] as const) {
      expect(SQL, `${sig} 의 GRANT 재명시가 없다`).toContain(`grant execute on function ${sig} to ${grant};`);
    }
    expect(SQL).toContain('revoke all on function public._grant_event_tickets() from public, anon, authenticated;');
  });

  it('🔴 숨김 = 새 참여 중지 (카드 열기 · 참여권 지급 둘 다)', () => {
    expect(bodyOf('open_event_card', '$function$')).toContain('v_c.hidden_at is not null');
    expect(bodyOf('_grant_event_tickets', '$$')).toContain('c.hidden_at is null');
  });

  it('🔴 숨김 = 손님에게 비공개, 관리자 미리보기 가능', () => {
    const b = bodyOf('event_board', '$function$');
    expect(b).toContain("v_c.hidden_at is not null and public.my_role() is distinct from 'admin'::user_role");
    expect(b).toContain('return null;');
    // 다른 캠페인으로 돌려보내지 않는다
    expect(b).not.toMatch(/CARD_EVENT_SLUG|coalesce\(p_slug/);
  });

  it('🔴 시간 경계가 서버·앱에서 같다 — 시작 포함, 종료 미포함', () => {
    expect(bodyOf('open_event_card', '$function$')).toContain('now() >= v_c.ends_at');
    expect(bodyOf('open_event_card', '$function$')).toContain('now() < v_c.starts_at');
    expect(bodyOf('_grant_event_tickets', '$$')).toContain('now() < c.ends_at');
    expect(bodyOf('_grant_event_tickets', '$$')).toContain('now() >= c.starts_at');
  });

  it('🔴 이력을 보존한다 — 이 파일에 이벤트 데이터 삭제가 없다', () => {
    expect(CODE).not.toMatch(/delete from public\.(event_cards|event_tickets|store_vouchers|event_campaigns)/);
    expect(CODE).not.toMatch(/drop (table|column)/i);
    // store_vouchers 를 갱신하지 않는다 — '내 당첨·내 이용권' 은 이 파일 전후가 같다
    expect(CODE).not.toMatch(/update public\.store_vouchers/);
  });

  it('🔴 RLS 표면을 넓히지 않는다 — 읽기 정책만 좁힌다', () => {
    expect(CODE).not.toMatch(/create policy .* on public\.event_(cards|tickets)/i);
    // 쓰기 정책을 만들지 않는다(읽기 정책 하나만 다시 쓴다) — `for update` 잠금과 헷갈리지 않게
    // **create policy 뒤의** for 절만 본다.
    expect(CODE).not.toMatch(/create policy[\s\S]{0,300}?\bfor\s+(insert|update|delete|all)\b/i);
    expect(CODE).not.toMatch(/grant (select|insert|update|delete)[^;]*on public\.event_cards/i);
    // 정책은 NULL-safe 관리자 판정을 쓴다(= 로 쓰면 비로그인에서 의도가 흐려진다)
    expect(SQL).toContain("hidden_at is null or public.my_role() is not distinct from 'admin'::user_role");
  });

  it('동작까지 보는 자가검사 · 스키마 리로드 · 알려진 함정 회피', () => {
    expect(SQL).toContain("notify pgrst, 'reload schema';");
    expect(SQL).toContain('do $check$');
    expect(SQL).toContain('ABORT: ');
    expect(SQL).toContain('strpos(v_src, ');
    // LIKE 의 '_' 와일드카드 함정
    expect(SQL).not.toMatch(/v_src\s+like\s+'%_/);
    // identity_arguments 는 파라미터 이름까지 돌려준다 — 타입만 적어 비교하면 영원히 불일치
    expect(SQL).not.toMatch(/pg_get_function_identity_arguments\(p\.oid\)\s*=/);
    // 자가검사가 '내 이용권' 을 막지 않았는지 확인한다(§8-4 에서 가장 있을 법한 사고)
    expect(SQL).toContain("has_table_privilege('authenticated', 'public.store_vouchers', 'select')");
  });

  it('선행 마이그레이션을 명시한다 — 파일명 순서로 돌려야 한다', () => {
    expect(SQL).toContain('20260912c_admin_event_ops.sql');
  });
});

// ── ⑤ 화면 배선 (F6 · F7) ───────────────────────────────────────────────────
// 판정 함수가 아무리 맞아도 **화면이 부르지 않으면** 소용이 없다. 그래서 여기서는 소스를 읽어
// '어떻게 배선했는가' 까지 본다(F6·F7 둘 다 배선 결함이었지 판정 결함이 아니었다).
const srcOf = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf-8');
/** 주석을 지운 **실행되는 코드만**. 주석에 적힌 옛 코드가 검사를 오탐시키는 것을 막는다. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const EVENT_PAGE = srcOf('components', 'features', 'EventPage.tsx');
const EVENT_OPS = srcOf('components', 'features', 'EventOpsAdmin.tsx');

describe('🔴 ⑨ F6 — 이벤트 상세의 참여 가능 판정이 기간·상태를 본다', () => {
  /** EventPage·HomeTab 이 쓰는 것과 **같은** 보드 → 판정 입력 매핑(EventBoard 에는 remain/total 이 없다). */
  const boardInput = (o: { status: string; startsAt?: string | null; endsAt?: string | null; opened?: number; total?: number }) => {
    const total = o.total ?? 100;
    return {
      status: o.status, startsAt: o.startsAt ?? null, endsAt: o.endsAt ?? null,
      totalCards: total, remainCards: total - (o.opened ?? 0),
    };
  };

  it('🔴 종료(status=ended) 보드 — 참여 불가이고 **이유 문장이 있다**', () => {
    // 미사용 참여권을 쥐고 있어도, 미개봉 카드가 남아 있어도 열 수 없다.
    const r = st.evaluateEvent(boardInput({ status: 'ended' }), NOW, { signedIn: true, tickets: 3 });
    expect(r.state).toBe('ended');
    expect(r.canJoin, '종료된 행사인데 카드 타일이 활성이다 — 눌러 보고 RPC 오류로 설명하게 된다').toBe(false);
    expect(r.blockedReason, '참여를 막았는데 화면이 아무 말도 하지 않는다').not.toBe('');
  });

  it('🔴 기간 만료 보드 — 참여 불가이고 **이유 문장이 있다**', () => {
    const r = st.evaluateEvent(
      boardInput({ status: 'live', endsAt: '2026-09-12T11:00:00Z' }), NOW, { signedIn: true, tickets: 3 });
    expect(r.state).toBe('expired');
    expect(r.canJoin).toBe(false);
    expect(r.blockedReason).not.toBe('');
  });

  it('🔴 canPlay 를 참여권만으로 계산하지 않는다 — 판정 함수를 부른다', () => {
    const code = stripComments(EVENT_PAGE);
    expect(code, 'evaluateEvent 를 부르지 않는다').toMatch(/evaluateEvent\(/);
    expect(code, '판정 결과가 아니라 참여권만 보고 카드를 살린다')
      .not.toMatch(/canPlay\s*=\s*!!user\s*&&/);
    expect(code, '카드 타일이 canPlay 로 잠기지 않는다').toContain('disabled={!canPlay}');
    expect(code, '참여 불가 사유를 화면에 그리지 않는다').toContain('av.blockedReason');
  });

  it('🔴 e2e 셀렉터가 잡는 문구를 지우지 않았다 (event-entry.spec.ts)', () => {
    // 문구를 blockedReason 으로 통째로 갈아끼우면 이 두 셀렉터가 조용히 죽는다.
    expect(EVENT_PAGE, "e2e 가 getByRole('button', { name: '로그인하고 참여하기' }) 로 잡는다")
      .toContain('로그인하고 참여하기');
    expect(EVENT_PAGE, "e2e 가 /모두 열렸어요/ 로 잡는다").toContain('모두 열렸어요');
    // 같은 커밋에서 data-testid 를 함께 달아 다음번엔 글자에 매달리지 않게 한다.
    expect(EVENT_PAGE).toContain('data-testid="event-login-cta"');
    expect(EVENT_PAGE).toContain('data-testid="event-blocked-reason"');
  });
});

describe('🔴 ⑩ F7 — 시계 보정 근거는 "서버의 지금" 뿐이다', () => {
  it('🔴 관리자 화면이 캠페인 생성 시각으로 시계를 보정하지 않는다', () => {
    const code = stripComments(EVENT_OPS);
    // `created_at desc` 목록의 첫 줄은 언제나 과거다 — 그걸 '지금' 으로 먹으면 화면의 시각이 뒤로 밀린다.
    expect(code, 'noteServerTime 에 행 데이터의 타임스탬프가 들어간다')
      .not.toMatch(/noteServerTime\s*\([^)]*(createdAt|created_at|startsAt|starts_at|endsAt|ends_at)/);
    // 지금은 보정 자체를 쓰지 않는다(서버가 '지금' 을 싣기 전까지). 되살리려면 근거부터 만들어라.
    expect(code, '보정을 되살렸다면 근거가 서버의 현재 시각인지 이 테스트를 함께 고쳐라')
      .not.toMatch(/\bnoteServerTime\s*\(/);
  });

  it('🔴 합리적 시계 오차 밖의 값은 보정 근거로 받지 않는다', () => {
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000;   // 한 달 전에 만든 캠페인 같은 값
    st.noteServerTime(new Date(old).toISOString());
    expect(st.isServerTimeKnown(), '한 달 전 값을 "서버의 지금" 으로 받아들였다').toBe(false);
    expect(Math.abs(st.eventNow() - Date.now()), '보정이 오염됐다').toBeLessThan(2000);
    // 미래 쪽도 같은 기준이다(부호가 아니라 크기로 자른다).
    st.noteServerTime(Date.now() + 2 * st.MAX_CLOCK_SKEW_MS);
    expect(st.isServerTimeKnown()).toBe(false);
  });

  it('🔴 기기 시계가 3시간 빠른 경우는 **계속** 정상 보정이다 — 음수 거절로 만들지 않는다', () => {
    const drift = 3 * 60 * 60 * 1000;
    st.noteServerTime(new Date(Date.now() - drift).toISOString());
    expect(st.isServerTimeKnown()).toBe(true);
    expect(Math.abs(st.eventNow() - (Date.now() - drift))).toBeLessThan(2000);
    // 상한 밖 값이 뒤늦게 와도 **직전의 정상 보정을 망가뜨리지 않는다**.
    st.noteServerTime(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(Math.abs(st.eventNow() - (Date.now() - drift))).toBeLessThan(2000);
  });
});
