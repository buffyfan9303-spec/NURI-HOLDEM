-- ✅ 적용 완료 2026-10-02 (리드, Management API). 되돌림 리허설 87칸 PASS · critical-reviewer 2회 검토(FAIL 4건 → 수정 반영: 그룹·다른 매장 이동 우회, 알림 상한, 계정 삭제 연쇄) · advisors ERROR 0 · 적용 직후 approved∧feed_request=false 0건 · md5 9c9cd27c
-- ⏳ 미적용 초안 — store-team 2026-10-02 + critical-reviewer 수정 2곳(CR 표시) + 오너 결정 A·B(2차) + CR 재검토 1곳(소속 변경 재심사). 설계: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\poster-approval-1002\design.md
-- 요구: 오너 10-02 A(프리미엄 매장 외 포스터는 관리자 승인) · B(그룹 포스터 — 그룹 페이지는 바로, 일정 피드만 승인).
--
-- 무엇:
--   1) venues.premium_until — 기존 관리자 '프리미엄 지정'(is_paid_ad)에 기간. null = 기한 없음. 비관리자 변경은 새 가드가 막는다.
--      (schedules.is_premium·premium_until 은 포스터 단위 상단 고정 부스트 — 이 파일은 손대지 않는다)
--   2) schedules.feed_request — 일정 피드 공개 요청. 매장·무소속 포스터는 트리거가 늘 true. 그룹 포스터만 false(그룹 전용) 가능.
--   3) 트리거: 기간 안 프리미엄 매장 운영자의 등록·저장은 즉시 공개. 그룹 전용은 언제나 비공개. 관리자 대기 알림은 공개 요청분만.
--   4) RLS: 그룹 개설자·운영진의 INSERT/UPDATE/DELETE 정책 추가(기존 정책 불변). schedules_select 는 넓히지 않는다 → 피드 쿼리는 서버가 미승인 그룹 포스터를 거른다.
--   5) 읽기 RPC get_group_schedules — 그룹 페이지 목록: 방문자 전체(비로그인 포함), 반려분만 작성자·운영진·관리자.
--   6) Storage: posters_upload_group 추가 — '<uid>/g/<그룹id>/' 경로만, 그 그룹 개설자·운영진만. posters_upload(매장 경로)는 불변.
--   오너 결정(10-02): ① 기존 프리미엄 1곳 기한 없이 유지 ② 작성자 = 개설자 + 운영진 ③ 그룹 전용은 그룹 페이지 방문자 전체 ④ 프리미엄 수정도 재심사 없음.
--   오너 결정(10-02 2차): A 관리자가 반려한 포스터는 프리미엄 매장이라도 저장 = 재제출(승인 대기·대기열·알림), 공개는 관리자 승인 후.
--                          삭제 후 재등록 우회는 그대로 둔다(프리미엄 해제로 대응 — 오너 결정)
--                        B 승인된 포스터의 이미지(poster_url) 교체는 재심사 — 비프리미엄 매장·그룹 공개 요청분. 프리미엄은 즉시, 설명 변경은 종전대로 즉시.
--   정본 이력: 원본(md5 4db6f170) → critical-reviewer 수정판(a5cfb078, CR 2곳) → 이 판(A·B 반영).
--
-- 라이브 실측(2026-10-02, 바꾸기 전, MCP execute_sql SELECT):
--   PG 17.6 · md5(prosrc) auto_approve_verified_poster=c6cb701d… prevent_self_approve_poster=4879beec… _notify_admin_pending_poster=85d22dff…
--   venues: is_paid_ad=true 1곳(f35b42d1, 승인 매장) → 적용 즉시 '기한 없는 프리미엄 = 즉시 공개'(설계 남은 결정 ①).
--   schedules 30행 전부 kind='venue' 매장 소속 → feed_request 기본 true 로 종전 판정 그대로.
--   posters_upload md5(with_check)=57b58a12…(20261001n 수정판) — 이 파일은 그 정책을 바꾸지 않는다.
-- 적용: 이 파일 전체를 한 번의 execute_sql 로(리허설 블록 없음 — 단언은 _rehearse.sql 별도 파일). 적용 판단은 리드.
-- 되돌리기: 함수 3개 원문은 git(20260911o·20260926c 계열)에 있다. 새 객체는 drop policy/trigger/function, 칸은 drop column.

