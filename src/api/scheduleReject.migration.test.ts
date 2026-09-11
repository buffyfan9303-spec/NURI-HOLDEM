// 포스터 반려가 '삭제'가 아니라 '상태 + 사유 + 알림'인가 — 서버(SQL) + 배포순서 계약 (20260911o, 2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   수정의 알맹이가 전부 DB 함수·트리거 안이라 단위 테스트가 실행으로 확인할 수 없다 → SQL 텍스트를 잠근다
//   (실행 검증은 적용 시 마이그레이션 하단 검증 블록이 맡는다 — 어긋나면 전체 롤백).
//
// 이 테스트가 잡는 회귀
//   · 반려를 다시 하드 delete 로 되돌리는 것
//   · notif_type 에 없는 값('rejection' 등)을 지어내 알림이 라우팅되지 않게 만드는 것
//   · 새 컬럼에 NOT NULL / DEFAULT 를 달아 기존 행을 재작성하는 것
//   · prevent_self_approve_poster 를 넓히면서 원래 하던 승인 위조 차단을 흘리는 것
//   · 반려 트리거를 모든 UPDATE 에 걸어 조회수 팬아웃에 얹는 것
//   · create or replace 뒤 ACL 재선언을 빠뜨리는 것
//   · 자가검사를 '반려된 행이 0건' 으로 되돌려 재실행을 불가능하게 만드는 것(멱등 파괴)
//   · 클라이언트에서 컬럼 부재 폴백을 지워 '앱 먼저 배포' 창에 반려를 통째로 막는 것
//   · 관리자 분석 '승인대기 포스터' 에서 반려분 제외를 빼먹는 것
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911o_schedule_reject_reason_and_notice.sql'),
  'utf-8',
);
const API = readFileSync(join(__dirname, 'schedules.ts'), 'utf-8');
const STATS = readFileSync(join(__dirname, 'community.ts'), 'utf-8');
const ADMIN = readFileSync(join(__dirname, '..', 'components', 'features', 'AdminTab.tsx'), 'utf-8');
const MYPOSTERS = readFileSync(join(__dirname, '..', 'components', 'features', 'MyPostersTab.tsx'), 'utf-8');

