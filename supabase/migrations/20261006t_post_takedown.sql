select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용 — 초안(community-team, 2026-10-06). 라이브 롤백 리허설만 했다. 적용 판단·실행은 리드.
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다. 리허설: supabase/tests/20261006t_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)
-- 20261006t — 권리침해 게시물 임시조치·통지·표시 (정보통신망법 §44의2·§44의3, 약관 제5조 ⑦~⑩ — PR #193)
--
-- 요구: 오너 2026-10-06 "게시물 임시조치 통지 기능 … 싹 해". 약관 문구는 #193 이 정본이고, 이 파일은 그 문구대로 동작을 만든다.
--   ⑦ 권리를 침해받은 사람이 소명하여 「신고」로 삭제를 요청 → 화면(ReportModal)의 '권리침해' 사유 + 소명(필수)
--   ⑧ 지체 없이 조치하고 요청한 사람과 작성자에게 알리며, 조치한 게시물 자리에 표시 → admin_takedown_post 가 알림 2건,
--      post_takedown_notice 가 게시물 자리(상세·링크)의 안내를 준다(비로그인 포함 — 본문·작성자·신청인은 싣지 않는다)
--   ⑨ 30일 이내 임시조치 · 작성자는 기간 안에 다시 게시를 요청 · 회사는 검토 결과를 알림 →
--      ends_at = 조치 + 30일(CHECK) · request_post_takedown_review · admin_decide_takedown(다시 게시/삭제/가림 유지) 결과 알림
--   ⑩ 명백한 침해는 요청 없이도 임시조치(§44의3) → admin_takedown_post 의 p_report_id 를 비우면 직권
--
-- 가림은 서버가 한다: 기존 숨김(blinded)을 그대로 쓴다 — posts_select(작성자·운영자만)·첨부 3정책·_poll_visible·끌올·광고가
--   이미 blinded 를 본다. blinded_source = 'takedown' 으로 출처를 남겨 관리자 '블라인드 해제' 토글이 임시조치를 몰래 풀지 못하게 한다.
--   기간이 지나도 자동으로 풀지 않는다(리드: 이의 없으면 유지/삭제 판단은 관리자) — 목록이 '기간 만료 — 판단 필요'로 보여 준다.
-- 댓글: 지금은 숨김 글의 댓글을 post_id 로 누구나 읽을 수 있다(comments_select 에 부모 글 조건이 없다). 숨김 글의 댓글은
--   글 작성자·운영자·댓글 작성자 본인만 보게 묶는다(20260905m 이 첨부를 부모 글에 묶은 것과 같은 취지). 관리자 숨김 글(4건)에도 적용된다.
-- 알림은 거래성 안내다 — notifications.is_ad 를 켜지 않는다(20261006l 의 칸이 있으면 기본값 false, 없으면 칸 자체를 안 쓴다).
--
-- 되돌리기(데이터 보존):
--   alter policy comments_select on public.comments using ((NOT COALESCE((user_id = ANY (COALESCE(( SELECT my_blocked_ids() AS my_blocked_ids), '{}'::uuid[]))), false)) OR (user_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role));
--   update public.community_posts set blinded_source = 'admin' where blinded_source = 'takedown';   -- 가림은 유지
--   drop function public.post_hidden_from_me(uuid), public.post_takedown_notice(uuid), public.admin_takedown_post(uuid,text,uuid),
--                 public.request_post_takedown_review(uuid,text), public.admin_decide_takedown(uuid,text,text);
--   admin_set_post_blinded 는 아래 게이트 md5(d23d9b84…) 정의로 되돌린다(임시조치 가드 블록 하나만 다르다). 표 post_takedowns 는 기록이라 남긴다.

-- ── 0) 출발점 게이트 — 작성 때(2026-10-06 라이브 실측)와 같아야 한다. 다시 적용하면(표가 이미 있으면) 건너뛴다. ──────────
do $gate$
begin
  if to_regclass('public.post_takedowns') is not null then return; end if;
  if md5(pg_get_functiondef('public.admin_set_post_blinded(uuid,boolean)'::regprocedure)) is distinct from 'd23d9b84fad5968fab3e21c3f8779f7e' then
    raise exception '20261006t 게이트: admin_set_post_blinded 가 작성 때와 다르다 — 라이브 정의를 다시 떠서 합쳐라';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_select')
     is distinct from '8e92757c77cf809f7da181fed98230b4' then
    raise exception '20261006t 게이트: comments_select 가 작성 때와 다르다';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.community_posts'::regclass and conname = 'community_posts_blinded_source_chk')
     is distinct from 'CHECK (((blinded_source IS NULL) OR (blinded AND (blinded_source = ANY (ARRAY[''auto''::text, ''admin''::text])))))' then
    raise exception '20261006t 게이트: community_posts_blinded_source_chk 가 작성 때와 다르다';
  end if;