-- ── 0) 게이트 ────────────────────────────────────────────────────────────────
do $gate$
begin
  if md5((select prosrc from pg_proc where oid = 'public.auto_approve_verified_poster()'::regprocedure)) is distinct from 'c6cb701dc3c827c292df0afbe1edb32c'
  or md5((select prosrc from pg_proc where oid = 'public.prevent_self_approve_poster()'::regprocedure)) is distinct from '4879beece63fcb612e61599fc8cf68be'
  or md5((select prosrc from pg_proc where oid = 'public._notify_admin_pending_poster()'::regprocedure)) is distinct from '85d22dff5aa2169f6dfc987415cc931c' then
    raise exception '20261002h 게이트: 포스터 승인 함수가 초안 작성 때와 다르다 — 라이브 본문을 다시 읽고 초안을 고쳐라';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'venues' and column_name = 'is_paid_ad') then
    raise exception '20261002h 게이트: venues.is_paid_ad 가 없다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_venue_verification' and tgrelid = 'public.venues'::regclass) then
    raise exception '20261002h 게이트: is_paid_ad 를 막는 guard_venue_verification 트리거가 없다 — 비관리자가 프리미엄을 켤 수 있다';
  end if;
end $gate$;

-- ── 1) 칸 ────────────────────────────────────────────────────────────────────
alter table public.venues add column if not exists premium_until timestamptz;
comment on column public.venues.premium_until is
  '프리미엄 매장(is_paid_ad) 기간 끝 — null=기한 없음. 기간 안 프리미엄 매장 포스터는 승인 없이 공개(20261002h). schedules.premium_until(포스터 부스트)와 별개';

alter table public.schedules add column if not exists feed_request boolean not null default true;
comment on column public.schedules.feed_request is
  '일정 피드 공개 요청 — 매장·무소속 포스터는 늘 true. 그룹 포스터만 false(그룹 전용: 그룹 페이지에만, 관리자 대기열 밖)(20261002h)';

alter table public.schedules drop constraint if exists schedules_group_only_not_public;
alter table public.schedules add constraint schedules_group_only_not_public check (approved is not true or feed_request);

