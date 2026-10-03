-- ✅ 적용 완료 2026-10-03 (리드, Management API). critical-reviewer 초안·리허설(수정 전 FAIL·후 PASS·양성 대조·표류/ACL 음성 대조) · 리드 재리허설 PASS · advisors ERROR 0 · 영향 행 0(시즌 0개).
-- 20261003g — DRAFT(미적용) · 요구 키 E4 보고 Low 형제(시즌 마감 D-3/D-1 알림 수신자, L-10 계열) · 작성 critical-reviewer 2026-10-03 · 적용 판단은 리드
-- 무엇: notify_season_deadline(크론 'season-deadline-notify' 0 1 * * *)이 진행 중 시즌 1~10위 마감 알림을 '지금 그 닉네임을 쓰는 활성 회원' 에게 보내던 것을
--       20261003f(_end_season_internal, 적용 완료)와 같은 판정으로 그 시즌 그 이름 순위 행의 주인에게만 보낸다.
--       판정 시각 t = least(첫 저장, 경기일 끝 KST) · 본인 이력상 t 에 그 이름 · t 이전 가입 · 지금 활성.
--       진행 중 시즌이어도 규칙은 같다: 순위(current_season_standings)가 이미 저장된 순위 행에서만 계산되므로 행마다 t 가 정해진다.
--       차이 1가지 — 크론이 도는 날 저장된 행은 t = 첫 저장 시각(경기일 끝보다 이르다)이라 그 뒤 개명은 '이어받음' 으로 판정된다(의도대로).
-- 출발점(라이브 2026-10-03 pg_get_functiondef): def md5 4c1e994f860d96d055952df67f99ccd8 · prosrc md5 085ee631491f6974e9b23581c4287f05 — 바꾼 곳 2곳(select p.id → o.uid, 수신자 from/where).
-- 적용 후 prosrc md5: 5ffa2b8216a6943ef0d96ebc9687f8c3
-- 그대로 둔 것: 대상 시즌 고르기(D-3/D-1·notified_at), 문구, 1~10위 범위, d3/d1_notified_at 갱신. 호출자는 크론 1곳(화면·다른 함수 0).
-- 영향(라이브 2026-10-03): venue_seasons 0 → 지금 바뀌는 행 0.
-- 리허설: names-1002/l10g_rehearse.sql (rehearse.mjs 되돌림). 이 파일 없이 = FAIL, 있으면 PASS.
-- ACL: CREATE OR REPLACE 라 기존 ACL(postgres·service_role) 유지. 아래 REVOKE/GRANT 는 새로 만들어지는 경우 대비.
do $pre$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.notify_season_deadline()'::regprocedure) is distinct from '085ee631491f6974e9b23581c4287f05' then
    raise exception '표류: 라이브 notify_season_deadline 본문이 초안 작성 때(085ee631491f6974e9b23581c4287f05)와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre$;

CREATE OR REPLACE FUNCTION public.notify_season_deadline()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare se record; r record; v_name text; v_days int; v_today date;
begin
  v_today := (now() at time zone 'Asia/Seoul')::date;
  for se in select * from public.venue_seasons where status = 'active' loop
    v_days := se.ends_on - v_today;
    if not ((v_days = 3 and se.d3_notified_at is null) or (v_days = 1 and se.d1_notified_at is null)) then
      continue;
    end if;
    select name into v_name from public.venues where id = se.venue_id;
    for r in select rank, nickname from public.current_season_standings(se.venue_id) where rank <= 10 loop
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      select o.uid, 'system',
             case when v_days = 1 then '⏳ 시즌 마감 내일!' else '⏳ 시즌 마감 D-3' end,
             format('%s — %s 현재 %s위 · %s 마감. 순위를 지키러 오세요!',
                    coalesce(se.name, '시즌'), coalesce(v_name, '매장'), r.rank, to_char(se.ends_on, 'MM/DD')),
             '⏳', '#FFD100', '/community/' || se.venue_id
      -- 20261003g L-10 계열(20261003f 와 같은 판정): 수신자는 '지금 그 닉네임을 쓰는 회원' 이 아니라 이 시즌 그 이름 순위 행의 주인이다.
      --   판정 시각 t = least(첫 저장, 경기일 끝 KST) · 본인 이력상 t 에 그 이름 · t 이전 가입 · 지금 활성.
      from (
        select distinct c.uid
          from public.venue_rankings vr
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
         where vr.venue_id = se.venue_id and vr.ranking_date between se.starts_on and se.ends_on and vr.nickname = r.nickname
      ) o;
    end loop;
    if v_days = 3 then update public.venue_seasons set d3_notified_at = now() where id = se.id;
    else update public.venue_seasons set d1_notified_at = now() where id = se.id;
    end if;
  end loop;
end $function$;
revoke all on function public.notify_season_deadline() from public, anon, authenticated;
grant execute on function public.notify_season_deadline() to service_role;

do $post$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.notify_season_deadline()'::regprocedure) is distinct from '5ffa2b8216a6943ef0d96ebc9687f8c3' then
    raise exception '자가검사: notify_season_deadline 새 본문 md5 가 기대(5ffa2b8216a6943ef0d96ebc9687f8c3)와 다르다';
  end if;
  if (select md5(replace(replace(p.prosrc, '      select o.uid, ''system'',', '      select p.id, ''system'','), '      -- 20261003g L-10 계열(20261003f 와 같은 판정): 수신자는 ''지금 그 닉네임을 쓰는 회원'' 이 아니라 이 시즌 그 이름 순위 행의 주인이다.
      --   판정 시각 t = least(첫 저장, 경기일 끝 KST) · 본인 이력상 t 에 그 이름 · t 이전 가입 · 지금 활성.
      from (
        select distinct c.uid
          from public.venue_rankings vr
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
         where vr.venue_id = se.venue_id and vr.ranking_date between se.starts_on and se.ends_on and vr.nickname = r.nickname
      ) o;', '      from public.profiles p
      where lower(btrim(p.nickname)) = lower(btrim(r.nickname))
        and coalesce(p.status::text, ''active'') = ''active'';')) from pg_proc p where p.oid = 'public.notify_season_deadline()'::regprocedure) is distinct from '085ee631491f6974e9b23581c4287f05' then
    raise exception '자가검사: notify_season_deadline 에서 의도한 줄 밖이 바뀌었다';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.notify_season_deadline()'::regprocedure)
     or has_function_privilege('anon', 'public.notify_season_deadline()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_season_deadline()', 'execute')
     or not has_function_privilege('service_role', 'public.notify_season_deadline()', 'execute') then
    raise exception '자가검사: notify_season_deadline DEFINER 또는 ACL(anon·authenticated 회수, service_role 허용)이 기대와 다르다';
  end if;
end $post$;
