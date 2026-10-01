-- ✅ 2026-10-02 라이브 적용 완료(nuri-lead · Management API database/query 로 이 파일 그대로 한 번에, 게이트 통과).
--    적용 전 리드 롤백 리허설: 확장 하네스 T0~T20(T11 위조 작성자→실제 작성자 정지 PASS, T13·T15·T16~T19 PASS) · 파일 REHEARSAL_OK. 하네스 T14 의 관리자 가림 미반영은 하네스 순서 문제로 판명(라이브·새 정의 단독 리허설 모두 가림 true).
--    적용 후 실측: admin_decide_report 55194e25(anon=f·auth=t) · _report_target_owner f1421cde(anon=f·auth=f) · admin_set_post_blinded 1ed3efb5 · reports 트리거 = trg_reports_server_fields,trg_rl_reports(자동 가림 제거) · 백업 표 2개 RLS on · 숨김 글 3→0(오너 10-02 공개) · 보안 어드바이저 ERROR 0.
-- (원래 머리줄) ⏳ 초안 — 라이브 미적용(2026-10-02, community-team 작성). 적용 판단은 nuri-lead.
--    2026-10-02 실측: 게이트 md5 4종·reports 트리거 구성 = 라이브와 일치(select 조회). 공개 대상 = 자동 0 · 출처 불명 3.
--    음성 대조(현행 라이브): 서로 다른 신고자 3명 → 글이 가려짐 재현(raise 로 되돌림, 사후 reports 0건 확인).
--    ⚠ 롤백 리허설(본문 + 맨 아래 REHEARSAL 블록, 끝의 raise 로 되돌림)은 **NOT_RUN** — execute_sql 호출이 권한 단계에서 거절됐다.
--      적용 전에 리드가 같은 묶음을 한 번 돌려 REHEARSAL_OK 를 확인해라.
-- ⏳ 개정 b(2026-10-02, community-team) — 독립 검토 FAIL(T11)과 권고 3건 반영. 여전히 **미적용**(적용은 리드).
--    · ⑤ reports BEFORE INSERT 트리거 trg_reports_server_fields: target_owner_id 를 서버가 원문 행에서 채운다(클라이언트 값 무시).
--      클라이언트 역할(authenticated·anon)의 insert 는 status='open'·created_at=now() 로 고정한다(검토 R6 — 속도 제한 우회 차단).
--    · ⑥ 기존 행 백필: 실제 작성자와 다른 target_owner_id 를 원문 기준으로 고친다. 백업 표 + 건수 게이트.
--      2026-10-02 라이브 select: reports 전체 0건 → 위조·불일치 0건(게시글 0 · 댓글 0 · 회원 0).
--    · ③ admin_decide_report: 정지 대상을 **원문 행**(게시글·댓글·매물·실시간 작성자, 회원 신고는 target_id)에서 정한다.
--      target_owner_id 는 읽지 않는다. 원문이 없으면 정지를 거절한다.
--      영구 정지·기한 없는 정지를 기간 정지로 줄이지 않는다(T13) · 더 긴 기존 기한은 유지한다.
--      승인 대기(pending) 회원은 정지하지 않는다(T15 — 만료 크론이 active 로 바꿔 승인을 건너뛴다).
--      실행되지 않던 '광고·구매 기록이 연결된 글' 예외 처리를 지웠다(community_posts·comments 를 참조하는 FK 는 전부 CASCADE·SET NULL).
--    · 자가검사의 숨김 경로 탐지를 판정기 하나(pg_temp._20261002a_hides_post)로 바꿔 글자 순서·형태에 덜 민감하게 했다.
--      라이브 함수 전체에 돌린 결과(select, 2026-10-02): 걸리는 것 = auto_blind_reported_post(① 이 지운다)·admin_set_post_blinded(허용) 뿐.
--    · 리허설(개정 b): 격리 PGlite(PG 17.5) 스텁 위에서 검토 하네스 T0~T15 + 추가 T16~T20 → 옛 정의 T11·T13·T15~T19 FAIL,
--      이 정의 전부 PASS · 아래 REHEARSAL 블록 REHEARSAL_OK · 백필 게이트(위조 1건이면 멈춤, 기대값 1이면 원문 작성자로 고침) 확인.
--      ⚠ 라이브 롤백 리허설은 이번에도 **NOT_RUN** — execute_sql 이 권한 단계에서 거절(declined)됐다. 리드가 적용 전에 돌린다.
--
-- 20261002a — 오너 10-02 신고 정책: "신고가 들어와도 글을 지우지(가리지) 말고, 관리자가 보고
--   기각 · 글만 삭제 · 유저 정지 중에서 정한다. 신고된다고 일단 글이 정지되는 게 아니다."
--   + 오너 확정(10-02): "관리자가 직접 가린 글만 가려 놓고" — 근거 없는 가림은 공개로 돌린다.
--
-- 자동 가림 경로(라이브 전수 조회 2026-10-02):
--   · reports AFTER INSERT 트리거 trg_auto_blind_reported_post → auto_blind_reported_post()
--     (기각 아닌 신고의 서로 다른 신고자 3명 이상이면 community_posts.blinded=true, blinded_source='auto') — **유일한 경로**.
--   · reports 의 다른 트리거는 rl_reports(속도 제한)뿐. 클라이언트 낙관적 숨김 없음(ReportModal 은 토스트만).
--   · 댓글(comments)에는 가림 칸이 없다.
--
-- 무엇을 바꾸나:
--   ① 자동 가림 트리거·함수를 지운다 — 신고는 기록만 한다.
--   ② admin_set_post_blinded 가 audit_log 에 'post_blind' 를 남긴다 — 앞으로 '관리자가 직접 가렸다'는 근거가 생긴다.
--      (지금까지는 기록이 없어서, 20261001e 가 숨김 3건을 신고 0건이라는 이유만으로 'admin' 으로 채웠다.)
--   ③ admin_decide_report 신설 — 관리자 결정 하나로 신고를 닫는다.
--      dismiss(기각: 글 그대로) · resolve(조치 없이 처리 완료) · delete(글/댓글 삭제) · suspend(작성자 정지, 글 삭제 선택).
--      같은 대상의 다른 미처리 신고를 함께 닫을지 고른다. audit_log 'report_decide' 기록.
--   ④ 공개 복원(별도 블록): 관리자 가림 근거가 없는 숨김 글을 공개로 돌린다. 백업 표 + 건수 게이트.
--
-- 롤백:
--   · ① 20261001e 의 auto_blind_reported_post 정의를 다시 만들고
--       `create trigger trg_auto_blind_reported_post after insert on public.reports for each row execute function public.auto_blind_reported_post();`
--       + `revoke all on function public.auto_blind_reported_post() from public, anon, authenticated;`
--   · ② 20261001e ③ 정의로 되돌린다(_audit 한 줄만 다르다).
--   · ③ `drop function if exists public.admin_decide_report(uuid,text,boolean,boolean,integer,text);`
--   · ⑤ `drop trigger if exists trg_reports_server_fields on public.reports; drop function if exists public._reports_server_fields();`
--   · ⑥ `update public.reports r set target_owner_id = b.old_owner from public._bk_20261002a_report_owner b where b.id = r.id;`
--   · ④ `update public.community_posts p set blinded = true, blinded_source = b.blinded_source
--         from public._bk_20261002a_unblinded b where b.id = p.id;`  (백업 표는 그 뒤 drop)

