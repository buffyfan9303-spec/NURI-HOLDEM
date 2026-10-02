-- ✅ 적용 완료 2026-10-03 (리드, Management API). 되돌림 리허설 PASS(수정 전 FAIL·후 PASS, 워크인 행 불변 양성 대조) · advisors ERROR 0 · critical-reviewer 설계·리허설
-- 20261003a — 적용됨 · 요구 키 audit-link-1002.md#L-10 · 작성 critical-reviewer 2026-10-02, 오너 결정 10-03 반영
-- 무엇: ① 탈퇴(status→withdrawn)가 nickname_history 를 지우지 않고, 탈퇴 때 이름 놓기를 한 줄 더 남긴다(트리거 profiles_nickname_rules).
--         → nickname_owner_at(옛닉, 탈퇴 전 시각) 이 그 닉네임의 새 주인이 아니라 탈퇴 계정을 가리킨다.
--       ② my_ranking_history 의 판정 시각을 created_at → least(created_at, 경기일 끝 KST) 로 바꾼다
--         (save_venue_rankings 는 delete+insert 라 재저장 때 created_at=now() 가 되어, 닉네임을 넘긴 사람의 옛 기록이 새 주인에게 갔다).
-- 출발점(라이브): profiles_nickname_rules def f8a13f93b85d7cf83097b5a14ac6f4c0 / prosrc 16f19fdc6085f47b00d258e17243ecee
--                 my_ranking_history     def 848860131afe6f3259545e397b3bc556 / prosrc 60b41321686bdc2988efecda6d51d995
-- 적용 후 prosrc: profiles_nickname_rules 10ce703fd3c9f11d2b8884b3cab838fc · my_ranking_history 5338f6ea881ff278902c6879e524437d
-- 전이 폐쇄: nickname_history 를 읽는 함수 7개(nickname_owner_at · my_nickname_aliases · _ranking_optin_real_name · is_my_shift_row ·
--   search_voucher_recipients · profiles_nickname_rules · (간접) nickname_display_at·my_championships·my_ranking_history).
--   남긴 탈퇴자 이력은 위 공개 경로에서 status·본인 조건으로 가려진다(리허설 단언). nickname_history 는 anon·authenticated GRANT 0 · RLS on.
-- 영향(2026-10-02 라이브 실측): 탈퇴 프로필 0 → 지금 잘못 돌아간 행 0. 순위 행 11 중 소유자 판정 행 4.
-- ⚠ 기존 탈퇴자의 이미 지워진 이력은 되살릴 수 없다(라이브 0명이라 해당 없음).
-- 오너 결정(10-03): ① 탈퇴자 순위 기록 유지 + 탈퇴 계정에 묶음(내부 이력 보존 OK) ② 그 회원에게 묶인 행의 업주 기록 실명(real_name)은 탈퇴 때 null.
--   ②의 주인 판정: 본인 이력상 그 시각에 그 이름 + 그 시각 이전 가입. 가입 전 같은 이름 워크인 행은 그대로(리허설 양성 대조).
-- 리허설: names-1002/l10_rehearse.sql. 파일명은 리드 지정(20261003a). 라이브 미적용.
do $pre_profiles_nickname_rules$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.profiles_nickname_rules'::regproc) is distinct from '16f19fdc6085f47b00d258e17243ecee' then
    raise exception '표류: 라이브 profiles_nickname_rules 본문이 초안 작성 때(16f19fdc6085f47b00d258e17243ecee)와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre_profiles_nickname_rules$;
do $pre_my_ranking_history$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_ranking_history'::regproc) is distinct from '60b41321686bdc2988efecda6d51d995' then
    raise exception '표류: 라이브 my_ranking_history 본문이 초안 작성 때(60b41321686bdc2988efecda6d51d995)와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
end $pre_my_ranking_history$;

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

CREATE OR REPLACE FUNCTION public.my_ranking_history(p_limit integer DEFAULT 30)
 RETURNS TABLE(ranking_date date, "position" integer, prize text, venue_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with al as (select distinct lower(btrim(a.nickname)) as k from public.my_nickname_aliases() a where a.nickname is not null)
  select r.ranking_date, r."position", r.prize, coalesce(v.name, '(매장)')
    from public.venue_rankings r
    join al on lower(btrim(r.nickname)) = al.k
    left join public.venues v on v.id = r.venue_id
   where auth.uid() is not null
     -- 20261002x L-10: 판정 시각 = 첫 저장과 경기일 끝(KST) 중 이른 쪽. save_venue_rankings 는 delete+insert 라 재저장마다 created_at 이 now() 가 된다.
     and public.nickname_owner_at(r.nickname, least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))) = auth.uid()
   order by r.ranking_date desc, r.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 200);