/** 함수 본문만 잘라 본다 — 머리말 주석이 통과시켜 주는 착시를 막는다(20260911b·i 테스트와 같은 관행). */
const bodyOf = (name: string): string => {
  const start = SQL.indexOf(`create or replace function public.${name}()`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const end = SQL.indexOf('$$;', SQL.indexOf('as $$', start));
  return SQL.slice(start, end);
};

describe('20260911o — 포스터 반려는 삭제가 아니라 상태다', () => {
  it('이미 삭제된 포스터는 되살릴 수 없다고 머리말이 못박는다', () => {
    expect(SQL).toContain('이미 삭제된 포스터는 되살릴 수 없다');
  });

  it('연쇄 삭제가 사라진다는 사실을 머리말이 숨기지 않는다(예약·문의는 이제 남는다)', () => {
    expect(SQL).toContain('ON DELETE CASCADE');
    expect(SQL).toContain('schedule_reservations');
  });

  it('컬럼 둘은 nullable · 기본값 없음 — 기존 행 영향 0', () => {
    expect(SQL).toContain('alter table public.schedules add column if not exists rejected_at   timestamptz;');
    expect(SQL).toContain('alter table public.schedules add column if not exists reject_reason text;');
    // NOT NULL / DEFAULT 가 붙으면 라이브 테이블이 재작성되고 기존 행의 뜻이 바뀐다
    expect(SQL).not.toMatch(/add column if not exists (rejected_at|reject_reason)[^\n;]*(not null|default)/i);
  });

  it('자가검사는 멱등하다 — 반려가 한 건이라도 생긴 뒤 재실행해도 터지지 않는다', () => {
    // '반려된 행이 0건' 을 세면 기능이 돌기 시작한 순간부터 재실행이 무조건 ABORT 된다
    expect(SQL).not.toContain('rejected_at is not null or reject_reason is not null');
    expect(SQL).toContain('where approved and rejected_at is not null');
    expect(SQL).toContain('ABORT: 승인과 반려가 동시인 행이 있다');
  });

  it('approved 를 status enum 으로 갈아엎지 않는다 — 읽는 곳 전부를 건드리는 순간이 기능 소실이다', () => {
    expect(SQL).not.toMatch(/drop column[^\n]*approved/i);
    expect(SQL).not.toMatch(/create type public\.schedule_status/i);
  });

  it('BEFORE 가드: 승인 위조 차단이 살아 있고, 반려 필드도 NULL-safe 하게 관리자 전용이다', () => {
    const b = bodyOf('prevent_self_approve_poster');
    expect(b).toContain('new.approved := old.approved');                       // 원래 하던 일(기능 보존)
    expect(b).toContain("is distinct from 'admin'::user_role");                // <> 면 비로그인에서 가드가 열린다
    expect(b).not.toContain("my_role()::text, '') <> 'admin'");
    expect(b).toContain('new.reject_reason := old.reject_reason');             // 업주의 위조 차단
    expect(b).toContain('new.updated_at is distinct from old.updated_at');     // 재제출 판정
    expect(SQL).toContain('set search_path = public, pg_temp');
  });

  it('남이 일으키는 UPDATE(문의 카운터·조회수·리마인더)가 반려를 조용히 지우지 못한다', () => {
    const b = bodyOf('prevent_self_approve_poster');
    const elseIdx = b.indexOf('else');
    expect(elseIdx).toBeGreaterThan(b.indexOf('new.updated_at is distinct from old.updated_at'));
    expect(b.slice(elseIdx)).toContain('new.rejected_at := old.rejected_at');
    expect(SQL).toContain('ABORT: 남이 일으킨 UPDATE(문의 카운터·조회수)가 반려를 지운다');
  });

  it('승인된 포스터는 반려 상태를 함께 가질 수 없다', () => {
    const b = bodyOf('prevent_self_approve_poster');
    expect(b).toContain('if new.approved then');
  });

  it('알림은 승인과 같은 테이블·같은 enum 값 — 새 kind 를 지어내지 않는다', () => {
    const b = bodyOf('notify_on_schedule_rejected');
    expect(b).toContain('insert into public.notifications');
    expect(b).toContain("values (new.owner_id, 'approval',");
    expect(b).toContain('new.rejected_at is not null and old.rejected_at is null');
    // notif_type 에 값을 추가하면 같은 트랜잭션에서 쓸 수 없고(20260817c) 클라이언트 라우터도 모른다
    expect(SQL).not.toMatch(/alter type public\.notif_type/i);
    expect(SQL).toContain("e.enumlabel = 'approval'");
  });

  it('사유는 잘라서 싣는다 — message 는 push_on_notification 이 통째로 엣지 함수에 보낸다', () => {
    expect(bodyOf('notify_on_schedule_rejected')).toContain('left(nullif(btrim(new.reject_reason), \'\'), 200)');
  });

  it('반려 트리거는 rejected_at 이 새로 세워질 때만 — 조회수 UPDATE 폭주에 얹히지 않는다', () => {
    expect(SQL).toContain('after update of rejected_at on public.schedules');
    expect(SQL).toContain('when (new.rejected_at is not null and old.rejected_at is null)');
    expect(SQL).toContain('ABORT: 반려 트리거가 모든 UPDATE 에 걸린다(조회수 팬아웃)');
  });

  it('create or replace 가 지운 ACL 을 두 트리거 함수 모두 다시 닫는다(PUBLIC 포함)', () => {
    expect(SQL).toContain('revoke all on function public.prevent_self_approve_poster()  from public, anon, authenticated;');
    expect(SQL).toContain('revoke all on function public.notify_on_schedule_rejected()  from public, anon, authenticated;');
    expect(SQL).toContain('ABORT: 트리거 함수가 외부에 열려 있다');
  });

  it('새 컬럼을 PostgREST 가 보게 스키마를 다시 읽힌다', () => {
    expect(SQL).toContain("notify pgrst, 'reload schema';");
  });
});

describe('20260911o — 클라이언트: 앱이 먼저 배포돼도 화면이 깨지지 않는다', () => {
  it('반려는 삭제가 아니라 상태 전이로 나간다', () => {
    expect(API).toContain('export async function rejectSchedule(');
    expect(API).toContain('rejected_at: now, reject_reason: reason.trim() || null');
    expect(API).toContain('approved: false');
  });

  it('컬럼 부재(PGRST204 / 42703)면 종전 동작으로 폴백해 관리자가 큐를 못 비우는 일이 없다', () => {
    expect(API).toContain("if (error.code !== 'PGRST204' && error.code !== '42703') throw error;");
    expect(API).toContain('await deleteSchedule(id);');
    expect(API).toContain("return 'deleted';");
  });

  it('업주의 진짜 삭제 경로(deleteSchedule)는 그대로 남는다 — 기능 보존', () => {
    expect(API).toContain('export async function deleteSchedule(id: string): Promise<void>');
  });

  it('마이그레이션 전 서버에서도 읽기가 성립한다(컬럼 없음 → null)', () => {
    expect(API).toContain('rejectedAt: r.rejected_at ?? null');
    expect(API).toContain('rejectReason: r.reject_reason ?? null');
  });

  it('대기열이 반려된 것을 제외한다', () => {
    expect(ADMIN).toContain('schedules.filter((s) => !s.approved && !s.rejectedAt)');
  });

  it("관리자 분석 '승인대기 포스터' 도 반려분을 빼고 센다 — 안 그러면 영구히 부푼다", () => {
    expect(STATS).toContain("cnt('schedules', (q) => q.eq('approved', false).is('rejected_at', null))");
  });

  it('업주 화면이 반려 사유를 그린다', () => {
    expect(MYPOSTERS).toContain('schedule.rejectedAt');
    expect(MYPOSTERS).toContain('반려 사유:');
  });
});
