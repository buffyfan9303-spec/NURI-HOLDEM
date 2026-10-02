-- ✅ 적용 완료 2026-10-02 (리드, Management API) — 합성 직원 리허설 ⓪~⑫ 통과(음성 대조: 마이그레이션 없이 ① 실패 확인) · 정책 4개 select/insert/update/delete {authenticated} · _game_presets_venue_fixed md5 5e5924f1… ACL postgres/service_role · advisors ERROR 0
-- 20261002d — 게임 프리셋: 장부 권한 직원은 읽기(=고르기·적용)만, 만들기·수정·삭제는 업주 (오너 결정 L-14, 2026-10-02)
--
-- ⛔ 미적용 초안. 적용 판단·실행은 nuri-lead 몫이다(store-team 은 파일만 작성). 적용하면 이 머리에
--    "✅ YYYY-MM-DD 라이브 적용 완료 + 실측값" 을 적는다(.claude/skills/nuri-migration/SKILL.md §0·§6).
--
-- 요구: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit-link-1002.md#L-14 · review-store-link-1002.md §4
-- 왜: 라이브 정책은 `game_presets_all`(ALL · USING/WITH CHECK = can_manage_pos(venue_id)) 하나다(2026-10-02 pg_policies 실측).
--   장부 권한만 있는 직원(can_access_ledger 참 · can_manage_pos 거짓)은 RLS 로 **0행을 정상 응답**으로 받아
--   장부 새 게임 폼·클락 설정의 프리셋 고르개가 '없음'처럼 숨었다(오류가 아니라 화면이 가를 수 없다).
--   오너 결정: 직원은 읽기·적용만. 쓰기는 지금처럼 can_manage_pos.
--
-- 바꾸는 것
--   1. game_presets_all(ALL) 을 지우고 명령별 정책 4개로 나눈다.
--        select : can_access_ledger(venue_id)        ← 넓힘(can_access_ledger 는 can_manage_pos 를 포함한다 — 라이브 정의 실측)
--        insert : with check can_manage_pos(venue_id) ← 그대로
--        update : using/with check can_manage_pos     ← 그대로
--        delete : using can_manage_pos                ← 그대로
--      역할은 authenticated 로 좁힌다(종전 {public}). anon 은 auth.uid() 가 NULL 이라 어차피 거짓이었다 — 표기만 정직하게.
--   2. (선택 · 심층 방어) venue_id 를 UPDATE 로 바꾸지 못하게 하는 BEFORE UPDATE 트리거.
--      RLS 만으로도 '한 매장만 관리하는 사람'은 못 옮기지만, 두 매장을 다 관리하는 사람의 실수 이동(L-05 부류)을 서버가 막는다.
--
-- 영향(클라이언트): 직원 화면에서 PresetPicker 가 프리셋을 보이고 적용할 수 있게 된다(읽기만).
--   쓰기 화면은 이미 업주 게이트다 — PresetManager(매장 설정 탭) · 장부 '프리셋으로 저장'(closed && canManage).
--   ⚠ 클락 '클락 프리셋 → 게임 프리셋 가져오기'(TournamentClock.tsx convertClockPresets)는 클락 canManage 로만 갈린다 —
--     클락 권한 직원이 누르면 지금처럼 RLS 거절(오류 토스트)이다. 이 마이그레이션이 바꾸지 않는다.
--
-- 의존: public.can_access_ledger(uuid) · public.can_manage_pos(uuid) — 둘 다 SECURITY DEFINER · search_path 고정(라이브 실측).

begin;

alter table public.game_presets enable row level security;

drop policy if exists game_presets_all    on public.game_presets;
drop policy if exists game_presets_select on public.game_presets;
drop policy if exists game_presets_insert on public.game_presets;
drop policy if exists game_presets_update on public.game_presets;
drop policy if exists game_presets_delete on public.game_presets;

create policy game_presets_select on public.game_presets
  for select to authenticated
  using (public.can_access_ledger(venue_id));

create policy game_presets_insert on public.game_presets
  for insert to authenticated
  with check (public.can_manage_pos(venue_id));

create policy game_presets_update on public.game_presets
  for update to authenticated
  using (public.can_manage_pos(venue_id))
  with check (public.can_manage_pos(venue_id));

create policy game_presets_delete on public.game_presets
  for delete to authenticated
  using (public.can_manage_pos(venue_id));

-- 2) venue_id 고정 트리거(선택)
create or replace function public._game_presets_venue_fixed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.venue_id is distinct from old.venue_id then
    raise exception '프리셋의 매장은 바꿀 수 없습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public._game_presets_venue_fixed() from public, anon, authenticated;

drop trigger if exists game_presets_venue_fixed on public.game_presets;
create trigger game_presets_venue_fixed
  before update of venue_id on public.game_presets
  for each row execute function public._game_presets_venue_fixed();

-- 자가검사 — 정책 모양·트리거 존재. 실패하면 트랜잭션째 멈춘다.
do $check$
declare
  n_all int; n_sel int; n_w int; n_trg int;
