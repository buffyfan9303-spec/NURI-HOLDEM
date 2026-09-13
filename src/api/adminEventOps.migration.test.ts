// 관리자 이벤트 운영(§6) — 클라이언트 계약 + 서버(SQL) 계약. 마이그레이션 20260912c.
//
// 왜 이 파일이 필요한가
//   ① 클라이언트: 마이그레이션이 **아직 운영에 없다**(오너 승인 대기). 앱이 먼저 배포되는 창에서
//      PostgREST 는 PGRST202 를 준다. 그때 목록을 `[]` 로 바꾸면 관리자는 '이벤트가 0건'이라고
//      믿고 새로 만들려다 또 실패한다 — 이용권이 바로 이 순서 문제로 전멸할 뻔했다
//      (voucherRpcFallback.test.ts). 그래서 **'함수 없음'과 '0건'을 구분해서 던지는 것**을 잠근다.
//      그리고 클라이언트가 **발급 주체·자리 배치를 보내지 않는 것**을 잠근다 — 둘 다 보내는 순간
//      서버가 아무리 옳아도 화면이 당첨 자리를 알게 된다.
//   ② 서버: 수정이 전부 DB 함수 안이라 단위 테스트가 실행으로 검증할 수 없다 → SQL 텍스트를 잠근다.
//      (실행 검증은 마이그레이션 하단 `do $check$` 가 맡는다 — 어긋나면 전체 롤백.
//       그 자가검사 자체를 격리 Postgres 컨테이너에서 8종 변조로 음성 대조해 두었다.)
// 실행: npx vitest run src/api/adminEventOps.migration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { msgOf, isDenied } from '../lib/dbError';
import { join } from 'node:path';

// ── ① 클라이언트 ────────────────────────────────────────────────────────────
const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
let rpcError: { message: string; code?: string; status?: number; details?: string } | null = null;
let rpcData: unknown = null;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: rpcData, error: rpcError };
    },
  },
}));

const ev = await import('./adminEvents');

beforeEach(() => { calls.length = 0; rpcError = null; rpcData = null; });

const PGRST202 = { code: 'PGRST202', message: 'Could not find the function public.admin_list_event_campaigns' };