-- ── 2) 판정 함수 ─────────────────────────────────────────────────────────────
create or replace function public._venue_premium_active(p_venue_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  -- 기간 안 프리미엄 매장(kind='venue')인가. 그룹은 프리미엄이 아니다.
  select exists (
    select 1 from public.venues v
     where v.id = p_venue_id and v.kind = 'venue' and v.is_paid_ad is true
       and (v.premium_until is null or v.premium_until > now())
  );
$fn$;
revoke all on function public._venue_premium_active(uuid) from public, anon, authenticated;

create or replace function public.can_post_group_poster(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  -- 그룹(kind<>'venue', 관리자 승인됨, active)의 개설자 또는 승인된 운영진(is_group_manager 와 같은 범위 — 관리자는
  -- 기존 schedules 정책이 따로 통과시킨다)이고 제재 중이 아닌가. 오너 결정 10-02 ②: 개설자 + 운영진.
  select exists (
    select 1 from public.venues v
     where v.id = p_group_id and v.kind <> 'venue' and v.approved is true
       and v.status = 'active'::public.venue_status
       and ( v.owner_id = auth.uid()
          or exists (select 1 from public.group_members m
                      where m.group_id = v.id and m.user_id = auth.uid()
                        and m.role = 'manager' and m.status = 'approved') )
  ) and public._actor_not_sanctioned();
$fn$;
revoke all on function public.can_post_group_poster(uuid) from public, anon;
grant execute on function public.can_post_group_poster(uuid) to authenticated, service_role;

-- ── 3) 공개 판정 트리거 ──────────────────────────────────────────────────────
create or replace function public.auto_approve_verified_poster()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  -- 20261002h: 그룹 포스터만 '그룹 전용'(feed_request=false)을 가질 수 있다.
  if not exists (select 1 from public.venues v where v.id = new.venue_id and v.kind <> 'venue') then
    new.feed_request := true;
  end if;
  if new.feed_request is not true then
    new.feed_request := false;
    new.approved := false; -- 그룹 전용은 일정 피드에 오르지 않는다(관리자 입력도 같다)
    return new;
  end if;
  if public.my_role() = 'admin' then return new; end if; -- 관리자 입력은 그대로(승인 가능)
  new.approved := false; -- 업주 등록은 승인 대기
  -- 20261002h: 기간 안 프리미엄 매장을 관리하는 사람의 등록은 즉시 공개
  if public._venue_premium_active(new.venue_id) and public.can_manage_venue_schedules(new.venue_id) then
    new.approved := true;
  end if;
  return new;
end; $function$;

create or replace function public.prevent_self_approve_poster()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  -- 20261002h: 그룹 포스터는 비관리자가 소속(그룹)·작성자를 바꿀 수 없다 — 운영진이 남의 포스터를 고칠 수 있게 되면서
  --   매장·다른 그룹으로 옮기거나 작성자를 바꾸는 길이 생기지 않게(오너 결정 10-02 ②).
  -- CR(10-02): 그룹 '으로' 옮기기도 막는다(프리미엄·승인된 매장 포스터를 그룹 포스터로 세탁해 승인 없이 피드에 올리는 길).
  --   작성자를 null 로 바꾸는 것은 허용 — FK owner_id ON DELETE SET NULL(계정 삭제) 연쇄가 이 가드에 걸려 삭제가 실패했다.
  if public.my_role() is distinct from 'admin'::user_role
     and exists (select 1 from public.venues v where v.id in (old.venue_id, new.venue_id) and v.kind <> 'venue')
     and (new.venue_id is distinct from old.venue_id
          or (new.owner_id is distinct from old.owner_id and new.owner_id is not null)) then
    raise exception '그룹 포스터는 다른 그룹·매장으로 옮기거나 작성자를 바꿀 수 없습니다';
  end if;
  -- 20261002h: 그룹이 아닌 포스터는 언제나 일정 공개 대상
  if not exists (select 1 from public.venues v where v.id = new.venue_id and v.kind <> 'venue') then
    new.feed_request := true;
  end if;
  if public.my_role() is distinct from 'admin'::user_role then
    new.approved := old.approved;
    -- 오너 결정 B(10-02 2차): 승인된 포스터의 **이미지(poster_url)** 교체도 재심사 — 매장·그룹(공개 요청분) 모두.
    --   설명(description) 등 나머지 칸은 종전대로 즉시. 프리미엄 매장은 아래 분기가 다시 공개한다.
    if old.approved
       and ( new.title      is distinct from old.title
          or new.buy_in     is distinct from old.buy_in
          or new.prize_pool is distinct from old.prize_pool
          or new.guaranteed is distinct from old.guaranteed
          or new.date       is distinct from old.date
          or new.start_time is distinct from old.start_time
          or new.poster_url is distinct from old.poster_url
          -- CR(10-02 재검토): 소속 변경도 재심사 — 프리미엄 매장에서 바로 공개된 포스터를 운영하는 다른 매장·무소속(venue_id null)으로
          --   옮기면 approved 가 남아 승인 없이 피드에 올랐다(리허설 Y1·Y2). 프리미엄 매장으로 옮기면 아래 분기가 다시 공개한다.
          or new.venue_id   is distinct from old.venue_id ) then
      new.approved := false;
    end if;
    -- 20261002h: 기간 안 프리미엄 매장 운영자의 **실제 저장**(updated_at 변경)은 재심사 없이 공개.
    --   updated_at 조건: 조회수 같은 부수 갱신이 반려된 프리미엄 포스터를 되살리지 않게.
    -- 오너 결정 A(10-02 2차·확정): 관리자가 **반려한** 포스터는 프리미엄 매장이라도 즉시 공개하지 않는다 —
    --   저장은 일반 매장처럼 재제출(반려 해제 → 승인 대기 · 관리자 대기열·재제출 알림), 공개는 관리자 승인 후.
    --   그래서 프리미엄 즉시 공개는 '이미 공개 중인 포스터의 수정'에만 건다(old.approved). old.rejected_at 만 보면
    --   반려→저장(재제출, 반려 해제)→한 번 더 저장 = 공개 로 두 번 저장에 반려가 풀렸다(리허설 PA1두번째저장).
    --   ⚠ 부수 효과: 프리미엄 지정 전부터 승인 대기이던 포스터도 저장만으로는 공개되지 않는다(관리자 승인). 새 등록은 종전대로 즉시.
    if new.feed_request
       and old.approved is true
       and new.updated_at is distinct from old.updated_at
       and public._venue_premium_active(new.venue_id)
       and public.can_manage_venue_schedules(new.venue_id) then
      new.approved := true;
    end if;
    if new.updated_at is distinct from old.updated_at then
      new.rejected_at := null;
      new.reject_reason := null;
    else
      new.rejected_at := old.rejected_at;
      new.reject_reason := old.reject_reason;
    end if;
  end if;
  -- 20261002h: 그룹 전용으로 돌리면 피드에서 내린다(관리자도 같다)
  if new.feed_request is not true then
    new.approved := false;
  end if;
  if new.approved then
    new.rejected_at := null;
    new.reject_reason := null;
  end if;
  return new;
end; $function$;

-- ── 4) 관리자 대기 알림 — 공개 요청분만 ──────────────────────────────────────
create or replace function public._notify_admin_pending_poster()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_venue text; v_group boolean;
begin
  select name, kind <> 'venue' into v_venue, v_group from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link)
  select p.id, 'system',
         case when coalesce(v_group, false) then '📢 그룹 포스터 일정 공개 요청'
              when tg_op = 'UPDATE' then '📢 포스터 재심사 대기' else '📢 포스터 승인 대기' end,
         coalesce(new.title,'(제목 없음)') || ' · ' || coalesce(v_venue,'-')
           || case when coalesce(v_group, false) then ' — 그룹 페이지에는 이미 보입니다. 승인하면 일정탐색에도 노출됩니다'
                   when tg_op = 'UPDATE' then ' — 수정 후 재심사 대기입니다. 승인하면 다시 일정탐색에 노출됩니다'
                   else ' — 승인하면 일정탐색에 노출됩니다' end,
         '/admin'
  from public.profiles p where p.role = 'admin'
    -- CR(10-02): 그룹 공개 요청 알림은 관리자마다 1시간 10건까지 — 공개 요청 토글 반복·대량 등록이 관리자 전원에게
    --   알림+푸시를 무한히 만들던 길. 대기열(feed_request 인 미승인)은 그대로라 승인 업무는 잃지 않는다.
    and ( not coalesce(v_group, false)
          or (select count(*) from public.notifications n
               where n.user_id = p.id and n.title = '📢 그룹 포스터 일정 공개 요청'
                 and n.created_at > now() - interval '1 hour') < 10 );
  return new;