-- ── 적용 전 게이트 ──────────────────────────────────────────────────────────────
do $$
begin
  if md5(pg_get_functiondef('public.auto_blind_reported_post()'::regprocedure)) is distinct from '7208634f8d4128e69400ff208b76b383' then
    raise exception '20261002a 게이트: auto_blind_reported_post 가 초안 작성 때와 다르다';
  end if;
  if md5(pg_get_functiondef('public.admin_set_post_blinded(uuid,boolean)'::regprocedure)) is distinct from '701c57dd1ceebf4a1bc79a46fa32b77e' then
    raise exception '20261002a 게이트: admin_set_post_blinded 가 초안 작성 때와 다르다';
  end if;
  if md5(pg_get_functiondef('public._audit(text,text,jsonb)'::regprocedure)) is distinct from '0f191125e3cba9d94891c5e3493110ec' then
    raise exception '20261002a 게이트: _audit 가 초안 작성 때와 다르다';
  end if;
  if exists (select 1 from pg_proc where proname in ('admin_decide_report', '_reports_server_fields', '_report_target_owner')
              and pronamespace = 'public'::regnamespace) then
    raise exception '20261002a 게이트: 새로 만들 함수(admin_decide_report·_reports_server_fields·_report_target_owner)가 이미 있다';
  end if;
  -- reports 의 트리거가 바뀌었으면(새 자동 처리 경로) 다시 조사해라.
  if (select string_agg(tgname, ',' order by tgname) from pg_trigger
       where tgrelid = 'public.reports'::regclass and not tgisinternal)
     is distinct from 'trg_auto_blind_reported_post,trg_rl_reports' then
    raise exception '20261002a 게이트: reports 트리거 구성이 초안 작성 때와 다르다';
  end if;
end $$;

-- ── ① 자동 가림 제거 ────────────────────────────────────────────────────────────
drop trigger if exists trg_auto_blind_reported_post on public.reports;
drop function if exists public.auto_blind_reported_post();

