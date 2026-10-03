-- ⏳ 적용 전 (DRAFT) — 작성 store-team 2026-10-04 · 적용 판단은 리드 · 라이브 커밋 금지 상태로 리허설만 함(되돌림)
-- 20261004a — 요구 키: 오너 결정 10-04 Q1(nuri-lead 기억 project_owner_decisions_1003.md #3)
--   "가입 전 같은 이름 워크인 순위 기록은 회원의 내 기록·내 우승·시즌 알림으로 인정 안 함 — 그 이름의 주인이 된 시점 이후 기록만."
-- 무엇:
--   ① 판정식 한 벌을 내부 함수로 만든다.
--      _ranking_row_owner_ok(uid, 이름, 첫 저장, 경기일) — t = least(첫 저장, 경기일 끝 KST) 에
--        본인 이력상 그 이름 · t 이전 가입(auth.users.created_at) · 지금 활성. (20261003f·g 의 인라인 식과 같은 식)
--      _season_name_owner_ok(uid, 시즌, 이름) — 그 시즌 기간 그 이름 순위 행이 **전부** 위 판정으로 uid 의 것(리드 P2 결정 10-04:
--        워크인 우승 5회 + 회원 9위 1회인 시즌은 우승 아님 · 같은 시즌 두 회원이 같은 이름을 쓴 경우 둘 다 아님 → 섞인 시즌은 알림 수신자 없음).
--   ② 그 식을 쓰게 바꾼다(라이브 pg_get_functiondef 를 읽어 한 곳만 치환 → execute):
--      my_ranking_history · my_career_standing : nickname_owner_at(...) = auth.uid() → _ranking_row_owner_ok(auth.uid(), …)
--         (nickname_owner_at 은 과거 이력이 없으면 '지금 그 이름 주인' 으로 폴백해 가입 시각·그 시각 이름을 안 본다 — 가입 전 워크인 행이 섞였다)
--      my_championships(본인 분기) : nickname_owner_at(sr.nickname, 시즌 끝) → _season_name_owner_ok(auth.uid(), 시즌, 이름)
--      _end_season_internal · notify_season_deadline : 행 단위 인라인 판정('하나라도')을 _season_name_owner_ok 호출('전부')로 바꾼다
--        → 셋(내 우승·결과 알림·마감 알림)이 같은 시즌 판정을 쓴다. 섞이지 않은 이름의 수신자는 종전과 같다(리허설 대조).
-- 그대로 둔 것: 반환 열·정렬·ACL·search_path, my_championships 의 '남의 닉네임' 분기(공개 이름 단위 카운트), profiles_nickname_rules(탈퇴 실명 지우기 —
--   탈퇴 처리 중인 본인이라 '지금 활성' 조건을 쓸 수 없어 인라인 유지), nickname_owner_at·nickname_display_at(표시용 — 이번 결정 범위 밖).
-- 출발점(라이브 2026-10-04 prosrc md5): my_ranking_history 5338f6ea881ff278902c6879e524437d · my_career_standing 49691b96c1ee359dec8a64dca1e72f3e ·
--   my_championships ccb52d2efaa895b4a914d4465d09a8f3 · _end_season_internal e3602e59e8f8230317882f825890b9ab · notify_season_deadline 5ffa2b8216a6943ef0d96ebc9687f8c3
-- 영향(라이브 2026-10-04 실측): venue_rankings 11 · venue_seasons 0 · venue_season_results 0 · 탈퇴 0 · 빈 이름 행 0.
-- 리허설: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\q1-1004\ (rehearse.mjs — 끝에 예외로 통째 되돌림).
--   2026-10-04 라이브 되돌림 리허설 PASS(10_fixture → 이 파일 → 40_assert): 수정 전 FAIL 관측(가입 전 워크인·개명한 이름의 워크인·
--   이어받은 이름의 옛 행·탈퇴 계정 행이 '내 기록' 에 섞임, 우승 2) → 수정 후 기대값 · 20261003f·g 인라인 식 대비 판정 불일치 0(233쌍) ·
--   f·g 실제 실행 수신자 = 공용 판정 기대 집합. 음성 대조 3종(표류 md5·내부 함수 REVOKE 뺌·활성 조건 뺌) 모두 멈춤/FAIL. 라이브 쓰기 0.
--   (리드 P2 '전부' 규칙 반영 재리허설 PASS: 섞인 시즌 S5 옛 '하나라도' 1 → 0 · 순수 회원 시즌 S2 양성 1 · 마감 알림 {g1,g2} · 결과 알림 손 기대 일치)
-- 적용 뒤 prosrc md5(자가검사에 고정): my_ranking_history 5ae6c3aa9db52bd64691cdc4f05d934c · my_career_standing 3561a3ce4c93ea51f89180c9ce75c7fb ·
--   my_championships 830edfacf09bf16893b08bec2329bf5e · _end_season_internal 227d5a9c2694b4aab648f224215bc237 · notify_season_deadline 35a517d73e430074565ea0e3a7fa66e3
--   (새 함수 _ranking_row_owner_ok 33ed4e26f23fb017e241add5d283bd9e · _season_name_owner_ok e5dacdfd95fa871a51647b00a2826840)
--   ⚠ 재적용하면 출발점 md5 가 달라 '표류' 로 멈춘다(의도 — 두 번 바뀌지 않는다).
-- 줄끝: 이 파일이 CRLF 로 체크아웃돼도 동작하게 치환 조각에서 chr(13) 을 지운다(라이브 본문은 LF).

-- ── ① 공용 판정 ─────────────────────────────────────────────────────────────
create or replace function public._ranking_row_owner_ok(p_uid uuid, p_nickname text, p_created_at timestamptz, p_ranking_date date)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20261004a: 순위 행(이름·첫 저장·경기일)의 주인이 p_uid 인가. 20261003f·g 와 같은 식.
  --   t = least(첫 저장, 경기일 끝 KST) — save_venue_rankings 가 delete+insert 라 재저장마다 created_at 이 now() 가 되므로 경기일 끝으로 묶는다.
  --   주인 = 본인 이력상 t 에 그 이름(t 뒤 첫 개명의 옛 이름, 없으면 지금 이름) + t 이전 가입 + 지금 활성.
  with w as (select least(p_created_at, ((p_ranking_date + 1)::timestamp at time zone 'Asia/Seoul')) as t)
  select p_uid is not null
     and coalesce(btrim(p_nickname), '') <> ''
     and exists (select 1 from auth.users u, w where u.id = p_uid and u.created_at < w.t)
     and exists (select 1 from public.profiles pr where pr.id = p_uid and coalesce(pr.status::text, 'active') = 'active')
     and lower(btrim(coalesce(
           (select h.old_nickname from public.nickname_history h, w
             where h.user_id = p_uid and h.changed_at > w.t
             order by h.changed_at, h.id limit 1),
           (select p.nickname from public.profiles p where p.id = p_uid),
           ''))) = lower(btrim(p_nickname));
$function$;
revoke all on function public._ranking_row_owner_ok(uuid, text, timestamptz, date) from public, anon, authenticated;
grant execute on function public._ranking_row_owner_ok(uuid, text, timestamptz, date) to service_role;

create or replace function public._season_name_owner_ok(p_uid uuid, p_season_id uuid, p_nickname text)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20261004a(리드 P2 결정): 그 시즌 기간 그 이름 순위 행이 **전부** p_uid 의 것일 때만 참.
  --   가입 전 워크인 행이나 다른 회원의 행이 하나라도 섞인 '이름 묶음' 의 시즌 성적은 누구의 것도 아니다(우승·결과/마감 알림 모두).
  with rows as (
    select vr.nickname, vr.created_at, vr.ranking_date
      from public.venue_seasons s
      join public.venue_rankings vr
        on vr.venue_id = s.venue_id and vr.ranking_date between s.starts_on and s.ends_on and vr.nickname = p_nickname
     where s.id = p_season_id)
  select exists (select 1 from rows)
     and not exists (select 1 from rows r
                      where public._ranking_row_owner_ok(p_uid, r.nickname, r.created_at, r.ranking_date) is not true);
$function$;
revoke all on function public._season_name_owner_ok(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public._season_name_owner_ok(uuid, uuid, text) to service_role;

-- ── ② 라이브 본문 한 곳 치환 ─────────────────────────────────────────────────
create or replace function pg_temp.nuri_patch_20261004a(p_fn regprocedure, p_md5 text, p_old text, p_new text)
 returns void language plpgsql as $patch$
declare d text; o text := replace(p_old, chr(13), ''); n text := replace(p_new, chr(13), ''); k int;
begin
  if (select md5(prosrc) from pg_proc where oid = p_fn) is distinct from p_md5 then
    raise exception '표류: 라이브 % 본문이 초안 작성 때(%)와 다르다 — 라이브 본문에서 다시 만들어라', p_fn, p_md5;
  end if;
  d := pg_get_functiondef(p_fn);
  k := (length(d) - length(replace(d, o, ''))) / greatest(length(o), 1);
  if k <> 1 then raise exception '치환 조각이 %에 정확히 1번이 아니다(%번)', p_fn, k; end if;
  execute replace(d, o, n);
end $patch$;

select pg_temp.nuri_patch_20261004a('public.my_ranking_history(integer)'::regprocedure, '5338f6ea881ff278902c6879e524437d',
  $o$public.nickname_owner_at(r.nickname, least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))) = auth.uid()$o$,
  $n$public._ranking_row_owner_ok(auth.uid(), r.nickname, r.created_at, r.ranking_date) /* 20261004a Q1: 가입 전 같은 이름 워크인 제외 */$n$);

