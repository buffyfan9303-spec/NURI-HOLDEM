-- 20260917f — 연합 대회 파트너 매칭(매장↔매장 짝짓기) — 테이블 2 · 정책 8 · 트리거 3 · 헬퍼 1
--
-- ✅ 2026-09-17 라이브 적용 완료 (오너 승인 · MCP execute_sql · nuri-lead)
--
-- 적용 후 실측: 정책 8 · 트리거 3 · `is_any_venue_manager` anon=false / authenticated=true ·
--   `venue_match_posts` 의 anon 테이블 권한 **0건**.
--   ⚠ `revoke ... from anon` 이 꼭 필요한 이유를 실측으로 확인했다 — 이 DB 의 `pg_default_acl` 이
--     public 스키마의 **새 테이블에 anon·authenticated·service_role 전 권한을 자동 부여**한다.
--     그래서 새 테이블은 만들자마자 anon 이 읽을 수 있는 상태로 태어난다. authenticated 는 그 기본값으로 동작한다.
--
-- 리허설(begin; … rollback;) 결과 — 음성뿐 아니라 양성까지 확인했다:
--   · 자가검사 통과(정책 8 · RLS 2 · 함수 ACL · 돈/점수 컬럼 0 · 트리거 3)
--   · 양성 — 업주 계정이 게시에 성공
--   · 음성 — 매장이 없는 일반 회원은 목록이 **0건**
--   · 음성2 — anon 은 테이블 접근 자체가 거부
--
-- (원래 머리말)
--    "✅ YYYY-MM-DD 라이브 적용 완료 + 실측값" 을 적는다. 이 표기가 없으면 미적용이다.
--
-- 무엇인가 (오너 결정 2026-09-17: "연합리그 기능은 다 없애고 연합리그 매칭만 제작")
-- ─────────────────────────────────────────────────────────────────
--   업주가 "이 날 연합 대회 같이 열 매장 구함" 을 게시 → 다른 매장 업주가 신청 → 게시 매장이 수락/거절.
--   수락되면 양쪽에 알림이 가고 서로의 매장명·전화가 보인다. **누리는 여기서 끝난다.**
--   점수·상금·정산·공동 순위·엔트리 집계 **없음** — §10 계층1 #3(네트워크 조직자 방조)을 다시 켜지 않는
--   유일한 선이다. 참가비·좌석 같은 '조건' 은 `note` 자유 텍스트 한 칸에만 적힌다(집계 불가 = 의도).
--   → 이 파일에 `points`·`prize`·`amount`·`buy_in`·`entries` 같은 컬럼이 **있으면 안 된다**(자가검사가 막는다).
--
-- 옛 연합리그(leagues·league_*)와의 관계
--   서버는 그대로 둔다(동결 유지 · 오너 결정 · DROP 0). 옛 notify_league_* 함수는 **재사용하지 않는다** —
--   제목·링크·의미가 다르다. 새 함수 3개는 전부 `venue_match_` 접두어.
--
-- 권한 설계 (RLS 가 정본 · 화면 게이트는 UI 분기일 뿐)
--   게시(insert/update/delete)   = can_manage_pos(게시 매장)          — 업주·공동 업주·운영자
--   열람(select)                 = is_any_venue_manager()             — 어느 매장이든 관리하는 로그인 사용자
--   신청(insert responses)       = can_manage_pos(신청 매장) ∧ 게시가 open ∧ 자기 게시 아님
--   결정(update responses.status)= can_manage_pos(게시 매장) — 그리고 BEFORE UPDATE 트리거가 status/responded_at 외 컬럼 변경을 막는다
--   신청 취소(delete responses)  = can_manage_pos(신청 매장)
--   비로그인: auth.uid() NULL → 모든 exists 가 false → 아무것도 못 본다(fail-closed 확인은 아래 리허설 ③)
--
-- 리허설 (리드가 적용 전 라이브에서 `begin; … rollback;` — 시험 계정은 역할·소유를 먼저 조회해서 고른다)
--   ① 양성: 업주 A 로 set_config('request.jwt.claims', …) → posts insert 1행 · 업주 B 로 responses insert 1행
--      · A 로 status='accepted' update 1행 · notifications 에 B 매장 profiles 수만큼 행 생성.
--   ② 음성: B 로 자기 게시가 아닌 글의 responses.status update → 0행. B 로 responses.venue_id 를 다른 매장으로 update → 예외.
--   ③ fail-closed: claims 빈 문자열(auth.uid() NULL) → posts select 0행 · insert 예외.
--   ④ 롤백 뒤 information_schema.tables 에 venue_match_% 0.
--
-- 되돌리려면:
--   drop table if exists public.venue_match_responses; drop table if exists public.venue_match_posts;
--   drop function if exists public.notify_venue_match_response(), public.notify_venue_match_decision(),
--     public.venue_match_response_guard(), public.is_any_venue_manager();

