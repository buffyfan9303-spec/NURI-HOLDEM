select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용 — 초안(community-team, 2026-10-06 · PR #196 반증 반영판). 라이브 롤백 리허설만 했다. 적용 판단·실행은 리드.
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다. 리허설: supabase/tests/20261006t_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)
-- 20261006t — 권리침해 게시물 임시조치·통지·표시 (정보통신망법 §44의2·§44의3, 약관 제5조 ⑦~⑩ — PR #193)
--
-- 요구: 오너 2026-10-06 "게시물 임시조치 통지 기능 … 싹 해". 약관 문구는 #193 이 정본이고, 이 파일은 그 문구대로 동작을 만든다.
--   ⑦ 권리를 침해받은 사람이 소명하여 「신고」로 삭제를 요청 → 화면(ReportModal)의 '권리침해' 사유 + 소명(필수)
--   ⑧ 지체 없이 조치하고 요청한 사람과 작성자에게 알리며, 조치한 게시물 자리에 표시 → admin_takedown_post 가 알림,
--      post_takedown_notice 가 게시물 자리(상세·링크)의 안내를 준다(비로그인 포함 — 본문·작성자·신청인은 싣지 않는다)
--   ⑨ 30일 이내 임시조치 · 작성자는 기간 안에 다시 게시를 요청 · 회사는 검토 결과를 알림 →
--      ends_at = 조치 + 30일(CHECK) · request_post_takedown_review · admin_decide_takedown(다시 게시/삭제/가림 유지) 결과 알림
--   ⑩ 명백한 침해는 요청 없이도 임시조치(§44의3) → admin_takedown_post 의 p_report_id 를 비우면 직권
--
-- PR #196 반증(security-1006/pr196-review.md) 반영:
--   P1-1 이미 숨긴 글(관리자·옛 자동)에 임시조치를 걸면 이전 blinded·blinded_source 를 기록에 남기고, 다시 게시(종결) 때 그 값으로 되돌린다.
--   P2-1 권리침해 신고는 옛 처리(admin_decide_report·admin_dismiss_report)를 서버가 거절한다 — 임시조치 또는 요청 기각(admin_reject_rights_request,
--        신청인 통지)으로만 닫힌다. 같은 대상 함께 닫기에서도 빠진다. 열린 권리침해 신고가 있는 글은 관리자 블라인드 토글도 거절.
--        임시조치는 같은 글의 열린 권리침해 신고를 모두 닫고 그 신청인 전원에게 알린다(other_requesters).
--   P2-2 리드 결정: 30일 뒤 자동 공개·삭제는 하지 않는다. 매일 크론(takedown-expiry, 01:00 UTC = 10:00 KST)이 만료된 건마다 한 번
--        관리자 전원 + 작성자 + 신청인에게 '기간 만료 — 운영자가 게시 재개/삭제를 결정해 알립니다' 를 보낸다(expiry_notified_at 로 중복 없음).
--   P2-3 '삭제' 종결이면 그 글의 community_images 객체를 storage_purge_queue(20261006s2)에 넣는다. 큐가 없으면 건너뛰고 결과에 queued=null.
--   P3 제3자는 숨김 글에 댓글을 못 단다(comments_insert) · 비로그인 숨김 판정 함수 제거(정책 안 EXISTS 로 대체 — 존재 노출 없음)
--      · 작성자가 스스로 지우면 기록을 'author_deleted' 로 종결(트리거) · 안내 응답에 ex_officio(직권 여부) — 화면 문구용.
-- 재반증(cfab4750 · 조건부 APPROVE) 반영:
--   ⑦ 글이 다른 경로(관리자 직접 삭제·일반 신고 삭제·정지+삭제·탈퇴 연쇄)로 지워지면 삭제 트리거가 임시조치 당사자에게 '삭제' 통지,
--      같은 글의 열린 권리침해 신고를 resolved 로 닫고 신청인에게 통지한다(작성자 자진 삭제면 신청인에게만).
--   P3 관리자 PostgREST 직접 UPDATE 로 권리침해 신고를 닫지 못하게 reports_admin_update 정책에 조건 · 만료 통지는 관리자당 하루 1통(건수 요약).
--
-- 가림은 서버가 한다: 기존 숨김(blinded)을 그대로 쓴다 — posts_select(작성자·운영자만)·첨부 3정책·_poll_visible·끌올·광고가
--   이미 blinded 를 본다. blinded_source = 'takedown' 으로 출처를 남겨 관리자 '블라인드 해제' 토글이 임시조치를 몰래 풀지 못하게 한다.
-- 댓글: 숨김 글의 댓글 읽기·쓰기를 부모 글이 보이는 사람(글 작성자·운영자)과 댓글 작성자 본인으로 묶는다 — 정책 안의 EXISTS 가
--   호출자의 posts_select 를 그대로 타므로 판정식은 한 곳뿐이다. ⚠ posts_select 의 '내가 차단한 사람의 글' 조건도 함께 타서,
--   차단한 사람의 글에 달린 남의 댓글도 내게 안 보이고 그 글에 댓글을 못 단다(그 글 자체가 이미 안 보인다). 관리자 숨김 글(4건)에도 적용.
-- 알림은 거래성 안내다 — notifications.is_ad 를 켜지 않는다(20261006l 의 칸이 있으면 기본값 false, 없으면 칸 자체를 안 쓴다).
--
-- 되돌리기(데이터 보존):
--   alter policy comments_select on public.comments using ((NOT COALESCE((user_id = ANY (COALESCE(( SELECT my_blocked_ids() AS my_blocked_ids), '{}'::uuid[]))), false)) OR (user_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role));
--   alter policy comments_insert on public.comments with check ((( SELECT auth.uid() AS uid) IS NOT NULL) AND (user_id = ( SELECT auth.uid() AS uid)));
--   drop policy reports_admin_update on public.reports;                                     -- 원래 with check 없음(null) → 다시 만든다
--   create policy reports_admin_update on public.reports for update using ((my_role() = 'admin'::user_role));
--   update public.community_posts p set blinded = t.prev_blinded, blinded_source = t.prev_blinded_source from public.post_takedowns t
--    where t.post_id = p.id and p.blinded_source = 'takedown' and t.status in ('active','kept') and t.prev_blinded;   -- 이전 숨김 복원
--   update public.community_posts set blinded_source = 'admin' where blinded_source = 'takedown';                    -- 나머지는 가림 유지
--   select cron.unschedule('takedown-expiry'); drop trigger trg_post_takedown_on_delete on public.community_posts;
--   drop function public.post_takedown_notice(uuid), public.admin_takedown_post(uuid,text,uuid), public.request_post_takedown_review(uuid,text),
--                 public.admin_decide_takedown(uuid,text,text), public.admin_reject_rights_request(uuid,text), public.cron_takedown_expiry(),
--                 public._post_takedown_on_delete(), public._notify_takedown_parties(uuid,text,text,text,text);
--   admin_set_post_blinded · admin_decide_report · admin_dismiss_report 는 아래 게이트 md5 정의로 되돌린다(가드 블록만 다르다).
--   _is_rights_report 는 위 셋이 부르므로 마지막에 지운다. 표 post_takedowns 는 기록이라 남긴다.

-- ── 0) 출발점 게이트 — 작성 때(2026-10-06 라이브 실측)와 같아야 한다. 다시 적용하면(표가 이미 있으면) 건너뛴다. ──────────
do $gate$
declare g record;
begin
  if to_regclass('public.post_takedowns') is not null then return; end if;
  for g in select * from (values
      ('public.admin_set_post_blinded(uuid,boolean)',                         'd23d9b84fad5968fab3e21c3f8779f7e'),
      ('public.admin_decide_report(uuid,text,boolean,boolean,integer,text)',  '6638e5f047575ca73ecb462282b2011d'),
      ('public.admin_dismiss_report(uuid)',                                   '734874aa1804be3fdd9551d66bf40bfa')) v(fn, want) loop
    if md5(pg_get_functiondef(g.fn::regprocedure)) is distinct from g.want then
      raise exception '20261006t 게이트: % 가 작성 때와 다르다 — 라이브 정의를 다시 떠서 합쳐라', g.fn;
    end if;
  end loop;
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_select')
     is distinct from '8e92757c77cf809f7da181fed98230b4' then
    raise exception '20261006t 게이트: comments_select 가 작성 때와 다르다';
  end if;
  if (select md5(with_check) from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_insert')
     is distinct from 'e3c0a20cd58c855c10c9017a80c359f5' then
    raise exception '20261006t 게이트: comments_insert 가 작성 때와 다르다';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_admin_update')
     is distinct from 'ceeb451e34f9dc3224605a58e1a9dced' then
    raise exception '20261006t 게이트: reports_admin_update 가 작성 때와 다르다';
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
--   신청인(requester_id·other_requesters)은 작성자에게 보이지 않아야 한다 — 그래서 작성자·신청인용 정책을 두지 않고 안내는 RPC 가 골라 준다.
create table if not exists public.post_takedowns (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid references public.community_posts(id) on delete set null,  -- 글이 지워져도 처리 기록은 남는다
  post_title          text,                       -- 기록용 제목(앞 80자) — 글이 지워진 뒤에도 무엇을 처리했는지 알 수 있게
  author_id           uuid,
  requester_id        uuid,                       -- null = 직권(§44의3)
  other_requesters    uuid[] not null default '{}',  -- 같은 글의 다른 권리침해 신청인(함께 닫히고 함께 통지받는다)
  report_id           uuid references public.reports(id) on delete set null,
  reason              text not null check (char_length(btrim(reason)) between 2 and 300),
  status              text not null default 'active' check (status in ('active', 'kept', 'restored', 'removed', 'author_deleted')),
  prev_blinded        boolean not null default false,  -- P1-1: 임시조치 전 숨김 상태 — 다시 게시(종결) 때 이 값으로 되돌린다
  prev_blinded_source text,
  created_at          timestamptz not null default now(),
  ends_at             timestamptz not null,
  expiry_notified_at  timestamptz,                -- P2-2: 기간 만료 통지를 보낸 때(한 번만)
  objection_text      text check (objection_text is null or char_length(objection_text) <= 1000),
  objection_at        timestamptz,
  decided_at          timestamptz,
  decided_by          uuid,
  decision_note       text check (decision_note is null or char_length(decision_note) <= 300),
  constraint post_takedowns_30d check (ends_at > created_at and ends_at <= created_at + interval '30 days')
);
comment on table public.post_takedowns is
  '권리침해 게시물 임시조치(정보통신망법 §44의2·§44의3) — active=가림 중(ends_at 지나면 판단 대기) · kept=가림 유지 · restored=다시 게시(이전 숨김 복원) · removed=삭제 · author_deleted=작성자 삭제';
create unique index if not exists post_takedowns_one_open on public.post_takedowns(post_id) where status in ('active', 'kept');
create index if not exists post_takedowns_expiry on public.post_takedowns(ends_at) where status = 'active' and expiry_notified_at is null;
alter table public.post_takedowns enable row level security;
revoke all on public.post_takedowns from public, anon, authenticated;
grant select on public.post_takedowns to authenticated;
drop policy if exists post_takedowns_admin_select on public.post_takedowns;
create policy post_takedowns_admin_select on public.post_takedowns for select to authenticated
  using (public.my_role() = 'admin'::public.user_role);

-- ── 3) 권리침해 신고 판정 · 통지 헬퍼(내부 전용) ─────────────────────────────────────────────────
--   사유 문자열은 화면 ReportModal 의 RIGHTS_REASON 과 같아야 한다(postTakedown.contract.test.ts 가 둘을 대조한다).
create or replace function public._is_rights_report(p_target_type text, p_reason text)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select p_target_type = 'post' and starts_with(coalesce(p_reason, ''), '권리침해(명예훼손·사생활 침해 등)');
$function$;
revoke all on function public._is_rights_report(text, text) from public, anon, authenticated;
grant execute on function public._is_rights_report(text, text) to service_role;