begin
  select count(*) into n_all from pg_policies where schemaname = 'public' and tablename = 'game_presets' and policyname = 'game_presets_all';
  select count(*) into n_sel from pg_policies where schemaname = 'public' and tablename = 'game_presets'
    and cmd = 'SELECT' and qual ilike '%can_access_ledger(venue_id)%';
  select count(*) into n_w from pg_policies where schemaname = 'public' and tablename = 'game_presets'
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and coalesce(qual, '') not ilike '%can_access_ledger%' and coalesce(with_check, '') not ilike '%can_access_ledger%'
    and (coalesce(qual, '') ilike '%can_manage_pos(venue_id)%' or coalesce(with_check, '') ilike '%can_manage_pos(venue_id)%');
  select count(*) into n_trg from pg_trigger where tgrelid = 'public.game_presets'::regclass and tgname = 'game_presets_venue_fixed' and not tgisinternal;
  if n_all <> 0 or n_sel <> 1 or n_w <> 3 or n_trg <> 1 then
    raise exception '20261002d 자가검사 실패: all=% select=% write=% trigger=%', n_all, n_sel, n_w, n_trg;
  end if;
end
$check$;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 리허설(리드 몫 · 라이브 begin…rollback, 쓰기 0) — 위 begin/commit 두 줄을 빼고 본문을 아래 틀의 <마이그레이션 본문> 자리에 넣는다.
-- 계정은 **역할·소유·소속을 먼저 조회해서** 고른다(SKILL §5). 고르는 쿼리:
--   -- 장부 권한 직원(양성: 읽기 통과 · 쓰기 차단 대상)
--   select la.user_id, la.venue_id from ledger_access la
--    where public._is_active_venue_staff(la.user_id, la.venue_id)
--      and not exists (select 1 from venues v where v.id = la.venue_id and v.owner_id = la.user_id) limit 3;
--   -- 그 매장 업주(양성: 읽기·쓰기 통과)
--   select owner_id from venues where id = :venue;
--   -- 그 매장과 무관한 일반 회원(음성: 읽기 0행)
--   select p.id from profiles p where p.role = 'user'
--     and not exists (select 1 from ledger_access la where la.user_id = p.id)
--     and not exists (select 1 from venues v where v.owner_id = p.id) limit 1;
--
-- begin;
--   <마이그레이션 본문>
--   -- 시험 행 하나(업주 권한으로 넣는다 — 서비스 롤 그대로 insert)
--   insert into game_presets (id, venue_id, name, data) values ('00000000-0000-4000-8000-00000000d002', :venue, '리허설-프리셋', '{}'::jsonb);
--   set local role authenticated;
--   do $r$
--   declare n int; ok boolean;
--   begin
--     -- ① 양성: 장부 권한 직원은 읽는다
--     perform set_config('request.jwt.claims', json_build_object('sub', :staff, 'role', 'authenticated')::text, true);
--     select count(*) into n from game_presets where id = '00000000-0000-4000-8000-00000000d002';
--     if n <> 1 then raise exception '① 직원 읽기 실패: %', n; end if;
--     -- ② 음성: 직원은 수정·삭제·추가 못 한다(수정·삭제는 0행, 추가는 RLS 오류)
--     update game_presets set name = 'x' where id = '00000000-0000-4000-8000-00000000d002'; get diagnostics n = row_count;
--     if n <> 0 then raise exception '② 직원 수정이 통과했다'; end if;
--     delete from game_presets where id = '00000000-0000-4000-8000-00000000d002'; get diagnostics n = row_count;
--     if n <> 0 then raise exception '② 직원 삭제가 통과했다'; end if;
--     ok := false;
--     begin insert into game_presets (venue_id, name, data) values (:venue, 'x', '{}'::jsonb); exception when insufficient_privilege then ok := true; end;
--     if not ok then raise exception '② 직원 추가가 통과했다'; end if;
--     -- ③ 음성: 무관한 회원은 0행
--     perform set_config('request.jwt.claims', json_build_object('sub', :stranger, 'role', 'authenticated')::text, true);
--     select count(*) into n from game_presets where id = '00000000-0000-4000-8000-00000000d002';
--     if n <> 0 then raise exception '③ 무관 회원이 읽었다'; end if;
--     -- ④ 음성(fail-open): 비로그인(sub 없음)은 0행
--     perform set_config('request.jwt.claims', '', true);
--     select count(*) into n from game_presets where id = '00000000-0000-4000-8000-00000000d002';
--     if n <> 0 then raise exception '④ 비로그인이 읽었다'; end if;
--     -- ⑤ 양성: 업주는 읽기·수정 통과
--     perform set_config('request.jwt.claims', json_build_object('sub', :owner, 'role', 'authenticated')::text, true);
--     update game_presets set name = '리허설-수정' where id = '00000000-0000-4000-8000-00000000d002'; get diagnostics n = row_count;
--     if n <> 1 then raise exception '⑤ 업주 수정이 막혔다: %', n; end if;
--     raise notice '20261002d 리허설 ①~⑤ 통과';
--   end
--   $r$;
--   reset role;
--   -- ⑥ 음성(트리거만 따로): RLS 를 타지 않는 소유자 롤로 venue_id 를 바꿔 본다 — authenticated 로 하면
--   --    WITH CHECK 가 먼저 막아 트리거가 없어도 통과하는 거짓 통과가 된다(같은 42501).
--   do $t$ declare ok boolean := false; begin
--     begin update game_presets set venue_id = :other_venue where id = '00000000-0000-4000-8000-00000000d002';
--     exception when insufficient_privilege then ok := true; end;
--     if not ok then raise exception '⑥ venue_id 이동이 통과했다(트리거 없음)'; end if;
--   end $t$;
-- rollback;
-- -- 롤백 확인: select count(*) from pg_policies where tablename = 'game_presets' and policyname = 'game_presets_all';  → 1