-- ── 1. 테이블 ────────────────────────────────────────────────────────────────
create table if not exists public.venue_match_posts (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  event_date  date,
  note        text not null check (length(btrim(note)) between 1 and 500),
  status      text not null default 'open' check (status in ('open','closed')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create table if not exists public.venue_match_responses (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.venue_match_posts(id) on delete cascade,
  venue_id     uuid not null references public.venues(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  message      text check (message is null or length(message) <= 300),
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (post_id, venue_id)
);
create index if not exists idx_venue_match_posts_open on public.venue_match_posts (status, created_at desc);
create index if not exists idx_venue_match_responses_post on public.venue_match_responses (post_id);

alter table public.venue_match_posts enable row level security;
alter table public.venue_match_responses enable row level security;
revoke all on table public.venue_match_posts, public.venue_match_responses from anon;

-- ── 2. 헬퍼 — "어느 매장이든 관리하는 사람인가" (정책이 부른다 · 회수 금지) ──────────
create or replace function public.is_any_venue_manager()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v where v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved');
$$;
revoke execute on function public.is_any_venue_manager() from public, anon;
grant execute on function public.is_any_venue_manager() to authenticated, service_role;

-- ── 3. 정책 ──────────────────────────────────────────────────────────────────
drop policy if exists vmp_select on public.venue_match_posts;
create policy vmp_select on public.venue_match_posts for select
  using (public.is_any_venue_manager());
drop policy if exists vmp_insert on public.venue_match_posts;
create policy vmp_insert on public.venue_match_posts for insert
  with check (public.can_manage_pos(venue_id) and created_by is not distinct from auth.uid());
drop policy if exists vmp_update on public.venue_match_posts;
create policy vmp_update on public.venue_match_posts for update
  using (public.can_manage_pos(venue_id)) with check (public.can_manage_pos(venue_id));
drop policy if exists vmp_delete on public.venue_match_posts;
create policy vmp_delete on public.venue_match_posts for delete
  using (public.can_manage_pos(venue_id));

drop policy if exists vmr_select on public.venue_match_responses;
create policy vmr_select on public.venue_match_responses for select
  using (public.can_manage_pos(venue_id)
      or exists (select 1 from public.venue_match_posts p where p.id = post_id and public.can_manage_pos(p.venue_id)));
drop policy if exists vmr_insert on public.venue_match_responses;
create policy vmr_insert on public.venue_match_responses for insert
  with check (public.can_manage_pos(venue_id)
      and created_by is not distinct from auth.uid()
      and exists (select 1 from public.venue_match_posts p
                  where p.id = post_id and p.status = 'open' and p.venue_id is distinct from venue_id));
drop policy if exists vmr_update on public.venue_match_responses;
create policy vmr_update on public.venue_match_responses for update
  using (exists (select 1 from public.venue_match_posts p where p.id = post_id and public.can_manage_pos(p.venue_id)))
  with check (exists (select 1 from public.venue_match_posts p where p.id = post_id and public.can_manage_pos(p.venue_id)));
drop policy if exists vmr_delete on public.venue_match_responses;
create policy vmr_delete on public.venue_match_responses for delete
  using (public.can_manage_pos(venue_id));

-- ── 4. 결정은 status 만 바꾼다 — 게시 매장이 신청 매장·메시지를 고쳐 쓰지 못하게 ─────────
create or replace function public.venue_match_response_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.post_id is distinct from old.post_id or new.venue_id is distinct from old.venue_id
     or new.created_by is distinct from old.created_by or new.message is distinct from old.message
     or new.created_at is distinct from old.created_at then
    raise exception '신청 내용은 바꿀 수 없습니다 — 수락/거절만 가능합니다';
  end if;
  if new.status is distinct from old.status then new.responded_at := now(); end if;
  return new;
end $$;
revoke execute on function public.venue_match_response_guard() from public, anon, authenticated;
drop trigger if exists trg_venue_match_response_guard on public.venue_match_responses;
create trigger trg_venue_match_response_guard before update on public.venue_match_responses
  for each row execute function public.venue_match_response_guard();

-- ── 5. 알림 — 옛 notify_league_* 조리법을 복제한 **새 함수** (링크는 내 매장 › 파트너 매장) ──
create or replace function public.notify_venue_match_response()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post_venue uuid; v_applicant text; v_date date;
begin
  select p.venue_id, p.event_date into v_post_venue, v_date from public.venue_match_posts p where p.id = new.post_id;
  select name into v_applicant from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', '연합 대회 파트너 신청',
    coalesce(v_applicant, '매장') || ' 매장이 ' || coalesce(to_char(v_date, 'MM/DD'), '날짜 미정') || ' 연합 대회에 함께하자고 신청했습니다.',
    '/my-store/partners', false
  from public.profiles pr where pr.venue_id = v_post_venue and coalesce(pr.mute_venue_notify, false) = false;
  return new;
end $$;
revoke execute on function public.notify_venue_match_response() from public, anon, authenticated;
drop trigger if exists trg_venue_match_response on public.venue_match_responses;
create trigger trg_venue_match_response after insert on public.venue_match_responses
  for each row execute function public.notify_venue_match_response();

create or replace function public.notify_venue_match_decision()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_host text;
begin
  if new.status = old.status or new.status = 'pending' then return new; end if;
  select v.name into v_host from public.venue_match_posts p join public.venues v on v.id = p.venue_id where p.id = new.post_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', '연합 대회 파트너 ' || (case when new.status = 'accepted' then '수락' else '거절' end),
    coalesce(v_host, '매장') || ' 매장이 신청을 ' ||
    (case when new.status = 'accepted' then '수락했습니다 — 내 매장 › 파트너 매장에서 연락처를 확인하세요.' else '거절했습니다.' end),
    '/my-store/partners', false
  from public.profiles pr where pr.venue_id = new.venue_id and coalesce(pr.mute_venue_notify, false) = false;
  return new;
end $$;
revoke execute on function public.notify_venue_match_decision() from public, anon, authenticated;
drop trigger if exists trg_venue_match_decision on public.venue_match_responses;
create trigger trg_venue_match_decision after update of status on public.venue_match_responses
  for each row execute function public.notify_venue_match_decision();

notify pgrst, 'reload schema';

-- ── 6. 자가검사 — 틀리면 예외로 멈춘다(RAISE NOTICE 는 편집기에서 안 보인다) ───────────
do $check$
declare n int; bad text;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename in ('venue_match_posts','venue_match_responses');
  if n <> 8 then raise exception 'SELFCHECK 정책 수 % (기대 8)', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.venue_match_posts'::regclass) then raise exception 'SELFCHECK posts RLS off'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.venue_match_responses'::regclass) then raise exception 'SELFCHECK responses RLS off'; end if;
  if has_function_privilege('anon', 'public.notify_venue_match_response()', 'execute')
     or has_function_privilege('anon', 'public.notify_venue_match_decision()', 'execute')
     or has_function_privilege('anon', 'public.venue_match_response_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.venue_match_response_guard()', 'execute')
     or has_function_privilege('anon', 'public.is_any_venue_manager()', 'execute') then
    raise exception 'SELFCHECK 함수 ACL 열림';
  end if;
  if not has_function_privilege('authenticated', 'public.is_any_venue_manager()', 'execute') then raise exception 'SELFCHECK 헬퍼가 authenticated 에서 막힘(정책이 못 돈다)'; end if;
  -- 돈·점수 컬럼 금지 — 이 매칭은 집계 대상이 아니다(§10 계층1 #3)
  select string_agg(table_name || '.' || column_name, ', ') into bad
  from information_schema.columns
  where table_schema = 'public' and table_name in ('venue_match_posts','venue_match_responses')
    and column_name ~ '(point|prize|amount|buy_in|buyin|entr|seat|money|price|fee|score)';
  if bad is not null then raise exception 'SELFCHECK 돈·점수 컬럼 발견: %', bad; end if;
  select count(*) into n from pg_trigger where tgrelid = 'public.venue_match_responses'::regclass and not tgisinternal;
  if n <> 3 then raise exception 'SELFCHECK 트리거 수 % (기대 3)', n; end if;
end $check$;
