-- ⏳ 초안 — 라이브 미적용(2026-10-02, community-team 작성). 적용 판단은 nuri-lead.
--    2026-10-02 실측: 게이트 md5 4종·reports 트리거 구성 = 라이브와 일치(select 조회). 공개 대상 = 자동 0 · 출처 불명 3.
--    음성 대조(현행 라이브): 서로 다른 신고자 3명 → 글이 가려짐 재현(raise 로 되돌림, 사후 reports 0건 확인).
--    ⚠ 롤백 리허설(본문 + 맨 아래 REHEARSAL 블록, 끝의 raise 로 되돌림)은 **NOT_RUN** — execute_sql 호출이 권한 단계에서 거절됐다.
--      적용 전에 리드가 같은 묶음을 한 번 돌려 REHEARSAL_OK 를 확인해라.
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
  if exists (select 1 from pg_proc where proname = 'admin_decide_report' and pronamespace = 'public'::regnamespace) then
    raise exception '20261002a 게이트: admin_decide_report 가 이미 있다';
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
    v_user := case when r.target_type = 'user' then r.target_id else r.target_owner_id end;
    if v_user is null and r.target_type = 'post' then
      select user_id into v_user from public.community_posts where id = r.target_id;
    elsif v_user is null and r.target_type = 'comment' then
      select user_id into v_user from public.comments where id = r.target_id;
    end if;
    if v_user is null then raise exception '정지할 작성자를 찾지 못했습니다'; end if;
    select role, status into v_user_role, v_user_status from public.profiles where id = v_user for update;
    if not found then raise exception '정지할 작성자를 찾지 못했습니다'; end if;
    if v_user_role = 'admin' or v_user = auth.uid() then raise exception '운영자는 정지할 수 없습니다'; end if;
    if v_user_status = 'withdrawn' then raise exception '이미 탈퇴한 회원입니다'; end if;
    if v_reason is null then raise exception '정지 사유를 입력해 주세요'; end if;
    if p_suspend_days is not null and (p_suspend_days < 1 or p_suspend_days > 3650) then
      raise exception '정지 기간은 1~3650일입니다';
    end if;
    -- 회원 관리 화면(updateUserStatus)과 같은 칸을 쓴다: 기간 정지 = suspended + suspended_until, 영구 = banned.
    update public.profiles
       set status = case when p_suspend_days is null then 'banned'::public.user_status else 'suspended'::public.user_status end,
           suspended_until = case when p_suspend_days is null then null else now() + make_interval(days => p_suspend_days) end,
           sanction_reason = v_reason
     where id = v_user;
  end if;

  if p_action = 'delete' or (p_action = 'suspend' and coalesce(p_delete_content, false)
                             and r.target_type in ('post', 'comment') and r.target_id is not null) then
    begin
      if r.target_type = 'post' then
        delete from public.community_posts where id = r.target_id;
      else
        delete from public.comments where id = r.target_id;
      end if;
      v_deleted := found;
    exception when foreign_key_violation then
      raise exception '광고·구매 기록이 연결된 글이라 삭제할 수 없습니다. 광고 관리에서 먼저 정리해 주세요';
    end;
  end if;

  v_status := case when p_action = 'dismiss' then 'dismissed' else 'resolved' end;
  update public.reports set status = v_status where id = any(v_ids) and status = 'open';

  perform public._audit('report_decide', p_report_id::text, jsonb_build_object(
    'action', p_action, 'target_type', r.target_type, 'target_id', r.target_id,
    'report_ids', to_jsonb(v_ids), 'deleted', v_deleted,
    'suspended_user', v_user, 'suspend_days', case when p_action = 'suspend' then p_suspend_days end));

  return jsonb_build_object('status', v_status, 'closed', coalesce(array_length(v_ids, 1), 0),
                            'deleted', v_deleted, 'suspended_user', v_user);
end $function$;

revoke all on function public.admin_decide_report(uuid,text,boolean,boolean,integer,text) from public, anon;
grant execute on function public.admin_decide_report(uuid,text,boolean,boolean,integer,text) to authenticated, service_role;

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
do $$
declare v_cfg text[];
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.reports'::regclass and not tgisinternal
              and tgname <> 'trg_rl_reports') then
    raise exception '20261002a: reports 에 속도 제한 말고 다른 트리거가 남았다';
  end if;
  if exists (select 1 from pg_proc where proname = 'auto_blind_reported_post' and pronamespace = 'public'::regnamespace) then
    raise exception '20261002a: 자동 가림 함수가 남았다';
  end if;
  -- 신고 표를 읽어 글을 가리는 함수가 다시 생기면 안 된다(admin_dismiss_report 의 '자동 출처 해제'만 예외).
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
               and p.proname not in ('admin_set_post_blinded', 'admin_dismiss_report')
               and pg_get_functiondef(p.oid) ~* 'set\s+blinded\s*=\s*true') then
    raise exception '20261002a: 글을 가리는 다른 함수가 있다';
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
  r1 uuid; r2 uuid; r3 uuid; rq uuid; rs uuid; rs2 uuid; v_s uuid; v_b boolean; v_st text; v_until timestamptz; j jsonb; n int;
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

  raise exception 'REHEARSAL_OK 20261002a';
end $$;
-- ▲REHEARSAL
*/