describe('관리자 RPC 미적용 창 — 0건으로 위장하지 않는다', () => {
  it('🔴 목록: PGRST202 는 빈 배열이 아니라 rpcMissing 오류로 나온다', async () => {
    rpcError = PGRST202;
    await expect(ev.adminListEventCampaigns()).rejects.toThrow(/적용되지 않았습니다/);
    await expect(ev.adminListEventCampaigns()).rejects.toSatisfy(ev.isEventRpcMissing);
  });

  it('메시지 문구로만 오는 경우도(코드 없음) 같은 취급', async () => {
    rpcError = { message: 'Could not find the function public.admin_create_event_campaign(...)' };
    await expect(ev.adminCreateEventCampaign({
      venueId: 'v', slug: 'a', title: 't', voucherTitle: '이용권',
    })).rejects.toSatisfy(ev.isEventRpcMissing);
  });

  it('🔴 권한 오류는 rpcMissing 이 아니다 — 둘을 섞으면 관리자가 엉뚱한 안내를 본다', async () => {
    rpcError = { code: '42501', message: '권한 없음: 관리자만 이벤트를 공개할 수 있습니다' };
    await expect(ev.adminPublishEventCampaign('c1')).rejects.toThrow('권한 없음: 관리자만 이벤트를 공개할 수 있습니다');
    await expect(ev.adminPublishEventCampaign('c1')).rejects.not.toSatisfy(ev.isEventRpcMissing);
  });

  it('🔴 code·status 를 버리지 않는다 — dbError 의 분류가 이 필드로만 산다', async () => {
    // `new Error(error.message)` 로 감싸면 code 가 사라진다. 그러면 msgOf 의 SQLSTATE 필터가
    // 통째로 꺼져 `permission denied for function admin_list_…` 원문이 화면에 그려지고,
    // isDenied 도 false 가 되어 '열람 권한이 없습니다' 대신 '불러오지 못했습니다' 가 뜬다.
    rpcError = { code: '42501', message: 'permission denied for function admin_list_event_campaigns', status: 403 };
    const e = await ev.adminListEventCampaigns().catch((x) => x);
    expect(e, 'Error 가 아니면 곳곳의 instanceof Error 가 깨진다').toBeInstanceOf(Error);
    expect((e as { code?: string }).code, 'code 가 버려졌다').toBe('42501');
    expect((e as { status?: number }).status, 'status 가 버려졌다').toBe(403);
    expect(isDenied(e), 'isDenied 가 false — 42501 인데 권한 안내가 안 뜬다').toBe(true);
    expect(msgOf(e, ''), '서버 원문이 그대로 새어 나온다(보안 표준 6번)')
      .not.toMatch(/permission denied|admin_list_event_campaigns/);
    expect(msgOf(e, '')).toBe('권한이 없습니다. 매장 담당자 계정인지 확인해 주세요');
  });

  it('내부 SQLSTATE 원문(42883 등)도 화면 문구로 새지 않는다', async () => {
    rpcError = { code: '42883', message: 'function public.admin_end_event_campaign(uuid, text) does not exist' };
    const e = await ev.adminEndEventCampaign('c1').catch((x) => x);
    expect(msgOf(e, '종료하지 못했습니다')).toBe('종료하지 못했습니다');
  });

  it('미적용 오류는 PGRST202 코드를 달지 않는다 — 달면 "새로고침하세요" 로 덮여 관리자가 오해한다', async () => {
    rpcError = PGRST202;
    const e = await ev.adminListEventCampaigns().catch((x) => x);
    expect((e as { code?: string }).code).toBeUndefined();
    expect(msgOf(e, '')).toMatch(/마이그레이션 20260912c/);
  });

  it('공개·종료·삭제 어느 것도 실패를 삼키지 않는다', async () => {
    rpcError = { code: 'P0001', message: '공개할 수 없습니다: 카드가 아직 구성되지 않았습니다' };
    await expect(ev.adminPublishEventCampaign('c1')).rejects.toThrow(/공개할 수 없습니다/);
    await expect(ev.adminEndEventCampaign('c1', '사유')).rejects.toThrow(/공개할 수 없습니다/);
    await expect(ev.adminDeleteEventDraft('c1')).rejects.toThrow(/공개할 수 없습니다/);
  });

  it('테이블 직접 쓰기 폴백이 없다 — rpc 말고는 아무 경로도 타지 않는다', async () => {
    rpcError = PGRST202;
    await expect(ev.adminCreateEventCampaign({ venueId: 'v', slug: 'a', title: 't', voucherTitle: 'x' })).rejects.toThrow();
    expect(calls.map((c) => c.fn)).toEqual(['admin_create_event_campaign']);
  });
});

describe('클라이언트가 보내면 안 되는 것', () => {
  it('🔴 발급 주체를 보내지 않는다 — 서버가 auth.uid() 로 유도한다', async () => {
    rpcData = { id: 'c1', slug: 'a' };
    await ev.adminCreateEventCampaign({ venueId: 'v', slug: 'a', title: 't', voucherTitle: '이용권' });
    const args = calls[0].args ?? {};
    expect(Object.keys(args).some((k) => /issued|issuer|admin_id/i.test(k)),
      `발급 주체를 클라이언트가 보내고 있다: ${Object.keys(args).join(',')}`).toBe(false);
  });

  it('🔴 카드 자리 배치를 보내지 않는다 — 수량(tier/cards/vouchers)만 간다', async () => {
    rpcData = { totalCards: 100, prizeCards: 17, totalVouchers: 37 };
    await ev.adminComposeEventCards('c1', 100, [{ tier: 1, cards: 1, vouchers: 10 }]);
    const args = calls[0].args as { p_tiers: Array<Record<string, unknown>> };
    expect(Object.keys(args)).toEqual(['p_campaign_id', 'p_total', 'p_tiers']);
    for (const t of args.p_tiers) {
      expect(Object.keys(t).sort(),
        '등급 줄에 자리(idx) 정보가 실렸다 — 만든 사람이 당첨 자리를 알게 된다').toEqual(['cards', 'tier', 'vouchers']);
    }
  });
});