$function$;
revoke all on function public.my_ranking_history(integer) from public, anon, authenticated;
grant execute on function public.my_ranking_history(integer) to authenticated, service_role;

do $post_profiles_nickname_rules$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.profiles_nickname_rules'::regproc) is distinct from '10ce703fd3c9f11d2b8884b3cab838fc' then
    raise exception '자가검사: profiles_nickname_rules 새 본문 md5 가 기대(10ce703fd3c9f11d2b8884b3cab838fc)와 다르다';
  end if;
  if (select md5(replace(p.prosrc, '      -- 20261002x L-10: 이력을 지우지 않는다. 지우면 nickname_owner_at 이 탈퇴자의 옛 순위 기록을 그 닉네임의 새 주인에게 돌려준다.
      --   탈퇴 때 이름을 놓은 기록을 한 줄 더 남겨, 탈퇴 전 기록의 주인이 탈퇴 계정으로 남게 한다(공개 함수는 status 로 가린다).
      if nullif(btrim(old.nickname), '''') is not null then
        insert into public.nickname_history (user_id, old_nickname, new_nickname, changed_by, source)
        values (new.id, old.nickname, new.nickname, v_actor, ''system'');
      end if;
      -- 20261003a: 오너 결정(10-03) — 업주가 적은 순위 실명(venue_rankings.real_name)은 그 회원이 탈퇴하면 지운다(본인·관리자 탈퇴 모두 이 트리거를 탄다).
      --   그 회원에게 묶이는 행만: 판정 시각 t = least(첫 저장, 경기일 끝 KST)(my_ranking_history 와 같은 시각)에
      --   ① 본인 이력상 그 회원이 그 이름을 쓰고 있었고 ② 이미 가입해 있었던 행. 가입 전 같은 이름 워크인 행은 건드리지 않는다.
      update public.venue_rankings r
         set real_name = null
       where r.real_name is not null
         and lower(btrim(r.nickname)) in (select lower(btrim(h.old_nickname)) from public.nickname_history h where h.user_id = new.id)
         and (select u.created_at from auth.users u where u.id = new.id)
             < least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone ''Asia/Seoul''))
         and lower(btrim(coalesce(
               (select h.old_nickname from public.nickname_history h
                 where h.user_id = new.id
                   and h.changed_at > least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone ''Asia/Seoul''))
                 order by h.changed_at, h.id limit 1),
               ''''))) = lower(btrim(r.nickname));
', '      delete from public.nickname_history where user_id = new.id;
')) from pg_proc p where p.oid = 'public.profiles_nickname_rules'::regproc) is distinct from '16f19fdc6085f47b00d258e17243ecee' then
    raise exception '자가검사: profiles_nickname_rules 에서 의도한 줄 밖이 바뀌었다';
  end if;
end $post_profiles_nickname_rules$;
do $post_my_ranking_history$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.my_ranking_history'::regproc) is distinct from '5338f6ea881ff278902c6879e524437d' then
    raise exception '자가검사: my_ranking_history 새 본문 md5 가 기대(5338f6ea881ff278902c6879e524437d)와 다르다';
  end if;
  if (select md5(replace(p.prosrc, '     -- 20261002x L-10: 판정 시각 = 첫 저장과 경기일 끝(KST) 중 이른 쪽. save_venue_rankings 는 delete+insert 라 재저장마다 created_at 이 now() 가 된다.
     and public.nickname_owner_at(r.nickname, least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone ''Asia/Seoul''))) = auth.uid()
', '     and public.nickname_owner_at(r.nickname, r.created_at) = auth.uid()
')) from pg_proc p where p.oid = 'public.my_ranking_history'::regproc) is distinct from '60b41321686bdc2988efecda6d51d995' then
    raise exception '자가검사: my_ranking_history 에서 의도한 줄 밖이 바뀌었다';
  end if;
end $post_my_ranking_history$;

do $acl_ten$ begin
  if has_function_privilege('anon', 'public.profiles_nickname_rules()', 'execute') is distinct from false
     or has_function_privilege('authenticated', 'public.profiles_nickname_rules()', 'execute') is distinct from false then
    raise exception '자가검사: profiles_nickname_rules() ACL 이 기대(anon=false, authenticated=false)와 다르다';
  end if;
  if has_function_privilege('anon', 'public.my_ranking_history(integer)', 'execute') is distinct from false
     or has_function_privilege('authenticated', 'public.my_ranking_history(integer)', 'execute') is distinct from true then
    raise exception '자가검사: my_ranking_history(integer) ACL 이 기대(anon=false, authenticated=true)와 다르다';
  end if;
end $acl_ten$;