end $function$;

drop trigger if exists trg_notify_admin_pending_poster on public.schedules;
create trigger trg_notify_admin_pending_poster after insert on public.schedules for each row
  when ((new.approved = false) and new.feed_request) execute function public._notify_admin_pending_poster();
drop trigger if exists trg_notify_admin_rereview_poster on public.schedules;
create trigger trg_notify_admin_rereview_poster after update on public.schedules for each row
  when ((old.approved = true) and (new.approved = false) and (new.rejected_at is null) and new.feed_request)
  execute function public._notify_admin_pending_poster();
drop trigger if exists trg_notify_admin_resubmit_poster on public.schedules;
create trigger trg_notify_admin_resubmit_poster after update on public.schedules for each row
  when ((old.rejected_at is not null) and (new.rejected_at is null) and (new.approved is not true) and new.feed_request)
  execute function public._notify_admin_pending_poster();
drop trigger if exists trg_notify_admin_feed_request on public.schedules;
create trigger trg_notify_admin_feed_request after update of feed_request on public.schedules for each row
  when ((old.feed_request = false) and new.feed_request and (new.approved is not true) and (new.rejected_at is null))
  execute function public._notify_admin_pending_poster();

-- ── 5) 프리미엄 기간 가드 ────────────────────────────────────────────────────
create or replace function public._guard_venue_premium_until()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if current_user in ('authenticated', 'anon')
     and coalesce(public.my_role() = 'admin'::user_role, false) is false
     and new.premium_until is distinct from old.premium_until then
    raise exception '프리미엄 기간은 관리자만 바꿀 수 있습니다';
  end if;
  return new;
