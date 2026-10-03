-- ⏳ 적용 전 — 리드 적용 예정. 라이브 미적용. (store-team 2026-10-03 · critical-reviewer recheck1 R2 초안 확장)
-- 요구 키: recheck1-security-1003.md#R2 · 리드 지시(URL 은 https + 우리 storage 공개 URL 만, javascript:/data:/외부 금지, 크기 상한)
-- 무엇: venues.page_config 는 업주가 쓰는 자유 JSON 이고 비로그인도 읽는다. 클락 배경 URL 검증은 화면(sanitizeClockTheme)만 했다.
--   서버에서도 판정한다 — 판정기는 한 벌(_venue_page_config_problem)이고 트리거와 아래 기존 값 전수 검사가 같은 함수를 쓴다.
--   ① 전체 64KB 상한
--   ② 값 안의 **모든 문자열**: URL·스킴처럼 생긴 값(javascript:·data:·vbscript:·http(s):·ftp:·file:·blob:·'//' 시작)은
--      https://<우리 프로젝트>.supabase.co/storage/v1/object/public/ 공개 경로만 허용(외부 호스트·다른 스킴 금지)
--   ③ clockTheme.background.image 는 clock_bg/<그 매장 id>/<파일명> 만 — 화면 isAllowedClockBgUrl 과 같은 조건(512자 · '..'·따옴표·괄호·공백·역슬래시 없음)
-- 기존 값(라이브 2026-10-03 조회): page_config 있는 매장 2곳 · 최대 252B · URL·이미지 값 0 → 아래 전수 검사 위반 0 예상.
--   위반 행이 있으면 지우지 않고 **멈춘다**(적용 전 리드가 보고받는다 — 지우거나 고치는 것은 오너 결정).
-- 리허설: Documents/누리홀덤_영상분석_0930/recheck1-sec-fix-1003 — node rehearse.mjs 00_harness.sql <이 파일> 70_page_config_check.sql

create or replace function public._venue_page_config_problem(p_id uuid, p_cfg jsonb)
 returns text
 language sql
 immutable
 set search_path = public, pg_temp
