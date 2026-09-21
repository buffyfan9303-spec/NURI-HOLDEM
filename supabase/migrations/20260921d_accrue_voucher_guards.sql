-- ============================================================================
-- accrue_voucher 에 20260921a 와 **같은 선**의 가드를 넣는다 (오너 결정 2026-09-21, 7-ⓐ)
--
-- 문제: 20260921a 가 issue_voucher 의 조용한 보정을 거절로 바꿨는데 accrue_voucher 는 빠져 있었다.
--   ① 장수: `least(greatest(coalesce(p_count,1),1),1000)` — 범위 밖을 조용히 보정
--   ② 보유자: 이름 매칭 실패 시 holder_user_id = NULL 로 그대로 insert
--      → 20260914b 가 영구 사용 거절하는 **고아 이용권**이 되고 발급 한도만 깎인다.
--
-- 지금은 닫혀 있다(그래서 사고가 아니었다): proacl = {postgres=X, service_role=X} 라
--   anon·authenticated 실행 불가이고, 클라 래퍼 `accrueVoucher`(src/api/vouchers.ts:195)의
--   UI 호출부가 0곳이다. 20260905i:7 이 "호출자 0곳" 이라며 **의도적으로 봉쇄**한 기록이다.
--   ⚠ 그래도 고치는 이유: service_role 경로는 게이트가 아니라 **함수 본문이 마지막 방어선**이고
--     (CLAUDE.md 보안표준 4번), 누가 `grant execute … to authenticated` 를 되돌리면
--     두 구멍이 **동시에** 열린다. 2026-09-15 '화면 0곳인데 RPC 만 살아 있던' 사건의 거울상이다.
--
-- 🔴 GRANT 를 복원하지 않는다. ACL 은 service_role 전용 그대로 둔다.
--   `create or replace` 는 ACL 을 보존한다(CLAUDE.md 2026-09-12 실측) — 확인했다.
--
-- 보존한 것: 빈 이름 → return 0(기존 동작) · 본인인증 게이트 · 한도 차감 순서 ·
--   알림 발송 실패를 삼키는 블록. 가드는 **한도 차감보다 앞**이라 거절해도 한도가 안 깎인다.
--
-- ✅ 2026-09-21 라이브 적용 완료.
--   적용 전 md5 6c8b4df8ac58e8fe34a71f3eee0fdefd → 적용 후 71feb09e654c5e64ec31d3e41567f243
--   ACL 적용 후 실측: {postgres=X/postgres, service_role=X/postgres}
--     has_function_privilege(anon)=false · (authenticated)=false  ← 회수 상태 유지 확인
--   라이브 begin;…rollback; 리허설 4/4:
--     없는 회원   → 거절 "'존재하지않는사람XYZ' 님을 회원에서 찾지 못했습니다"
--     장수 0      → 거절 "적립 장수는 1~1000 사이여야 합니다 (요청 0장)"
--     장수 1001   → 거절 "적립 장수는 1~1000 사이여야 합니다 (요청 1001장)"
--     빈 이름     → 0 반환 (기존 동작 보존 — 양성 대조)
-- ============================================================================

create or replace function public.accrue_voucher(p_venue_id uuid, p_player_name text, p_count integer)
 returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_count int; v_uid uuid; v_name text; v_quota int; v_vname text; v_nick text; v_real text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 이용권 적립은 업주만 가능합니다'; end if;
  if not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 적립할 수 있습니다';
  end if;
  v_name := btrim(coalesce(p_player_name, ''));
  if v_name = '' then return 0; end if;
  v_nick := btrim(coalesce((regexp_match(v_name, '^.*\((.+)\)$'))[1], ''));
  v_real := btrim(coalesce((regexp_match(v_name, '^(.*)\(.+\)$'))[1], ''));
  -- [20260921d] 범위 밖 장수는 조용히 보정하지 않고 거절한다.
  if p_count is not null and (p_count < 1 or p_count > 1000) then
    raise exception '적립 장수는 1~1000 사이여야 합니다 (요청 %장)', p_count;
  end if;
  v_count := coalesce(p_count, 1);
  select p.id into v_uid from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and (lower(btrim(p.nickname)) = lower(v_name)
       or (v_nick <> '' and lower(btrim(p.nickname)) = lower(v_nick))
       or btrim(p.real_name) = v_name
       or (v_real <> '' and btrim(p.real_name) = v_real)
       or btrim(p.name) = v_name)
   order by (lower(btrim(p.nickname)) = lower(case when v_nick <> '' then v_nick else v_name end)) desc
   limit 1;
  -- [20260921d] 보유자 NULL 금지 — 한도 차감보다 앞이라 거절해도 한도가 안 깎인다.
  if v_uid is null then
    raise exception '''%'' 님을 회원에서 찾지 못했습니다 — 이용권은 회원에게만 적립할 수 있습니다', v_name;
  end if;
  if public.identity_gate_on() and not exists (
    select 1 from public.profiles p where p.id = v_uid and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '''%'' 님은 본인인증 전이라 이용권을 적립할 수 없습니다', v_name;
  end if;
  if my_role() IS DISTINCT FROM 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개)', coalesce(v_quota, 0), v_count;
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title)
  select p_venue_id, auth.uid(), v_uid, v_name, '적립 이용권' from generate_series(1, v_count);
  begin
    select name into v_vname from public.venues where id = p_venue_id;
    insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
    values (v_uid, 'system', '🎟 적립 이용권 도착!',
            format('%s 방문 적립으로 이용권 %s장을 받았어요. 지갑에서 확인하세요', coalesce(v_vname,'매장'), v_count),
            '🎟', '#FFD100', '/wallet');
  exception when others then null;
  end;
  return v_count;
end $function$;

-- ⚠ GRANT 를 복원하지 않는다(의도). ACL = service_role 전용 유지.
