-- 20260911o — 포스터 '반려'를 삭제가 아니라 상태로 (2026-09-11 승인 큐 점검)
--
-- 현행 결함
--   관리자의 '반려'는 src/App.tsx handleRejectSchedule → src/api/schedules.ts deleteSchedule 의
--   .delete().eq('id', id) 로 행을 **영구 삭제**한다. 업주에게 알림도 사유도 가지 않는다.
--   승인 쪽에는 알림이 있다 — 20260602h:36 → 20260817d:42 의 notify_on_schedule_approved.
--   반려용 트리거는 마이그레이션 전체에 없었다.
--   게다가 대기 포스터는 이미 approved=false 라 updateSchedule(id, { approved:false }) 는 무동작이고
--   대기열(AdminTab.tsx 의 schedules.filter(s => !s.approved))에서도 사라지지 않는다.
--   '삭제' 말고 큐를 비울 길이 없었던 것이 하드 delete 의 진짜 원인이다. 그 길을 여는 것이 이 파일이다.
--
-- ⚠ 이미 삭제된 포스터는 되살릴 수 없다.
--   schedules 에는 소프트 삭제도 감사 스냅샷도 없다(activity_log 는 id·제목만 남긴다).
--   지금까지 반려로 지워진 행은 복구 대상이 아니고, 이 마이그레이션은 **앞으로의 반려**만 상태로 남긴다.
--
-- ⚠ 반려 행이 남으면서 달라지는 것(연쇄까지 정직하게)
--   schedules 에 걸린 ON DELETE CASCADE — schedule_reservations(baseline:1109)·comments(baseline:1053) —
--   가 더 이상 발동하지 않는다. 종전 '반려=삭제' 는 그 포스터의 예약·문의까지 함께 지웠다.
--   이제 남는다. 승인됐던 포스터를 반려하면 예약자의 '내 예약'(getMyReservations, 좌측 조인)이
--   RLS 로 schedules 를 못 읽어 제목 '(대회)' · 날짜 빈칸으로 보인다. 데이터 보존 쪽이 옳다고 보고 남긴다.
--   realtime 도 뒤집힌다: DELETE 는 RLS 로 걸러지지 않아 전원에게 방송됐지만, UPDATE 는
--   schedules_select 에 막혀 소유자·관리자에게만 간다 → 남의 화면에서는 새로고침 전까지 안 사라진다.
--
-- 기존 행 영향 0
--   컬럼 둘 다 nullable · DEFAULT 없음 → 테이블 재작성 없이 카탈로그만 바뀐다.
--   기존 행은 전부 NULL = '반려된 적 없음'. approved 를 읽는 화면·RLS·트리거는 하나도 달라지지 않는다.
--   이 파일은 어떤 포스터도 반려하지 않는다.
--
-- 왜 status enum 이 아니라 컬럼 둘인가
--   approved(boolean)를 읽는 곳이 클라이언트 13곳·RLS 4개·트리거 4개다. 세 값짜리 status 로 갈아타면
--   그 전부를 같은 커밋에서 고쳐야 하고 하나만 놓쳐도 라이브에서 포스터가 사라진다(기능 소실).
--   rejected_at(반려 시각 = 상태) + reject_reason(사유 원문) 둘이면 approved 를 건드리지 않고 끝난다.
--
-- 재제출 경로(이게 없으면 반려가 그냥 조용한 무덤이다)
--   업주가 포스터를 수정해 저장하면(= updated_at 이 올라간 UPDATE) 반려가 풀려 다시 대기열로 간다.
--   남이 일으키는 UPDATE 는 updated_at 을 건드리지 않는다 — 소스로 확인한 3종:
--     update_qna_count(baseline:4457, unread_qna_count 만) · bump_schedule_view(20260817e, view_count 만)
--     · send_tournament_reminders(20260817d, reminder_sent_at 만).
--
-- 롤백
--   drop trigger if exists trg_notify_schedule_rejected on public.schedules;
--   drop function if exists public.notify_on_schedule_rejected();
--   alter table public.schedules drop column if exists rejected_at, drop column if exists reject_reason;
--   prevent_self_approve_poster 옛 본문: supabase/baseline/2026-07-20-live-snapshot.sql:3546
--
-- 적용: 운영 DB 에 아직 적용하지 않았다. 하단 검증 블록이 적용 직후 스스로 확인하고 아니면 전체 롤백한다.
-- 멱등: 두 번 실행해도 안전하다(검증 블록이 '반려된 행이 있다'는 이유로 터지지 않는다 — 아래 ② 참고).