-- 작성자 + 신청인 전원(작성자와 같은 사람은 한 번만)에게 같은 결과를 알린다. 돌려주는 값 = 보낸 건수.
create or replace function public._notify_takedown_parties(p_takedown_id uuid, p_author_title text, p_author_msg text,
                                                           p_requester_title text, p_requester_msg text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t public.post_takedowns%rowtype;
  v_link text;
  u uuid;
  n int := 0;
begin
  select * into t from public.post_takedowns where id = p_takedown_id;
  if not found then return 0; end if;
  -- 지워진(또는 지워지는 중인) 글로는 링크를 걸지 않는다 — 삭제 트리거는 BEFORE DELETE 라 post_id 가 아직 남아 있다.
  v_link := case when t.post_id is not null and t.status not in ('removed', 'author_deleted') then '/posts/' || t.post_id::text end;
  if t.author_id is not null and p_author_msg is not null then
    perform public._notify_user(t.author_id, 'system'::public.notif_type, p_author_title, p_author_msg, v_link);
    n := n + 1;
  end if;
  if p_requester_msg is not null then
    for u in select distinct x from unnest(array[t.requester_id] || t.other_requesters) x
              where x is not null and x is distinct from t.author_id loop
      perform public._notify_user(u, 'system'::public.notif_type, p_requester_title, p_requester_msg, v_link);
      n := n + 1;
    end loop;
  end if;
  return n;
end $function$;
revoke all on function public._notify_takedown_parties(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public._notify_takedown_parties(uuid, text, text, text, text) to service_role;

-- ── 4) 게시물 자리의 안내 — 누구나(비로그인 포함). 본문·작성자·신청인은 싣지 않는다. ──────────────────
--   작성자 본인과 운영자에게만 사유·이의제기 상태를 더 준다. ex_officio 는 화면 문구('운영 정책에 따라')용 — 신원은 없다.
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
      'expired', t.status = 'active' and t.ends_at <= now(), 'mine', v_mine,
      'ex_officio', t.requester_id is null)
    || case when v_mine or public.my_role() is not distinct from 'admin'::public.user_role
            then jsonb_build_object('reason', t.reason, 'objection_at', t.objection_at)
            else '{}'::jsonb end;