-- ── ② 관리자 가림에 근거(감사 기록)를 남긴다 ─────────────────────────────────────
create or replace function public.admin_set_post_blinded(p_post_id uuid, p_blinded boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(public.my_role()::text,'') <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  -- 20261001e: 숨길 때 'admin', 풀 때 null(CHECK: 숨김일 때만 출처가 있다).
  update public.community_posts
     set blinded = p_blinded,
         blinded_source = case when p_blinded then 'admin' else null end
   where id = p_post_id;
  -- 20261002a: '관리자가 직접 가렸다'의 근거 — 오너 기준(관리자 가림만 유지)을 앞으로 판정할 수 있게.
  if found then
    perform public._audit('post_blind', p_post_id::text, jsonb_build_object('blinded', p_blinded));
  end if;
end; $function$;

revoke all on function public.admin_set_post_blinded(uuid,boolean) from public, anon;
grant execute on function public.admin_set_post_blinded(uuid,boolean) to authenticated, service_role;

-- ── 신고 대상의 작성자 판정기(③ 정지 · ⑤ 트리거 · ⑥ 백필이 모두 이것 하나를 쓴다) ──────────
-- 회원 신고는 대상 id 자체, 글·댓글·매물·실시간은 원문 행의 작성자. 원문이 없거나 모르는 종류면 null.
-- 숨김 글도 봐야 하므로 SECURITY DEFINER(RLS 우회). 내부 함수 — 클라이언트 실행 권한 없음.
create or replace function public._report_target_owner(p_type text, p_id uuid)
 returns uuid
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_id is null then null
    when p_type = 'user'    then p_id
    when p_type = 'post'    then (select cp.user_id from public.community_posts cp where cp.id = p_id)
    when p_type = 'comment' then (select c.user_id from public.comments c where c.id = p_id)
    when p_type = 'listing' then (select ml.seller_id from public.marketplace_listings ml where ml.id = p_id)
    when p_type = 'live'    then (select lw.user_id from public.live_wall lw where lw.id = p_id)
  end
$function$;

revoke all on function public._report_target_owner(text, uuid) from public, anon, authenticated;
grant execute on function public._report_target_owner(text, uuid) to service_role;

-- ── ③ 관리자 결정 RPC ───────────────────────────────────────────────────────────
create or replace function public.admin_decide_report(
  p_report_id uuid,
  p_action text,                              -- 'dismiss' | 'resolve' | 'delete' | 'suspend'
  p_include_same_target boolean default true, -- 같은 대상의 다른 미처리 신고도 함께 닫는다
  p_delete_content boolean default false,     -- suspend 일 때 글/댓글도 삭제
  p_suspend_days integer default null,        -- suspend: null = 영구 정지(banned), 1~3650 = 기간 정지
  p_reason text default null                  -- suspend: 정지 사유(필수 — 회원 관리 화면과 같은 규칙)
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r public.reports%rowtype;
  v_ids uuid[];
  v_user uuid;
  v_user_role public.user_role;
  v_user_status public.user_status;
  v_user_until timestamptz;
  v_until timestamptz;
  v_deleted boolean := false;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status text;
begin
  if public.my_role() is distinct from 'admin'::public.user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if p_action is null or p_action not in ('dismiss', 'resolve', 'delete', 'suspend') then
    raise exception '알 수 없는 처리입니다';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found or r.status is distinct from 'open' then
    raise exception '이미 처리되었거나 없는 신고입니다';
  end if;

  -- 함께 닫을 신고(행 잠금). 대상 id 가 없는 신고는 그 한 건만.
  if coalesce(p_include_same_target, true) and r.target_id is not null then
    select array_agg(id order by created_at) into v_ids from (
      select id, created_at from public.reports
       where target_type = r.target_type and target_id = r.target_id and status = 'open'
       for update) s;
  else
    v_ids := array[r.id];
  end if;

  if p_action = 'delete' and (r.target_type not in ('post', 'comment') or r.target_id is null) then
    raise exception '삭제할 수 있는 대상(게시글·댓글)이 아닙니다';
  end if;

  if p_action = 'suspend' then
    -- 개정 b(검토 T11): 정지 대상은 **원문 행**에서 서버가 정한다. 신고자가 쓴 reports.target_owner_id 는 읽지 않는다.
    -- 회원 신고는 대상 id 가 곧 회원이다. 원문이 이미 없으면 작성자를 확정할 수 없으니 정지하지 않는다.
    v_user := public._report_target_owner(r.target_type, r.target_id);
    if v_user is null then raise exception '정지할 작성자를 찾지 못했습니다(원문이 이미 삭제됐을 수 있습니다)'; end if;
    select role, status, suspended_until into v_user_role, v_user_status, v_user_until
      from public.profiles where id = v_user for update;
    if not found then raise exception '정지할 작성자를 찾지 못했습니다'; end if;
    if v_user_role = 'admin' or v_user = auth.uid() then raise exception '운영자는 정지할 수 없습니다'; end if;
    if v_user_status = 'withdrawn' then raise exception '이미 탈퇴한 회원입니다'; end if;
    -- 개정 b(검토 T15): 승인 대기 회원을 정지하면 만료 크론이 active 로 돌려 승인을 건너뛴다 — 정상·정지 중·영구 정지만.
    if v_user_status is null or v_user_status not in ('active', 'suspended', 'banned') then
      raise exception '승인 대기 중인 회원은 정지할 수 없습니다. 회원 관리에서 승인·반려를 먼저 정해 주세요';
    end if;
    if v_reason is null then raise exception '정지 사유를 입력해 주세요'; end if;
    if p_suspend_days is not null and (p_suspend_days < 1 or p_suspend_days > 3650) then
      raise exception '정지 기간은 1~3650일입니다';
    end if;
    -- 개정 b(검토 T13): 이미 더 긴 제재를 줄이지 않는다. 영구 정지·기한 없는 정지 위에 기간 정지는 거절하고,
    -- 기간 정지끼리는 더 늦은 만료를 남긴다.
    if p_suspend_days is not null and (v_user_status = 'banned'
                                        or (v_user_status = 'suspended' and v_user_until is null)) then
      raise exception '이미 영구(기한 없는) 정지된 회원입니다. 기간 정지로 줄일 수 없습니다 — 신고만 닫으려면 처리 완료를 고르세요';
    end if;
    v_until := case when p_suspend_days is null then null
                    when v_user_status = 'suspended' then greatest(v_user_until, now() + make_interval(days => p_suspend_days))
                    else now() + make_interval(days => p_suspend_days) end;
    -- 회원 관리 화면(updateUserStatus)과 같은 칸을 쓴다: 기간 정지 = suspended + suspended_until, 영구 = banned.
    update public.profiles
       set status = case when p_suspend_days is null then 'banned'::public.user_status else 'suspended'::public.user_status end,
           suspended_until = v_until,
           sanction_reason = v_reason
     where id = v_user;
  end if;

  -- community_posts·comments 를 참조하는 FK 는 전부 CASCADE·SET NULL 이다(2026-10-02 조회) — 삭제가 FK 로 막히지 않는다.
  if p_action = 'delete' or (p_action = 'suspend' and coalesce(p_delete_content, false)
                             and r.target_type in ('post', 'comment') and r.target_id is not null) then
    if r.target_type = 'post' then
      delete from public.community_posts where id = r.target_id;
    else
      delete from public.comments where id = r.target_id;
    end if;
    v_deleted := found;
  end if;

  v_status := case when p_action = 'dismiss' then 'dismissed' else 'resolved' end;
  update public.reports set status = v_status where id = any(v_ids) and status = 'open';

  perform public._audit('report_decide', p_report_id::text, jsonb_build_object(
    'action', p_action, 'target_type', r.target_type, 'target_id', r.target_id,
    'report_ids', to_jsonb(v_ids), 'deleted', v_deleted,
    'suspended_user', v_user, 'suspend_days', case when p_action = 'suspend' then p_suspend_days end,
    'suspended_until', v_until));

  return jsonb_build_object('status', v_status, 'closed', coalesce(array_length(v_ids, 1), 0),
                            'deleted', v_deleted, 'suspended_user', v_user, 'suspended_until', v_until);
end $function$;

revoke all on function public.admin_decide_report(uuid,text,boolean,boolean,integer,text) from public, anon;
grant execute on function public.admin_decide_report(uuid,text,boolean,boolean,integer,text) to authenticated, service_role;

-- ── ⑤ 신고 행의 서버 칸 — 작성자(target_owner_id)는 서버가 원문에서 채운다 ────────────
-- 검토 T11: reports_insert 정책은 reporter_id 만 확인하고 authenticated 에 target_owner_id INSERT 권한이 열려 있어,
-- 신고자가 아무 회원이나 '작성자'로 적을 수 있었다. 이제 클라이언트가 보낸 값은 항상 덮어쓴다.
-- 원문(글·댓글·매물·실시간)을 못 찾으면 null — 서버가 확인하지 못한 작성자를 남기지 않는다.
-- 클라이언트 역할의 insert 는 status·created_at 도 서버가 정한다(검토 R6: 과거 시각으로 속도 제한 rl_reports 를 피하던 길).
-- SECURITY DEFINER 안에서도 current_setting('role') 은 요청 역할(authenticated·anon)을 그대로 보여 준다(2026-10-02 라이브 프로브).
create or replace function public._reports_server_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  new.target_owner_id := public._report_target_owner(new.target_type, new.target_id);
  if current_setting('role', true) in ('authenticated', 'anon') then
    new.status := 'open';
    new.created_at := now();
  end if;
  return new;
end $function$;

revoke all on function public._reports_server_fields() from public, anon, authenticated;

drop trigger if exists trg_reports_server_fields on public.reports;
create trigger trg_reports_server_fields before insert on public.reports
  for each row execute function public._reports_server_fields();

-- ── ⑥ 기존 신고 행 백필 — 실제 작성자와 다른 target_owner_id 를 원문 기준으로 고친다 ───────
-- 2026-10-02 라이브 select: reports 0건 → 위조·불일치 0건. 건수가 달라졌으면 멈추고 다시 센다.
create table if not exists public._bk_20261002a_report_owner (
  id uuid primary key,
  old_owner uuid,
  new_owner uuid,
  backed_up_at timestamptz not null default now()
);
alter table public._bk_20261002a_report_owner enable row level security;
revoke all on public._bk_20261002a_report_owner from public, anon, authenticated;

do $$
declare
  c_expected_mismatch constant int := 0;   -- 2026-10-02 라이브 실측
  v_n int;
begin
  insert into public._bk_20261002a_report_owner (id, old_owner, new_owner)
  select r.id, r.target_owner_id, s.owner
    from public.reports r
    cross join lateral (select public._report_target_owner(r.target_type, r.target_id) as owner) s
   where r.target_owner_id is distinct from s.owner
  on conflict (id) do nothing;

  select count(*) into v_n from public._bk_20261002a_report_owner;
  if v_n is distinct from c_expected_mismatch then
    raise exception '20261002a 게이트: 작성자 불일치 신고가 실측과 다르다(% / 기대 %) — 다시 세고 리드 확인을 받아라', v_n, c_expected_mismatch;
  end if;

  update public.reports r set target_owner_id = b.new_owner
    from public._bk_20261002a_report_owner b where b.id = r.id;
end $$;

-- ── ④ 공개 복원 — 관리자 가림 근거가 없는 숨김 글 ────────────────────────────────
-- 근거 = audit_log 'post_blind'(②부터 기록). 20261001e 의 'admin' 출처는 **신고 0건이라는 이유로 채운 백필**이라
-- 관리자 행동의 기록이 아니다(20261001e 머리말 "숨김 글 3건 출처 admin" = 아래 세 id, 활동·감사 기록 0건).
-- 그래서 ② 이후의 감사 기록이 없는 숨김 글은 전부 공개 대상이다:
--   · blinded_source = 'auto'(신고 자동 가림) — 2026-10-02 조회 0건
--   · 출처 불명(백필 'admin') — 2026-10-02 조회 3건: 50c98864… · 54f448a7… · 51e5dc42… (작성자 모두 관리자 계정, 제목 'ㅇ'·'d'·'ㅎㅇ')
-- ⚠ 리드가 출처 불명 3건의 표본을 확인한 뒤 적용한다(오너 지시). 건수가 바뀌었으면 아래 게이트가 멈춘다.
create table if not exists public._bk_20261002a_unblinded (
  id uuid primary key,
  blinded_source text,
  bucket text not null,                 -- 'auto' | 'unknown'
  backed_up_at timestamptz not null default now()
);
alter table public._bk_20261002a_unblinded enable row level security;
revoke all on public._bk_20261002a_unblinded from public, anon, authenticated;

do $$
declare
  c_expected_auto    constant int := 0;   -- 리허설(2026-10-02) 실측
  c_expected_unknown constant int := 3;   -- 리허설(2026-10-02) 실측
  v_auto int; v_unknown int;
begin
  insert into public._bk_20261002a_unblinded (id, blinded_source, bucket)
  select p.id, p.blinded_source, case when p.blinded_source = 'auto' then 'auto' else 'unknown' end
    from public.community_posts p
   where p.blinded
     and not exists (select 1 from public.audit_log a
                      where a.action = 'post_blind' and a.target = p.id::text)
  on conflict (id) do nothing;

  select count(*) filter (where bucket = 'auto'), count(*) filter (where bucket = 'unknown')
    into v_auto, v_unknown from public._bk_20261002a_unblinded;
  if v_auto is distinct from c_expected_auto or v_unknown is distinct from c_expected_unknown then
    raise exception '20261002a 게이트: 공개 대상이 리허설과 다르다(자동 % / 기대 %, 출처 불명 % / 기대 %) — 다시 세고 리드 확인을 받아라',
      v_auto, c_expected_auto, v_unknown, c_expected_unknown;
  end if;

  update public.community_posts p set blinded = false, blinded_source = null
    from public._bk_20261002a_unblinded b where b.id = p.id and p.blinded;
end $$;

-- ── 자가검사 ────────────────────────────────────────────────────────────────────
-- 숨김 경로 판정기(개정 b · 검토 R5). 예전 정규식 `set\s+blinded\s*=\s*true` 는 `set blinded_source = 'x', blinded = true` 처럼
-- 순서가 다르거나 `new.blinded := true` · `set (blinded, …) = (…)` · insert 열 목록 · 동적 SQL 형태를 못 봤다.
-- 판정: 주석을 걷어 낸 본문에서 아래 중 하나라도 있으면 '글을 가릴 수 있는 함수'다(거짓 양성은 멈춤 = 안전 쪽).
--   ① blinded 에 false·null 이 아닌 값을 대입/비교(= · :=, 위치 무관)   ② 행 생성자 `set ( … blinded … ) =`
--   ③ insert into community_posts( … blinded … )                         ④ 문자열 속 'blinded'·"blinded"(동적 SQL·jsonb 키)
-- 미리보기·자가검사·리허설이 **이 함수 하나**를 쓴다(판정기를 복붙하지 않는다 — nuri-migration §5-2).
create or replace function pg_temp._20261002a_hides_post(p_def text) returns boolean
 language sql immutable as $j$
  select d ~* '\mblinded\M\s*:?=(?!\s*(false|null)\M)'
      or d ~* 'set\s*\([^()]*\mblinded\M[^()]*\)\s*='
      or d ~* 'insert\s+into\s+(public\.)?community_posts\s*\([^)]*\mblinded\M'
      or d ~* '[''"]blinded[''"]'
    from (select regexp_replace(coalesce(p_def, ''), '--[^\n]*', '', 'g') as d) s
$j$;

do $$
declare v_cfg text[];
begin
  -- 판정기 자기 확인: 알려진 우회 형태는 잡고, 가림을 푸는·읽는 형태는 놓아준다.
  if not (pg_temp._20261002a_hides_post('update community_posts set blinded = true where id = x')
          and pg_temp._20261002a_hides_post('update public.community_posts set blinded_source = ''x'', blinded = true')
          and pg_temp._20261002a_hides_post('new.blinded := true;')
          and pg_temp._20261002a_hides_post('update community_posts set (blinded_source, blinded) = (''x'', true)')
          and pg_temp._20261002a_hides_post('insert into public.community_posts (user_id, blinded) values (u, true)')
          and pg_temp._20261002a_hides_post('execute format(''update community_posts set %I = true'', ''blinded'')')
          and pg_temp._20261002a_hides_post('update community_posts set blinded = not blinded')) then
    raise exception '20261002a: 숨김 경로 판정기가 알려진 형태를 놓친다';
  end if;
  if pg_temp._20261002a_hides_post('update community_posts set blinded = false, blinded_source = null where blinded')
     or pg_temp._20261002a_hides_post('select 1 from community_posts cp where cp.blinded = false')
     or pg_temp._20261002a_hides_post('new.blinded := false; -- blinded = true 는 주석')
     or pg_temp._20261002a_hides_post('and coalesce(p.blinded, false) = false') then
    raise exception '20261002a: 숨김 경로 판정기가 해제·읽기를 가림으로 오판한다';
  end if;
  if (select string_agg(tgname, ',' order by tgname) from pg_trigger
       where tgrelid = 'public.reports'::regclass and not tgisinternal)
     is distinct from 'trg_reports_server_fields,trg_rl_reports' then
    raise exception '20261002a: reports 트리거가 서버 칸 채우기·속도 제한 둘이 아니다';
  end if;
  if exists (select 1 from pg_proc where proname = 'auto_blind_reported_post' and pronamespace = 'public'::regnamespace) then
    raise exception '20261002a: 자동 가림 함수가 남았다';
  end if;
  -- 글을 가리는 함수는 관리자 직접 가림 하나뿐이어야 한다(신고·트리거 경로로 다시 생기면 멈춘다).
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
               and p.proname <> 'admin_set_post_blinded'
               and pg_temp._20261002a_hides_post(pg_get_functiondef(p.oid))) then
    raise exception '20261002a: 글을 가리는 다른 함수가 있다: %', (select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> 'admin_set_post_blinded'
        and pg_temp._20261002a_hides_post(pg_get_functiondef(p.oid)));
  end if;
  -- 검토 T11: 정지 대상은 원문에서 — 결정 RPC 가 신고자가 쓴 칸을 읽으면 안 된다.
  if regexp_replace(pg_get_functiondef('public.admin_decide_report(uuid,text,boolean,boolean,integer,text)'::regprocedure),
                    '--[^\n]*', '', 'g') ~* '\mtarget_owner_id\M' then
    raise exception '20261002a: admin_decide_report 가 reports.target_owner_id 를 읽는다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.reports'::regclass and tgname = 'trg_reports_server_fields'
                  and tgenabled = 'O' and tgfoid = 'public._reports_server_fields()'::regprocedure) then
    raise exception '20261002a: 서버 칸 채우기 트리거가 없거나 꺼져 있다';
  end if;
  if has_function_privilege('anon', 'public._report_target_owner(text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._report_target_owner(text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._reports_server_fields()', 'execute') then
    raise exception '20261002a: 내부 함수가 클라이언트에 열려 있다';
  end if;
  if has_table_privilege('anon', 'public._bk_20261002a_report_owner', 'select')
     or has_table_privilege('authenticated', 'public._bk_20261002a_report_owner', 'select') then
    raise exception '20261002a: 작성자 백업 표가 클라이언트에 열려 있다';
  end if;
  if exists (select 1 from public.reports r
              where r.target_owner_id is distinct from public._report_target_owner(r.target_type, r.target_id)) then
    raise exception '20261002a: 원문 작성자와 다른 target_owner_id 가 남았다';
  end if;
  select proconfig into v_cfg from pg_proc where oid = 'public.admin_decide_report(uuid,text,boolean,boolean,integer,text)'::regprocedure;
  if not exists (select 1 from pg_proc where oid = 'public.admin_decide_report(uuid,text,boolean,boolean,integer,text)'::regprocedure and prosecdef)
     or not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception '20261002a: admin_decide_report 가 SECURITY DEFINER·search_path 고정이 아니다 (%)', v_cfg;
  end if;
  if has_function_privilege('anon', 'public.admin_decide_report(uuid,text,boolean,boolean,integer,text)', 'execute')
     or has_function_privilege('anon', 'public.admin_set_post_blinded(uuid,boolean)', 'execute') then
    raise exception '20261002a: 관리자 RPC 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_decide_report(uuid,text,boolean,boolean,integer,text)', 'execute') then
    raise exception '20261002a: 결정 RPC 가 authenticated 에 닫혔다';
  end if;
  if has_table_privilege('anon', 'public._bk_20261002a_unblinded', 'select')
     or has_table_privilege('authenticated', 'public._bk_20261002a_unblinded', 'select') then
    raise exception '20261002a: 백업 표가 클라이언트에 열려 있다';
  end if;
  if exists (select 1 from public.community_posts p where p.blinded
              and not exists (select 1 from public.audit_log a where a.action = 'post_blind' and a.target = p.id::text)) then
    raise exception '20261002a: 관리자 가림 근거 없는 숨김 글이 남았다';
  end if;
