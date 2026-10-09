-- ⏳ 미적용(2026-10-09 초안 · store-team). 적용·리허설·커밋 판단은 nuri-lead. 적용 경로: MCP execute_sql 로 이 파일 전문(nuri-migration §0).
--
-- 요구: audit-open-1009 r1-result.json SEC-01(P2) — client_errors 속도 제한 우회 · user_id 위조.
--   라이브(2026-10-09 읽기 전용 조회, fix-db/q/a1_client_errors.out.json):
--     정책 client_errors_insert (anon, authenticated) WITH CHECK = 길이 상한 AND client_error_rate_ok()
--     client_error_rate_ok() 는 로그인이면 user_id = auth.uid() 인 최근 1분 행 < 15, 비로그인이면 user_id IS NULL 인 최근 1분 행 < 60 을 센다.
--     표 ACL anon=arm · authenticated=arwdm → 두 역할 모두 user_id·created_at·id 칸에 INSERT 가능, 트리거 0, FK 0.
--   그래서 (1) user_id 에 아무 uuid 를 넣으면 '최근 1분' 집계에 안 잡혀 상한이 없고, (2) created_at 을 과거로 넣어도 집계를 피하며,
--   (3) 회원은 남의 user_id 로 기록을 남겨 관리자 오류 화면(AdminTab select *)을 오염시킬 수 있었다.
--   격리 재현(감사): verify-security/pglite_client_errors.out.txt — 현행 B·C·E 100/100 통과, 제안 수정 0/100.
--
-- 무엇:
--   ① INSERT 를 표 단위에서 칸 단위로 좁힌다 — 앱(src/lib/errorLog.ts logClientError)이 보내는 다섯 칸
--      user_id·message·stack·url·user_agent 만. id·created_at 은 서버 기본값(gen_random_uuid()·now())만 쓰인다.
--   ② 정책 CHECK 에 user_id IS NOT DISTINCT FROM auth.uid() 를 더한다 — 비로그인은 NULL 만, 회원은 자기 id 만(NULL-safe).
--   SELECT·DELETE(관리자 정책)·client_error_rate_ok()·purge 함수는 그대로다.
-- 앱 양성 경로: errorLog.ts 는 user_id = (await currentUser())?.id ?? null — currentUser 는 supabase.auth.getSession() 의 세션 id 이고
--   같은 세션의 토큰이 요청에 실리므로 auth.uid() 와 같다. 다른 칸은 보내지 않는다(id·created_at 미전송). .select() 없음(return=minimal).
--   src 전체에서 client_errors 에 INSERT 하는 곳은 errorLog.ts 하나(monitoring.ts·ErrorBoundary 는 logClientError 를 거친다).
-- 리허설: supabase/tests/20261009t_rehearsal.sql (이 파일 뒤에 이어 붙여 rehearse.mjs 로).

-- ① 칸 단위 INSERT
revoke insert on table public.client_errors from anon, authenticated;
grant insert (user_id, message, stack, url, user_agent) on table public.client_errors to anon, authenticated;

-- ② user_id 결속(ALTER — 정책을 지웠다 다시 만들지 않는다)
alter policy client_errors_insert on public.client_errors
  with check (
    char_length(coalesce(message, ''::text)) <= 2000
    and char_length(coalesce(stack, ''::text)) <= 6000
    and user_id is not distinct from (select auth.uid())
    and public.client_error_rate_ok()
  );

-- 자가검사(실패하면 전체가 되돌아간다)
do $selfcheck$
declare r text; c text; v_chk text; v_roles text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach c in array array['user_id', 'message', 'stack', 'url', 'user_agent'] loop
      if not has_column_privilege(r, 'public.client_errors', c, 'INSERT') then
        raise exception '20261009t: % 가 %.INSERT 를 잃었다 — 앱 오류 기록이 막힌다', r, c;
      end if;
    end loop;
    foreach c in array array['id', 'created_at'] loop
      if has_column_privilege(r, 'public.client_errors', c, 'INSERT') then
        raise exception '20261009t: % 가 아직 %.INSERT 를 가진다', r, c;
      end if;
    end loop;
    if has_table_privilege(r, 'public.client_errors', 'INSERT') then
      raise exception '20261009t: % 에 표 단위 INSERT 가 남았다(칸 제한 무효)', r;
    end if;
  end loop;
  -- 관리자 읽기 경로(SELECT 표 권한)는 그대로여야 한다
  if not has_table_privilege('authenticated', 'public.client_errors', 'SELECT') then
    raise exception '20261009t: authenticated SELECT 가 사라졌다 — 관리자 오류 화면이 막힌다';
  end if;
  select pg_get_expr(pol.polwithcheck, pol.polrelid), array_to_string(array(select rolname from pg_roles where oid = any(pol.polroles) order by 1), '/')
    into v_chk, v_roles
    from pg_policy pol where pol.polrelid = 'public.client_errors'::regclass and pol.polname = 'client_errors_insert';
  -- PG 는 IS NOT DISTINCT FROM 을 NOT (x IS DISTINCT FROM y) 로 되돌려 적는다(PGlite 18 실측) — 두 모양 모두 받는다.
  if v_chk is null or v_chk !~ '(user_id IS NOT DISTINCT FROM|NOT \(user_id IS DISTINCT FROM)' or v_chk !~ 'auth\.uid\(\)' or v_chk !~ 'client_error_rate_ok\(\)' then
    raise exception '20261009t: 정책 CHECK 가 기대와 다르다: %', v_chk;
  end if;
  if v_roles is distinct from 'anon/authenticated' then
    raise exception '20261009t: 정책 대상 역할이 바뀌었다: %', v_roles;
  end if;
  perform set_config('open_reset.report', coalesce(current_setting('open_reset.report', true), '') || '[20261009t 자가검사 통과] ', true);
end $selfcheck$;
