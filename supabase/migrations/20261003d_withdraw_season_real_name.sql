-- ✅ 적용 완료 2026-10-03 (리드, Management API). critical-reviewer E4 초안 · 리드 재리허설 PASS(본인/관리자 탈퇴 12+12 단언, 워크인·다른 손님 실명 유지 양성 대조) · advisors ERROR 0 · 적용 시 바뀐 행 0. 오너 결정: 탈퇴 시 실명 삭제는 순위·시즌까지만(고객·근무·장부 기록 제외).
-- 초안(미적용) 20261003d_withdraw_season_real_name — 요구 키 PLAN-1002c-remaining.md#E4 ⑥ · 작성 critical-reviewer 2026-10-03 · 적용은 리드
-- 무엇: 오너 결정(10-03) '탈퇴 시 순위 실명 삭제' 를 시즌 결과 스냅샷(venue_season_results.real_name)까지 넓힌다.
--   20261003a 는 venue_rankings.real_name 만 지운다. 끝난 시즌 결과는 _end_season_internal 이 시즌 종료 때
--   _current_season_standings_raw 의 max(real_name) 을 복사해 둔 것이라, 탈퇴 뒤에도 season_results·venue_hall_of_fame·
--   (진행 중이면 current_season_standings 는 venue_rankings 에서 다시 계산되므로 자동으로 빠진다) 에 남는다.
-- 범위 밖(확장하지 않음 — 근거는 E4-security-1003.md ⑥): customer_profiles(매장 자체 고객 기록, 플랫폼이 넣는 값은 닉네임뿐) ·
--   staff_schedule/staff_wage(근로 기록 — 보존 의무 후보, 법령 원문 리드 확인) · 장부 이름(ledger_players.name 등 — 매장 거래 기록).
-- 출발점(라이브 2026-10-03 실측): profiles_nickname_rules prosrc md5 10ce703fd3c9f11d2b8884b3cab838fc (= 20261003a 적용 후 값)
-- 적용 후 prosrc md5: b62d597282183bbb0f6e429bf152567d
-- 영향(라이브 2026-10-03): venue_season_results 0행 · venue_seasons 0 · 탈퇴 프로필 0 → 지금 바뀌는 행 0.
-- 리허설: node rehearse.mjs ../E4-sec-1003/00_harness.sql ../E4-sec-1003/20261003d_withdraw_season_real_name.draft.sql ../E4-sec-1003/20_withdraw_season.sql
--   음성 대조: 이 파일 없이 같은 시험 → S2 에서 CHECK FAIL(실명 남음).
-- ACL: CREATE OR REPLACE 라 기존 ACL 유지(라이브: anon·authenticated 실행권 없음). 아래 REVOKE/GRANT 는 새로 만들어지는 경우 대비.
do $pre$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.profiles_nickname_rules'::regproc) is distinct from '10ce703fd3c9f11d2b8884b3cab838fc' then
    raise exception '표류: 라이브 profiles_nickname_rules 본문이 초안 작성 때와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre$;

