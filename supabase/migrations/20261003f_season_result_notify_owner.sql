-- ✅ 적용 완료 2026-10-03 (리드, Management API). critical-reviewer 초안·리허설(수정 전 FAIL·후 PASS·양성 대조·표류/ACL 음성 대조) · 리드 재리허설 PASS · advisors ERROR 0 · 영향 행 0(시즌 0개).
-- 20261003f — DRAFT(미적용) · 요구 키 E4 보고 Low(시즌 결과 알림 수신자, L-10 계열) · 작성 critical-reviewer 2026-10-03 · 적용 판단은 리드
-- 무엇: _end_season_internal 이 시즌 1~3위 알림을 '지금 lower(nickname) 이 같은 회원' 에게 보내던 것을
--       그 시즌 그 이름 순위 행의 주인(20261003a 와 같은 판정)에게만 보낸다.
--       판정 시각 t = least(첫 저장, 경기일 끝 KST) · 본인 이력상 t 에 그 이름 · t 이전 가입 · 지금 활성.
--       → 닉네임을 이어받은 회원·가입 전 같은 이름 워크인을 나중에 가입한 회원·개명으로 워크인 이름을 쓴 회원은 남의 결과 알림을 받지 않는다.
-- 출발점(라이브 2026-10-03 pg_get_functiondef): def md5 e7847936ea931938367d4bb791b5a902 · prosrc md5 c16b1e400f94f4cdbd83a76565f9ca7b — 바꾼 곳 1곳(알림 수신자 select).
-- 적용 후 prosrc md5: e3602e59e8f8230317882f825890b9ab
-- 그대로 둔 것: 시즌 결과 행(venue_season_results) 생성·시즌 종료 처리·반환값. 호출자 end_venue_season(업주 RPC)·end_expired_seasons(크론) 무변경.
-- 영향(라이브 2026-10-03): venue_seasons 0 · venue_season_results 0 → 지금 바뀌는 행 0(다음 시즌 종료부터).
-- 리허설: names-1002/l10f_rehearse.sql (rehearse.mjs 되돌림). 이 파일 없이 = FAIL, 있으면 PASS.
-- ACL: CREATE OR REPLACE 라 기존 ACL(postgres·service_role) 유지. 아래 REVOKE/GRANT 는 새로 만들어지는 경우 대비.
do $pre$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public._end_season_internal(uuid)'::regprocedure) is distinct from 'c16b1e400f94f4cdbd83a76565f9ca7b' then
    raise exception '표류: 라이브 _end_season_internal 본문이 초안 작성 때(c16b1e400f94f4cdbd83a76565f9ca7b)와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre$;