describe('상태 파생 — 진행 중과 소진을 혼동하지 않는다', () => {
  const base = {
    id: 'c', slug: 's', title: 't', subtitle: null, createdAt: '2026-09-01T00:00:00Z',
    startsAt: null, endsAt: null, venueId: 'v', venueName: null, ticketVenueId: null,
    ticketVenueName: null, voucherTitle: 'x', voucherExpiresAt: null, issuedBy: null, issuedByName: null,
    venueQuota: 0, venueApproved: true, totalCards: 100, openedCards: 0, remainCards: 100,
    prizeCards: 17, remainPrizeCards: 17, totalVouchers: 37, wonVouchers: 0,
    ticketsIssued: 0, ticketsUsed: 0, vouchersIssued: 0, vouchersUsed: 0,
  } as const;
  const now = Date.parse('2026-09-12T00:00:00Z');

  it('draft / ended 는 그대로', () => {
    expect(ev.eventPhase({ ...base, status: 'draft' }, now)).toBe('draft');
    expect(ev.eventPhase({ ...base, status: 'ended' }, now)).toBe('ended');
  });
  it('시작 전은 진행 중이 아니다', () => {
    expect(ev.eventPhase({ ...base, status: 'live', startsAt: '2026-10-01T00:00:00Z' }, now)).toBe('scheduled');
  });
  it("🔴 카드가 다 열렸으면 'live' 라도 소진이다 — 20260906c 가 참여권도 이미 끊었다", () => {
    expect(ev.eventPhase({ ...base, status: 'live', openedCards: 100, remainCards: 0 }, now)).toBe('soldout');
  });
  it('카드가 남아 있으면 진행 중', () => {
    expect(ev.eventPhase({ ...base, status: 'live', openedCards: 3, remainCards: 97 }, now)).toBe('live');
  });
});

describe('다음 회차 — 설정만 복사한다', () => {
  it('🔴 카드·당첨자·참여권·실적·기간을 복사하지 않는다', () => {
    const src = {
      id: 'c1', slug: 'old', title: '오픈 기념', subtitle: '부제', status: 'ended' as const,
      createdAt: '', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-30T00:00:00Z',
      venueId: 'v1', venueName: '로티', ticketVenueId: 'v1', ticketVenueName: '로티',
      voucherTitle: '로티 이용권', voucherExpiresAt: '2026-10-30T00:00:00Z',
      issuedBy: 'admin-1', issuedByName: '운영자', venueQuota: 100, venueApproved: true,
      totalCards: 100, openedCards: 100, remainCards: 0, prizeCards: 17, remainPrizeCards: 0,
      totalVouchers: 37, wonVouchers: 37, ticketsIssued: 200, ticketsUsed: 100,
      vouchersIssued: 37, vouchersUsed: 12,
    };
    const next = ev.nextRoundDraft(src, 'new-round');
    expect(next).toEqual({
      venueId: 'v1', slug: 'new-round', title: '오픈 기념', subtitle: '부제',
      startsAt: null, endsAt: null, ticketVenueId: 'v1',
      voucherTitle: '로티 이용권', voucherExpiresAt: null,
    });
    // 실적·개봉·발급이 새 초안으로 새어 들어가지 않는다
    expect(JSON.stringify(next)).not.toMatch(/totalCards|openedCards|vouchersIssued|ticketsIssued/);
  });
});

// ── ② 서버(SQL) ─────────────────────────────────────────────────────────────
const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260912c_admin_event_ops.sql'),
  'utf-8',
);
/** 함수 본문만 잘라 본다 — 머리말 주석이 통과시켜 주는 착시를 막는다. */
const bodyOf = (name: string, tag = '$fn$'): string => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const open = SQL.indexOf(`as ${tag}`, start);
  return SQL.slice(start, SQL.indexOf(`${tag};`, open + 3));
};

const ADMIN_FNS = [
  'admin_list_event_campaigns', 'admin_create_event_campaign', 'admin_compose_event_cards',
  'admin_validate_event_campaign', 'admin_publish_event_campaign', 'admin_end_event_campaign',
  'admin_delete_event_draft',
];