CREATE OR REPLACE FUNCTION public.profiles_nickname_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_admin boolean;
begin
  if tg_op = 'UPDATE' and new.nickname is distinct from old.nickname then
    v_admin := coalesce(public.my_role()::text, '') = 'admin';
    if new.status::text = 'withdrawn' then
      -- 20261002x L-10: 이력을 지우지 않는다. 지우면 nickname_owner_at 이 탈퇴자의 옛 순위 기록을 그 닉네임의 새 주인에게 돌려준다.
      --   탈퇴 때 이름을 놓은 기록을 한 줄 더 남겨, 탈퇴 전 기록의 주인이 탈퇴 계정으로 남게 한다(공개 함수는 status 로 가린다).
      if nullif(btrim(old.nickname), '') is not null then
        insert into public.nickname_history (user_id, old_nickname, new_nickname, changed_by, source)
        values (new.id, old.nickname, new.nickname, v_actor, 'system');
      end if;
      -- 20261003a: 오너 결정(10-03) — 업주가 적은 순위 실명(venue_rankings.real_name)은 그 회원이 탈퇴하면 지운다(본인·관리자 탈퇴 모두 이 트리거를 탄다).
      --   그 회원에게 묶이는 행만: 판정 시각 t = least(첫 저장, 경기일 끝 KST)(my_ranking_history 와 같은 시각)에
      --   ① 본인 이력상 그 회원이 그 이름을 쓰고 있었고 ② 이미 가입해 있었던 행. 가입 전 같은 이름 워크인 행은 건드리지 않는다.
      update public.venue_rankings r
         set real_name = null
       where r.real_name is not null
         and lower(btrim(r.nickname)) in (select lower(btrim(h.old_nickname)) from public.nickname_history h where h.user_id = new.id)
         and (select u.created_at from auth.users u where u.id = new.id)
             < least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))
         and lower(btrim(coalesce(
               (select h.old_nickname from public.nickname_history h
                 where h.user_id = new.id
                   and h.changed_at > least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))
                 order by h.changed_at, h.id limit 1),
               ''))) = lower(btrim(r.nickname));
      -- E4-1003 ⑥: 끝난 시즌 결과(venue_season_results)는 시즌 종료 때 venue_rankings.real_name 을 복사한 스냅샷이라
      --   위 갱신만으로는 탈퇴 회원의 실명이 시즌 결과·명예의 전당에 남는다. 같은 주인 판정(그 시각에 그 이름 + 가입 후)으로
      --   그 시즌·그 이름에 묶인 결과 행의 실명만 지운다. 가입 전 같은 이름 워크인만 있는 시즌은 그대로.
      update public.venue_season_results sr
         set real_name = null
        from public.venue_seasons s
       where s.id = sr.season_id
         and sr.real_name is not null
         and exists (
           select 1 from public.venue_rankings r
            where r.venue_id = s.venue_id
              and r.ranking_date between s.starts_on and s.ends_on
              and lower(btrim(r.nickname)) = lower(btrim(sr.nickname))
              and lower(btrim(r.nickname)) in (select lower(btrim(h.old_nickname)) from public.nickname_history h where h.user_id = new.id)
              and (select u.created_at from auth.users u where u.id = new.id)
                  < least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))
              and lower(btrim(coalesce(
                    (select h.old_nickname from public.nickname_history h
                      where h.user_id = new.id
                        and h.changed_at > least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))
                      order by h.changed_at, h.id limit 1),
                    ''))) = lower(btrim(r.nickname)));
    else
      if v_actor is not null and not v_admin
         and old.nickname_changed_at is not null
         and now() < old.nickname_changed_at + interval '30 days' then
        raise exception '닉네임은 30일에 한 번 변경할 수 있어요 (다음 변경 가능: %)',
          to_char((old.nickname_changed_at + interval '30 days') at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"');
      end if;
      if v_actor is not null and v_actor = new.id then
        new.nickname_changed_at := now();
      end if;
      if nullif(btrim(old.nickname), '') is not null then
        insert into public.nickname_history (user_id, old_nickname, new_nickname, changed_by, source)
        values (new.id, old.nickname, new.nickname, v_actor,
                case when v_actor is null then 'system' when v_actor = new.id then 'user' else 'admin' end);
      end if;
    end if;
  end if;
  if new.nickname is not null then
    new.name := new.nickname;
  end if;
  return new;
end $function$;
revoke all on function public.profiles_nickname_rules() from public, anon, authenticated;
grant execute on function public.profiles_nickname_rules() to service_role;

do $post$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.profiles_nickname_rules'::regproc) is distinct from 'b62d597282183bbb0f6e429bf152567d' then
    raise exception '자가검사: 적용 후 본문 md5 가 초안과 다르다';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.profiles_nickname_rules'::regproc)
     or has_function_privilege('authenticated', 'public.profiles_nickname_rules()', 'execute')
     or has_function_privilege('anon', 'public.profiles_nickname_rules()', 'execute') then
    raise exception '자가검사: DEFINER 또는 실행권 회수가 빠졌다';
  end if;
end $post$;