-- ── ① 반려 상태를 남길 자리 ───────────────────────────────────────────────────
alter table public.schedules add column if not exists rejected_at   timestamptz;
alter table public.schedules add column if not exists reject_reason text;

comment on column public.schedules.rejected_at is
  '관리자가 반려한 시각. null = 반려된 적 없음. 관리자만 세울 수 있다(trg_prevent_self_approve). 2026-09-11';
comment on column public.schedules.reject_reason is
  '반려 사유 원문 — 업주 알림과 업주 화면(내 매장 > 게임 관리)에 그대로 보인다. 2026-09-11';

-- ── ② BEFORE 가드 확장 — 승인 위조 차단은 그대로, 반려 필드를 같은 규칙 아래 둔다 ──────────
--   새 트리거를 하나 더 붙이지 않고 이미 '승인 상태를 누가 바꿀 수 있는가'를 소유한 함수를 넓힌다.
--   (트리거가 둘이면 순서 의존이 생기고, 같은 판정이 두 곳에 갈라진다.)
--   트리거는 baseline:4807 의 BEFORE UPDATE 그대로 재사용한다 — INSERT 가 없으므로 old 는 항상 있다.
create or replace function public.prevent_self_approve_poster()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 관리자만 승인·반려 상태를 바꾼다. 그 외(업주·비로그인·크론)는 원래 값 유지 — NULL-safe 비교.
  if public.my_role() is distinct from 'admin'::user_role then
    new.approved := old.approved;
    -- 업주가 내용을 저장한 것(시각이 실제로 올라간 UPDATE)만 반려를 푼다 = 재제출.
    -- 문의 카운터·조회수·리마인더처럼 남이 일으키는 UPDATE 는 상태를 그대로 둔다(위조도 함께 막힌다).
    if new.updated_at is distinct from old.updated_at then
      new.rejected_at := null;
      new.reject_reason := null;
    else
      new.rejected_at := old.rejected_at;
      new.reject_reason := old.reject_reason;
    end if;
  end if;
  -- 승인된 포스터는 반려 상태를 함께 가질 수 없다(반려한 것을 관리자가 다시 승인한 경우).
  if new.approved then
    new.rejected_at := null;
    new.reject_reason := null;
  end if;
  return new;
end; $$;

-- ── ③ 반려 알림 — 승인 트리거와 같은 테이블·같은 enum 값('approval') ────────────────────
--   notif_type 에 새 값을 만들지 않는다: ALTER TYPE ADD VALUE 는 같은 트랜잭션 안에서 그 값을 쓸 수 없고
--   (20260817c 가 그 이유로 20260817d 와 분리됐다), 클라이언트 라우터(App.tsx 의 n.type === 'approval')가
--   모르는 값이면 알림을 눌러도 아무 데도 못 간다. 승인·반려는 같은 심사 결과다.
--   사유는 200자에서 자른다 — message 는 push_on_notification 이 to_jsonb(new) 로 엣지 함수에 그대로 싣는다
--   (20260817d notify_on_comment 의 left(...,80) 과 같은 관행). 전문은 업주 화면에 그대로 남는다.
create or replace function public.notify_on_schedule_rejected()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.rejected_at is not null and old.rejected_at is null and new.owner_id is not null then
    insert into public.notifications (user_id, type, title, message, avatar_color, read)
    values (new.owner_id, 'approval', '포스터 반려 안내',
            coalesce(new.title, '') || ' 포스터가 반려되었습니다.'
              || coalesce(' 사유: ' || left(nullif(btrim(new.reject_reason), ''), 200), '')
              || ' 내용을 수정해 저장하면 다시 승인 대기열로 올라갑니다.',
            '#FF4D6D', false);
  end if;
  return new;
end; $$;

-- UPDATE OF rejected_at + WHEN — 조회수 UPDATE 폭주(2026-09-10 팬아웃 점검)에 얹히지 않게 좁힌다.
-- bump_schedule_view 는 view_count 만 SET 하므로 이 트리거는 아예 호출되지 않는다.
drop trigger if exists trg_notify_schedule_rejected on public.schedules;
create trigger trg_notify_schedule_rejected
  after update of rejected_at on public.schedules
  for each row
  when (new.rejected_at is not null and old.rejected_at is null)
  execute function public.notify_on_schedule_rejected();

-- ── ④ ACL 재선언 — create or replace 뒤엔 반드시 다시 닫는다(20260902b 의 internal 규칙) ──────
revoke all on function public.prevent_self_approve_poster()  from public, anon, authenticated;
revoke all on function public.notify_on_schedule_rejected()  from public, anon, authenticated;

