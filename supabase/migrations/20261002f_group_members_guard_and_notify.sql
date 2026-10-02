-- ✅ 적용 완료 2026-10-02 (리드, Management API). 되돌림 리허설 PASS · advisors ERROR 0 · 43_groups_final 166 단언, 원 초안 음성 대조(B3·B4 재현)
-- ============================================================================
-- 20261002f_group_members_guard_and_notify.sql — 수정판(critical-reviewer 2026-10-02, 원 초안 community-team). ⛔ 미적용 · 적용 판단은 리드.
-- 원 초안 대비 바뀐 것(검토 보고 review-groups-20261002f.md):
--   R1 가드 UPDATE 비교를 칸 목록 → 행 전체(status 제외)로. 초안은 id 칸이 빠져 운영진이 멤버 행 id 를 바꿀 수 있었고, 앞으로 생길 칸도 열린다.
--   R2 가입 신청 알림 10분 중복 억제. 초안은 가입→탈퇴→가입 반복(누구나·무제한)이 개설자·운영진에게 푸시를 무한히 보낸다.
--   R3 _notify_venue_decision 에서 빠졌던 주석 한 줄 복원(동작 무관). R4 자가검사에 트리거 함수 authenticated 회수 확인 추가.
-- ----------------------------------------------------------------------------
-- 근거: 운영 DB 되돌림 리허설 `Documents\누리홀덤_영상분석_0930\dummy-1002\40_groups.sql`(113 단언 통과, 운영 쓰기 0)의 D·O 줄.
--
-- A. D09·D10 — group_members 의 gm_update/gm_delete 정책은 is_group_manager 만 보고 **칸 제한이 없다**
--    (authenticated 는 전 칸 UPDATE 권한). 그래서 개설자가 지정한 운영진(비개설자)이 PATCH 한 줄로:
--      · 남을 운영진으로 올린다 → set_group_member_role 의 '개설자만'·'5명 상한' 우회 (리허설 n=1)
--      · 멤버 행의 user_id 를 신청한 적 없는 사람으로 바꿔 끼운다 → 그 사람이 승인 멤버가 된다 (n=1)
--      · 멤버 표시 이름(member_name)을 다른 사람 닉네임으로 바꾼다(순위·멤버 목록 사칭) (n=1)
--      · 개설자의 멤버십 행을 지운다(개설자는 owner_id 로 여전히 운영진이지만 순위·멤버 수에서 빠진다) (n=1)
--    → 클라이언트(authenticated/anon)가 직접 바꿀 수 있는 것은 **status pending→approved 하나**로 좁히고,
--      운영진 행 삭제는 본인·개설자·관리자만. 역할 변경은 DEFINER RPC(set_group_member_role)로만 —
--      DEFINER 안에서는 current_user 가 함수 소유자라 이 가드를 타지 않는다(_sync_nickname_snapshots 도 DEFINER).
-- B. D03·D05·O01 — 알림 공백:
--      · 그룹 개설 승인·반려 알림 0건(_notify_venue_decision 이 kind<>'venue' 면 바로 return)
--      · 가입 신청(운영진에게)·가입 승인(신청자에게) 알림 0건(group_members 에 트리거 없음)
--      · 관리자 알림 문구가 그룹도 '🏪 새 매장 입점 신청'
-- C. O02 — join_group 이 승인 여부·숨김을 보지 않는다(id 를 알면 미승인·반려 그룹에 신청이 들어간다).
--
-- 클라 영향: 화면 경로(approveMember=status 만 PATCH · removeMember=DELETE · 역할은 RPC)는 그대로 통과한다.
-- 링크 '/?venue=<id>' 는 App 딥링크(?venue=)가 매장·그룹 페이지를 연다.
-- 리허설: node rehearse.mjs 00_ids.sql ..\groups-1002\20261002f_group_members_guard_and_notify.sql 42_groups_after.sql
-- ============================================================================