end $function$;
revoke all on function public.post_takedown_notice(uuid) from public;
grant execute on function public.post_takedown_notice(uuid) to anon, authenticated, service_role;

-- ── 5) 관리자 임시조치(30일) — 신고(요청)에서 또는 직권 ───────────────────────────────────────────
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
  v_prev_blinded boolean;
  v_prev_source text;
  v_requester uuid;
  v_others uuid[];
  v_id uuid;
  v_ends timestamptz := now() + interval '30 days';
  v_day text;
  r public.reports%rowtype;
  n int;
begin
  if public.my_role() is distinct from 'admin'::public.user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if v_reason is null or char_length(v_reason) < 2 then raise exception '임시조치 사유를 입력해 주세요'; end if;
  if char_length(v_reason) > 300 then raise exception '사유는 300자 이내로 입력해 주세요'; end if;

  select user_id, left(coalesce(nullif(btrim(title), ''), left(content, 40)), 80), blinded, blinded_source
    into v_author, v_title, v_prev_blinded, v_prev_source
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
  end if;
  -- P2-1: 같은 글의 열린 권리침해 신고는 모두 이 조치로 닫힌다 — 그 신청인들도 통지받는다(옛 버튼으로는 닫을 수 없다).
  with closed as (
    update public.reports set status = 'resolved'
     where target_type = 'post' and target_id = p_post_id and status = 'open'
       and (id = p_report_id or public._is_rights_report(target_type, reason))
    returning reporter_id)
  select coalesce(array_agg(distinct reporter_id) filter (where reporter_id is distinct from v_requester), '{}') into v_others from closed;

  insert into public.post_takedowns (post_id, post_title, author_id, requester_id, other_requesters, report_id, reason, ends_at,
                                     prev_blinded, prev_blinded_source)
  values (p_post_id, v_title, v_author, v_requester, v_others, p_report_id, v_reason, v_ends,
          coalesce(v_prev_blinded, false), case when v_prev_blinded then v_prev_source end)
  returning id into v_id;

  update public.community_posts set blinded = true, blinded_source = 'takedown' where id = p_post_id;

  v_day := to_char(v_ends at time zone 'Asia/Seoul', 'YYYY.MM.DD');
  -- ⑧ 통지: 작성자 · 요청한 사람 전원(직권이면 작성자만). 거래성 안내 — 광고 표지(is_ad) 없음.
  n := public._notify_takedown_parties(v_id, '게시물 임시조치 안내',
    format('회원님의 게시물이 %s %s까지 임시조치(가림)되었습니다. 사유: %s. 기간 안에 게시물 화면의 「다시 게시 요청」이나 고객센터(ace@nuriholdem.com)로 이의를 제기할 수 있습니다.',
           case when v_requester is null and cardinality(v_others) = 0 then '운영 정책에 따라' else '권리침해 신고로' end,
           v_day, left(v_reason, 80)),
    '권리침해 신고 처리 안내',
    format('신고하신 게시물을 %s까지 임시조치(가림)했습니다. 사유: %s. 작성자가 기간 안에 다시 게시를 요청하면 검토하여 결과를 알려 드립니다.',
           v_day, left(v_reason, 80)));

  perform public._audit('post_takedown', p_post_id::text, jsonb_build_object(
    'takedown_id', v_id, 'report_id', p_report_id, 'ex_officio', p_report_id is null, 'ends_at', v_ends,
    'prev_blinded', v_prev_blinded, 'prev_blinded_source', v_prev_source, 'closed_others', cardinality(v_others)));
  return jsonb_build_object('id', v_id, 'ends_at', v_ends, 'notified', n);