-- 새 컬럼은 스키마 캐시를 새로 읽어야 PostgREST 가 본다
notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 하나라도 어긋나면 전체 롤백 ────────────────────────────
do $$
declare v_src text; v_def text; v_n bigint;
begin
  -- ① 컬럼이 있고 nullable · 기본값 없음 = 기존 행 재작성 0
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'schedules'
                   and column_name = 'rejected_at' and is_nullable = 'YES' and column_default is null) then
    raise exception 'ABORT: rejected_at 가 없거나 nullable/무기본값이 아니다';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'schedules'
                   and column_name = 'reject_reason' and is_nullable = 'YES' and column_default is null) then
    raise exception 'ABORT: reject_reason 가 없거나 nullable/무기본값이 아니다';
  end if;

  -- ② 불변식: 승인과 반려는 동시에 설 수 없다(②의 가드가 지킨다).
  --    '반려된 행이 0건' 을 세면 기능이 돌기 시작한 뒤 재실행이 무조건 터진다 — 그래서 불변식으로 센다.
  select count(*) into v_n from public.schedules where approved and rejected_at is not null;
  if v_n <> 0 then raise exception 'ABORT: 승인과 반려가 동시인 행이 있다 (%건)', v_n; end if;

  -- ③ BEFORE 가드 — 원래 하던 일(승인 위조 차단)이 살아 있고, 반려 필드도 같은 규칙 아래 있다
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prevent_self_approve_poster';
  if v_src is null then raise exception 'ABORT: prevent_self_approve_poster 없음'; end if;
  if strpos(v_src, 'new.approved := old.approved') = 0 then
    raise exception 'ABORT: 승인 위조 차단이 사라졌다';
  end if;
  if strpos(v_src, 'new.reject_reason := old.reject_reason') = 0 then
    raise exception 'ABORT: 업주가 반려 필드를 직접 쓸 수 있다';
  end if;
  if strpos(v_src, 'new.updated_at is distinct from old.updated_at') = 0 then
    raise exception 'ABORT: 남이 일으킨 UPDATE(문의 카운터·조회수)가 반려를 지운다';
  end if;
  if strpos(v_src, 'is distinct from ''admin''::user_role') = 0 then
    raise exception 'ABORT: 권한 판정이 NULL-safe 하지 않다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_prevent_self_approve'
                   and tgrelid = 'public.schedules'::regclass and not tgisinternal) then
    raise exception 'ABORT: trg_prevent_self_approve 가 사라졌다';
  end if;

  -- ④ 알림 — 승인과 같은 테이블, notif_type 에 실재하는 값
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'notify_on_schedule_rejected';
  if v_src is null then raise exception 'ABORT: notify_on_schedule_rejected 없음'; end if;
  if strpos(v_src, 'insert into public.notifications') = 0 then
    raise exception 'ABORT: 반려 알림이 알림 테이블에 쓰지 않는다';
  end if;
  if strpos(v_src, '''approval''') = 0 then
    raise exception 'ABORT: 반려 알림이 다른 type 을 쓴다(클라이언트 라우터가 모르는 값)';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'notif_type' and e.enumlabel = 'approval') then
    raise exception 'ABORT: notif_type 에 approval 이 없다';
  end if;

  -- ⑤ 트리거는 rejected_at 이 새로 세워질 때만 — 조회수 UPDATE 에 얹히면 안 된다
  select pg_get_triggerdef(oid) into v_def from pg_trigger
   where tgname = 'trg_notify_schedule_rejected' and tgrelid = 'public.schedules'::regclass;
  if v_def is null then raise exception 'ABORT: trg_notify_schedule_rejected 없음'; end if;
  if position('UPDATE OF rejected_at' in v_def) = 0 then
    raise exception 'ABORT: 반려 트리거가 모든 UPDATE 에 걸린다(조회수 팬아웃)';
  end if;

  -- ⑥ ACL — 트리거 함수는 직접 호출 불가(create or replace 가 지운 몫을 다시 닫았는가)
  if has_function_privilege('anon', 'public.notify_on_schedule_rejected()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_on_schedule_rejected()', 'execute')
     or has_function_privilege('anon', 'public.prevent_self_approve_poster()', 'execute')
     or has_function_privilege('authenticated', 'public.prevent_self_approve_poster()', 'execute') then
    raise exception 'ABORT: 트리거 함수가 외부에 열려 있다';
  end if;
end $$;
