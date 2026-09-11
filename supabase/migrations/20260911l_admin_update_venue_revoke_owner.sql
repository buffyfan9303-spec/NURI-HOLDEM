-- 20260911l — 관리자가 업주를 교체하면 이전 업주의 매장 권한도 함께 회수한다
--
-- 무엇이 문제였나 (2026-09-11)
--   admin_update_venue 는 venues.owner_id 를 새 사람으로 바꾸고 이전 업주의 profiles.venue_id 만 끊었다.
--   그런데 '이 매장을 관리할 수 있는가' 판정은 profiles.venue_id 를 보지 않는다:
--     · can_manage_pos        (20260828d) = admin · venues.owner_id · 승인된 공동 사장 행
--     · can_access_ledger     (baseline)  = can_manage_pos  또는 장부 부여 행     → 장부 금액·손님 명단
--     · can_view_vouchers     (baseline)  = can_manage_pos  또는 이용권 부여 행   → 이용권 발급·내역
--     · can_manage_venue_staff(20260911e) = admin · venues.owner_id · 승인된 공동 사장 행 → 직원 관리
--   이전 업주가 승인된 공동 사장 행을 들고 있으면 owner_id 에서 빠져도 네 판정이 전부 그대로 참이다.
--   덤으로 find_user_by_phone(20260827b) 의 게이트는 '매장 불문 승인된 공동 사장'이라 전화번호 회원 조회까지 남는다.
--   알림(_notify_buyin_request) 수신자 목록도 같은 두 테이블을 보므로 손님 바인 요청 알림이 계속 갔다.
--
-- 현행 정의의 출처(대조 완료)
--   본문 = baseline 1736~1774. 그 뒤 본문을 다시 쓴 것은 20260820a 의 정규식 치환 한 줄
--   (`my_role() <> 'admin'` → `IS DISTINCT FROM`) 뿐이고, 20260829e 가 search_path 를
--   `public, pg_temp` 로 ALTER 했다(본문 무변경). 아래 정의는 그 둘을 모두 반영한 상태다.
--
-- 무엇을 바꾸나 — 본문의 '업주 변경 처리' 블록 하나. 나머지 문장은 현행 정의에서 그대로 떼어 왔다.
--   ① 이전 업주: 이 매장의 공동 사장 행 · 장부 부여 행 · 이용권 부여 행을 지운다(매장 범위 한정).
--   ② 새 업주 : 승인된 공동 사장으로 올린다 — 사장님 목록(list_venue_owners)에 대표가 아예 안 뜨던 것과
--      대표 교체(transfer_venue_primary 의 '먼저 승인된 공동 사장' 전제)가 같이 맞춰진다.
--   ③ 없는 매장 id 면 명시적으로 거절한다 — ②의 삽입이 FK 오류로 제약 이름을 뱉는 것을 막는다(보안 §6).
--
-- ②가 남기는 것 — 정직하게
--   · 이 행은 venues.owner_id 보다 오래 산다. 이후 transfer_venue_primary(baseline:4437)가 돌면
--     옛 대표는 owner_id 를 잃고도 이 행으로 장부·이용권·직원·POS 를 계속 본다. create_my_venue 로
--     만든 매장은 이미 그렇고(대표가 처음부터 행을 갖는다), 화면 문구도 '교체 후에는 새 대표만 다시
--     변경할 수 있습니다'로 옛 대표=공동 사장을 전제한다. 즉 관리자 매장을 자체 생성 매장과 같게 맞추는
--     것이지만, '권한이 전혀 안 생긴다'는 뜻은 아니다 — 필요 없으면 새 대표가 remove_venue_owner 로 뺀다.
--   · admin_create_venue(baseline:1565)는 이번에 안 건드린다. 그래서 **앞으로 관리자가 만드는 매장도
--     여전히 venue_owners 행 없이 태어난다** — 생성 직후 '관리 → 저장'을 한 번 눌러야 목록에 대표가 뜬다.
--   · AdminTab 매장 목록은 kind 필터가 없어 그룹 행도 포함한다(getAllVenues). 그룹을 저장하면 그룹에도
--     이 행이 생긴다 — 그룹 소유자는 venues.owner_id 로 같은 판정을 이미 통과하므로 권한 변화는 없다.
--
-- 일부러 건드리지 않는 것 (근거)
--   · profiles.role / approved — 업주 자격은 계정 단위다. 이전 업주가 다른 매장의 대표이거나 그쪽 공동
--     사장일 수 있고(venues.owner_id 는 한 사람이 여러 행), role 을 내리면 그 매장 관리가 같이 죽는다.
--     반대로 role 만으로는 이 매장의 문이 하나도 안 열린다 — 위 네 판정 전부 매장 조건을 함께 본다.
--     remove_venue_owner(baseline:3712)도 같은 이유로 '다른 매장이 하나도 없을 때만' profiles 를 만진다.
--   · venue_staff — 권한 판정이 읽지 않는 명부 테이블이다. 읽는 곳은 add/update/remove_venue_staff 와
--     '자기 행만 보이는' RLS(20260911e) 뿐. 지우면 명부만 사라지고 열리는 문은 그대로다.
--   · 이미 교체가 끝난 매장의 잔존 행 일괄 정리 — 그 행이 '옛 업주'인지 '정상 공동 사장'인지 데이터로
--     구분할 수 없다. 일괄 삭제하면 멀쩡한 사장님이 잘린다. 파일 맨 아래 점검 쿼리로 눈으로 고른다.
--
-- 데이터 영향: 이 마이그레이션 실행 자체는 0행. 다음 저장/교체부터 위 삭제·삽입이 돈다.
-- 시그니처·인자 기본값·반환형 무변경 → 앱이 먼저 배포돼도 화면은 그대로다(PGRST202 창이 없다).
-- ROLLBACK: 파일 하단.