end $function$;
revoke all on function public.admin_takedown_post(uuid, text, uuid) from public, anon;
grant execute on function public.admin_takedown_post(uuid, text, uuid) to authenticated, service_role;

-- ── 6) 권리침해 요청 기각 — 침해로 보기 어려울 때. 글은 그대로, 신청인에게 사유와 함께 알린다. ───────────────
create or replace function public.admin_reject_rights_request(p_report_id uuid, p_note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r public.reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if public.my_role() is distinct from 'admin'::public.user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if v_note is null then raise exception '신청인에게 알릴 사유를 입력해 주세요'; end if;
  if char_length(v_note) > 300 then raise exception '사유는 300자 이내로 입력해 주세요'; end if;
  select * into r from public.reports where id = p_report_id for update;
  if not found or r.status is distinct from 'open' then raise exception '이미 처리되었거나 없는 신고입니다'; end if;
  if not public._is_rights_report(r.target_type, r.reason) then raise exception '권리침해 삭제 요청이 아닙니다'; end if;
  update public.reports set status = 'dismissed' where id = p_report_id;
  perform public._notify_user(r.reporter_id, 'system'::public.notif_type, '권리침해 신고 처리 결과',
    format('신고하신 게시물을 검토한 결과 권리 침해로 보기 어려워 게시물을 그대로 둡니다. 사유: %s. 추가 자료가 있으면 고객센터(ace@nuriholdem.com)로 보내 주세요.',
           left(v_note, 80)),
    null);
  perform public._audit('rights_request_reject', p_report_id::text, jsonb_build_object('target_id', r.target_id, 'note', v_note));
  return jsonb_build_object('status', 'dismissed', 'notified', 1);
end $function$;
revoke all on function public.admin_reject_rights_request(uuid, text) from public, anon;
grant execute on function public.admin_reject_rights_request(uuid, text) to authenticated, service_role;

-- ── 7) 작성자의 다시 게시 요청(이의제기) — 기간 안에 한 번 ────────────────────────────────────────
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