-- ── A. group_members 클라이언트 가드 ─────────────────────────────────────────
-- 그룹 개설자 id — 숨김·미승인 그룹도 RLS 와 무관하게 읽어야 해서 DEFINER. owner_id 는 공개 그룹에선 이미 공개 칸이다.
create or replace function public._group_owner_id(p_group uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as
$$ select owner_id from public.venues where id = p_group and kind <> 'venue' $$;
revoke all on function public._group_owner_id(uuid) from public, anon;
grant execute on function public._group_owner_id(uuid) to authenticated, service_role;

-- ⚠ 가드 자체는 INVOKER 다 — DEFINER 면 current_user 가 함수 소유자가 돼 '클라이언트가 직접 고쳤나' 판정이 늘 거짓이 된다
--   (guard_venue_verification 과 같은 방식). DEFINER RPC(set_group_member_role·_sync_nickname_snapshots) 안에서는 건너뛴다.
create or replace function public._guard_group_members_client()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  if current_user not in ('authenticated', 'anon') or coalesce(public.my_role() = 'admin'::user_role, false) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_owner := public._group_owner_id(old.group_id);

  if tg_op = 'UPDATE' then
    -- R1: 칸을 나열하지 않는다 — status 를 뺀 행 전체가 같아야 한다(id·앞으로 생길 칸까지 닫힌다)
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception '멤버 정보는 직접 바꿀 수 없습니다 — 운영진 지정은 개설자 화면에서 해 주세요' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'approved') then
      raise exception '가입 상태는 승인만 할 수 있습니다' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE: 본인 탈퇴는 언제나. 개설자 행은 관리자만. 운영진 행은 개설자만.
  if old.user_id = auth.uid() and old.user_id is distinct from v_owner then return old; end if;
  if old.user_id = v_owner then
    raise exception '개설자는 그룹에서 내보낼 수 없습니다' using errcode = '42501';
  end if;
  if old.role = 'manager' and v_owner is distinct from auth.uid() then
    raise exception '운영진은 개설자만 내보낼 수 있습니다' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function public._guard_group_members_client() from public, anon, authenticated;

drop trigger if exists trg_guard_group_members_client on public.group_members;
create trigger trg_guard_group_members_client
  before update or delete on public.group_members
  for each row execute function public._guard_group_members_client();

-- ── B1. 관리자 알림 문구(그룹은 '그룹 개설 신청') ─────────────────────────────
create or replace function public._notify_admin_new_venue()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  insert into public.notifications (user_id, type, title, message, link)
  select p.id, 'system',
         case when new.kind is distinct from 'venue' then '👥 새 그룹 개설 신청' else '🏪 새 매장 입점 신청' end,
         coalesce(new.name,'(이름 없음)') || ' · ' || coalesce(new.region,'-') || ' — 관리자 설정에서 승인해 주세요',
         '/admin'
  from public.profiles p where p.role = 'admin';
  return new;
end $function$;
revoke all on function public._notify_admin_new_venue() from public, anon, authenticated;

-- ── B2. 승인·반려 알림 — 그룹도 보낸다(매장 분기는 종전 그대로) ───────────────
create or replace function public._notify_venue_decision()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if public.my_role() is distinct from 'admin'::user_role
     or current_setting('nuri.skip_venue_decision_notify', true) is not distinct from 'on' then
    return new;
  end if;
  if new.kind is distinct from 'venue' then
    if new.approved is true and old.approved is distinct from true then
      perform public._notify_user(new.owner_id, 'approval'::public.notif_type, '그룹 개설 승인',
        left(new.name, 30) || ' 그룹이 승인되었습니다. 이제 커뮤니티에 공개됩니다.', '/?venue=' || new.id);
    elsif old.approved is not true and new.approved is not true
          and new.status = 'hidden'::public.venue_status and old.status is distinct from 'hidden'::public.venue_status then
      perform public._notify_user(new.owner_id, 'system'::public.notif_type, '그룹 개설 반려',
        left(new.name, 30) || ' 그룹 개설 신청이 반려되었습니다. 궁금한 점은 고객센터로 문의해 주세요.', '/support');
    end if;
    return new;
  end if;
  -- ↓ 종전 본문(매장) 그대로
  if new.approved is true and old.approved is distinct from true then
    -- 업주 승인(approveOwner)과 같이 오면 '매장 업주 승인 완료' 알림이 방금 나갔다 — 겹쳐 보내지 않는다.
    if not exists (select 1 from public.notifications n
                    where n.user_id = new.owner_id and n.type = 'approval' and n.link = '/guide/manual.html'
                      and n.created_at > now() - interval '10 minutes') then
      perform public._notify_user(new.owner_id, 'approval'::public.notif_type, '입점 승인 완료',
        left(new.name, 30) || ' 입점이 승인되었습니다. 이제 손님에게 매장이 보입니다.',
        '/my-store?venue=' || new.id);
    end if;
  elsif old.approved is not true and new.approved is not true
        and new.status = 'hidden'::public.venue_status and old.status is distinct from 'hidden'::public.venue_status then
    perform public._notify_user(new.owner_id, 'system'::public.notif_type, '입점 신청 반려',
      left(new.name, 30) || ' 입점 신청이 반려되었습니다. 궁금한 점은 고객센터로 문의해 주세요.',
      '/support');
  end if;
  return new;