select pg_temp.nuri_patch_20261004a('public.my_career_standing(date)'::regprocedure, '49691b96c1ee359dec8a64dca1e72f3e',
  $o$public.nickname_owner_at(r.nickname, least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))) = auth.uid()$o$,
  $n$public._ranking_row_owner_ok(auth.uid(), r.nickname, r.created_at, r.ranking_date) /* 20261004a Q1: 가입 전 같은 이름 워크인 제외 */$n$);

select pg_temp.nuri_patch_20261004a('public.my_championships(text)'::regprocedure, 'ccb52d2efaa895b4a914d4465d09a8f3',
  $o$public.nickname_owner_at(sr.nickname, coalesce(s.ends_on::timestamptz, now())) = auth.uid()$o$,
  $n$public._season_name_owner_ok(auth.uid(), sr.season_id, sr.nickname) /* 20261004a Q1: 그 시즌 그 이름 행의 주인일 때만(20261003f 와 같은 규칙) */$n$);

-- f·g 의 인라인 판정(같은 글자·같은 들여쓰기 — 2026-10-04 라이브 두 함수 모두 1번씩 확인) → 공용 함수 호출
select pg_temp.nuri_patch_20261004a(x.fn, x.m,
  $o$          cross join lateral (select least(vr.created_at, ((vr.ranking_date + 1)::timestamp at time zone 'Asia/Seoul')) as t) w
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
$o$,
  replace($n$          -- 20261004a: 판정식 한 벌 — public._season_name_owner_ok(그 시즌 그 이름 행이 전부 이 회원 것: t 에 본인 이력상 그 이름 · t 이전 가입 · 지금 활성).
          --   섞인 이름(가입 전 워크인·다른 회원 행 포함)은 수신자 없음(리드 P2 결정 10-04, 내 우승과 같은 판정).
          cross join lateral (
            select x.uid from (
              select h.user_id as uid from public.nickname_history h where lower(btrim(h.old_nickname)) = lower(btrim(vr.nickname))
              union
              select p.id from public.profiles p where lower(btrim(p.nickname)) = lower(btrim(vr.nickname))
            ) x
            where public._season_name_owner_ok(x.uid, __SEASON__, vr.nickname)
          ) c
$n$, '__SEASON__', x.sx))
from (values ('public._end_season_internal(uuid)'::regprocedure, 'e3602e59e8f8230317882f825890b9ab', 'p_season_id'),
             ('public.notify_season_deadline()'::regprocedure,   '5ffa2b8216a6943ef0d96ebc9687f8c3', 'se.id')) x(fn, m, sx);