CREATE OR REPLACE FUNCTION public._end_season_internal(p_season_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_venue uuid; r record; n int := 0;
begin
  select venue_id into v_venue from public.venue_seasons where id = p_season_id and status = 'active';
  if v_venue is null then return 0; end if;
  insert into public.venue_season_results (season_id, rank, nickname, real_name, points, prize_man, appearances, best_position)
  select p_season_id, rank, nickname, real_name, points, prize_man, appearances, best_position
    from public._current_season_standings_raw(v_venue);
  get diagnostics n = row_count;
  for r in select rank, nickname from public.venue_season_results where season_id = p_season_id and rank <= 3 loop
    insert into public.notifications (user_id, type, title, message, link)
    -- 20261003f L-10 계열: 수신자는 '지금 그 닉네임을 쓰는 회원' 이 아니라 그 시즌 그 이름 순위 행의 주인이다.
    --   판정 시각 t = least(첫 저장, 경기일 끝 KST)(my_ranking_history·20261003a 와 같은 시각).
    --   주인 = 본인 이력상 t 에 그 이름을 쓰던 회원 + t 이전 가입 + 지금 활성. 가입 전 같은 이름 워크인·탈퇴 계정·이름을 이어받은 회원은 받지 않는다.
    select o.uid, 'system', '🏆 시즌 결과', '시즌 ' || r.rank || '위 달성! 기록은 명예의 전당에 남습니다', '/community/' || v_venue
      from (
        select distinct c.uid
          from public.venue_seasons s
          join public.venue_rankings vr
            on vr.venue_id = s.venue_id and vr.ranking_date between s.starts_on and s.ends_on and vr.nickname = r.nickname
          cross join lateral (select least(vr.created_at, ((vr.ranking_date + 1)::timestamp at time zone 'Asia/Seoul')) as t) w
          cross join lateral (
            select x.uid from (
              select h.user_id as uid from public.nickname_history h where lower(btrim(h.old_nickname)) = lower(btrim(vr.nickname))
              union
              select p.id from public.profiles p where lower(btrim(p.nickname)) = lower(btrim(vr.nickname))
            ) x
            where lower(btrim(coalesce(
                    (select h.old_nickname from public.nickname_history h
                      where h.user_id = x.uid and h.changed_at > w.t
                      order by h.changed_at, h.id limit 1),
                    (select p.nickname from public.profiles p where p.id = x.uid),
                    ''))) = lower(btrim(vr.nickname))
          ) c
          join auth.users u on u.id = c.uid and u.created_at < w.t
          join public.profiles pr on pr.id = c.uid and coalesce(pr.status::text, 'active') = 'active'
         where s.id = p_season_id
      ) o;
  end loop;
  update public.venue_seasons set status = 'ended', ended_at = now() where id = p_season_id;
  return n;
end
$function$;
revoke all on function public._end_season_internal(uuid) from public, anon, authenticated;
grant execute on function public._end_season_internal(uuid) to service_role;

do $post$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public._end_season_internal(uuid)'::regprocedure) is distinct from 'e3602e59e8f8230317882f825890b9ab' then
    raise exception '자가검사: _end_season_internal 새 본문 md5 가 기대(e3602e59e8f8230317882f825890b9ab)와 다르다';
  end if;
  if (select md5(replace(p.prosrc, '    -- 20261003f L-10 계열: 수신자는 ''지금 그 닉네임을 쓰는 회원'' 이 아니라 그 시즌 그 이름 순위 행의 주인이다.
    --   판정 시각 t = least(첫 저장, 경기일 끝 KST)(my_ranking_history·20261003a 와 같은 시각).
    --   주인 = 본인 이력상 t 에 그 이름을 쓰던 회원 + t 이전 가입 + 지금 활성. 가입 전 같은 이름 워크인·탈퇴 계정·이름을 이어받은 회원은 받지 않는다.
    select o.uid, ''system'', ''🏆 시즌 결과'', ''시즌 '' || r.rank || ''위 달성! 기록은 명예의 전당에 남습니다'', ''/community/'' || v_venue
      from (
        select distinct c.uid
          from public.venue_seasons s
          join public.venue_rankings vr
            on vr.venue_id = s.venue_id and vr.ranking_date between s.starts_on and s.ends_on and vr.nickname = r.nickname
          cross join lateral (select least(vr.created_at, ((vr.ranking_date + 1)::timestamp at time zone ''Asia/Seoul'')) as t) w
          cross join lateral (
            select x.uid from (
              select h.user_id as uid from public.nickname_history h where lower(btrim(h.old_nickname)) = lower(btrim(vr.nickname))
              union
              select p.id from public.profiles p where lower(btrim(p.nickname)) = lower(btrim(vr.nickname))
            ) x
            where lower(btrim(coalesce(
                    (select h.old_nickname from public.nickname_history h
                      where h.user_id = x.uid and h.changed_at > w.t
                      order by h.changed_at, h.id limit 1),
                    (select p.nickname from public.profiles p where p.id = x.uid),
                    ''''))) = lower(btrim(vr.nickname))
          ) c
          join auth.users u on u.id = c.uid and u.created_at < w.t
          join public.profiles pr on pr.id = c.uid and coalesce(pr.status::text, ''active'') = ''active''
         where s.id = p_season_id
      ) o;', '    select id, ''system'', ''🏆 시즌 결과'', ''시즌 '' || r.rank || ''위 달성! 기록은 명예의 전당에 남습니다'', ''/community/'' || v_venue
      from public.profiles where lower(nickname) = lower(r.nickname);')) from pg_proc p where p.oid = 'public._end_season_internal(uuid)'::regprocedure) is distinct from 'c16b1e400f94f4cdbd83a76565f9ca7b' then
    raise exception '자가검사: _end_season_internal 에서 의도한 줄 밖이 바뀌었다';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public._end_season_internal(uuid)'::regprocedure)
     or has_function_privilege('anon', 'public._end_season_internal(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._end_season_internal(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public._end_season_internal(uuid)', 'execute') then
    raise exception '자가검사: _end_season_internal DEFINER 또는 ACL(anon·authenticated 회수, service_role 허용)이 기대와 다르다';
  end if;
end $post$;
