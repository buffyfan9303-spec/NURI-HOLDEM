-- ============================================================================
-- 순위·보상 분리 후속 하드닝 (2026-09-05 배포 후 적용 — 리뷰 워크플로 확정 사항)
--
-- ① venue_rankings 직접 쓰기 회수 — RPC(save_venue_rankings) 의 'prize 무시·승계' 정책을 PostgREST 직접 INSERT/UPDATE 로
--    우회할 수 없게 한다. 클라이언트 직접 쓰기 0곳(실측). SELECT 는 그대로(공개 순위표).
-- ② weekly_moneyin_kings DROP — 상금 파생 정렬 함수. 클라 호출은 배포로 0 이 됐다(홈 스트립·PC 레일 삭제).
-- ③ accrue_voucher 실행권 회수 — 순위 가드·발급 사유 없이 store_vouchers 를 만드는 우회 경로. 호출자 0곳.
-- ④ save_venue_rankings prize 승계를 (닉네임, 등수) 우선으로 — 동명이인이 같은 게임에 둘 있으면 닉네임만으로는
--    상금이 복제됐다. 정확히 같은 (닉네임·등수) 행이 있으면 그것을, 없으면 그 닉네임이 옛 칸에서 유일할 때만 승계.
-- ⑤ issue_voucher 영문 가드를 단어 경계로 — 'rank' 가 'frank' 같은 이름에 오탐하지 않게. 한글 가드는 그대로.
--
-- 소급: 데이터 변경 0. 롤백: 20260905g(save_venue_rankings)·20260905h(issue_voucher) 본문 재실행, GRANT 복원.
-- ============================================================================

-- ── ① 순위 표 직접 쓰기 회수 ──────────────────────────────────────────────────
revoke insert, update, delete on public.venue_rankings from anon, authenticated;

-- ── ② 주간 머니인 킹 삭제 ─────────────────────────────────────────────────────
drop function if exists public.weekly_moneyin_kings(date, date, integer);

-- ── ③ 적립 발급 경로 봉쇄(호출자 0) ───────────────────────────────────────────
revoke execute on function public.accrue_voucher(uuid, text, integer) from public, anon, authenticated;

-- ── ④ 과거 상금 승계 — (닉네임·등수) 정확 일치 우선, 닉네임 단독은 유일할 때만 ────────
create or replace function public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb, p_event text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  e jsonb; i int := 0;
  v_ev text := left(coalesce(trim(p_event), ''), 40);
  v_nick text; v_key text; v_prize text;
  v_by_pos jsonb;    -- lower(닉네임)||'#'||position → prize
  v_by_nick jsonb;   -- lower(닉네임) → prize (옛 칸에서 그 닉네임이 유일할 때만)
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;

  select coalesce(jsonb_object_agg(lower(trim(nickname)) || '#' || position, prize), '{}'::jsonb) into v_by_pos
    from public.venue_rankings
   where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev and prize is not null;
  select coalesce(jsonb_object_agg(k, p), '{}'::jsonb) into v_by_nick
    from (select lower(trim(nickname)) as k, max(prize) as p
            from public.venue_rankings
           where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev and prize is not null
           group by lower(trim(nickname)) having count(*) = 1) u;

  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;

  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_nick := left(trim(coalesce(e->>'nickname', '')), 30);
    if v_nick = '' then continue; end if;
    i := i + 1;
    v_key := lower(v_nick);
    v_prize := coalesce(v_by_pos->>(v_key || '#' || i), v_by_nick->>v_key);   -- 입력값의 prize 는 쓰지 않는다
    insert into public.venue_rankings (venue_id, ranking_date, event_name, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, v_ev, i,
            v_nick,
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            v_prize,
            auth.uid());
  end loop;
end;
$function$;
revoke all on function public.save_venue_rankings(uuid, date, jsonb, text) from public, anon;
grant execute on function public.save_venue_rankings(uuid, date, jsonb, text) to authenticated, service_role;

-- ── ⑤ 이용권 가드 영문 단어 경계 ──────────────────────────────────────────────
create or replace function public.issue_voucher(
  p_venue_id uuid, p_title text, p_count integer default 1,
  p_holder_name text default null, p_holder_user_id uuid default null,
  p_note text default null, p_expires_at timestamp with time zone default null,
  p_reason text default 'service')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_count int; v_title text; v_holder text; v_quota int; v_vname text; v_reason text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  -- 순위(대회 등수)를 근거로 한 이용권 발급은 지원하지 않는다(2026-09-05 법적위험완화 v3). 영문은 단어 경계(\m \M)로만.
  if coalesce(p_title, '') ~* '(순위|시상|입상|우승|\maward\M|\mrank\M|\mprize\M)'
     or coalesce(p_note, '') ~* '(AWARD:|순위|시상|입상|우승|\maward\M|\mrank\M|\mprize\M)' then
    raise exception '순위·입상을 근거로 한 이용권 발급은 지원하지 않습니다 — 제목·비고에서 순위/시상 관련 문구를 빼고 일반 이용권으로만 발급할 수 있습니다';
  end if;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'service');
  if v_reason not in ('welcome', 'visit', 'event', 'service', 'other') then
    raise exception '발급 사유를 골라 주세요 — 첫 방문 환영·방문 감사·이벤트·서비스 보상·기타 중 하나';
  end if;
  if v_reason = 'other' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception '기타 사유는 비고에 발급 이유를 적어 주세요';
  end if;
  if my_role() IS DISTINCT FROM 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  if public.identity_gate_on() and p_holder_user_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_holder_user_id and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다 — 받는 분이 프로필 > 보안에서 본인인증을 마쳐야 합니다';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() IS DISTINCT FROM 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 운영자에게 문의해 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note, expires_at, issue_reason)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_expires_at, v_reason
  from generate_series(1, v_count);
  if p_holder_user_id is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (p_holder_user_id, 'system', '🎟 매장이용권 도착!',
              format('%s에서 ''%s'' %s장을 보냈어요. 지갑에서 확인하세요%s',
                     coalesce(v_vname, '매장'), v_title, v_count,
                     case when p_expires_at is not null
                          then format(' (유효기간 ~%s)', to_char(p_expires_at at time zone 'Asia/Seoul', 'MM/DD'))
                          else '' end),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end $function$;
revoke all on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone, text) from public, anon;
grant execute on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone, text) to authenticated, service_role;
