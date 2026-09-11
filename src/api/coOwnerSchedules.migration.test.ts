// 공동 사장에게 포스터·예약을 여는 계약 — **서버(SQL) + 화면** (20260911p, 2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   변경이 전부 RLS 정책·함수 DDL 이라 단위 테스트가 실행으로 검증할 수 없고, e2e 는 운영 DB 에
//   쓰기를 못 한다(e2e/write-guard.spec.ts 가 비-GET 을 네트워크 단에서 끊는다).
//   실행 검증은 적용 시 마이그레이션 하단 DO 블록이 맡는다 — 어긋나면 전체 롤백.
//
// 이 테스트가 잡는 회귀
//   · 종전 절을 지우고 판정 함수로 **갈아치우는 것**(가산이 아니면 venue_id NULL 포스터가 통째로 잠긴다)
//   · SECURITY DEFINER·search_path·PUBLIC 회수를 빠뜨리는 것
//   · schedules_select 를 함께 건드려 20260911m(미적용)과 충돌하는 것
//   · 화면이 다시 role 로 판정하게 되돌아가는 것 · 목록이 다시 owner 기준으로 돌아가는 것
//
// ⚠ 정정(2026-09-12) — 이 자리에 '포스터 판이 realtime 때문에 에러 경계로 떨어진다' 고 적었던 것은 **틀렸다**.
//   실제 원인 둘: ① 픽스처의 `buy_in: ''` → MyPostersTab 의 `schedule.buyIn.amount` 무가드 역참조가
//   렌더에서 TypeError(같은 커밋에서 매퍼를 고쳤다) ② e2e/_mockOwner 에 ledger_players 라우트가 없어
//   대시보드 core 가 401 로 거절(같은 커밋에서 추가했다). realtime 구독은 `.subscribe()` 를 콜백 없이
//   부르므로 join 이 거부돼도 **throw 하지 않는다** — 애초에 원인이 될 수 없었다.
//   둘 다 고쳤으므로 이 계약은 e2e 로 승격할 수 있다(앵커 data-testid="my-posters" 는 이미 있다).
//   지금 소스 단언으로 두는 이유는 하나뿐이다: 서버 쪽(RLS·판정 함수)은 운영 DB 쓰기가 막혀 있어
//   실행으로 검증할 수 없고, 그 검증은 적용 시 마이그레이션 하단 DO 블록이 맡는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 줄끝 정규화 — Windows 체크아웃(core.autocrlf)에서는 CRLF 로 내려온다(kstDates 테스트와 같은 이유). */
const lf = (s: string) => s.split('\r\n').join('\n');
const root = join(__dirname, '..', '..');
const SQL = lf(readFileSync(join(root, 'supabase', 'migrations', '20260911p_co_owner_can_manage_schedules.sql'), 'utf-8'));
const TAB = lf(readFileSync(join(root, 'src', 'components', 'features', 'VenueManageTab.tsx'), 'utf-8'));
const POSTERS = lf(readFileSync(join(root, 'src', 'components', 'features', 'MyPostersTab.tsx'), 'utf-8'));
const API = lf(readFileSync(join(__dirname, 'schedules.ts'), 'utf-8'));

/** 머리말 주석이 통과시켜 주는 착시를 막는다 — 실행 구간(첫 DDL 이후 ~ 롤백 주석 앞)만 본다. */
const RUN = SQL.slice(
  SQL.indexOf('create or replace function public.can_manage_venue_schedules'),
  SQL.indexOf('-- ROLLBACK (필요 시 수동)'),
);

