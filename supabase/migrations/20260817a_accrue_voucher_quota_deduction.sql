-- 정책 확정(2026-08-17): 장부 자동 적립(accrue_voucher)도 발급 한도(voucher_quota)를 차감한다.
-- 지금까지는 적립 경로가 쿼터를 전혀 거치지 않아, 바인당 적립 수를 크게 설정하면
-- 유료 발급 한도를 무제한 우회할 수 있었다(플랫폼 과금 체계 우회 — 보안 감사 S3 잔여 1건).
-- issue_voucher 와 동일한 FOR UPDATE 행 잠금 패턴. 한도 소진 시 명확한 사유로 실패 —
-- 접수대 토스트가 서버 메시지를 그대로 보여주므로 운영자가 즉시 원인을 안다.
-- CREATE OR REPLACE = 기존 ACL({authenticated}) 보존.
create or replace function public.accrue_voucher(p_venue_id uuid, p_player_name text, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int; v_uid uuid; v_name text; v_quota int;
begin
  if not can_access_ledger(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 적립할 수 있습니다';
  end if;
  v_name := btrim(coalesce(p_player_name, ''));
  if v_name = '' then return 0; end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  -- 발급 한도 차감(신규): 적립도 발급이다. admin 은 issue_voucher 와 동일하게 예외.
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개) — 이용권 관리에서 충전을 요청해 주세요', coalesce(v_quota, 0), v_count;
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  select p.id into v_uid from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and (lower(btrim(p.nickname)) = lower(v_name) or btrim(p.real_name) = v_name or btrim(p.name) = v_name)
   order by (lower(btrim(p.nickname)) = lower(v_name)) desc
   limit 1;
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title)
  select p_venue_id, auth.uid(), v_uid, v_name, '적립 이용권'
  from generate_series(1, v_count);
  return v_count;
end $function$;