-- ── 자가검사 ────────────────────────────────────────────────────────────────
do $post$
declare f record;
begin
  -- 새 본문에 공용 함수 호출이 있고 옛 판정이 없다
  for f in select * from (values
      ('public.my_ranking_history(integer)'::regprocedure, '_ranking_row_owner_ok(auth.uid()', 'nickname_owner_at'),
      ('public.my_career_standing(date)'::regprocedure,    '_ranking_row_owner_ok(auth.uid()', 'nickname_owner_at'),
      ('public.my_championships(text)'::regprocedure,      '_season_name_owner_ok(auth.uid()', 'nickname_owner_at'),
      ('public._end_season_internal(uuid)'::regprocedure,  '_season_name_owner_ok(x.uid, p_season_id, vr.nickname)', 'u.created_at < w.t'),
      ('public.notify_season_deadline()'::regprocedure,    '_season_name_owner_ok(x.uid, se.id, vr.nickname)',       'u.created_at < w.t')) v(fn, must, gone)
  loop
    if position(f.must in (select prosrc from pg_proc where oid = f.fn)) = 0
       or position(f.gone in (select prosrc from pg_proc where oid = f.fn)) > 0 then
      raise exception '자가검사: % 치환 결과가 기대와 다르다', f.fn;
    end if;
    if not (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = f.fn) then
      raise exception '자가검사: % DEFINER/search_path 가 빠졌다', f.fn;
    end if;
  end loop;
  -- 앞 마이그레이션이 넣은 것이 살아 있다(라이브 전용 변경을 덮지 않았다)
  if position('least(vr.created_at' in (select prosrc from pg_proc where oid = 'public._end_season_internal(uuid)'::regprocedure)) > 0
     or position('20261003f L-10' in (select prosrc from pg_proc where oid = 'public._end_season_internal(uuid)'::regprocedure)) = 0
     or position('20261003g L-10' in (select prosrc from pg_proc where oid = 'public.notify_season_deadline()'::regprocedure)) = 0
     or position('20261002x L-09' in (select prosrc from pg_proc where oid = 'public.my_career_standing(date)'::regprocedure)) = 0 then
    raise exception '자가검사: 앞 마이그레이션(20261003c·f·g) 표식이 사라졌거나 옛 식이 남았다';
  end if;
  -- 적용 뒤 본문 md5 고정(2026-10-04 되돌림 리허설 실측 — 적용 직후 리드 대조값과 같다)
  if exists (select 1 from (values
      ('public.my_ranking_history(integer)'::regprocedure, '5ae6c3aa9db52bd64691cdc4f05d934c'),
      ('public.my_career_standing(date)'::regprocedure,    '3561a3ce4c93ea51f89180c9ce75c7fb'),
      ('public.my_championships(text)'::regprocedure,      '830edfacf09bf16893b08bec2329bf5e'),
      ('public._end_season_internal(uuid)'::regprocedure,  '227d5a9c2694b4aab648f224215bc237'),
      ('public.notify_season_deadline()'::regprocedure,    '35a517d73e430074565ea0e3a7fa66e3'),
      ('public._ranking_row_owner_ok(uuid, text, timestamptz, date)'::regprocedure, '33ed4e26f23fb017e241add5d283bd9e'),
      ('public._season_name_owner_ok(uuid, uuid, text)'::regprocedure,              'e5dacdfd95fa871a51647b00a2826840')) v(fn, m)
     -- chr(13) 제거 후 비교: 새 함수 둘은 이 파일 글자로 만들어져 CRLF 체크아웃이면 본문에 CR 이 들어간다(동작은 같다)
     where (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = v.fn) is distinct from v.m) then
    raise exception '자가검사: 적용 뒤 본문 md5 가 리허설 실측값과 다르다';
  end if;
  -- ACL: 새 내부 함수는 anon·authenticated 불가 · 바꾼 함수의 ACL 은 그대로
  if has_function_privilege('anon', 'public._ranking_row_owner_ok(uuid, text, timestamptz, date)', 'execute')
     or has_function_privilege('authenticated', 'public._ranking_row_owner_ok(uuid, text, timestamptz, date)', 'execute')
     or has_function_privilege('anon', 'public._season_name_owner_ok(uuid, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public._season_name_owner_ok(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.my_ranking_history(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.my_ranking_history(integer)', 'execute')
     or has_function_privilege('anon', 'public.my_career_standing(date)', 'execute')
     or not has_function_privilege('authenticated', 'public.my_career_standing(date)', 'execute')
     or not has_function_privilege('authenticated', 'public.my_championships(text)', 'execute')
     or has_function_privilege('authenticated', 'public._end_season_internal(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_season_deadline()', 'execute') then
    raise exception '자가검사: ACL 이 기대와 다르다';
  end if;
end $post$;
