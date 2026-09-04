-- 그룹 설정 변경 + 운영진 지정 (오너 지시 2026-09-05)
--
-- 지시: "그룹설정을 그룹개설자가 회원승인을 해야 가입이 되는건지 아니면 자유가입인지 그룹개설할 때
--        설정할 수 있게 해야하는것이고 **그룹관리에서도 이를 설정할 수 있게** 해줘.
--        기본적으로 그룹 개설자가 운영진을 설정할 수 있게 하고 매장이 아닌 일반 그룹의 경우에는
--        관리자를 설정할 수 있지만 **최대 5명까지** 설정할 수 있어야해"
--
-- 현황: join_approval 컬럼과 'manager' 역할은 이미 있는데 **바꾸는 경로가 없었다**.
--       개설 시 한 번 정해지면 끝이고, 멤버를 운영진으로 올리는 UI·RPC 가 아예 없었다(추방만 가능).
--
-- 권한 설계(둘을 일부러 다르게 둔다):
--  · 가입 정책 변경 → is_group_manager (운영진도 가능). 공지·프로필 편집과 같은 층의 운영 행위다.
--  · 역할 지정     → **개설자(owner) 또는 사이트 관리자만**. 오너 지시가 '그룹 개설자가 운영진을
--    설정'이라고 못 박았고, 운영진이 서로를 올려 주면 상한 5명이 사실상 무의미해진다.
--
-- 롤백:
--   drop function if exists public.set_group_join_approval(uuid, boolean);
--   drop function if exists public.set_group_member_role(uuid, text);
--   alter table public.group_members drop constraint if exists group_members_role_check;

-- 역할 값은 둘뿐이다. 제약이 없어 오타 한 번이면 권한 판정(is_group_manager)이 조용히 어긋난다.
alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check check (role in ('manager', 'member'));

-- ── ① 가입 정책 변경 ─────────────────────────────────────────────────────────
create or replace function public.set_group_join_approval(p_group_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF NOT public.is_group_manager(p_group_id) THEN RAISE EXCEPTION '이 그룹의 운영진만 바꿀 수 있습니다'; END IF;
  -- 매장(kind='venue')은 가입 개념이 없다 — 그룹에만 적용한다.
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_group_id AND kind <> 'venue') THEN
    RAISE EXCEPTION '그룹이 아닙니다';
  END IF;
  UPDATE public.venues SET join_approval = coalesce(p_value, true) WHERE id = p_group_id;
END; $$;

revoke all on function public.set_group_join_approval(uuid, boolean) from public;
revoke all on function public.set_group_join_approval(uuid, boolean) from anon;
grant execute on function public.set_group_join_approval(uuid, boolean) to authenticated, service_role;

-- ── ② 운영진 지정/해제 ───────────────────────────────────────────────────────
-- 상한 5명은 **승인된 manager 총원**이다(개설자 포함). 개설자 자신은 내려갈 수 없다 —
-- 마지막 운영진까지 내려가면 아무도 그룹을 관리할 수 없는 상태가 만들어진다.
create or replace function public.set_group_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE gid uuid; target_uid uuid; owner_uid uuid; gkind text; mgr_cnt int; cur_role text; cur_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_role NOT IN ('manager', 'member') THEN RAISE EXCEPTION '허용되지 않은 역할'; END IF;

  SELECT m.group_id, m.user_id, m.role, m.status INTO gid, target_uid, cur_role, cur_status
    FROM public.group_members m WHERE m.id = p_member_id;
  IF gid IS NULL THEN RAISE EXCEPTION '멤버를 찾을 수 없습니다'; END IF;

  SELECT v.owner_id, v.kind INTO owner_uid, gkind FROM public.venues v WHERE v.id = gid;
  IF gkind = 'venue' THEN RAISE EXCEPTION '매장 직원은 매장 설정에서 관리합니다'; END IF;

  -- 오너 지시대로 **개설자만**(+ 사이트 관리자). 운영진이 서로를 올리면 상한이 무의미해진다.
  IF owner_uid IS DISTINCT FROM auth.uid()
     AND coalesce(public.my_role() = 'admin'::user_role, false) = false THEN
    RAISE EXCEPTION '그룹 개설자만 운영진을 지정할 수 있습니다';
  END IF;

  IF target_uid = owner_uid THEN RAISE EXCEPTION '개설자의 역할은 바꿀 수 없습니다'; END IF;
  IF cur_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION '가입이 승인된 멤버만 지정할 수 있습니다'; END IF;
  IF cur_role = p_role THEN RETURN; END IF;  -- 멱등

  IF p_role = 'manager' THEN
    SELECT count(*) INTO mgr_cnt FROM public.group_members
      WHERE group_id = gid AND role = 'manager' AND status = 'approved';
    IF mgr_cnt >= 5 THEN
      RAISE EXCEPTION '운영진은 개설자를 포함해 최대 5명까지입니다';
    END IF;
  END IF;

  UPDATE public.group_members SET role = p_role WHERE id = p_member_id;
END; $$;

revoke all on function public.set_group_member_role(uuid, text) from public;
revoke all on function public.set_group_member_role(uuid, text) from anon;
grant execute on function public.set_group_member_role(uuid, text) to authenticated, service_role;