-- ── 8) 관리자 판단 — 다시 게시(restore) · 삭제(remove) · 가림 유지(keep). 결과를 작성자·신청인 전원에게 알린다. ──────
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
  v_tail text;
  v_imgs text[];
  v_queued int;   -- P2-3: 이미지 파일 삭제 큐에 넣은 수 · null = 큐 없음(20261006s2 미적용)으로 건너뜀
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
    -- P1-1: 임시조치 전 상태로 되돌린다 — 관리자가 이미 숨긴 글이면 숨김(출처 포함)이 그대로 남는다.
    update public.community_posts
       set blinded = t.prev_blinded, blinded_source = case when t.prev_blinded then t.prev_blinded_source end
     where id = t.post_id and blinded_source = 'takedown';
    v_status := 'restored';
    v_what := case when t.prev_blinded then '임시조치를 해제하기로' else '다시 게시하기로' end;
  elsif p_action = 'remove' then
    select images into v_imgs from public.community_posts where id = t.post_id;
    -- 먼저 종결해 둔다 — 그래야 삭제 트리거(다른 경로 삭제 통지)가 이 건을 다시 통지하지 않는다(통지는 아래 한 번).
    update public.post_takedowns set status = 'removed', decided_at = now(), decided_by = auth.uid(), decision_note = v_note where id = t.id;
    delete from public.community_posts where id = t.post_id;
    v_status := 'removed'; v_what := '삭제하기로';
    -- P2-3: 공개 버킷 파일은 행을 지워도 URL 로 열린다 → 실제 객체를 삭제 큐로(엣지 storage-purge 가 Storage API 로 지운다).
    if to_regclass('public.storage_purge_queue') is not null and coalesce(cardinality(v_imgs), 0) > 0 then
      with names as (
        select distinct substring(u from '/storage/v1/object/public/community_images/([^?#]+)') as name from unnest(v_imgs) u),
      ins as (
        insert into public.storage_purge_queue(bucket_id, name, reason)
        select 'community_images', n.name, 'takedown_remove' from names n
         where n.name is not null
           and exists (select 1 from storage.objects o where o.bucket_id = 'community_images' and o.name = n.name)
        on conflict (bucket_id, name) do update set done_at = null, last_error = null
        returning 1)
      select count(*) into v_queued from ins;
    elsif to_regclass('public.storage_purge_queue') is not null then
      v_queued := 0;
    end if;
  else
    v_status := 'kept'; v_what := '계속 가리기로';
  end if;

  update public.post_takedowns
     set status = v_status, decided_at = now(), decided_by = auth.uid(), decision_note = v_note
   where id = t.id;

  v_tail := case when v_note is not null then ' 사유: ' || left(v_note, 80) || '.' else '' end
         || case when p_action = 'restore' and t.prev_blinded then ' 게시물은 운영 정책에 따라 계속 가려집니다.' else '' end;
  perform public._notify_takedown_parties(t.id, '임시조치 검토 결과',
    format('임시조치된 회원님의 게시물을 검토한 결과 %s 했습니다.%s', v_what, v_tail),
    '권리침해 신고 처리 결과',
    format('신고하신 게시물의 임시조치를 검토한 결과 %s 했습니다.%s', v_what, v_tail));

  perform public._audit('post_takedown_decide', p_takedown_id::text, jsonb_build_object(
    'action', p_action, 'post_id', t.post_id, 'note', v_note, 'prev_blinded', t.prev_blinded, 'purge_queued', v_queued));
  return jsonb_build_object('status', v_status, 'purge_queued', v_queued);
