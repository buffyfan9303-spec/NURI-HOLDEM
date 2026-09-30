-- 2026-09-30 K단계 — 클락 슬라이드 광고(clock_ads) + 추가 페이지·시상 문구 서버 상한
--
-- ⚠ 초안 — 라이브 미적용. 리드(nuri-lead)가 begin … rollback 리허설 뒤 MCP execute_sql 로 적용한다.
--   클라이언트는 표가 없으면 빈 광고 목록으로 읽고(src/api/clockAds.ts isMissingTable), 추가 페이지·시상 문구는
--   clock_states.config(jsonb) 에 그대로 실리므로 이 파일 없이도 동작한다. 이 파일이 더하는 것은 ① 광고 표·버킷 ② 서버 상한.
--
-- 🧪 2026-09-30 라이브 리허설(begin … 끝에서 raise → 전부 롤백, 적용 0 확인: to_regclass null · 버킷 0 · 트리거 0) — PG 17.6:
--   existing_rows_ok=2(기존 clock_states 전 행 config 재저장 통과) · 3pages=rejected · longtext=rejected · valid(team)=accepted ·
--   admin_insert=ok · admin_update_rows=1 · user_insert=rejected(42501) · user_update_rows=0 · user_delete_rows=0 · user_read=1 ·
--   anon_read=1 · anon_insert=rejected · bad_period=rejected · 버킷 512000 / image/webp,image/jpeg,image/png.
--   (관리자 f5d305f2… · 일반 7e435684… — role 을 조회해 고른 계정. 저장소 객체 정책은 문장 실행까지만 확인, 업로드 행동 시험은 NOT_RUN.)
--
-- 요구 원문: .claude/handoff/specs-0930/PLAN-AB-exec.md §5-1
--   · 광고 여러 개(기간·대상 매장·순번) · 840×1120 · 500KB 이하 · webp/jpg/png — 형식·크기는 버킷이 서버에서 강제한다.
--     (가로세로는 저장소가 검사하지 못한다 → 클라이언트 checkClockAdMeta. 관리자만 쓰므로 위험은 '규격 밖 이미지' 수준이다.)
--   · 쓰기는 관리자만, 읽기는 공개(TV 는 비로그인 ?display= 화면).
--   · 추가 페이지·시상 문구: 서버는 행 수·글자 길이 상한 검사. 상한 수는 src/lib/clockSlides.ts 와 같다(바꾸면 둘 다).
--
-- 멱등(재실행 안전). 기존 행 영향: clock_states·clock_presets 에 BEFORE 트리거가 붙는다 —
--   기존 config 에는 extraPages·text·note 가 없으므로 검사 대상이 없어 통과한다(리허설에서 기존 전 행 UPDATE 로 확인할 것).

-- ── ① 광고 표 ─────────────────────────────────────────────────────────────
create table if not exists public.clock_ads (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null check (char_length(image_url) between 1 and 500),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  venue_ids   uuid[] null check (venue_ids is null or cardinality(venue_ids) <= 200),  -- null = 전체 매장
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint clock_ads_period check (ends_at > starts_at)
);
create index if not exists clock_ads_sort_idx on public.clock_ads (sort_order);

alter table public.clock_ads enable row level security;

-- 읽기 공개 — 광고는 TV 에 공개로 걸리는 이미지다(민감 컬럼 없음: 작성자 칸을 두지 않았다).
drop policy if exists clock_ads_public_read on public.clock_ads;
create policy clock_ads_public_read on public.clock_ads for select to anon, authenticated using (true);

-- 쓰기 관리자만. 정책식의 NULL 은 거짓으로 닫힌다(비로그인 my_role() = NULL → 차단) — coalesce 로 명시한다.
drop policy if exists clock_ads_admin_insert on public.clock_ads;
create policy clock_ads_admin_insert on public.clock_ads for insert to authenticated
  with check (coalesce(public.my_role() = 'admin'::public.user_role, false));
drop policy if exists clock_ads_admin_update on public.clock_ads;
create policy clock_ads_admin_update on public.clock_ads for update to authenticated
  using (coalesce(public.my_role() = 'admin'::public.user_role, false))
  with check (coalesce(public.my_role() = 'admin'::public.user_role, false));