describe('20260912c — 보안 표준을 하나도 빠뜨리지 않는다', () => {
  it('초안임을 파일이 스스로 말한다 — 적용 여부를 헷갈리지 않게', () => {
    expect(SQL).toContain('아직 **적용하지 않았다(오너 승인 대기)**');
  });

  it('🔴 관리자 가드가 전부 NULL-safe — `<>` 는 비로그인에서 열린다', () => {
    for (const fn of ADMIN_FNS) {
      const b = bodyOf(fn);
      expect(b, `${fn} 의 가드가 NULL-safe 가 아니다`).toContain("my_role() is distinct from 'admin'::user_role");
      expect(b, `${fn} 에 <> 가드가 남아 있다`).not.toMatch(/my_role\(\)\s*<>\s*'admin'/);
    }
  });

  it('🔴 SECURITY DEFINER + search_path 고정', () => {
    for (const fn of [...ADMIN_FNS, '_event_campaign_problems', 'open_event_card']) {
      const b = bodyOf(fn, fn === 'open_event_card' ? '$function$' : '$fn$');
      expect(b, `${fn} 이 security definer 가 아니다`).toContain('security definer');
      expect(b, `${fn} 의 search_path 가 고정되지 않았다`).toContain('set search_path = public, pg_temp');
    }
  });

  it("🔴 ACL: `from public, anon` 회수 + authenticated·service_role 재부여 (`from anon` 만은 무효)", () => {
    for (const fn of ADMIN_FNS) {
      const rx = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`);
      expect(SQL, `${fn} 의 REVOKE 가 없거나 public 을 빼먹었다`).toMatch(rx);
      expect(SQL, `${fn} 의 GRANT 가 없다`).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated, service_role;`));
    }
    // create or replace 로 ACL 이 초기화된 손님 함수도 다시 닫는다
    expect(SQL).toContain('revoke all on function public.open_event_card(text, int) from public, anon;');
    expect(SQL).toContain('grant execute on function public.open_event_card(text, int) to authenticated, service_role;');
    // 내부 검증 함수는 클라이언트 롤 전면 회수
    expect(SQL).toContain('revoke all on function public._event_campaign_problems(uuid) from public, anon, authenticated;');
    expect(SQL).not.toMatch(/grant execute on function public\._event_campaign_problems\(uuid\) to [^;]*authenticated/);
  });

  it('🔴 발급 주체는 서버가 유도한다 — 클라이언트 파라미터가 없다', () => {
    const b = bodyOf('admin_create_event_campaign');
    expect(b).toContain('auth.uid()');
    // ⚠ 함수 **본문**만 본다 — 하단 자가검사가 'p_issued_by 가 들어왔는가' 를 감시하느라
    //   그 문자열을 스스로 들고 있어서, 파일 전체로 보면 늘 실패한다.
    expect(b).not.toMatch(/p_issued_by/);
    // 옛 seed 의 '이름으로 첫 매장·첫 관리자 고르기' 가 되살아나지 않는다
    expect(b).not.toMatch(/where name = '/);
    expect(b).not.toMatch(/role = 'admin' order by id limit 1/);
  });

  it('🔴 셔플은 서버 — 자리 배치를 받는 파라미터가 없다', () => {
    const b = bodyOf('admin_compose_event_cards');
    expect(b).toContain('row_number() over (order by random()) as idx');
    expect(b).not.toMatch(/p_idx|p_cards\s+jsonb|p_placement/);
    // 감사기록에 자리별 등급을 남기지 않는다
    expect(b).toContain("jsonb_build_object('total', v_rows");
    expect(b).not.toMatch(/_audit\([^)]*idx/);
  });

  it('🔴 공개된 판의 배치·결과는 바꿀 수 없다 · 초안에서만 구성/삭제', () => {
    expect(bodyOf('admin_compose_event_cards')).toContain("v_c.status <> 'draft'");
    expect(bodyOf('admin_delete_event_draft')).toContain("v_c.status <> 'draft'");
    // 만들지 않기로 한 것들이 실제로 없다
    expect(SQL).not.toMatch(/opened_at\s*=\s*null/);
    expect(SQL).not.toMatch(/set\s+opened_by\s*=\s*p_/);
    expect(SQL).not.toMatch(/admin_(reopen|reset|force_win|set_winner)/);
  });

  it('🔴 공개는 원자적 — 행 잠금 + 잠금 안 재검증 + 조건부 UPDATE + 행 수 확인', () => {
    const b = bodyOf('admin_publish_event_campaign');
    expect(b).toContain('for update');
    expect(b).toContain('_event_campaign_problems(p_campaign_id)');
    expect(b).toContain("status = 'draft'");
    expect(b).toContain('get diagnostics v_rows = row_count');
  });

  it('검증이 수량 합계·기간 역전·경품 만료·한도를 전부 본다', () => {
    const b = bodyOf('_event_campaign_problems');
    for (const code of ['no_cards', 'idx_gap', 'no_prize', 'tier_voucher_mixed',
                        'period_inverted', 'ends_in_past', 'voucher_expired',
                        'voucher_expires_before_end', 'venue_not_approved', 'quota_short']) {
      expect(b, `검증에 ${code} 가 없다`).toContain(code);
    }
    // 한도를 '올려서' 통과시키지 않는다
    expect(b).not.toMatch(/update public\.venues set voucher_quota/);
  });

  it('🔴 초안 삭제는 개봉·참여권·발급 이용권 세 이력을 전부 본다', () => {
    const b = bodyOf('admin_delete_event_draft');
    expect(b).toContain('opened_at is not null');
    expect(b).toContain('public.event_tickets where campaign_id = p_campaign_id');
    expect(b).toContain('public.store_vouchers where event_campaign_id = p_campaign_id');
  });

  it('🔴 당첨↔이용권이 구조적 FK — note 파싱이 아니다. 그리고 비파괴다', () => {
    expect(SQL).toContain('add column if not exists event_campaign_id uuid references public.event_campaigns(id) on delete set null');
    expect(SQL).toContain('add column if not exists event_card_idx int');
    const b = bodyOf('open_event_card', '$function$');
    expect(b).toContain('event_campaign_id, event_card_idx)');
    expect(b).toContain('v_c.id, p_idx');
    // 기존 행을 손대지 않는다 — 옛 note 를 파싱해 되채우면 파싱이 틀린 행에 틀린 캠페인이 박힌다
    expect(SQL).not.toMatch(/update public\.store_vouchers\s+set\s+event_campaign_id/);
    // 손님 경로의 불변식은 그대로
    for (const keep of ['for update skip locked', 'identity_gate_on()',
                        'voucher_quota = voucher_quota - v_card.voucher_count',
                        '이미 열린 카드예요', '참여권이 없습니다']) {
      expect(b, `open_event_card 재정의에서 '${keep}' 가 사라졌다`).toContain(keep);
    }
  });

  it('🔴 event_campaigns/event_cards 의 RLS 표면을 넓히지 않는다', () => {
    // 관리자 경로는 전부 SECURITY DEFINER 안이다. 테이블에 insert/update 정책을 열면
    // 등급 유출·임의 공개의 벽이 사라진다.
    expect(SQL).not.toMatch(/create policy .* on public\.event_(campaigns|cards|tickets)/i);
    expect(SQL).not.toMatch(/grant (select|insert|update|delete).* on public\.event_cards/i);
  });

  it('감사기록을 다섯 단계 전부에 건다', () => {
    for (const [fn, action] of [
      ['admin_create_event_campaign', 'admin_create_event_campaign'],
      ['admin_compose_event_cards', 'admin_compose_event_cards'],
      ['admin_publish_event_campaign', 'admin_publish_event_campaign'],
      ['admin_end_event_campaign', 'admin_end_event_campaign'],
      ['admin_delete_event_draft', 'admin_delete_event_draft'],
    ] as const) {
      expect(bodyOf(fn), `${fn} 에 감사기록이 없다`).toContain(`public._audit('${action}'`);
    }
  });

  it('동작까지 보는 자가검사 · 스키마 리로드 · LIKE 와일드카드 함정 회피', () => {
    expect(SQL).toContain("notify pgrst, 'reload schema';");
    expect(SQL).toContain('do $check$');
    expect(SQL).toContain('strpos(v_src, ');
    expect(SQL).toContain('ABORT: ');
    expect(SQL).not.toMatch(/v_src\s+like\s+'%_/);
    // ⚠ identity_arguments 는 파라미터 **이름까지** 돌려준다 — 타입만 적어 비교하면 영원히
    //   불일치라 자가검사가 '함수가 없다'로 오탐한다(컨테이너 실행으로 확인).
    expect(SQL).not.toMatch(/pg_get_function_identity_arguments\(p\.oid\)\s*=/);
  });
});