end $fn$;
revoke all on function public._guard_venue_premium_until() from public, anon, authenticated;
drop trigger if exists trg_guard_venue_premium_until on public.venues;
create trigger trg_guard_venue_premium_until before update of premium_until on public.venues
  for each row execute function public._guard_venue_premium_until();

-- ── 6) 그룹 개설자·운영진 RLS(추가 — 기존 정책 불변) ───────────────────────
--   등록은 본인 명의로만. 수정·삭제는 그 그룹의 개설자·운영진이면 남의 그룹 포스터도(운영 관리).
--   소속·작성자 변경은 prevent_self_approve_poster 가 막는다(WITH CHECK 는 옛 행을 못 본다).
drop policy if exists schedules_insert_group on public.schedules;
create policy schedules_insert_group on public.schedules for insert to authenticated
  with check (owner_id = (select auth.uid()) and venue_id is not null and public.can_post_group_poster(venue_id));
drop policy if exists schedules_update_group on public.schedules;
create policy schedules_update_group on public.schedules for update to authenticated
  using (venue_id is not null and public.can_post_group_poster(venue_id))
  with check (venue_id is not null and public.can_post_group_poster(venue_id));
-- 수정·삭제는 행이 '보여야' 된다(UPDATE/DELETE 는 SELECT 정책도 탄다). 개설자는 owner_id 분기로 자기 것만 보이므로
--   운영진이 남의 미승인 그룹 포스터를 고치려면 그 그룹 범위의 SELECT 가 필요하다. 일반 회원·비로그인의 피드 조회는 넓어지지 않는다
--   (이 정책은 그 그룹의 개설자·운영진에게만 참) — 그들의 피드는 개설자 본인 포스터와 같이 화면의 approved 필터가 거른다.
drop policy if exists schedules_select_group on public.schedules;
create policy schedules_select_group on public.schedules for select to authenticated
  using (venue_id is not null and public.can_post_group_poster(venue_id));
drop policy if exists schedules_delete_group on public.schedules;
create policy schedules_delete_group on public.schedules for delete to authenticated
  using (venue_id is not null and public.can_post_group_poster(venue_id));

-- ── 7) 그룹 페이지 목록 RPC(읽기) ───────────────────────────────────────────
create or replace function public.get_group_schedules(p_group_id uuid)
returns setof public.schedules language sql stable security definer set search_path = public, pg_temp as $fn$
  -- 오너 결정 10-02 ③: 그룹 페이지 방문자 전체(비로그인 포함)가 본다 — 그룹 전용·공개 대기 포함.
  --   단 그룹이 승인·active 일 때만, 반려된 포스터는 작성자·운영진·관리자만(is_group_manager 는 관리자 포함).
  --   전체 일정 피드(schedules_select)는 넓히지 않는다 — 미승인 그룹 포스터는 이 RPC 로만 나간다.
  select s.*
    from public.schedules s
    join public.venues v on v.id = s.venue_id
   where s.venue_id = p_group_id
     and v.kind <> 'venue'
     and v.approved is true
     and v.status = 'active'::public.venue_status
     and (s.rejected_at is null
          or s.owner_id = auth.uid()
          or public.is_group_manager(p_group_id))
   order by s.date desc, s.start_time desc
   limit 200;
