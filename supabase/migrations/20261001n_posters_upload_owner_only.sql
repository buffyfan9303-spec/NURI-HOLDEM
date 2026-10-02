-- ✅ 적용 완료 2026-10-02 (리드, Management API) — 수정판(그룹 소유 회원 차단 v.kind='venue'). 리허설: 수정판 P1~P5 ok·N1~N5 rls / 현행 정책은 N2(매장0 업주) ok = 막은 구멍. 적용 후 같은 블록 재실행 OK. advisors ERROR 0
-- ⏳ 미적용 초안 — critical-reviewer 2026-10-02 수정판(A3 ①). 원본: origin/main supabase/migrations/20261001n_posters_upload_owner_only.sql (cab5b563)
--    원본과 다른 점은 한 곳: 소유 절에 `and v.kind = 'venue'` 를 넣었다(+ 자가검사 1줄, 리허설 4건 추가).
--    왜: 원본의 `exists (venues where owner_id = 나)` 는 **그룹(kind <> 'venue')** 도 센다. create_group 은 role 'user' 를 포함한
--       모든 로그인 회원이 실행할 수 있다(라이브 2026-10-02: EXECUTE authenticated=t, 본문 가드는 auth.uid() is null 뿐).
--       → 원본을 적용하면 일반 회원이 그룹 하나를 만들어 포스터 버킷에 올릴 수 있게 된다 = 지금보다 **넓어진다**.
--       업로드 호출부 5곳(PosterFormModal·VenueManageTab 첫 매장·TournamentClock·HomeBannersCard·SystemSwitchesCard) 중 그룹 화면은 0곳이라
--       kind 를 좁혀도 잃는 흐름이 없다.
--    선행 조건 확인(2026-10-02): ca54e515(매장 생성 → 사진 업로드 순서)는 origin/main 에 있고, 운영 번들 VenueManageTab-s3B0Nw5a.js 에
--       새 순서 문구('대표 사진은 올리지 못했습니다')가 실려 있다 → 배포 완료.
--    적용은 이 파일 전체(REHEARSAL 주석 블록 제외)를 한 번의 execute_sql 로. 적용 판단·리허설은 리드.
--
-- 라이브 실측(2026-10-02, 바꾸기 전): posters_upload WITH CHECK md5 3e465a2f3bbd5e9df8c6001f4caee7c9 (원본 게이트와 같다).
--   계정 분포에서 판정이 바뀌는 사람은 0명(admin 3 · venue_owner 4 · user 12 · venue_staff 3 — 원본·수정판 모두 지금 판정과 같다).
--   차이는 '일반 회원 + 그룹 생성' 반사실 경로 하나다.

do $$
begin
  if (select md5(with_check) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'posters_upload')
       is distinct from '3e465a2f3bbd5e9df8c6001f4caee7c9' then
    raise exception '20261001n 게이트: posters_upload 가 초안 작성 때와 다르다';
  end if;
  if not has_function_privilege('authenticated', 'public.is_any_venue_manager()', 'execute') then
    raise exception '20261001n 게이트: is_any_venue_manager 를 authenticated 가 실행할 수 없다 — 정책이 42501 로 깨진다';
  end if;
end $$;

alter policy posters_upload on storage.objects
  with check ((bucket_id = 'posters'::text)
              and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
              and (public.is_any_venue_manager()
                   or exists (select 1 from public.venues v
                               where v.owner_id = (select auth.uid())
                                 and v.kind = 'venue')));

-- 자가검사
do $$
declare q text := (select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'posters_upload');
begin
  if q ~ 'my_role\(\)' then
    raise exception '20261001n: 역할만 보는 절이 남아 있다';
  end if;
  if q !~ 'owner_id = \( SELECT auth\.uid\(\)' or q !~ 'is_any_venue_manager\(\)' then
    raise exception '20261001n: 매장 소유·운영자 조건이 없다';
  end if;
  if q !~ 'kind = ''venue''' then
    raise exception '20261001n: 소유 절에 kind = venue 가 없다 — 그룹을 만든 일반 회원이 통과한다';
  end if;
  if q !~ 'bucket_id = ''posters''' or q !~ 'foldername' then
    raise exception '20261001n: 버킷·폴더 조건이 빠졌다';
  end if;
  if q ~ 'approved' then
    raise exception '20261001n: 승인 조건이 들어갔다 — 첫 매장 사진 업로드가 깨진다';
  end if;
end $$;

/* ── REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문> <아래 블록> rollback;` 로 돌린다. 끝의 raise 가 전부 되돌린다.
   음성 대조: 같은 블록을 **본문 없이**(현재 정책) 돌리면 N2(매장 0개 업주)만 'ok' 여야 하고(= 지금 열린 구멍),
              원본 20261001n 본문으로 돌리면 N4(그룹 소유 회원)만 'ok' 여야 한다(= 원본의 넓어짐). 그 밖의 칸이 바뀌면 시험이 틀린 것이다.
   계정(2026-10-02 재조회): NEW 1a8c5117(venue_owner·프로필 승인·**미승인 매장** 615376fa 대표) · ADMIN f5d305f2(소유 0) ·
   OWNER 7e435684(승인 매장 f35b42d1 대표) · X 708de904(user, 소유·소속 0)
-- ▼REHEARSAL
create function pg_temp.nuri_up(u uuid, folder text, r text) returns text language plpgsql as $f$
declare st text := 'ok';
begin
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', r)::text end, true);
  execute format('set local role %I', r);
  begin
    insert into storage.objects(bucket_id, name, owner, owner_id)
    values ('posters', folder || '/rehearsal-20261001n-' || gen_random_uuid() || '.webp', u, u::text);
  exception when insufficient_privilege then
    st := case when sqlerrm ~ 'row-level security' then 'rls' else 'priv:' || sqlerrm end;
  end;
  execute 'reset role';
  return st;
end $f$;
create function pg_temp.nuri_as(u uuid, sql text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute sql;
  execute 'reset role';
end $f$;

do $$
declare
  c_new   uuid := '1a8c5117-a4c7-42fe-abb6-021544adcd16';
  c_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_x     uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_r     uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  res text := '';
begin
  res := res || ' P1미승인매장대표=' || pg_temp.nuri_up(c_new, c_new::text, 'authenticated');
  res := res || ' P2대표=' || pg_temp.nuri_up(c_owner, c_owner::text, 'authenticated');
  res := res || ' P2관리자=' || pg_temp.nuri_up(c_admin, c_admin::text, 'authenticated');
  res := res || ' N1일반=' || pg_temp.nuri_up(c_x, c_x::text, 'authenticated');
  res := res || ' N5비로그인=' || pg_temp.nuri_up(null, 'anon', 'anon');
  res := res || ' N3남의폴더=' || pg_temp.nuri_up(c_owner, c_new::text, 'authenticated');
  -- N4: 일반 회원이 **실제 RPC** 로 그룹을 만든 뒤(원본의 넓어짐 경로)
  perform pg_temp.nuri_as(c_x, $q$select public.create_group('리허설 그룹', 'club', '서울', '', true, '')$q$);
  res := res || ' N4그룹소유회원=' || pg_temp.nuri_up(c_x, c_x::text, 'authenticated');
  -- N2: 역할만 venue_owner, 매장(kind=venue) 0개 — 그룹 1개는 남아 있다
  update public.profiles set role = 'venue_owner', approved = true where id = c_x;
  res := res || ' N2매장0업주=' || pg_temp.nuri_up(c_x, c_x::text, 'authenticated');
  -- P3: 실제 RPC 로 첫 매장 생성(화면 순서 ca54e515: 생성 → 업로드) — 미승인 매장
  perform pg_temp.nuri_as(c_x, $q$select public.create_my_venue('리허설 매장', '서울', '주소', '010', null, null, null, null)$q$);
  res := res || ' P3막만든매장=' || pg_temp.nuri_up(c_x, c_x::text, 'authenticated');
  -- P5: 프로필 미승인(대기) 업주가 매장을 만든 상태 — create_my_venue 는 v_ok=false 도 허용한다
  update public.profiles set approved = false where id = c_x;
  res := res || ' P5대기업주=' || pg_temp.nuri_up(c_x, c_x::text, 'authenticated');
  -- P4: role user 인 승인 공동 운영자(is_any_venue_manager) — 소유는 관리자에게 옮긴다(postgres 라 guard 미적용, 롤백됨)
  update public.profiles set role = 'user', approved = true where id = c_x;
  update public.venues set owner_id = c_admin where owner_id = c_x;
  insert into public.venue_owners(venue_id, user_id, status) values (c_r, c_x, 'approved');
  res := res || ' P4공동운영자=' || pg_temp.nuri_up(c_x, c_x::text, 'authenticated');

  -- 기대(수정판): P*=ok, N1·N2·N3·N4·N5=rls. 'priv:' 로 시작하면 정책이 아니라 권한 오류다 — 시험부터 의심.
  if res ~ 'P[0-9][^ ]*=(rls|priv)' or res ~ 'N[0-9][^ ]*=ok' or res ~ 'priv:' then
    raise exception 'REHEARSAL_FAIL 20261001n:%', res;
  end if;
  raise exception 'REHEARSAL_OK 20261001n:%', res;
end $$;
*/