end $function$;
revoke all on function public.admin_decide_takedown(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_takedown(uuid, text, text) to authenticated, service_role;

-- ── 9) 글이 어떤 경로로든 지워지면 — 임시조치 기록 종결 + 당사자 통지 + 열린 권리침해 신고 종결·통지 ──────────────
--   BEFORE DELETE — FK(on delete set null)가 post_id 를 비우기 전에 행을 찾는다.
--   경로: 작성자 자진 삭제 · 관리자 상세 '삭제'(직접 DELETE) · 일반 신고의 '삭제'·'정지+삭제' · 탈퇴 연쇄 — 한 곳에서 덮는다(재반증 ⑦).
--   임시조치 '삭제' 판단(admin_decide_takedown)은 지우기 전에 기록을 먼저 종결하므로 여기서 다시 통지되지 않는다.
create or replace function public._post_takedown_on_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_by_author boolean := auth.uid() is not distinct from old.user_id;
  t record;
  u uuid;
begin
  for t in update public.post_takedowns
              set status = case when v_by_author then 'author_deleted' else 'removed' end,
                  decided_at = now(), decided_by = auth.uid(),
                  decision_note = case when v_by_author then '작성자 삭제' else '다른 경로로 삭제' end
            where post_id = old.id and status in ('active', 'kept')
           returning id loop
    -- 작성자가 지웠으면 작성자에게는 알릴 것이 없다 — 신청인에게만 알린다.
    perform public._notify_takedown_parties(t.id,
      '임시조치 검토 결과', case when v_by_author then null else '임시조치된 회원님의 게시물이 삭제되었습니다.' end,
      '권리침해 신고 처리 결과',
      case when v_by_author then '신고하신 게시물을 작성자가 삭제했습니다.' else '신고하신 게시물이 삭제되었습니다.' end);
  end loop;
  -- 임시조치 없이 열려 있던 권리침해 신고 — 글이 없어지면 처리 완료로 닫고 신청인에게 알린다(통지 없이 열린 채 남지 않게).
  for u in with closed as (
             update public.reports set status = 'resolved'
              where target_type = 'post' and target_id = old.id and status = 'open'
                and public._is_rights_report(target_type, reason)
             returning reporter_id)
           select distinct reporter_id from closed where reporter_id is not null loop
    perform public._notify_user(u, 'system'::public.notif_type, '권리침해 신고 처리 결과',
      case when v_by_author then '신고하신 게시물을 작성자가 삭제해 신고를 처리 완료로 닫았습니다.'
           else '신고하신 게시물이 삭제되어 신고를 처리 완료로 닫았습니다.' end, null);
  end loop;
  return old;
end $function$;
revoke all on function public._post_takedown_on_delete() from public, anon, authenticated;
drop trigger if exists trg_post_takedown_on_delete on public.community_posts;
create trigger trg_post_takedown_on_delete before delete on public.community_posts
  for each row execute function public._post_takedown_on_delete();

-- ── 10) 기간 만료 통지 — 매일 한 번. 당사자는 건마다 한 번, 관리자는 하루 한 통(건수 요약)(P2-2 리드 결정: 자동 공개·삭제 없음) ──
create or replace function public.cron_takedown_expiry()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t record;
  a uuid;
  n int := 0;
begin
  for t in select id from public.post_takedowns
            where status = 'active' and ends_at <= now() and expiry_notified_at is null
            for update skip locked loop
    update public.post_takedowns set expiry_notified_at = now() where id = t.id;
    perform public._notify_takedown_parties(t.id, '임시조치 기간 만료 안내',
      '게시물의 임시조치 기간이 끝났습니다. 운영자가 게시 재개 또는 삭제를 결정해 알려 드립니다. 결정 전까지 게시물은 가려진 상태로 유지됩니다.',
      '임시조치 기간 만료 안내',
      '신고하신 게시물의 임시조치 기간이 끝났습니다. 운영자가 게시 재개 또는 삭제를 결정해 알려 드립니다.');
    n := n + 1;
  end loop;
  -- 관리자는 하루 한 통 — 오늘 새로 만료된 건수와 아직 판단하지 않은 만료 건수를 함께 적는다(재반증 P3).
  if n > 0 then
    for a in select id from public.profiles where role = 'admin'::public.user_role loop
      perform public._notify_user(a, 'system'::public.notif_type, '임시조치 기간 만료 — 판단 필요',
        format('임시조치 기간이 새로 끝난 게시물 %s건(판단 대기 전체 %s건)이 있습니다. 관리자 → 신고 처리의 임시조치 목록에서 게시 재개·삭제·가림 유지를 정해 주세요.',
               n, (select count(*) from public.post_takedowns where status = 'active' and ends_at <= now())), null);
    end loop;
  end if;
  return n;
end $function$;
revoke all on function public.cron_takedown_expiry() from public, anon, authenticated;
grant execute on function public.cron_takedown_expiry() to service_role;
select cron.schedule('takedown-expiry', '0 1 * * *', 'select public.cron_takedown_expiry();')
 where not exists (select 1 from cron.job where jobname = 'takedown-expiry');