end $gate$;

-- ── 1) 숨김 출처에 'takedown' 추가 ─────────────────────────────────────────────────────────────
alter table public.community_posts drop constraint if exists community_posts_blinded_source_chk;
alter table public.community_posts add constraint community_posts_blinded_source_chk
  check (blinded_source is null or (blinded and blinded_source in ('auto', 'admin', 'takedown')));

-- ── 2) 임시조치 기록 — 관리자만 읽는다. 쓰기는 아래 정의자 함수만. ─────────────────────────────────
--   신청인(requester_id)은 작성자에게 보이지 않아야 한다 — 그래서 작성자·신청인용 정책을 두지 않고 안내는 RPC 가 골라 준다.
create table if not exists public.post_takedowns (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid references public.community_posts(id) on delete set null,  -- 글이 지워져도 처리 기록은 남는다
  post_title     text,                       -- 기록용 제목(앞 80자) — 글이 지워진 뒤에도 무엇을 처리했는지 알 수 있게
  author_id      uuid,
  requester_id   uuid,                       -- null = 직권(§44의3)
  report_id      uuid references public.reports(id) on delete set null,
  reason         text not null check (char_length(btrim(reason)) between 2 and 300),
  status         text not null default 'active' check (status in ('active', 'kept', 'restored', 'removed')),
  created_at     timestamptz not null default now(),
  ends_at        timestamptz not null,
  objection_text text check (objection_text is null or char_length(objection_text) <= 1000),
  objection_at   timestamptz,
  decided_at     timestamptz,
  decided_by     uuid,
  decision_note  text check (decision_note is null or char_length(decision_note) <= 300),
  constraint post_takedowns_30d check (ends_at > created_at and ends_at <= created_at + interval '30 days')
);
comment on table public.post_takedowns is
  '권리침해 게시물 임시조치(정보통신망법 §44의2·§44의3) — active=가림 중(ends_at 지나면 판단 대기) · kept=가림 유지 · restored=다시 게시 · removed=삭제';
create unique index if not exists post_takedowns_one_open on public.post_takedowns(post_id) where status in ('active', 'kept');
alter table public.post_takedowns enable row level security;
revoke all on public.post_takedowns from public, anon, authenticated;
grant select on public.post_takedowns to authenticated;
drop policy if exists post_takedowns_admin_select on public.post_takedowns;
create policy post_takedowns_admin_select on public.post_takedowns for select to authenticated
  using (public.my_role() = 'admin'::public.user_role);