create or replace function public.admin_update_venue(
  p_venue_id uuid,
  p_name text,
  p_region text,
  p_address text default ''::text,
  p_owner_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_old_owner uuid;
begin
  if my_role() is distinct from 'admin'::user_role then
    raise exception '관리자만 매장을 수정할 수 있습니다';
  end if;
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
    raise exception '매장명과 지역은 필수입니다';
  end if;

  select owner_id into v_old_owner from public.venues where id = p_venue_id;

  update public.venues
     set name       = btrim(p_name),
         region     = btrim(p_region),
         address    = coalesce(p_address, ''),
         owner_id   = p_owner_id,
         updated_at = now()
   where id = p_venue_id;
  if not found then
    raise exception '매장을 찾을 수 없습니다';
  end if;

  -- 업주 변경 처리(이전 업주 연결 해제 + 새 업주 임명)
  if p_owner_id is distinct from v_old_owner then
    if v_old_owner is not null then
      update public.profiles set venue_id = null
       where id = v_old_owner and venue_id = p_venue_id;
      -- 2026-09-11 추가분: 연결만 끊고 아래 세 행을 남겨 두면 권한 판정이 계속 참이라
      -- 교체된 사람이 장부 금액·손님 명단·이용권·직원 관리를 그대로 본다. 이 매장 범위만 회수한다.
      delete from public.venue_owners  where venue_id = p_venue_id and user_id = v_old_owner;
      delete from public.ledger_access  where venue_id = p_venue_id and user_id = v_old_owner;
      delete from public.voucher_access where venue_id = p_venue_id and user_id = v_old_owner;
    end if;
    if p_owner_id is not null then
      update public.profiles
         set role = 'venue_owner'::user_role, venue_id = p_venue_id, approved = true
       where id = p_owner_id;
    end if;
  end if;

  -- 대표는 사장님 목록에도 있어야 한다 — 없으면 '대표' 줄이 통째로 안 보이고 대표 교체도 막힌다.
  -- 교체가 아닌 단순 저장에서도 한 번 맞춰 준다(관리자가 만든 옛 매장이 다음 저장에 스스로 정상화된다).
  if p_owner_id is not null then
    insert into public.venue_owners (venue_id, user_id, added_by, status)
    values (p_venue_id, p_owner_id, auth.uid(), 'approved')
    on conflict (venue_id, user_id) do update set status = 'approved';
  end if;
end;
$fn$;

-- CREATE OR REPLACE 뒤에는 ACL 을 다시 못박는다(프로젝트 규약). `from anon` 만으로는 PUBLIC 기본 GRANT 가 남는다.
-- service_role 을 넣어도 본문 가드가 my_role() 기준이라 서비스 키 단독으로는 여전히 못 지난다.
revoke all on function public.admin_update_venue(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.admin_update_venue(uuid, text, text, text, uuid) to authenticated, service_role;

comment on function public.admin_update_venue(uuid, text, text, text, uuid) is
  '관리자 전용 매장 수정. 업주 교체 시 이전 업주의 사장님·장부·이용권 부여 행을 이 매장 범위에서 회수하고, 새 업주를 승인된 사장님으로 올린다(2026-09-11 · 20260911l).';

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 어긋나면 전체 롤백 ──────────────────────────
do $verify$
declare
  v_src text;
  v_cfg text;
  v_sig text := 'public.admin_update_venue(uuid, text, text, text, uuid)';
begin
  select regexp_replace(p.prosrc, '\s+', ' ', 'g'), coalesce(array_to_string(p.proconfig, ','), '')
    into v_src, v_cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_update_venue' and p.pronargs = 5;
  if v_src is null then raise exception 'ABORT: admin_update_venue(5인자) 가 없다'; end if;

  -- ① 원래 하던 일이 그대로 남아 있는가(손으로 옮겨 적다 흘린 것 잡기)
  if v_src not like '%매장명과 지역은 필수입니다%' then
    raise exception 'ABORT: 필수값 검사가 사라졌다'; end if;
  if v_src not like '%owner_id = p_owner_id%' then
    raise exception 'ABORT: 매장 업주 갱신이 사라졌다'; end if;
  if v_src not like '%set venue_id = null where id = v_old_owner and venue_id = p_venue_id%' then
    raise exception 'ABORT: 이전 업주 매장 연결 해제가 사라졌다'; end if;
  if v_src not like '%set role = ''venue_owner''::user_role, venue_id = p_venue_id, approved = true%' then
    raise exception 'ABORT: 새 업주 임명이 사라졌다'; end if;

  -- ② 관리자 가드는 NULL-safe 여야 한다(비로그인에서 열리면 임의 매장 업주 교체가 된다 — 20260820a)
  if v_src not like '%my_role() is distinct from ''admin''%' then
    raise exception 'ABORT: 관리자 가드가 NULL-safe 가 아니다'; end if;

  -- ③ 이번에 닫는 경로가 실제로 들어갔는가
  if v_src not like '%delete from public.venue_owners where venue_id = p_venue_id and user_id = v_old_owner%' then
    raise exception 'ABORT: 이전 업주의 사장님 행 회수가 없다'; end if;
  if v_src not like '%delete from public.ledger_access where venue_id = p_venue_id and user_id = v_old_owner%' then
    raise exception 'ABORT: 이전 업주의 장부 부여 행 회수가 없다'; end if;
  if v_src not like '%delete from public.voucher_access where venue_id = p_venue_id and user_id = v_old_owner%' then
    raise exception 'ABORT: 이전 업주의 이용권 부여 행 회수가 없다'; end if;
  if v_src not like '%on conflict (venue_id, user_id) do update set status = ''approved''%' then
    raise exception 'ABORT: 새 업주를 승인된 사장님으로 올리는 구문이 없다'; end if;

  -- ④ 계정 단위 값·다른 매장은 건드리지 않는다
  if v_src like '%set role = ''user''%' then
    raise exception 'ABORT: 이전 업주의 계정 역할까지 내리고 있다 — 그 사람이 가진 다른 매장이 같이 죽는다'; end if;
  if v_src like '%where user_id = v_old_owner;%' then
    raise exception 'ABORT: 회수 범위가 매장을 넘었다(매장 조건 없는 삭제)'; end if;

  -- ⑤ SECURITY DEFINER + search_path 고정
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'admin_update_venue'
                    and p.pronargs = 5 and p.prosecdef) then
    raise exception 'ABORT: SECURITY DEFINER 가 풀렸다'; end if;
  if v_cfg not like '%search_path=public, pg_temp%' then
    raise exception 'ABORT: search_path 가 고정돼 있지 않다'; end if;

  -- ⑥ ACL — 관리 RPC 가 anon/PUBLIC 에 열려 있으면 안 되고, 관리자는 실행할 수 있어야 한다
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'ABORT: anon 이 관리 RPC 를 실행할 수 있다'; end if;
  if not has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'ABORT: 관리자가 실행할 수 없다 — 매장 수정 화면이 통째로 막힌다'; end if;

  -- ⑦ 전제 확인 — upsert 대상 키가 그대로인가
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t      on t.oid = c.conrelid
      join pg_namespace n2 on n2.oid = t.relnamespace and n2.nspname = 'public'
     where t.relname = 'venue_owners' and c.contype = 'p'
       and (select array_agg(a.attname order by a.attname)
              from pg_attribute a where a.attrelid = t.oid and a.attnum = any(c.conkey))
           = array['user_id','venue_id']::name[]
  ) then
    raise exception 'ABORT: venue_owners 의 기본키가 (venue_id, user_id) 가 아니다 — on conflict 대상이 틀렸다';
  end if;
