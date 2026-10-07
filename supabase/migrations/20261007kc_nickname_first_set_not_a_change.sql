-- ⏳ 미적용 — 초안(home-team, 2026-10-07). 적용 판단·실행은 리드. 리허설: supabase/tests/20261007kc_rehearsal.sql
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다.
select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- 20261007kc — 소셜 가입 첫 동의 화면의 닉네임 설정은 30일 1회 변경으로 세지 않는다(critical-211 P3-3).
--
-- 함수 본문은 2026-10-07 라이브 pg_get_functiondef 를 그대로 옮기고 nickname_changed_at 을 찍는 if 하나만 바꿨다
--   (생성: scratchpad k211fix/gen_kc.py — 손으로 옮겨 적지 않았다). 아래 출발점 게이트가 라이브 본문이 그때와 같은지 md5 로 확인한다 —
--   다르면 그 사이 누가 이 함수를 바꾼 것이니 덮어쓰지 말고 멈춘다.
-- 이메일 가입자는 영향 없다(가입 때 agreed_to_terms=true). 동의 전 계정 1개(2026-10-07 실측, 탈퇴 제외)가 한 번 무료 변경을 얻는다.

do $gate$
begin
  if md5(pg_get_functiondef('public.profiles_nickname_rules()'::regprocedure)) <> 'a6d567c7c60a268e4f537e2bcaded639' then
    raise exception '20261007kc 출발점 게이트: profiles_nickname_rules 가 2026-10-07 라이브 본문과 다르다 — 바뀐 내용을 먼저 확인할 것';
  end if;
end $gate$;

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
      -- 20261007kc(critical-211 P3-3): 첫 동의 전 첫 설정은 '변경' 으로 세지 않는다(30일 시계를 켜지 않는다).
      --   이메일 가입자는 가입 폼에서 닉네임을 정한 뒤 한 번 더 바로 바꿀 수 있다(첫 변경은 기록이 없어 바로).
      --   소셜 가입자는 그 폼 대신 첫 동의 화면(ConsentGateModal)에서 정한다 — 그게 변경으로 찍히면 오타를 내도 30일을 기다린다.
      --   판정은 서버 값으로만: 아직 약관 동의 전(agreed_to_terms 가 true 아님) · 시계가 꺼져 있음 · 본인 변경 이력 0건.
      --   클라이언트가 '첫 설정' 을 주장할 길이 없고, 동의 전이라도 무료는 딱 한 번이다(그 변경이 본인 이력 1건을 남긴다).
      if v_actor is not null and v_actor = new.id
         and not (old.agreed_to_terms is not true
                  and old.nickname_changed_at is null
                  and not exists (select 1 from public.nickname_history h where h.user_id = new.id and h.source = 'user')) then
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

-- 자가검사
do $self$
begin
  if pg_get_functiondef('public.profiles_nickname_rules()'::regprocedure) !~ 'old\.agreed_to_terms is not true' then
    raise exception '20261007kc 자가검사: 첫 설정 예외가 들어가지 않았다'; end if;
  if pg_get_functiondef('public.profiles_nickname_rules()'::regprocedure) !~ '닉네임은 30일에 한 번' then
    raise exception '20261007kc 자가검사: 30일 규칙이 사라졌다'; end if;
  if has_function_privilege('authenticated', 'public.profiles_nickname_rules()', 'execute')
     or has_function_privilege('anon', 'public.profiles_nickname_rules()', 'execute') then
    raise exception '20261007kc 자가검사: 트리거 함수가 클라이언트에 열려 있다'; end if;
end $self$;

-- ROLLBACK: 위 함수 본문에서 20261007kc 주석과 `and not (...)` 세 줄을 빼고(= 라이브 md5 a6d567c7c60a268e4f537e2bcaded639 본문) 다시 적용한다.