-- ── 3) 게시물 자리의 안내 — 누구나(비로그인 포함). 본문·작성자·신청인은 싣지 않는다. ──────────────────
--   작성자 본인과 운영자에게만 사유·이의제기 상태를 더 준다.
create or replace function public.post_takedown_notice(p_post_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t public.post_takedowns%rowtype;
  v_me uuid := auth.uid();
  v_mine boolean;
begin
  select * into t from public.post_takedowns
   where post_id = p_post_id and status in ('active', 'kept')
   order by created_at desc limit 1;
  if not found then return null; end if;
  v_mine := v_me is not null and v_me = t.author_id;
  return jsonb_build_object(
      'status', t.status, 'created_at', t.created_at, 'ends_at', t.ends_at,
      'expired', t.status = 'active' and t.ends_at <= now(), 'mine', v_mine)
    || case when v_mine or public.my_role() is not distinct from 'admin'::public.user_role
            then jsonb_build_object('reason', t.reason, 'objection_at', t.objection_at)
            else '{}'::jsonb end;
end $function$;
revoke all on function public.post_takedown_notice(uuid) from public;
grant execute on function public.post_takedown_notice(uuid) to anon, authenticated, service_role;

-- ── 4) 관리자 임시조치(30일) — 신고(요청)에서 또는 직권 ───────────────────────────────────────────
create or replace function public.admin_takedown_post(p_post_id uuid, p_reason text, p_report_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_author uuid;
  v_title text;
  v_requester uuid;
  v_id uuid;
  v_ends timestamptz := now() + interval '30 days';
  v_day text;
  v_link text := '/posts/' || p_post_id::text;
  r public.reports%rowtype;
  n int := 0;
begin
  if public.my_role() is distinct from 'admin'::public.user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if v_reason is null or char_length(v_reason) < 2 then raise exception '임시조치 사유를 입력해 주세요'; end if;
  if char_length(v_reason) > 300 then raise exception '사유는 300자 이내로 입력해 주세요'; end if;

  select user_id, left(coalesce(nullif(btrim(title), ''), left(content, 40)), 80) into v_author, v_title
    from public.community_posts where id = p_post_id for update;
  if not found then raise exception '게시글을 찾지 못했습니다(이미 삭제됐을 수 있습니다)'; end if;
  if exists (select 1 from public.post_takedowns where post_id = p_post_id and status in ('active', 'kept')) then
    raise exception '이미 임시조치 중인 게시글입니다';
  end if;

  if p_report_id is not null then
    select * into r from public.reports where id = p_report_id for update;
    if not found or r.status is distinct from 'open' then raise exception '이미 처리되었거나 없는 신고입니다'; end if;
    if r.target_type is distinct from 'post' or r.target_id is distinct from p_post_id then
      raise exception '신고 대상과 게시글이 다릅니다';
    end if;
    v_requester := r.reporter_id;
    update public.reports set status = 'resolved' where id = p_report_id;
  end if;

  insert into public.post_takedowns (post_id, post_title, author_id, requester_id, report_id, reason, ends_at)
  values (p_post_id, v_title, v_author, v_requester, p_report_id, v_reason, v_ends)
  returning id into v_id;

  update public.community_posts set blinded = true, blinded_source = 'takedown' where id = p_post_id;

  v_day := to_char(v_ends at time zone 'Asia/Seoul', 'YYYY.MM.DD');
  -- ⑧ 통지: 작성자 · 요청한 사람(직권이면 작성자만). 거래성 안내 — 광고 표지(is_ad) 없음.
  if v_author is not null then
    perform public._notify_user(v_author, 'system'::public.notif_type, '게시물 임시조치 안내',
      format('회원님의 게시물이 %s %s까지 임시조치(가림)되었습니다. 사유: %s. 기간 안에 게시물 화면의 「다시 게시 요청」이나 고객센터(ace@nuriholdem.com)로 이의를 제기할 수 있습니다.',
             case when v_requester is null then '권리침해가 명백한 게시물로 판단되어' else '권리침해 신고로' end,
             v_day, left(v_reason, 80)),
      v_link);
    n := n + 1;
  end if;
  if v_requester is not null and v_requester is distinct from v_author then
    perform public._notify_user(v_requester, 'system'::public.notif_type, '권리침해 신고 처리 안내',
      format('신고하신 게시물을 %s까지 임시조치(가림)했습니다. 사유: %s. 작성자가 기간 안에 다시 게시를 요청하면 검토하여 결과를 알려 드립니다.',
             v_day, left(v_reason, 80)),
      v_link);
    n := n + 1;
  end if;

  perform public._audit('post_takedown', p_post_id::text, jsonb_build_object(
    'takedown_id', v_id, 'report_id', p_report_id, 'ex_officio', p_report_id is null, 'ends_at', v_ends));
  return jsonb_build_object('id', v_id, 'ends_at', v_ends, 'notified', n);
end $function$;
revoke all on function public.admin_takedown_post(uuid, text, uuid) from public, anon;
grant execute on function public.admin_takedown_post(uuid, text, uuid) to authenticated, service_role;

-- ── 5) 작성자의 다시 게시 요청(이의제기) — 기간 안에 한 번 ────────────────────────────────────────
create or replace function public.request_post_takedown_review(p_post_id uuid, p_text text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_me uuid := auth.uid();
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  t public.post_takedowns%rowtype;
  a uuid;
begin
  if v_me is null then raise exception '로그인이 필요합니다'; end if;
  if v_text is null or char_length(v_text) < 5 then raise exception '다시 게시를 요청하는 이유를 5자 이상 적어 주세요'; end if;
  if char_length(v_text) > 1000 then raise exception '1000자 이내로 적어 주세요'; end if;
  select * into t from public.post_takedowns where post_id = p_post_id and status = 'active' for update;
  if not found then raise exception '임시조치 중인 게시물이 아닙니다'; end if;
  if t.author_id is distinct from v_me then raise exception '게시물 작성자만 요청할 수 있습니다'; end if;
  if t.ends_at <= now() then
    raise exception '임시조치 기간이 지났습니다. 고객센터(ace@nuriholdem.com)로 문의해 주세요';
  end if;
  if t.objection_at is not null then raise exception '이미 다시 게시 요청을 접수했습니다. 검토 결과를 알림으로 알려 드립니다'; end if;

  update public.post_takedowns set objection_text = v_text, objection_at = now() where id = t.id;
  for a in select id from public.profiles where role = 'admin'::public.user_role loop
    perform public._notify_user(a, 'system'::public.notif_type, '임시조치 다시 게시 요청',
      '작성자가 임시조치된 게시물의 다시 게시를 요청했습니다. 관리자 → 신고 처리의 임시조치 목록에서 검토해 주세요.', null);
  end loop;
  return jsonb_build_object('objection_at', now());
end $function$;
revoke all on function public.request_post_takedown_review(uuid, text) from public, anon;
grant execute on function public.request_post_takedown_review(uuid, text) to authenticated, service_role;

-- ── 6) 관리자 판단 — 다시 게시(restore) · 삭제(remove) · 가림 유지(keep). 결과를 작성자·요청한 사람에게 알린다. ──────
create or replace function public.admin_decide_takedown(p_takedown_id uuid, p_action text, p_note text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t public.post_takedowns%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_what text;
  v_link text;
  v_tail text;
begin
  if public.my_role() is distinct from 'admin'::public.user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if p_action is null or p_action not in ('restore', 'remove', 'keep') then raise exception '알 수 없는 처리입니다'; end if;
  if p_action in ('remove', 'keep') and v_note is null then raise exception '작성자에게 알릴 사유를 입력해 주세요'; end if;
  if char_length(coalesce(v_note, '')) > 300 then raise exception '사유는 300자 이내로 입력해 주세요'; end if;

  select * into t from public.post_takedowns where id = p_takedown_id for update;
  if not found or t.status not in ('active', 'kept') then raise exception '이미 처리되었거나 없는 임시조치입니다'; end if;
  if p_action = 'keep' and t.status = 'kept' then raise exception '이미 가림 유지로 정한 게시물입니다'; end if;

  if p_action = 'restore' then
    update public.community_posts set blinded = false, blinded_source = null
     where id = t.post_id and blinded_source = 'takedown';
    v_status := 'restored'; v_what := '다시 게시하기로'; v_link := case when t.post_id is not null then '/posts/' || t.post_id::text end;
  elsif p_action = 'remove' then
    delete from public.community_posts where id = t.post_id;
    v_status := 'removed'; v_what := '삭제하기로'; v_link := null;
  else
    v_status := 'kept'; v_what := '계속 가리기로'; v_link := case when t.post_id is not null then '/posts/' || t.post_id::text end;
  end if;

  update public.post_takedowns
     set status = v_status, decided_at = now(), decided_by = auth.uid(), decision_note = v_note
   where id = t.id;

  v_tail := case when v_note is not null then ' 사유: ' || left(v_note, 80) || '.' else '' end;
  if t.author_id is not null then
    perform public._notify_user(t.author_id, 'system'::public.notif_type, '임시조치 검토 결과',
      format('임시조치된 회원님의 게시물을 검토한 결과 %s 했습니다.%s', v_what, v_tail), v_link);
  end if;
  if t.requester_id is not null and t.requester_id is distinct from t.author_id then
    perform public._notify_user(t.requester_id, 'system'::public.notif_type, '권리침해 신고 처리 결과',
      format('신고하신 게시물의 임시조치를 검토한 결과 %s 했습니다.%s', v_what, v_tail), v_link);
  end if;

  perform public._audit('post_takedown_decide', p_takedown_id::text, jsonb_build_object(
    'action', p_action, 'post_id', t.post_id, 'note', v_note));
  return jsonb_build_object('status', v_status);
end $function$;
revoke all on function public.admin_decide_takedown(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_takedown(uuid, text, text) to authenticated, service_role;

-- ── 7) 관리자 '블라인드' 토글이 임시조치를 몰래 풀거나 덮지 않게 ─────────────────────────────────────
--   라이브 정의(md5 d23d9b84…)에 가드 한 블록만 더했다.
create or replace function public.admin_set_post_blinded(p_post_id uuid, p_blinded boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(public.my_role()::text,'') <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  -- 20261006t: 권리침해 임시조치 중인 글은 임시조치 목록에서만 정한다(통지·기록이 함께 가야 한다).
  if exists (select 1 from public.community_posts where id = p_post_id and blinded_source = 'takedown') then
    raise exception '권리침해 임시조치 중인 글입니다. 신고 처리의 임시조치 목록에서 다시 게시·삭제를 정해 주세요';
  end if;
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
revoke all on function public.admin_set_post_blinded(uuid, boolean) from public, anon;
grant execute on function public.admin_set_post_blinded(uuid, boolean) to authenticated, service_role;

-- ── 8) 숨김 글의 댓글 — 글 작성자·운영자·댓글 작성자 본인만 ─────────────────────────────────────────
--   정책은 호출 역할로 돈다 → 판정 함수는 정의자(글 행을 RLS 없이 본다)이고 anon·authenticated 에 실행을 준다.
--   돌려주는 값은 '이 글이 나에게 숨김인가' 하나뿐이다(같은 사실을 post_takedown_notice·posts_select 가 이미 드러낸다).
create or replace function public.post_hidden_from_me(p_post_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.community_posts p
                  where p.id = p_post_id and p.blinded and p.user_id is distinct from auth.uid())
     and public.my_role() is distinct from 'admin'::public.user_role;
$function$;
revoke all on function public.post_hidden_from_me(uuid) from public;
grant execute on function public.post_hidden_from_me(uuid) to anon, authenticated, service_role;

alter policy comments_select on public.comments using (
  ((not coalesce((user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[]))), false))
    or (user_id = (select auth.uid()))
    or (public.my_role() = 'admin'::public.user_role))
  and (post_id is null or user_id = (select auth.uid()) or not public.post_hidden_from_me(post_id))
);

