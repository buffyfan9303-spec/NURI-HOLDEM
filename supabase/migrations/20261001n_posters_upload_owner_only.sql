-- ⏳ 미적용 초안(2026-10-01, 서버 수정 초안 담당 Opus 5.5). 리드 독립 검토 뒤 지시가 있을 때만 적용한다.
--    적용은 이 파일 전체(REHEARSAL 주석 블록 제외)를 **한 번의 execute_sql** 로.
--    🔴 순서: store-team 의 S-11 화면 수정(커밋 ca54e515 — 첫 매장 만들기 = 매장 생성 → 사진 업로드 → updateVenueImage)이
--       **main 에 합쳐지고 운영에 배포된 뒤에** 적용한다. 2026-10-01 현재 ca54e515 는 origin/NURI/store-fix-1001 에만 있다.
--       먼저 적용하면 옛 화면(업로드 → 매장 생성)에서 매장이 0개인 새 업주의 첫 사진 업로드가 42501 로 깨진다(2026-09-30 이력).
-- 20261001n — S-11(audit-store-1001 · review-sec R2): 포스터 버킷 업로드를 '매장을 가진 사람'으로
--
-- 라이브 실측(2026-10-01, 바꾸기 전):
--   · storage.objects posters_upload(INSERT, authenticated) WITH CHECK md5 3e465a2f3bbd5e9df8c6001f4caee7c9
--     = bucket 'posters' + 첫 폴더 = 내 uid + (my_role() ∈ {venue_owner, admin} 또는 is_any_venue_manager()).
--     → role 만 venue_owner 이고 매장이 0개인 계정도 올릴 수 있다(고아 파일·저장 공간 남용 — 일정 등록은 schedules_insert 가 승인을 요구).
--   · 업로더(src/lib/storage.ts uploadPoster, 경로 `${uid}/…`): PosterFormModal(업주·공동 운영자) · VenueManageTab 첫 매장 만들기 ·
--     TournamentClock 클락 광고 · HomeBannersCard · SystemSwitchesCard(관리자). 매장 사진첩은 community_images 버킷이라 무관.
--   · 라이브 계정: venue_owner 2명 모두 매장 보유(1명은 매장 미승인) · 매장 0개인 venue_owner 0명 → 지금 막히는 실사용자 0.
-- 무엇을 바꾸나: 역할만 보는 절(`my_role() in (venue_owner, admin)`)을 빼고 **매장 소유(승인 여부 무관)** 로 바꾼다.
--   = is_any_venue_manager()(관리자·승인 대표·승인 공동 운영자) 또는 venues.owner_id = 나 인 행이 있음.
--   승인 조건은 넣지 않는다 — 첫 매장은 미승인 상태에서 사진을 올린다(오너·리드 지시). 버킷·폴더 조건은 그대로.

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
                   or exists (select 1 from public.venues v where v.owner_id = (select auth.uid()))));

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
  if q !~ 'bucket_id = ''posters''' or q !~ 'foldername' then
    raise exception '20261001n: 버킷·폴더 조건이 빠졌다';
  end if;
  if q ~ 'approved' then
    raise exception '20261001n: 승인 조건이 들어갔다 — 첫 매장 사진 업로드가 깨진다';
  end if;
end $$;

/* ── REHEARSAL — 운영 DB 에서 `<이 파일 본문>` + 아래 블록을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-01 조회): NEW 1a8c5117(venue_owner·승인·**미승인 매장** 615376fa 대표) · ADMIN f5d305f2(소유 0) ·
   OWNER 7e435684(승인 매장 R 대표) · X 708de904(user, 소유·소속 0 — 트랜잭션 안에서 venue_owner 로 올려 '매장 0개 업주' 를 만든다)
-- ▼REHEARSAL
create function pg_temp.nuri_try_up(u uuid, folder text) returns boolean language plpgsql as $f$
declare ok boolean := true;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into storage.objects(bucket_id, name, owner, owner_id)
    values ('posters', folder || '/rehearsal-20261001n-' || gen_random_uuid() || '.webp', u, u::text);
  exception when insufficient_privilege then ok := false;
  end;
  execute 'reset role';
  return ok;
end $f$;

do $$
declare
  c_new   uuid := '1a8c5117-a4c7-42fe-abb6-021544adcd16';
  c_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_x     uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_r uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
begin
  -- 양성 1: 미승인 매장의 대표(첫 매장 사진 경로) — 승인 조건이 없어야 통과
  if not pg_temp.nuri_try_up(c_new, c_new::text) then raise exception 'FAIL: 미승인 매장 대표의 업로드가 막혔다(첫 매장 깨짐 재발)'; end if;
  -- 양성 2: 승인 대표 · 관리자(소유 0)
  if not pg_temp.nuri_try_up(c_owner, c_owner::text) then raise exception 'FAIL: 대표 업로드가 막혔다'; end if;
  if not pg_temp.nuri_try_up(c_admin, c_admin::text) then raise exception 'FAIL: 관리자 업로드가 막혔다'; end if;
  -- 음성 1: 일반 회원
  if pg_temp.nuri_try_up(c_x, c_x::text) then raise exception 'FAIL: 일반 회원이 올렸다'; end if;
  -- 음성 2: 역할만 venue_owner 이고 매장 0개(옛 정책은 통과시켰다)
  update public.profiles set role = 'venue_owner', approved = true where id = c_x;
  if pg_temp.nuri_try_up(c_x, c_x::text) then raise exception 'FAIL: 매장 0개 업주가 올렸다'; end if;
  -- 양성 3: 같은 사람이 매장을 만든 뒤(화면 순서 ca54e515: 생성 → 업로드) — 미승인 매장이어도 통과
  insert into public.venues(name, region, owner_id) values ('리허설 매장', '서울', c_x);
  if not pg_temp.nuri_try_up(c_x, c_x::text) then raise exception 'FAIL: 매장을 막 만든 업주의 업로드가 막혔다'; end if;
  -- 음성 3: 남의 폴더
  if pg_temp.nuri_try_up(c_owner, c_new::text) then raise exception 'FAIL: 남의 폴더에 올렸다'; end if;
  -- 양성 4: role user 인 승인 공동 운영자(is_any_venue_manager)
  update public.profiles set role = 'user' where id = c_x;
  update public.venues set owner_id = c_admin where owner_id = c_x;   -- 하드 삭제 가드가 있어 소유만 옮긴다(롤백됨)
  insert into public.venue_owners(venue_id, user_id, status) values (c_r, c_x, 'approved');
  if not pg_temp.nuri_try_up(c_x, c_x::text) then raise exception 'FAIL: 승인 공동 운영자 업로드가 막혔다'; end if;

  raise exception 'REHEARSAL_OK 20261001n';
end $$;
*/