end
$verify$;

-- ── 적용 후 점검(읽기 전용 · 수동) ────────────────────────────────────────────
-- 이미 교체가 끝난 매장에 남아 있을 수 있는 행. '정상 공동 사장'과 '교체된 옛 업주'는 데이터로 구분되지
-- 않으니 사장님께 확인하고, 옛 업주면 기존 도구 remove_venue_owner(venue_id, user_id) 로 정리한다.
--   select v.name, p.nickname, vo.user_id, vo.status, vo.created_at
--     from public.venue_owners vo
--     join public.venues   v on v.id = vo.venue_id
--     join public.profiles p on p.id = vo.user_id
--    where vo.status = 'approved' and v.owner_id is distinct from vo.user_id
--    order by v.name, vo.created_at;
--   -- 장부·이용권 부여 행도 같은 눈으로:
--   select 'ledger'  as k, venue_id, user_id from public.ledger_access
--   union all
--   select 'voucher' as k, venue_id, user_id from public.voucher_access;

-- ── ROLLBACK (필요 시 수동) ───────────────────────────────────────────────────
--   create or replace function public.admin_update_venue(
--     p_venue_id uuid, p_name text, p_region text,
--     p_address text default ''::text, p_owner_id uuid default null::uuid)
--   returns void language plpgsql security definer set search_path = public, pg_temp
--   as $rb$
--   declare v_old_owner uuid;
--   begin
--     if my_role() is distinct from 'admin'::user_role then
--       raise exception '관리자만 매장을 수정할 수 있습니다';
--     end if;
--     if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
--       raise exception '매장명과 지역은 필수입니다';
--     end if;
--     select owner_id into v_old_owner from public.venues where id = p_venue_id;
--     update public.venues
--        set name = btrim(p_name), region = btrim(p_region), address = coalesce(p_address, ''),
--            owner_id = p_owner_id, updated_at = now()
--      where id = p_venue_id;
--     if p_owner_id is distinct from v_old_owner then
--       if v_old_owner is not null then
--         update public.profiles set venue_id = null where id = v_old_owner and venue_id = p_venue_id;
--       end if;
--       if p_owner_id is not null then
--         update public.profiles set role = 'venue_owner'::user_role, venue_id = p_venue_id, approved = true
--          where id = p_owner_id;
--       end if;
--     end if;
--   end;
--   $rb$;
--   revoke all on function public.admin_update_venue(uuid, text, text, text, uuid) from public, anon;
--   grant execute on function public.admin_update_venue(uuid, text, text, text, uuid) to authenticated;
--   notify pgrst, 'reload schema';