as $function$
  select case
    when p_cfg is null then null
    when octet_length(p_cfg::text) > 65536 then '매장 설정이 너무 큽니다'
    when exists (
      select 1 from jsonb_path_query(p_cfg, 'strict $.**') v
       where jsonb_typeof(v) = 'string'
         -- critical 재리허설(2026-10-03 밤) 우회 6종: 스킴 중간 탭·개행 · 앞 제어문자(브라우저 URL 파서가 지운다) · 역슬래시 두 개/'/' 시작 ·
         --   intent:·mailto: — 공백·제어문자를 지운 뒤 위험 스킴 목록 + 슬래시/역슬래시 두 개 연속을 본다.
         --   ⚠ '아무 스킴이나' 막지 않는다 — 라이브 값 custom:cgt6pzq(커스텀 순위 보드 키)가 막힌다.
         and regexp_replace(v #>> '{}', E'[\\x00-\\x20\\x7f]', '', 'g')
               ~* E'^((javascript|data|vbscript|https?|ftp|file|blob|intent|mailto|tel|sms|wss?):|[\\\\/]{2})'
         and (v #>> '{}') !~ '^https://idsxiqspecrucvfvtgbw\.supabase\.co/storage/v1/object/public/[a-z0-9_-]+/[^"''()\\\s]*$'
    ) then '매장 설정에 허용되지 않은 주소가 있습니다(우리 저장소 이미지 주소만 쓸 수 있습니다)'
    when (p_cfg #>> '{clockTheme,background,image}') is not null
         and ( (p_cfg #>> '{clockTheme,background,image}') !~ ('^https://idsxiqspecrucvfvtgbw\.supabase\.co/storage/v1/object/public/clock_bg/' || p_id::text || '/[A-Za-z0-9._-]+$')
               or position('..' in (p_cfg #>> '{clockTheme,background,image}')) > 0
               or length(p_cfg #>> '{clockTheme,background,image}') > 512 )
      then '클락 배경은 이 매장에 올린 이미지만 쓸 수 있습니다'
    else null
  end
$function$;
revoke all on function public._venue_page_config_problem(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._venue_page_config_problem(uuid, jsonb) to service_role;

-- SECURITY DEFINER(critical 재리허설): INVOKER 면 업주가 venues 를 직접 UPDATE 할 때 판정 함수 실행권(회수됨) 때문에
--   판정 문구 대신 '42501 permission denied for function' 이 났다. 실행권은 아래에서 anon·authenticated 모두 회수한다(트리거로만 돈다).
create or replace function public._venue_page_config_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_err text;
begin
  v_err := public._venue_page_config_problem(new.id, new.page_config);
  if v_err is not null then
    raise exception '%', v_err using errcode = '22023';
  end if;
  return new;
end $function$;
revoke all on function public._venue_page_config_guard() from public, anon, authenticated;
grant execute on function public._venue_page_config_guard() to service_role;
drop trigger if exists trg_venue_page_config_guard on public.venues;
create trigger trg_venue_page_config_guard before insert or update of page_config on public.venues
  for each row execute function public._venue_page_config_guard();

do $check$
declare n int; ex text;
begin
  -- 기존 값 전수 — 같은 판정기. 위반이 있으면 적용을 멈추고 매장 id 를 보고한다(행은 건드리지 않는다).
  select count(*), string_agg(id::text || ':' || public._venue_page_config_problem(id, page_config), ' | ')
    into n, ex from public.venues where public._venue_page_config_problem(id, page_config) is not null;
  if n > 0 then raise exception '20261003j: 기존 page_config % 건이 새 검사를 통과하지 못한다 — 지우지 말고 리드에게 보고: %', n, ex; end if;
  if not (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public._venue_page_config_guard()'::regprocedure) then
    raise exception '20261003j: 트리거 함수가 DEFINER·search_path 고정이 아니다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'trg_venue_page_config_guard' and tgenabled <> 'D') then
    raise exception '20261003j: 트리거가 없다';
  end if;
  if has_function_privilege('anon', 'public._venue_page_config_guard()', 'execute') or has_function_privilege('authenticated', 'public._venue_page_config_guard()', 'execute')
     or has_function_privilege('anon', 'public._venue_page_config_problem(uuid,jsonb)', 'execute') or has_function_privilege('authenticated', 'public._venue_page_config_problem(uuid,jsonb)', 'execute') then
    raise exception '20261003j: 내부 함수를 anon·authenticated 가 실행할 수 있다';
  end if;
  -- 판정기 자체 단언(알려진 입력 → 기대 출력)
  if public._venue_page_config_problem(gen_random_uuid(), '{"a":"javascript:alert(1)"}') is null
     or public._venue_page_config_problem(gen_random_uuid(), '{"a":{"b":["data:text/html,x"]}}') is null
     or public._venue_page_config_problem(gen_random_uuid(), '{"a":"https://evil.example/x.png"}') is null
     or public._venue_page_config_problem(gen_random_uuid(), '{"a":"//evil.example/x"}') is null
     or public._venue_page_config_problem(gen_random_uuid(), jsonb_build_object('a', E'java\tscript:alert(1)')) is null
     or public._venue_page_config_problem(gen_random_uuid(), jsonb_build_object('a', chr(1) || 'javascript:alert(1)')) is null
     or public._venue_page_config_problem(gen_random_uuid(), jsonb_build_object('a', E'\\\\evil.example/a.png')) is null
     or public._venue_page_config_problem(gen_random_uuid(), jsonb_build_object('a', E'/\\evil.example/a.png')) is null
     or public._venue_page_config_problem(gen_random_uuid(), '{"a":"intent://x#Intent;end"}') is null
     or public._venue_page_config_problem(gen_random_uuid(), '{"a":"mailto:a@b.c"}') is null
     or public._venue_page_config_problem(gen_random_uuid(), '{"rankMetrics":["prize","custom:cgt6pzq"]}') is not null
     or public._venue_page_config_problem(gen_random_uuid(), '{"logo":"https://idsxiqspecrucvfvtgbw.supabase.co/storage/v1/object/public/posters/a.webp"}') is not null
     or public._venue_page_config_problem(gen_random_uuid(), '{"customBoards":[{"key":"k","name":"월요 토너 킹"}],"rankMetrics":["prize"]}') is not null then
    raise exception '20261003j: 판정기 자체 단언 실패';
  end if;
end $check$;