-- ── 11) 옛 처리 경로가 권리침해 신고를 통지 없이 닫지 못하게(P2-1) ─────────────────────────────────────
--   관리자 '블라인드' 토글: 임시조치 글은 풀거나 덮지 못하고, 열린 권리침해 신고가 있는 글은 임시조치로만 가린다.
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
  if p_blinded and exists (select 1 from public.reports where target_type = 'post' and target_id = p_post_id
                             and status = 'open' and public._is_rights_report(target_type, reason)) then
    raise exception '권리침해 삭제 요청이 접수된 글입니다. 신고 처리에서 임시조치로 가려 주세요(신청인·작성자 통지가 함께 갑니다)';
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

-- 신고 결정 RPC: 라이브 정의(md5 6638e5f0…)에 ① 권리침해 신고 거절 ② 같은 대상 함께 닫기에서 권리침해 신고 제외 — 두 군데만 더했다.
create or replace function public.admin_decide_report(p_report_id uuid, p_action text, p_include_same_target boolean DEFAULT true, p_delete_content boolean DEFAULT false, p_suspend_days integer DEFAULT NULL::integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 20261006t ①: 권리침해 삭제 요청은 신청인·작성자 통지가 함께 가는 임시조치·요청 기각으로만 닫는다(약관 제5조⑧).
  if public._is_rights_report(r.target_type, r.reason) then
    raise exception '권리침해 삭제 요청은 임시조치 또는 요청 기각으로 처리해 주세요(신청인·작성자 통지가 함께 갑니다)';
  end if;

  -- 함께 닫을 신고(행 잠금). 대상 id 가 없는 신고는 그 한 건만.
  -- 20261006t ②: 같은 대상의 권리침해 신고는 함께 닫지 않는다(통지 없이 사라지면 안 된다).
  if coalesce(p_include_same_target, true) and r.target_id is not null then
    select array_agg(id order by created_at) into v_ids from (
      select id, created_at from public.reports
       where target_type = r.target_type and target_id = r.target_id and status = 'open'
         and not public._is_rights_report(target_type, reason)
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
revoke all on function public.admin_decide_report(uuid, text, boolean, boolean, integer, text) from public, anon;
grant execute on function public.admin_decide_report(uuid, text, boolean, boolean, integer, text) to authenticated, service_role;

-- 옛 기각 RPC(화면 호출 0 — reportDecide.contract.test.ts): 라이브 정의(md5 734874aa…)에 권리침해 신고 거절 한 블록만 더했다.
create or replace function public.admin_dismiss_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type text; v_target uuid; v_left int := 0; v_unblinded boolean := false;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '운영자만 가능합니다';
  end if;
  -- 20261006t: 권리침해 삭제 요청은 통지가 함께 가는 경로로만 닫는다.
  if exists (select 1 from public.reports where id = p_report_id and public._is_rights_report(target_type, reason)) then
    raise exception '권리침해 삭제 요청은 임시조치 또는 요청 기각으로 처리해 주세요(신청인·작성자 통지가 함께 갑니다)';
  end if;
  -- 검토 반영: 대상 글 행을 먼저 잠근다 — 두 관리자가 같은 글의 마지막 두 신고를 동시에 기각하면
  -- 서로의 미확정 기각을 open 으로 보고 둘 다 안 푸는 경합을 막는다(두 번째는 첫 번째 커밋 뒤에 센다).
  select target_type, target_id into v_type, v_target from public.reports where id = p_report_id;
  if v_type = 'post' and v_target is not null then
    perform 1 from public.community_posts where id = v_target for update;
  end if;
  update public.reports set status = 'dismissed'
   where id = p_report_id and status = 'open'
  returning target_type, target_id into v_type, v_target;
  if not found then
    raise exception '이미 처리되었거나 없는 신고입니다';
  end if;

  if v_type = 'post' and v_target is not null then
    -- 같은 대상에 기각 아닌 신고(open·resolved)가 남아 있으면 풀지 않는다.
    select count(*) into v_left from public.reports
     where target_type = 'post' and target_id = v_target and status is distinct from 'dismissed';
    if v_left = 0 then
      update public.community_posts set blinded = false, blinded_source = null
       where id = v_target and blinded and blinded_source = 'auto';
      v_unblinded := found;
    end if;
  end if;

  perform public._audit('report_dismiss', p_report_id::text,
    jsonb_build_object('target_type', v_type, 'target_id', v_target, 'reports_left', v_left, 'unblinded', v_unblinded));
  return jsonb_build_object('unblinded', v_unblinded, 'reports_left', v_left);
end $function$;
revoke all on function public.admin_dismiss_report(uuid) from public, anon;
grant execute on function public.admin_dismiss_report(uuid) to authenticated, service_role;

-- 관리자의 PostgREST 직접 UPDATE 로 권리침해 신고를 통지 없이 닫는 길도 막는다(재반증 P3). 권리침해 신고의 상태 변경은
--   정의자 RPC(임시조치·요청 기각·삭제 트리거)만 한다 — 정의자는 표 소유자라 RLS 를 타지 않는다(FORCE RLS 꺼짐, 2026-10-06 실측).
--   reports 에 트리거를 다는 대신 정책 조건으로 둔다(reportDecide.contract.test.ts 가 reports 트리거 추가를 막는다).
--   정책은 호출 역할로 돌므로 내부 판정 함수(_is_rights_report, 클라이언트 실행 회수) 대신 같은 식을 그대로 적는다.
alter policy reports_admin_update on public.reports
  using (public.my_role() = 'admin'::public.user_role
         and not (target_type = 'post' and starts_with(coalesce(reason, ''), '권리침해(명예훼손·사생활 침해 등)')))
  with check (public.my_role() = 'admin'::public.user_role
         and not (target_type = 'post' and starts_with(coalesce(reason, ''), '권리침해(명예훼손·사생활 침해 등)')));

-- ── 12) 숨김 글의 댓글 — 읽기·쓰기를 부모 글이 보이는 사람 + 댓글 작성자 본인으로(P3: 제3자 댓글 쓰기 차단) ─────────
--   EXISTS 는 호출자의 posts_select 를 탄다(정의자 함수 없음 → 비로그인이 숨김 여부를 캐물을 함수가 없다).
--   PK 조회 한 번(community_posts_pkey) · idx_comments_post 로 글별 댓글을 고른 뒤 행마다 평가한다.
alter policy comments_select on public.comments using (
  ((not coalesce((user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[]))), false))
    or (user_id = (select auth.uid()))
    or (public.my_role() = 'admin'::public.user_role))
  and (comments.post_id is null or comments.user_id = (select auth.uid())
       or exists (select 1 from public.community_posts p where p.id = comments.post_id))
);
alter policy comments_insert on public.comments with check (
  ((select auth.uid()) is not null) and (user_id = (select auth.uid()))
  and (comments.post_id is null or exists (select 1 from public.community_posts p where p.id = comments.post_id))
);