describe('20260911p — 공동 사장 포스터·예약 (서버)', () => {
  it('슬라이스 앵커가 살아 있다 — 빈 문자열이면 아래 단언이 전부 헛돈다', () => {
    expect(RUN.length).toBeGreaterThan(500);
  });

  it('판정 함수가 can_manage_venue_staff 와 같은 세 절을 쓴다', () => {
    expect(RUN).toContain("coalesce(my_role() = 'admin'::user_role, false)");
    expect(RUN).toContain('from public.venues v');
    expect(RUN).toContain('from public.venue_owners vo');
    expect(RUN).toContain("vo.status = 'approved'");
  });

  it('SECURITY DEFINER 이고 search_path 가 고정이다', () => {
    expect(RUN).toContain('security definer');
    expect(RUN).toContain('set search_path = public, pg_temp');
  });

  it('🔴 PUBLIC 에서 회수한다 — anon 만 빼면 무효다(PUBLIC 기본 GRANT)', () => {
    expect(RUN).toContain('revoke execute on function public.can_manage_venue_schedules(uuid) from public, anon;');
    expect(RUN).toContain('grant execute on function public.can_manage_venue_schedules(uuid) to authenticated, service_role;');
  });

  it.each(['schedules_insert', 'schedules_update', 'schedules_delete'])('%s 가 판정 함수를 부른다', (name) => {
    const i = RUN.indexOf(`create policy "${name}"`);
    expect(i, `${name} 정책이 없다`).toBeGreaterThan(0);
    const block = RUN.slice(i, RUN.indexOf(';', i));
    expect(block).toContain('public.can_manage_venue_schedules(venue_id)');
    // venue_id 가 NULL 인 행에 함수를 걸지 않는다 — 옛 포스터가 잠긴다
    expect(block).toContain('venue_id is not null');
  });

  it('🔴 가산이다 — 종전 절이 그대로 살아 있다(갈아치우면 지금 통과하던 것이 막힌다)', () => {
    const ins = RUN.slice(RUN.indexOf('create policy "schedules_insert"'), RUN.indexOf('create policy "schedules_update"'));
    expect(ins, '종전 업주 절이 사라졌다').toContain("my_role() = any (array['venue_owner'::user_role, 'admin'::user_role])");
    expect(ins, '승인 업주 조건이 사라졌다').toContain('p.approved = true');
    expect(ins, '본인 명의 조건이 사라졌다').toContain('owner_id = (select auth.uid())');
    for (const name of ['schedules_update', 'schedules_delete']) {
      const i = RUN.indexOf(`create policy "${name}"`);
      const block = RUN.slice(i, RUN.indexOf(';', i));
      expect(block, `${name} 의 본인 절이 사라졌다`).toContain('owner_id = (select auth.uid())');
      expect(block, `${name} 의 관리자 절이 사라졌다`).toContain("my_role() = 'admin'::user_role");
    }
  });

  it('update 에 WITH CHECK 을 붙여 남의 매장으로 옮기는 것을 막는다', () => {
    const i = RUN.indexOf('create policy "schedules_update"');
    const block = RUN.slice(i, RUN.indexOf(';', i));
    expect(block).toContain('with check (');
  });

  it('🔴 schedules_select 는 건드리지 않는다 — 20260911m(미적용)이 그 정책을 다시 쓴다', () => {
    expect(RUN).not.toContain('create policy "schedules_select"');
    expect(RUN).not.toContain('create policy schedules_select');
    expect(SQL, '충돌 가능성을 머리말에 남겨 둔다').toContain('20260911m');
  });

  it('데이터를 건드리지 않는다', () => {
    expect(RUN).not.toMatch(/\b(drop table|truncate|delete from|alter table)\b/i);
    expect(RUN).not.toMatch(/update public\.schedules/i);
  });

  it('자가검사와 롤백이 함께 있다', () => {
    expect(SQL).toContain('ABORT: 공동 사장 절이 없다');
    expect(SQL).toContain('ABORT: insert 의 종전 업주 절이 사라졌다 — 가산이 아니다');
    expect(SQL).toContain('ABORT: anon 이 판정 함수를 실행할 수 있다');
    expect(SQL).toContain('-- ROLLBACK (필요 시 수동)');
  });
});

describe('20260911p — 화면이 서버 판정을 쓴다', () => {
  it('api 가 미적용(함수 없음)을 null 로 알린다 — false 로 닫지 않는다', () => {
    expect(API).toContain('export async function canManageVenueSchedules');
    expect(API).toContain("if (error.code === '42883' || error.code === 'PGRST202') return null;");
  });

  it('🔴 canPosters 가 role 이 아니라 서버 판정을 쓰고, 미적용일 때만 종전 규칙으로 떨어진다', () => {
    expect(TAB).toContain('const canPosters = scheduleOk ?? (isOwner || isAdmin);');
    // 되돌아감 방지 — 예전 한 줄이 그대로 남아 있으면 안 된다
    expect(TAB).not.toContain('const canPosters = isOwner || isAdmin;');
  });

  it('포스터 판정 실패가 장부·정산까지 닫지 않는다 — 배치에서 격리한다', () => {
    expect(TAB).toContain('canManageVenueSchedules(venueId).catch(() => null)');
  });

  it('🔴 내 포스터 목록이 owner 가 아니라 매장 기준이다 — 공동 사장 화면이 비지 않게', () => {
    expect(POSTERS).toContain('s.ownerId === user?.id || (!!venueId && s.venueId === venueId)');
    expect(POSTERS, '옛 owner 전용 필터가 남아 있다').not.toContain('schedules.filter((s) => s.ownerId === user?.id);');
  });
});
