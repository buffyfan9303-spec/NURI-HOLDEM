-- ✅ 적용 완료 2026-09-26 (nuri-lead, MCP execute_sql) — §0 게이트·§9 자가검사 통과. 적용 후 양성: 승인 업주 3곳 can_manage_pos·can_manage_venue_schedules = true.
--    리허설(critical-reviewer 2차, 전량 롤백): 대기 업주 자가승인 차단·회수 알림 타 매장 0·전화 10회 잠금·공동운영자 예약 0→1·재제출 알림 +1.
-- 20260926e — 이용권 전 흐름 점검 후속 + store-team 사슬 리허설 후속 (리드·오너 결정 2026-09-26)
--
-- 1) D1 High  create_my_venue 가 승인 대기 업주를 스스로 승인시킨다 → 20260926c 무력화.
--      · 라이브 본문이 호출자 profiles.approved := true, venue_owners 행을 status 없이 넣는데 기본값이 'approved' 였다.
--      · 리허설(2026-09-26): 대기 업주 P → create_my_venue 1회 → 기존 대기 매장까지 can_manage_pos/can_view_vouchers/can_access_ledger = true.
--      · 고침: venue_owners.status 기본값 'pending' · create_my_venue 는 approved 를 건드리지 않고 관리자 role 을 덮지 않으며,
--        승인된 호출자(또는 관리자)만 venue_owners 'approved', 나머지는 'pending'(관리자 공동운영자 요청 목록에 뜬다 →
--        admin_decide_venue_owner 로 승인하면 프로필도 승인된다). v_role NULL(프로필 없음)이 가드를 건너뛰던 것도 막는다.
--      · 바꾸지 않는 것: 승인 업주의 두 번째 매장(venues.approved=false)은 계속 운영 가능(20260926c 설계 그대로).
-- 2) D2 Medium revoke_vouchers 알림이 입력 id 전체의 status='revoked' 를 모아 남의 매장 보유자에게도 갔다 → 이번 호출에서 실제 회수된 id 로만.
-- 3) Low  redeem_my_voucher_by_phone 이 업주 개인 번호 확인 도구였다(시도 제한 없음).
--      · 대조 규칙은 그대로(업주 프로필 번호 우선, 없으면 매장 대표 번호) — 화면 문구 '업주 전화번호' 와 로티아레나(두 번호가 다름) 동작 보존.
--      · 회원별 10회/10분 잠금. 잠금 카운터는 20260925g 방식(시퀀스 setval 은 raise 로도 롤백되지 않는다)을 재사용하되,
--        시퀀스를 raise 경로에서 만들면 같이 롤백되므로 여기서 64개 풀을 미리 만든다.
--        ponytail: 64칸 공유 풀 — 같은 칸 회원끼리 실패 수가 합쳐진다(10회 문턱으로 여유). 오탐이 보이면 칸 수를 늘릴 것.
-- 4) Low  voucher_transfers(양도 기능 없음 · 행 0) 의 anon/authenticated 쓰기 권한 회수. authenticated SELECT 는 정책 그대로 둔다.
-- 5) store-team  schedule_reservations sr_select/sr_update/sr_delete 가 venues.owner_id 만 봐서 공동운영자가 예약을 못 보고(realtime 0) 못 지웠다.
--      → can_manage_venue_schedules(관리자·승인 업주·승인 공동운영자) 로 교체, 대상은 authenticated 로 한정(비로그인 평가 시 정의자 함수 권한 오류 방지).
--      schedules RLS 를 피하려고 정의자 헬퍼 _can_manage_reservation_schedule 을 거친다(아래 §6 주석).
--      원문: .claude/agent-memory-local/store-team/pipeline_chain_rehearsal_2026-09-26.md
-- 6) store-team  반려 포스터를 업주가 고쳐 다시 내면(BEFORE 트리거가 rejected_at 을 지운다) 관리자 알림이 없었다
--      (기존 trg_notify_admin_rereview_poster 는 승인→대기 전이만). 반려→재심사 전이에 같은 알림 함수를 건다.
--      주의: prevent_self_approve_poster 는 업주가 updated_at 을 바꾸는 모든 수정(순서 변경 포함)을 재제출로 본다 — 알림도 그 기준을 따른다.
--
-- 제외(오너 결정 2026-09-26): 정지·차단 회원의 이용권 사용·발급 제한은 하지 않는다.
--
-- 되돌리기: 각 함수를 §0 md5 의 이전 본문으로 create or replace(같은 시그니처 → ACL 보존) · 기본값 'approved' 복귀 ·
--           정책 3개를 이전 식으로 재생성 · drop function _can_manage_reservation_schedule · drop trigger trg_notify_admin_resubmit_poster · 시퀀스 64개 drop.