drop policy if exists clock_ads_admin_delete on public.clock_ads;
create policy clock_ads_admin_delete on public.clock_ads for delete to authenticated
  using (coalesce(public.my_role() = 'admin'::public.user_role, false));

revoke all on table public.clock_ads from anon;
grant select on table public.clock_ads to anon;
grant select, insert, update, delete on table public.clock_ads to authenticated;

-- ── ② 광고 버킷 — 형식·크기를 서버가 강제 ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clock_ads', 'clock_ads', true, 512000, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 표시는 공개 URL(CDN)로 나간다 — 목록 열람 SELECT 는 관리자만(remove() 가 먼저 SELECT 하므로 필요, 20260828b 와 같은 이유).
drop policy if exists clock_ads_obj_admin_read on storage.objects;
create policy clock_ads_obj_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'clock_ads' and coalesce(public.my_role() = 'admin'::public.user_role, false));
drop policy if exists clock_ads_obj_admin_insert on storage.objects;
create policy clock_ads_obj_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clock_ads' and coalesce(public.my_role() = 'admin'::public.user_role, false));
drop policy if exists clock_ads_obj_admin_update on storage.objects;
create policy clock_ads_obj_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'clock_ads' and coalesce(public.my_role() = 'admin'::public.user_role, false))
  with check (bucket_id = 'clock_ads' and coalesce(public.my_role() = 'admin'::public.user_role, false));
drop policy if exists clock_ads_obj_admin_delete on storage.objects;
create policy clock_ads_obj_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'clock_ads' and coalesce(public.my_role() = 'admin'::public.user_role, false));

-- ── ③ 클락 config 상한 — 추가 페이지(최대 2 · 줄 10 · 글자 길이) · 시상 문구/메모 길이 ──────────
-- 수치: src/lib/clockSlides.ts EXTRA_*·TEAM_POINTS_MAX·PRIZE_TEXT_MAX·PRIZE_NOTE_MAX 와 같다.
create or replace function public._clock_config_limits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c jsonb := new.config;
  pg jsonb;
  rw jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return new; end if;

  if c ? 'extraPages' and c->'extraPages' <> 'null'::jsonb then
    if jsonb_typeof(c->'extraPages') <> 'array' or jsonb_array_length(c->'extraPages') > 2 then
      raise exception '추가 페이지는 최대 2장입니다' using errcode = '22023';
    end if;
    for pg in select * from jsonb_array_elements(c->'extraPages') loop
      if jsonb_typeof(pg) <> 'object'
         or coalesce(pg->>'kind', '') not in ('bounty', 'event', 'notice', 'custom', 'team')
         or char_length(coalesce(pg->>'title', '')) > 30
         or jsonb_typeof(coalesce(pg->'rows', '[]'::jsonb)) <> 'array'
         or jsonb_array_length(coalesce(pg->'rows', '[]'::jsonb)) > 10
         or (pg ? 'points' and (jsonb_typeof(pg->'points') <> 'array' or jsonb_array_length(pg->'points') > 30)) then
        raise exception '추가 페이지 형식이 올바르지 않습니다(줄 10개·제목 30자 이하)' using errcode = '22023';
      end if;
      for rw in select * from jsonb_array_elements(coalesce(pg->'rows', '[]'::jsonb)) loop
        if char_length(coalesce(rw->>'label', '')) > 20
           or char_length(coalesce(rw->>'content', '')) > 40
           or char_length(coalesce(rw->>'note', '')) > 40 then
          raise exception '추가 페이지 글자가 너무 깁니다(이름표 20·내용 40·메모 40자)' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  if jsonb_typeof(c->'prizes') = 'array' then
    for rw in select * from jsonb_array_elements(c->'prizes') loop
      if char_length(coalesce(rw->>'text', '')) > 24 or char_length(coalesce(rw->>'note', '')) > 30 then
        raise exception '시상 문구는 24자, 메모는 30자까지입니다' using errcode = '22023';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public._clock_config_limits() from public;
revoke all on function public._clock_config_limits() from anon, authenticated;

drop trigger if exists clock_states_config_limits on public.clock_states;
create trigger clock_states_config_limits
  before insert or update of config on public.clock_states
  for each row execute function public._clock_config_limits();

drop trigger if exists clock_presets_config_limits on public.clock_presets;
create trigger clock_presets_config_limits
  before insert or update of config on public.clock_presets
  for each row execute function public._clock_config_limits();