end $$;

notify pgrst, 'reload schema';

/* REHEARSAL — 운영 DB 에서 `<이 파일 본문>` + 아래 블록을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-02 조회 — 역할·소유 확인): ADMIN c8e3734d(admin) · OWNER 7e435684(venue_owner, 매장 1)
     일반 회원 U1 fd14c2dc · U2 47360d8e · U3 7f985240 · U4 708de904 (role=user, 매장 소유 0) · 라이브 reports 0건.
   글 P = 1d703654-9260-4fe6-a2f1-c04c0c62a85c · Q = dddd0000-0000-4000-8000-000000000903 (작성자 ADMIN, 광고·구매 연결 0).
   정지 대상 글은 리허설 안에서 U3 명의로 새로 만든다(관리자 글로는 정지 시험이 안 된다).
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_u1 uuid := 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
  c_u2 uuid := '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
  c_u3 uuid := '7f985240-486c-4731-a166-109a52bea487';
  c_u4 uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_p uuid := '1d703654-9260-4fe6-a2f1-c04c0c62a85c';
  c_q uuid := 'dddd0000-0000-4000-8000-000000000903';
  r1 uuid; r2 uuid; r3 uuid; rq uuid; rs uuid; rs2 uuid; v_s uuid; v_owner uuid; v_b boolean; v_st text; v_until timestamptz; j jsonb; n int;
begin
  -- 공개 복원 결과
  select count(*) into n from public.community_posts where blinded;
  if n <> 0 then raise exception 'FAIL: 복원 뒤 숨김 글 % 건', n; end if;
  select count(*) into n from public._bk_20261002a_unblinded;
  if n <> 3 then raise exception 'FAIL: 백업 % 건', n; end if;

  -- 핵심: 서로 다른 3명이 신고해도 글이 가려지지 않는다(옛 트리거면 여기서 FAIL)
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, created_at) values (c_u1,'post',c_p,c_admin,'리허설', now() - interval '1 hour') returning id into r1;
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, created_at) values (c_u2,'post',c_p,c_admin,'리허설', now() - interval '1 hour') returning id into r2;
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, created_at) values (c_u3,'post',c_p,c_admin,'리허설', now() - interval '1 hour') returning id into r3;
  select blinded into v_b from public.community_posts where id = c_p;
  if v_b then raise exception 'FAIL: 신고 3건으로 글이 가려졌다'; end if;

  -- 음성: 비로그인 · 일반 회원 · 업주
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_decide_report(r1, 'dismiss'); raise exception 'FAIL: 비로그인 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(비로그인): %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_u4, 'role', 'authenticated')::text, true);
  begin perform public.admin_decide_report(r1, 'delete'); raise exception 'FAIL: 일반 회원 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(회원): %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  begin perform public.admin_decide_report(r1, 'suspend', true, false, 7, 'x'); raise exception 'FAIL: 업주 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(업주): %', sqlerrm; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  -- (a) 기각 — 이 신고만: 글은 그대로, 나머지 2건은 열린 채
  j := public.admin_decide_report(r1, 'dismiss', false);
  if (j->>'closed')::int <> 1 then raise exception 'FAIL: 단건 기각 closed %', j; end if;
  select status into v_st from public.reports where id = r2;
  if v_st <> 'open' then raise exception 'FAIL: 단건 기각이 다른 신고를 닫았다'; end if;
  if not exists (select 1 from public.community_posts where id = c_p and not blinded) then raise exception 'FAIL: 기각이 글을 건드렸다'; end if;
  begin perform public.admin_decide_report(r1, 'dismiss'); raise exception 'FAIL: 중복 처리 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%이미 처리되었거나 없는 신고%' then raise exception 'FAIL: 엉뚱한 오류(중복): %', sqlerrm; end if; end;
  begin perform public.admin_decide_report(r2, 'hide'); raise exception 'FAIL: 모르는 처리 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%알 수 없는 처리%' then raise exception 'FAIL: 엉뚱한 오류(처리값): %', sqlerrm; end if; end;
  -- 기각 함께: 남은 2건이 함께 닫힌다
  j := public.admin_decide_report(r2, 'dismiss', true);
  if (j->>'closed')::int <> 2 or exists (select 1 from public.reports where id in (r2, r3) and status <> 'dismissed') then
    raise exception 'FAIL: 함께 기각 %', j; end if;

  -- (b) 글만 삭제
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, created_at) values (c_u4,'post',c_q,c_admin,'리허설', now() - interval '1 hour') returning id into rq;
  j := public.admin_decide_report(rq, 'delete');
  if exists (select 1 from public.community_posts where id = c_q) or not (j->>'deleted')::boolean then raise exception 'FAIL: 글 삭제 %', j; end if;
  select status into v_st from public.reports where id = rq;
  if v_st <> 'resolved' then raise exception 'FAIL: 삭제 뒤 신고 상태 %', v_st; end if;
  if not exists (select 1 from public.audit_log where action = 'report_decide' and target = rq::text and actor_id = c_admin) then
    raise exception 'FAIL: 결정 감사 기록 없음'; end if;

  -- (c) 유저 정지 — U3 의 글을 신고(작성자 칸 비움 → 서버가 글에서 찾는다)
  perform set_config('request.jwt.claims', json_build_object('sub', c_u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.community_posts (user_id, user_name, content) values (c_u3, 'x', '리허설 정지 대상 글') returning id into v_s;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  insert into public.reports(reporter_id, target_type, target_id, reason, created_at) values (c_owner,'post',v_s,'리허설', now() - interval '1 hour') returning id into rs;
  begin perform public.admin_decide_report(rs, 'suspend', true, true, 7, '   '); raise exception 'FAIL: 사유 없이 정지';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%정지 사유%' then raise exception 'FAIL: 엉뚱한 오류(사유): %', sqlerrm; end if; end;
  j := public.admin_decide_report(rs, 'suspend', true, true, 7, '리허설 사유');
  select status::text, suspended_until into v_st, v_until from public.profiles where id = c_u3;
  if v_st <> 'suspended' or v_until < now() + interval '6 days' or v_until > now() + interval '8 days' then
    raise exception 'FAIL: 7일 정지 % %', v_st, v_until; end if;
  if exists (select 1 from public.community_posts where id = v_s) then raise exception 'FAIL: 정지+삭제인데 글이 남았다'; end if;
  if (j->>'suspended_user')::uuid is distinct from c_u3 then raise exception 'FAIL: 정지 대상 %', j; end if;
  -- 정지만(글 유지) + 영구 정지
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, created_at) values ('1a8c5117-a4c7-42fe-abb6-021544adcd16','user',c_u1,c_u1,'리허설', now() - interval '1 hour') returning id into rs2;
  perform public.admin_decide_report(rs2, 'suspend', true, false, null, '영구 리허설');
  select status::text into v_st from public.profiles where id = c_u1;
  if v_st <> 'banned' then raise exception 'FAIL: 영구 정지 %', v_st; end if;
  -- 운영자는 정지할 수 없다
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, created_at) values ('f5d305f2-0f30-4d61-91ce-51f3332e5193','user',c_admin,c_admin,'리허설', now() - interval '1 hour') returning id into rs2;
  begin perform public.admin_decide_report(rs2, 'suspend', true, false, 1, 'x'); raise exception 'FAIL: 운영자 정지 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자는 정지할 수 없습니다%' then raise exception 'FAIL: 엉뚱한 오류(운영자): %', sqlerrm; end if; end;
  -- 회원·매물 신고는 '글 삭제' 불가
  begin perform public.admin_decide_report(rs2, 'delete'); raise exception 'FAIL: 회원 신고 삭제 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%삭제할 수 있는 대상%' then raise exception 'FAIL: 엉뚱한 오류(삭제 대상): %', sqlerrm; end if; end;

  -- 관리자 직접 가림은 근거가 남고, 해제도 된다(양성)
  perform public.admin_set_post_blinded(c_p, true);
  if not exists (select 1 from public.audit_log where action = 'post_blind' and target = c_p::text and actor_id = c_admin) then
    raise exception 'FAIL: 관리자 가림 감사 기록 없음'; end if;
  perform public.admin_set_post_blinded(c_p, false);

  -- 일반 회원 신고 접수는 그대로 된다(양성 대조 — RLS 를 태워서)
  perform set_config('request.jwt.claims', json_build_object('sub', c_u4, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.reports(reporter_id, target_type, target_id, reason) values (c_u4, 'post', c_p, '리허설 양성');
  execute 'reset role';
  if not exists (select 1 from public.reports where reporter_id = c_u4 and reason = '리허설 양성' and status = 'open') then
    raise exception 'FAIL: 일반 회원 신고 접수 실패'; end if;

  -- 개정 b(검토 T11·R6): 신고자가 작성자 칸을 남(U1)으로, 상태·시각을 위조해도 서버가 덮고 실제 작성자(U4)가 정지된다
  perform set_config('request.jwt.claims', json_build_object('sub', c_u4, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.community_posts (user_id, user_name, content) values (c_u4, 'x', '리허설 위조 대상 글') returning id into v_s;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c_u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.reports(reporter_id, target_type, target_id, target_owner_id, reason, status, created_at)
    values (c_u2, 'post', v_s, c_u1, '리허설 위조', 'resolved', '2000-01-01');
  execute 'reset role';
  select id, target_owner_id, status, created_at into rs, v_owner, v_st, v_until from public.reports where reporter_id = c_u2 and reason = '리허설 위조';
  if v_owner is distinct from c_u4 or v_st <> 'open' or v_until <> now() then
    raise exception 'FAIL: 신고 서버 칸이 덮이지 않았다 % % %', v_owner, v_st, v_until; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  j := public.admin_decide_report(rs, 'suspend', true, false, 1, '위조 리허설');
  if (j->>'suspended_user')::uuid is distinct from c_u4 then raise exception 'FAIL: 위조 신고의 정지 대상 %', j; end if;
  select status::text into v_st from public.profiles where id = c_u1;
  if v_st <> 'banned' then raise exception 'FAIL: 위조로 지목된 U1 상태가 바뀌었다 %', v_st; end if;
  -- 개정 b(검토 T13): 영구 정지(U1) 위에 기간 정지 → 거절, 상태 유지
  insert into public.reports(reporter_id, target_type, target_id, reason, created_at) values (c_owner,'user',c_u1,'리허설', now() - interval '2 hour') returning id into rs2;
  begin perform public.admin_decide_report(rs2, 'suspend', true, false, 1, 'x'); raise exception 'FAIL: 영구 정지가 기간 정지로 줄었다';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%이미 영구%' then raise exception 'FAIL: 엉뚱한 오류(영구): %', sqlerrm; end if; end;
  -- 개정 b(검토 T15): 승인 대기 회원은 정지하지 않는다
  update public.profiles set status = 'pending' where id = c_u2;
  insert into public.reports(reporter_id, target_type, target_id, reason, created_at) values (c_owner,'user',c_u2,'리허설', now() - interval '3 hour') returning id into rs2;
  begin perform public.admin_decide_report(rs2, 'suspend', true, false, 1, 'x'); raise exception 'FAIL: 승인 대기 회원 정지 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%승인 대기%' then raise exception 'FAIL: 엉뚱한 오류(승인 대기): %', sqlerrm; end if; end;

  raise exception 'REHEARSAL_OK 20261002a';
end $$;
-- ▲REHEARSAL
*/