-- ── 9) 자가검사 — ACL·정책·제약 ───────────────────────────────────────────────────────────────
do $check$
declare f text;
begin
  foreach f in array array['public.admin_takedown_post(uuid,text,uuid)', 'public.request_post_takedown_review(uuid,text)',
                           'public.admin_decide_takedown(uuid,text,text)', 'public.admin_set_post_blinded(uuid,boolean)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception '20261006t 자가검사: anon 이 % 를 실행할 수 있다', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception '20261006t 자가검사: authenticated 가 % 를 못 부른다', f; end if;
  end loop;
  if not has_function_privilege('anon', 'public.post_takedown_notice(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.post_hidden_from_me(uuid)', 'execute') then
    raise exception '20261006t 자가검사: 공개 안내·댓글 정책 함수를 anon 이 못 부른다(정책이 비로그인에서 깨진다)';
  end if;
  if has_table_privilege('anon', 'public.post_takedowns', 'select')
     or has_table_privilege('authenticated', 'public.post_takedowns', 'insert')
     or has_table_privilege('authenticated', 'public.post_takedowns', 'update') then
    raise exception '20261006t 자가검사: post_takedowns 표 권한이 열려 있다';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.post_takedowns'::regclass) then
    raise exception '20261006t 자가검사: post_takedowns RLS 꺼짐';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_select') not like '%post_hidden_from_me%' then
    raise exception '20261006t 자가검사: comments_select 에 숨김 글 조건이 없다';
  end if;
end $check$;

notify pgrst, 'reload schema';