-- ── 13) 자가검사 — ACL·정책·제약 ───────────────────────────────────────────────────────────────
do $check$
declare f text;
begin
  foreach f in array array['public.admin_takedown_post(uuid,text,uuid)', 'public.request_post_takedown_review(uuid,text)',
                           'public.admin_decide_takedown(uuid,text,text)', 'public.admin_reject_rights_request(uuid,text)',
                           'public.admin_set_post_blinded(uuid,boolean)',
                           'public.admin_decide_report(uuid,text,boolean,boolean,integer,text)', 'public.admin_dismiss_report(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception '20261006t 자가검사: anon 이 % 를 실행할 수 있다', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception '20261006t 자가검사: authenticated 가 % 를 못 부른다', f; end if;
  end loop;
  foreach f in array array['public._is_rights_report(text,text)', 'public._notify_takedown_parties(uuid,text,text,text,text)',
                           'public._post_takedown_on_delete()', 'public.cron_takedown_expiry()'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '20261006t 자가검사: 내부 함수 % 가 클라이언트에 열려 있다', f;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.post_takedown_notice(uuid)', 'execute') then
    raise exception '20261006t 자가검사: 공개 안내를 anon 이 못 부른다';
  end if;
  if has_table_privilege('anon', 'public.post_takedowns', 'select')
     or has_table_privilege('authenticated', 'public.post_takedowns', 'insert')
     or has_table_privilege('authenticated', 'public.post_takedowns', 'update')
     or has_table_privilege('authenticated', 'public.post_takedowns', 'delete') then
    raise exception '20261006t 자가검사: post_takedowns 표 권한이 열려 있다';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.post_takedowns'::regclass) then
    raise exception '20261006t 자가검사: post_takedowns RLS 꺼짐';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_select') not like '%community_posts%'
     or (select with_check from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_insert') not like '%community_posts%' then
    raise exception '20261006t 자가검사: 댓글 정책에 숨김 글 조건이 없다';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_admin_update') not like '%권리침해%' then
    raise exception '20261006t 자가검사: reports_admin_update 에 권리침해 신고 제외 조건이 없다';
  end if;
  if not exists (select 1 from cron.job where jobname = 'takedown-expiry') then
    raise exception '20261006t 자가검사: 만료 통지 크론이 없다';
  end if;
end $check$;

notify pgrst, 'reload schema';