end $function$;
revoke all on function public._notify_venue_decision() from public, anon, authenticated;

-- ── B3. 가입 신청(→ 개설자·운영진) · 가입 승인(→ 신청자) ─────────────────────
create or replace function public._notify_group_membership()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare g record; v_msg text;
begin
  select id, name, owner_id into g from public.venues where id = new.group_id and kind <> 'venue';
  if g.id is null then return new; end if;
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_msg := coalesce(new.member_name, '회원') || ' 님이 ' || left(g.name, 30) || ' 가입을 신청했습니다.';
    -- R2: 같은 받는 사람·같은 문구(=같은 신청자 닉네임)·같은 그룹은 10분에 한 번(가입→탈퇴→가입 반복 푸시 폭탄 차단)
    perform public._notify_user(t.u, 'system'::public.notif_type, '그룹 가입 신청', v_msg, '/?venue=' || g.id)
      from (select g.owner_id as u
            union
            select m.user_id from public.group_members m
             where m.group_id = g.id and m.role = 'manager' and m.status = 'approved') t
     where t.u is distinct from new.user_id
       and not exists (select 1 from public.notifications n
                        where n.user_id = t.u and n.title = '그룹 가입 신청' and n.link = '/?venue=' || g.id
                          and n.message = left(v_msg, 300) and n.created_at > now() - interval '10 minutes');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'approved' then
    perform public._notify_user(new.user_id, 'approval'::public.notif_type, '그룹 가입 승인',
              left(g.name, 30) || ' 가입이 승인되었습니다.', '/?venue=' || g.id);
  end if;
  return new;
end $$;
revoke all on function public._notify_group_membership() from public, anon, authenticated;

drop trigger if exists trg_notify_group_membership on public.group_members;
create trigger trg_notify_group_membership
  after insert or update of status on public.group_members
  for each row execute function public._notify_group_membership();

-- ── C. join_group — 공개(승인·active) 그룹에만 신청 ──────────────────────────
create or replace function public.join_group(p_group uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $function$
DECLARE need_appr boolean; st text; pname text; pcolor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  SELECT join_approval INTO need_appr FROM public.venues
   WHERE id = p_group AND kind <> 'venue' AND approved = true AND status = 'active';
  IF need_appr IS NULL THEN RAISE EXCEPTION '그룹을 찾을 수 없습니다'; END IF;
  SELECT coalesce(nickname,'회원'), avatar_color INTO pname, pcolor FROM public.profiles WHERE id = auth.uid();
  st := CASE WHEN need_appr THEN 'pending' ELSE 'approved' END;
  INSERT INTO public.group_members (group_id, user_id, role, status, member_name, member_color)
    VALUES (p_group, auth.uid(), 'member', st, coalesce(pname,'회원'), pcolor)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN st;
END; $function$;
revoke execute on function public.join_group(uuid) from public, anon;
grant execute on function public.join_group(uuid) to authenticated, service_role;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
do $chk$
begin
  if (select count(*) from pg_trigger where tgrelid = 'public.group_members'::regclass and not tgisinternal
        and tgname in ('trg_guard_group_members_client', 'trg_notify_group_membership')) <> 2 then
    raise exception '20261002f: group_members 트리거 2개가 아닙니다';
  end if;
  if has_function_privilege('anon', 'public.join_group(uuid)', 'execute') then
    raise exception '20261002f: join_group 이 anon 에 열려 있습니다';
  end if;
  if (select prosecdef from pg_proc where oid = 'public._guard_group_members_client'::regproc) then
    raise exception '20261002f: 가드가 DEFINER 면 current_user 판정이 늘 거짓이다 — INVOKER 여야 한다';
  end if;
  -- R4: 트리거 함수는 클라이언트가 직접 못 부른다(트리거 발동은 EXECUTE 를 보지 않는다 — guard_venue_verification 과 같은 구성)
  if has_function_privilege('authenticated', 'public._guard_group_members_client()', 'execute')
     or has_function_privilege('authenticated', 'public._notify_group_membership()', 'execute') then
    raise exception '20261002f: 트리거 함수가 authenticated 에 열려 있습니다';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public._group_owner_id'::regproc)
     or has_function_privilege('anon', 'public._group_owner_id(uuid)', 'execute') then
    raise exception '20261002f: _group_owner_id 는 DEFINER + anon 회수여야 한다';
  end if;
end $chk$;