$fn$;
revoke all on function public.get_group_schedules(uuid) from public;
grant execute on function public.get_group_schedules(uuid) to anon, authenticated, service_role;

-- ── 8) 그룹 포스터 이미지 업로드(추가 — posters_upload 불변) ────────────────
drop policy if exists posters_upload_group on storage.objects;
create policy posters_upload_group on storage.objects for insert to authenticated
  with check ((bucket_id = 'posters'::text)
              and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
              and ((storage.foldername(name))[2] = 'g')
              and public.can_post_group_poster(
                    case when (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then ((storage.foldername(name))[3])::uuid end));

-- ── 9) 자가검사 ──────────────────────────────────────────────────────────────
do $chk$
declare f text;
begin
  foreach f in array array['public._venue_premium_active(uuid)', 'public.can_post_group_poster(uuid)', 'public.get_group_schedules(uuid)',
                           'public.auto_approve_verified_poster()', 'public.prevent_self_approve_poster()', 'public._notify_admin_pending_poster()'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then raise exception '20261002h: % 가 DEFINER 가 아니다', f; end if;
    if not exists (select 1 from pg_proc where oid = f::regprocedure and proconfig @> array['search_path=public, pg_temp']) then
      raise exception '20261002h: % search_path 고정 없음', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public._venue_premium_active(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._venue_premium_active(uuid)', 'execute') then
    raise exception '20261002h: _venue_premium_active 가 클라이언트에 열려 있다';
  end if;
  if has_function_privilege('anon', 'public.can_post_group_poster(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.can_post_group_poster(uuid)', 'execute') then
    raise exception '20261002h: can_post_group_poster ACL(anon 회수 · authenticated 실행 — 정책이 호출자 권한으로 부른다)';
  end if;
  if not has_function_privilege('anon', 'public.get_group_schedules(uuid)', 'execute') then
    raise exception '20261002h: get_group_schedules 는 읽기 RPC 라 anon 허용이어야 한다(비로그인 방문자도 그룹 포스터를 본다)';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.schedules'::regclass
        and tgname in ('trg_notify_admin_pending_poster','trg_notify_admin_rereview_poster','trg_notify_admin_resubmit_poster','trg_notify_admin_feed_request')
        and pg_get_triggerdef(oid) ~ 'feed_request') <> 4 then
    raise exception '20261002h: 관리자 대기 알림 트리거 4개 중 feed_request 조건이 빠진 것이 있다';
  end if;
  if (select count(*) from pg_policies where tablename = 'schedules' and policyname in ('schedules_insert_group','schedules_update_group','schedules_delete_group','schedules_select_group')) <> 4
     or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'posters_upload_group'
                     and with_check ~ 'can_post_group_poster' and with_check ~ '''g''') then
    raise exception '20261002h: 그룹 정책이 빠졌다';
  end if;
  if md5((select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'posters_upload'))
       is distinct from '57b58a12d8f3c0b4ee3341ccd6836dec' then
    raise exception '20261002h: posters_upload(매장 경로)가 바뀌었다 — 이 파일은 그 정책을 건드리면 안 된다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_venue_premium_until' and tgrelid = 'public.venues'::regclass) then
    raise exception '20261002h: 프리미엄 기간 가드가 없다';
  end if;
  if (select prosrc from pg_proc where oid = 'public.prevent_self_approve_poster()'::regprocedure) !~ 'new\.poster_url is distinct from old\.poster_url'
     or (select prosrc from pg_proc where oid = 'public.prevent_self_approve_poster()'::regprocedure) !~ 'and old\.approved is true'
     or (select prosrc from pg_proc where oid = 'public.prevent_self_approve_poster()'::regprocedure) !~ 'new\.venue_id   is distinct from old\.venue_id \) then' then
    raise exception '20261002h: 오너 결정 A(반려 재제출)·B(이미지 재심사) 분기가 빠졌다';
  end if;
  if exists (select 1 from public.schedules where approved and not feed_request) then
    raise exception '20261002h: 그룹 전용인데 공개된 포스터가 있다';
  end if;
end $chk$;