-- §0 적용 전 본문 게이트 — 라이브가 예상과 다르면 멈춘다(이 파일이 이미 적용된 본문이면 통과 = 재적용 가능)
do $pre$
declare r record; q text;
begin
  for r in select * from (values
      ('public.create_my_venue(text,text,text,text,text,text,text,text)', '52e1a7c6e19fe27da9a5e45e8477bccc'),
      ('public.revoke_vouchers(uuid[])',                                  'b0541270a6b42ae0aa1d6486a380cf42'),
      ('public.redeem_my_voucher_by_phone(uuid,text,smallint)',           'e778ea9b61339fbb528ccbbe5647c557'),
      ('public._notify_admin_pending_poster()',                          'b6217184157d41aa87925e6a255e3bee'),
      ('public.can_manage_venue_schedules(uuid)',                         'c188501a579c6fdd63798bfceb4b60d6')) t(sig, want)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.want
       and pg_get_functiondef(r.sig::regprocedure) not like '%20260926e%' then
      raise exception '20260926e: % 라이브 본문이 예상(%)과 다릅니다(%). 본문을 다시 맞추세요',
        r.sig, r.want, md5(pg_get_functiondef(r.sig::regprocedure));
    end if;
  end loop;
  -- 정책 게이트: 업주 판정이 venues.owner_id 직접 비교이거나(적용 전) can_manage_venue_schedules(적용 후)여야 한다
  for q in select coalesce(qual, '') from pg_policies
            where schemaname = 'public' and tablename = 'schedule_reservations' and policyname in ('sr_select','sr_update','sr_delete')
  loop
    if q not like '%owner_id = ( SELECT auth.uid()%' and q not like '%_can_manage_reservation_schedule%' then
      raise exception '20260926e: schedule_reservations 정책 본문이 예상과 다릅니다: %', q;
    end if;
  end loop;
  -- 이미 새어 나간 자가승인이 있으면 이 파일만으로는 안 닫힌다 — 먼저 사람이 본다
  if exists (select 1 from public.venue_owners vo join public.profiles p on p.id = vo.user_id
              where vo.status = 'approved' and p.approved is not true and p.role::text is distinct from 'admin') then
    raise exception '20260926e: 프로필 미승인인데 venue_owners 가 approved 인 행이 있습니다 — 정리 후 적용';
  end if;
end $pre$;

-- §1 공동운영자 기본값: 넣는 쪽이 status 를 빠뜨려도 승인으로 새지 않게
alter table public.venue_owners alter column status set default 'pending';

