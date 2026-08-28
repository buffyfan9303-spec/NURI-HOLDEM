-- 구성원 초대 — 이메일 외에 '아이디(닉네임)'로도 초대(2026-08-28 오너 지시).
-- 신규 RPC 를 만들지 않는다: 기존 invite_staff_by_email(text, uuid) 의 시그니처를 그대로 두고
-- p_email 인자가 받는 '식별자'의 범위만 넓힌다(초대 경로 하나 = 서버 가드 하나).
--   1) uuid        → 검색 결과에서 고른 회원(닉네임은 DB unique 제약이 없어 id 가 유일한 정본 키)
--   2) '@' 포함    → 기존 이메일 경로(문구·동작 100% 동일)
--   3) 그 외       → 닉네임 정확일치(대소문자·공백 무시). 2명 이상이면 실패시키고 목록 선택 유도.
-- 검색 자체는 기존 RPC find_user_for_transfer 재사용 — 여기서 조회 함수를 새로 만들지 않는다.
--
-- 같은 교체에서 fail-open 가드 1건 동봉(nuri-migration §3):
--   기존 `if not can_manage_pos(v_venue)` 는 비로그인(auth.uid()=NULL)에서 my_role()=NULL →
--   can_manage_pos=NULL → `not NULL`=NULL 로 IF 를 건너뛰어 권한 검사가 통째로 열렸다.
--   anon 에 EXECUTE 가 부여돼 있어 실제 도달 가능한 경로였다. IS DISTINCT FROM TRUE 로 닫고
--   ACL 도 authenticated 한정으로 회수한다.
create or replace function public.invite_staff_by_email(p_email text, p_venue_id uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_venue uuid; v_vname text; v_user uuid; v_role user_role; v_key text; v_n int;
begin
  v_key := btrim(coalesce(p_email, ''));
  if v_key = '' then raise exception '초대할 회원을 입력해 주세요'; end if;

  v_venue := coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1));
  if v_venue is null then raise exception '관리할 매장을 찾을 수 없습니다'; end if;
  -- NULL-safe: not can_manage_pos(...) 는 비로그인에서 fail-open 이었다.
  if can_manage_pos(v_venue) is distinct from true then raise exception '이 매장의 구성원을 초대할 권한이 없습니다'; end if;
  select v.name into v_vname from venues v where v.id = v_venue;

  if v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id, p.role into v_user, v_role from profiles p where p.id = v_key::uuid limit 1;
    if v_user is null then raise exception '해당 회원을 찾을 수 없습니다'; end if;
  elsif position('@' in v_key) > 0 then
    select p.id, p.role into v_user, v_role from profiles p where lower(btrim(p.email)) = lower(v_key) limit 1;
    if v_user is null then raise exception '해당 이메일의 회원을 찾을 수 없습니다. 먼저 일반 회원으로 가입해야 합니다.'; end if;
  else
    select count(*) into v_n from profiles p where lower(btrim(coalesce(p.nickname, ''))) = lower(v_key);
    if v_n = 0 then raise exception '해당 아이디의 회원을 찾을 수 없습니다. 먼저 일반 회원으로 가입해야 합니다.'; end if;
    if v_n > 1 then raise exception '같은 아이디의 회원이 여러 명입니다. 검색 목록에서 선택해 주세요.'; end if;
    select p.id, p.role into v_user, v_role from profiles p where lower(btrim(coalesce(p.nickname, ''))) = lower(v_key) limit 1;
  end if;

  if v_user = auth.uid() then raise exception '본인은 초대할 수 없습니다'; end if;
  if v_role in ('venue_owner','admin') then raise exception '업주/관리자 계정은 직원으로 초대할 수 없습니다'; end if;
  if v_role = 'venue_staff' then raise exception '이미 매장 소속 직원입니다'; end if;

  insert into venue_staff_invites (venue_id, user_id, invited_by, status)
  values (v_venue, v_user, auth.uid(), 'pending')
  on conflict (venue_id, user_id) do update set status='pending', invited_by=auth.uid(), created_at=now();

  insert into notifications (user_id, type, title, message, avatar_color, read, link)
  values (v_user, 'system', '매장 구성원 초대',
          coalesce(v_vname,'한 매장') || '에서 구성원으로 초대했습니다. 수락하면 매장 운영을 도울 수 있어요.',
          '#FFD100', false, '/invites');
end; $$;

-- ACL — PUBLIC 기본 GRANT 와 anon 을 회수하고 로그인 회원에게만(nuri-migration §1)
revoke all on function public.invite_staff_by_email(text, uuid) from public, anon;
grant execute on function public.invite_staff_by_email(text, uuid) to authenticated;