-- §2 create_my_venue
create or replace function public.create_my_venue(p_name text, p_region text DEFAULT ''::text, p_address text DEFAULT ''::text, p_phone text DEFAULT ''::text, p_image_url text DEFAULT NULL::text, p_kakao_url text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_business_hours text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_id uuid; v_role user_role; v_ok boolean;
begin
  -- 20260926e: 승인은 여기서 만들지 않는다. 프로필 approved 는 그대로 두고, 승인된 호출자·관리자만 공동운영자 'approved'.
  select role, (approved is true) into v_role, v_ok from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('venue_owner','admin') then raise exception '업주만 매장을 생성할 수 있습니다'; end if;
  if coalesce(trim(p_name),'')='' then raise exception '매장 이름은 필수입니다'; end if;
  insert into public.venues (name, region, address, contact_phone, image_url, kakao_url, description, business_hours, owner_id, approved, kind)
  values (left(trim(p_name),60), left(coalesce(trim(p_region),''),40), coalesce(trim(p_address),''), nullif(trim(coalesce(p_phone,'')),''),
          nullif(trim(coalesce(p_image_url,'')),''), nullif(trim(coalesce(p_kakao_url,'')),''),
          nullif(trim(coalesce(p_description,'')),''), nullif(trim(coalesce(p_business_hours,'')),''),
          auth.uid(), (v_role = 'admin'), 'venue')
  returning id into v_id;
  insert into public.venue_owners(venue_id, user_id, added_by, status)
  values (v_id, auth.uid(), auth.uid(), case when v_role = 'admin' or v_ok then 'approved' else 'pending' end)
  on conflict do nothing;
  update public.profiles
     set venue_id = v_id,
         role = case when role = 'admin'::user_role then role else 'venue_owner'::user_role end
   where id = auth.uid();
  return v_id;
end $function$;

-- §3 revoke_vouchers — 알림은 이번 호출에서 실제로 회수된 id 로만
create or replace function public.revoke_vouchers(p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  r record; v_ok int := 0; v_reasons text[] := '{}'::text[]; v_total int; v_msg text;
  v_ids uuid[] := coalesce(p_ids, '{}'::uuid[]);
  v_done uuid[];
begin
  -- 20260926e: 알림 대상 = 이 호출의 UPDATE 가 돌려준 id(v_done). 종전엔 입력 id 전체의 status='revoked' 를 모아
  --   남의 매장·이미 회수된 이용권 보유자에게도 '회수' 알림이 갔다.
  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then return jsonb_build_object('ok', 0, 'failed', 0, 'reasons', '[]'::jsonb); end if;
  if v_total > 500 then raise exception '한 번에 500장까지 회수할 수 있습니다'; end if;

  for r in
    select sv.id, sv.status, sv.venue_id, can_manage_pos(sv.venue_id) as mine
    from public.store_vouchers sv where sv.id = any(v_ids)
  loop
    v_msg := case
      when not r.mine then '권한이 없습니다 — 업주만 회수할 수 있습니다'
      when r.status = 'used' then '이미 사용된 이용권은 회수할 수 없습니다 — 사용 내역은 그대로 보존됩니다'
      when r.status = 'revoked' then '이미 회수된 이용권입니다'
      else null end;
    if v_msg is not null and not (v_msg = any(v_reasons)) then
      v_reasons := array_append(v_reasons, v_msg);
    end if;
  end loop;

  with upd as (
    update public.store_vouchers sv set status = 'revoked'
     where sv.id = any(v_ids) and sv.status = 'active' and can_manage_pos(sv.venue_id)
    returning sv.id
  )
  select coalesce(array_agg(upd.id), '{}'::uuid[]) into v_done from upd;
  v_ok := coalesce(array_length(v_done, 1), 0);

  if v_ok < v_total and not exists (select 1 from public.store_vouchers where id = any(v_ids)) then
    v_reasons := array_append(v_reasons, '이용권을 찾을 수 없습니다 — 이미 삭제되었을 수 있습니다'::text);
  end if;

  if v_ok > 0 then
    begin
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      select g.holder_user_id, 'system', '🎟 매장이용권이 회수되었습니다',
             format('%s의 매장이용권 %s장이 매장에 의해 회수되었습니다. 문의는 매장으로 부탁드립니다.',
                    coalesce(v.name, '매장'), g.n),
             '🎟', '#FFD100', '/wallet'
      from (
        select sv.holder_user_id, sv.venue_id, count(*) as n
        from public.store_vouchers sv
        where sv.id = any(v_done) and sv.holder_user_id is not null
        group by sv.holder_user_id, sv.venue_id
      ) g left join public.venues v on v.id = g.venue_id;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', v_ok, 'failed', v_total - v_ok, 'reasons', to_jsonb(v_reasons));
end $function$;

-- §4 전화 경로 시도 제한 — 카운터 풀(64칸)을 커밋되는 경로(이 마이그레이션)에서 만든다
do $seq$
declare i int; s text;
begin
  for i in 0..63 loop
    s := 'voucher_phone_try_' || lpad(i::text, 2, '0');
    execute format('create sequence if not exists public.%I minvalue 0 start 0', s);
    execute format('revoke all on sequence public.%I from public, anon, authenticated', s);
  end loop;
end $seq$;

create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text, p_game_seq smallint DEFAULT NULL::smallint)
 returns text
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_holder uuid; v_venue uuid; v_owner uuid; v_ownerphone text; v_norm text; v_name text; v_exp timestamptz; v_status text; v_biz date;
        v_seq text; v_val bigint; v_called boolean; v_fails int := 0; v_now bigint;
begin
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_norm) < 9 then raise exception '전화번호를 정확히 입력하세요'; end if;
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  -- NULL-safe(2026-09-13): auth.uid() 가 NULL(비로그인)이면 `<>` 는 NULL 이 되어 IF 를 건너뛰었다(fail-open). 명시 체크 + is distinct from.
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if v_holder is null or v_holder is distinct from auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  select owner_id, name into v_owner, v_name from public.venues where id = v_venue;
  select regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.profiles p where p.id = v_owner;
  if v_ownerphone is null or v_ownerphone = '' then
    select regexp_replace(coalesce(contact_phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.venues where id = v_venue;
  end if;
  if v_ownerphone is null or v_ownerphone = '' then
    raise exception '이 매장은 전화번호로 사용할 수 없습니다 — 매장 QR 을 찍어 주세요';
  end if;
  -- 20260926e: 회원별 10회/10분 잠금 — 업주 개인 번호를 맞혀 보는 도구가 되지 않게.
  --   카운터 = 시퀀스 값(분 에포크×16 + 연속 실패 수). setval 은 아래 raise 로도 롤백되지 않는다(20260925g 와 같은 방식).
  v_seq := 'voucher_phone_try_' || lpad((((hashtext(auth.uid()::text)::bigint % 64) + 64) % 64)::text, 2, '0');
  execute format('select last_value, is_called from public.%I', v_seq) into v_val, v_called;
  v_now := floor(extract(epoch from now()) / 60)::bigint;
  if coalesce(v_called, false) then
    v_fails := (v_val % 16)::int;
    if v_now - v_val / 16 > 10 then v_fails := 0; end if;
  end if;
  if v_fails >= 10 then
    raise exception '전화번호 확인을 여러 번 틀려 10분 동안 잠겼습니다 — 매장 QR 을 찍거나 잠시 후 다시 시도해 주세요'
      using errcode = '42501';
  end if;
  if v_ownerphone <> v_norm then
    v_fails := v_fails + 1;
    perform setval('public.' || quote_ident(v_seq), v_now * 16 + v_fails, true);
    raise exception '번호가 맞지 않습니다 — 매장에서 안내한 업주 번호를 확인해 주세요' using errcode = '42501';
  end if;
  if p_game_seq is not null then
    if p_game_seq < 1 then
      raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    v_biz := public.ledger_business_date(v_venue);
    if not exists (
      select 1 from public.ledger_sessions ls
       where ls.venue_id = v_venue and ls.session_date = v_biz and ls.game_seq = p_game_seq
    ) then
      raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    if public.ledger_is_closed(v_venue, v_biz, p_game_seq) then
      raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
    end if;
  end if;
  perform set_config('nuri.voucher_game_seq', coalesce(p_game_seq::text, ''), true);
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  return coalesce(v_name, '매장');
end; $function$;

-- §5 voucher_transfers — 양도 기능은 없다(오너 결정 §12-A). 쓰기 권한을 회수하고 비로그인 읽기도 닫는다.
revoke insert, update, delete, truncate, references, trigger on public.voucher_transfers from anon, authenticated;
revoke select on public.voucher_transfers from anon;

-- §6 schedule_reservations — 매장 쪽 판정을 can_manage_venue_schedules 로(공동운영자 포함 · 승인 업주만), 비로그인은 정책 대상에서 뺀다
--   정책 안에서 schedules 를 직접 조인하면 schedules RLS(승인 포스터·작성자·관리자만)가 먼저 걸려,
--   공동운영자는 재심사 중(approved=false) 포스터의 예약을 여전히 0행으로 본다(리허설 1차 S1=0 실측).
--   → 정의자 헬퍼로 포스터→매장만 풀고 판정은 can_manage_venue_schedules 그대로.
create or replace function public._can_manage_reservation_schedule(p_schedule_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926e: 예약 정책 전용. 포스터의 매장을 운영할 수 있나(관리자·승인 업주·승인 공동운영자).
  select exists (
    select 1 from public.schedules s
     where s.id = p_schedule_id
       and s.venue_id is not null
       and public.can_manage_venue_schedules(s.venue_id)
  );
$function$;
revoke all on function public._can_manage_reservation_schedule(uuid) from public, anon;
grant execute on function public._can_manage_reservation_schedule(uuid) to authenticated, service_role;  -- 정책은 호출자 권한으로 평가된다

drop policy if exists sr_select on public.schedule_reservations;
drop policy if exists sr_update on public.schedule_reservations;
drop policy if exists sr_delete on public.schedule_reservations;
create policy sr_select on public.schedule_reservations for select to authenticated
  using ( user_id = (select auth.uid())
       or public._can_manage_reservation_schedule(schedule_id)
       or public.my_role() = 'admin'::user_role );
create policy sr_update on public.schedule_reservations for update to authenticated
  using ( user_id = (select auth.uid())
       or public._can_manage_reservation_schedule(schedule_id) );
create policy sr_delete on public.schedule_reservations for delete to authenticated
  using ( user_id = (select auth.uid())
       or public._can_manage_reservation_schedule(schedule_id)
       or public.my_role() = 'admin'::user_role );

-- §7 반려 → 재심사 전이 알림 (값 전이는 WHEN 으로 — BEFORE 트리거가 바꾼 NEW 를 본다. `UPDATE OF 열` 은 쓰지 않는다)
drop trigger if exists trg_notify_admin_resubmit_poster on public.schedules;
create trigger trg_notify_admin_resubmit_poster
  after update on public.schedules
  for each row
  when (old.rejected_at is not null and new.rejected_at is null and new.approved is not true)
  execute function public._notify_admin_pending_poster();

-- §8 ACL 재기재(같은 시그니처 create or replace 는 ACL 을 보존하지만, 새로 만들어지는 경우를 위해 적는다)
revoke all on function public.create_my_venue(text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_my_venue(text,text,text,text,text,text,text,text) to authenticated, service_role;
revoke all on function public.revoke_vouchers(uuid[]) from public, anon;
grant execute on function public.revoke_vouchers(uuid[]) to authenticated, service_role;
revoke all on function public.redeem_my_voucher_by_phone(uuid,text,smallint) from public, anon;
grant execute on function public.redeem_my_voucher_by_phone(uuid,text,smallint) to authenticated, service_role;
revoke all on function public._notify_admin_pending_poster() from public, anon, authenticated;

-- §9 자가검사 — 하나라도 틀리면 전체 롤백
do $chk$
declare n int; s text;
begin
  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='venue_owners' and column_name='status') is distinct from '''pending''::text' then
    raise exception '20260926e 자가검사: venue_owners.status 기본값이 pending 이 아닙니다';
  end if;
  for s in select unnest(array[
      'public.create_my_venue(text,text,text,text,text,text,text,text)',
      'public.revoke_vouchers(uuid[])',
      'public.redeem_my_voucher_by_phone(uuid,text,smallint)']) loop
    if pg_get_functiondef(s::regprocedure) not like '%20260926e%' then raise exception '20260926e 자가검사: % 본문 표식 없음', s; end if;
    if has_function_privilege('anon', s::regprocedure, 'execute') then raise exception '20260926e 자가검사: % anon 실행 가능', s; end if;
    if not has_function_privilege('authenticated', s::regprocedure, 'execute') then raise exception '20260926e 자가검사: % authenticated 실행 불가', s; end if;
    if not exists (select 1 from pg_proc where oid = s::regprocedure and prosecdef
                    and array_to_string(proconfig, ',') like '%search_path=public, pg_temp%') then
      raise exception '20260926e 자가검사: % definer/search_path', s;
    end if;
  end loop;
  if has_function_privilege('anon', 'public._can_manage_reservation_schedule(uuid)', 'execute')
     or not exists (select 1 from pg_proc where oid = 'public._can_manage_reservation_schedule(uuid)'::regprocedure and prosecdef
                     and array_to_string(proconfig, ',') like '%search_path=public, pg_temp%') then
    raise exception '20260926e 자가검사: 예약 헬퍼 ACL/definer/search_path';
  end if;
  if pg_get_functiondef('public.create_my_venue(text,text,text,text,text,text,text,text)'::regprocedure) ~* 'approved\s*=\s*true' then
    raise exception '20260926e 자가검사: create_my_venue 가 아직 approved 를 세운다';
  end if;
  select count(*) into n from pg_class c
   where c.relkind = 'S' and c.relnamespace = 'public'::regnamespace and c.relname like 'voucher_phone_try_%'
     and not has_sequence_privilege('anon', c.oid, 'usage') and not has_sequence_privilege('authenticated', c.oid, 'usage')
     and not has_sequence_privilege('authenticated', c.oid, 'update');
  if n <> 64 then raise exception '20260926e 자가검사: 잠금 시퀀스 64개 중 닫힌 것 %개', n; end if;
  if has_table_privilege('authenticated', 'public.voucher_transfers', 'insert')
     or has_table_privilege('anon', 'public.voucher_transfers', 'insert')
     or has_table_privilege('anon', 'public.voucher_transfers', 'select') then
    raise exception '20260926e 자가검사: voucher_transfers 권한이 남았습니다';
  end if;
  select count(*) into n from pg_policies
   where schemaname='public' and tablename='schedule_reservations' and policyname in ('sr_select','sr_update','sr_delete')
     and roles = '{authenticated}' and qual like '%_can_manage_reservation_schedule%' and qual not like '%owner_id%';
  if n <> 3 then raise exception '20260926e 자가검사: 예약 정책 3개 중 %개만 교체됨', n; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_notify_admin_resubmit_poster' and tgrelid = 'public.schedules'::regclass) then
    raise exception '20260926e 자가검사: 재심사 알림 트리거 없음';
  end if;
end $chk$;
