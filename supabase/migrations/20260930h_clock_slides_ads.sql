-- 2026-09-30 K단계 — 클락 슬라이드 광고(clock_ads) + 추가 페이지·시상 문구 서버 상한
--
-- ⚠ 초안 — 라이브 미적용. 리드(nuri-lead)가 begin … rollback 리허설 뒤 MCP execute_sql 로 적용한다.
--   클라이언트는 표가 없으면 빈 광고 목록으로 읽고(src/api/clockAds.ts isMissingTable), 추가 페이지·시상 문구는
--   clock_states.config(jsonb) 에 그대로 실리므로 이 파일 없이도 동작한다. 이 파일이 더하는 것은 ① 광고 표·버킷 ② 서버 상한.
--
-- 🧪 리허설 기록은 파일 끝 주석(REHEARSAL) — 리드 검토 반영판(design ②③·critical P3 ①②③) 기준으로 다시 돌렸다.
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

-- ── ③ 클락 config 상한 — 모양 · 줄/글자 수 · §28 금칙 표현 ──────────────────────────
-- 수치: src/lib/clockSlides.ts 의 EXTRA_*·TEAM_POINTS_MAX·PRIZE_TEXT_MAX·PRIZE_NOTE_MAX·PRIZE_ROWS_MAX 와 같다(바꾸면 둘 다).
--   상한은 TV 왼쪽 칸에 한 줄로 다 보이는 길이다(design-reviewer 2026-09-30 실측 — 제목 30자는 7~8자만 보였다).
-- 모양(critical-reviewer P3): 줄이 객체가 아니거나(문자열·null) 글자 칸이 문자열이 아니면 거절한다 — 그런 줄은 길이 검사를
--   건너뛰어 상한을 우회했고, TV 는 문자열을 기대한다. 시상 줄 수도 상한을 둔다.
-- §28: 매장이 쓴 글자(시상 문구·메모, 추가 페이지 제목·이름표·내용·메모)에 기존 금칙 판정 contains_blocked_ugc(20260927d)를
--   그대로 쓴다(새 금칙어 목록을 만들지 않는다). 편집기는 lib/content-filter filterContent 로 같은 칸을 미리 거른다.
create or replace function public._clock_config_limits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c jsonb := new.config;
  pg jsonb;
  rw jsonb;
  k text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return new; end if;

  if c ? 'extraPages' and c->'extraPages' <> 'null'::jsonb then
    if jsonb_typeof(c->'extraPages') <> 'array' or jsonb_array_length(c->'extraPages') > 2 then
      raise exception '추가 페이지는 최대 2장입니다' using errcode = '22023';
    end if;
    for pg in select * from jsonb_array_elements(c->'extraPages') loop
      if jsonb_typeof(pg) <> 'object'
         or coalesce(pg->>'kind', '') not in ('bounty', 'event', 'notice', 'custom', 'team')
         or (pg ? 'title' and jsonb_typeof(pg->'title') <> 'string')
         or char_length(coalesce(pg->>'title', '')) > 12
         or jsonb_typeof(coalesce(pg->'rows', '[]'::jsonb)) <> 'array'
         or jsonb_array_length(coalesce(pg->'rows', '[]'::jsonb)) > 8
         or (pg ? 'points' and (jsonb_typeof(pg->'points') <> 'array' or jsonb_array_length(pg->'points') > 30)) then
        raise exception '추가 페이지 형식이 올바르지 않습니다(줄 8개·제목 12자 이하)' using errcode = '22023';
      end if;
      if public.contains_blocked_ugc(pg->>'title') then
        raise exception '게시할 수 없는 표현이 들어 있습니다' using errcode = '22023';
      end if;
      for rw in select * from jsonb_array_elements(coalesce(pg->'rows', '[]'::jsonb)) loop
        if jsonb_typeof(rw) <> 'object' then
          raise exception '추가 페이지 줄 형식이 올바르지 않습니다' using errcode = '22023';
        end if;
        foreach k in array array['label', 'content', 'note'] loop
          if rw ? k and jsonb_typeof(rw->k) not in ('string', 'null') then
            raise exception '추가 페이지 줄 형식이 올바르지 않습니다' using errcode = '22023';
          end if;
          if public.contains_blocked_ugc(rw->>k) then
            raise exception '게시할 수 없는 표현이 들어 있습니다' using errcode = '22023';
          end if;
        end loop;
        if char_length(coalesce(rw->>'label', '')) > 14
           or char_length(coalesce(rw->>'content', '')) > 16
           or char_length(coalesce(rw->>'note', '')) > 20 then
          raise exception '추가 페이지 글자가 너무 깁니다(이름표 14·내용 16·메모 20자)' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  if c ? 'prizes' and c->'prizes' <> 'null'::jsonb then
    if jsonb_typeof(c->'prizes') <> 'array' or jsonb_array_length(c->'prizes') > 200 then
      raise exception '시상 줄은 200개까지입니다' using errcode = '22023';
    end if;
    for rw in select * from jsonb_array_elements(c->'prizes') loop
      if jsonb_typeof(rw) <> 'object'
         or (rw ? 'text' and jsonb_typeof(rw->'text') not in ('string', 'null'))
         or (rw ? 'note' and jsonb_typeof(rw->'note') not in ('string', 'null')) then
        raise exception '시상 줄 형식이 올바르지 않습니다' using errcode = '22023';
      end if;
      if char_length(coalesce(rw->>'text', '')) > 12 or char_length(coalesce(rw->>'note', '')) > 20 then
        raise exception '시상 문구는 12자, 메모는 20자까지입니다' using errcode = '22023';
      end if;
      if public.contains_blocked_ugc(rw->>'text') or public.contains_blocked_ugc(rw->>'note') then
        raise exception '게시할 수 없는 표현이 들어 있습니다' using errcode = '22023';
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

-- REHEARSAL 2026-09-30(리드 검토 반영판) — 라이브 PG 17.6 · `begin; <이 파일 전문> -- @@END; do $t$ … raise $t$; rollback;`
--   전사 확인: md5(current_query() 의 파일 부분) = 8a3fbee96a99aab7c88611c4f7fb1cc9 = 이 주석을 붙이기 전 파일의 LF 본문(끝 줄바꿈 제외) md5.
--   결과: existing=2(기존 clock_states 전 행 재저장 통과) · owner_valid_rows=1(업주가 authenticated 로 12자 제목·14/16/20자 줄 저장 — contains_blocked_ugc 실행 가능)
--   · owner_blocked(추가 페이지 '칩 환전 가능')=rejected · prize_note_blocked('현금 환전 해드림')=rejected · scalar_row·null_row·num_label=rejected
--   · title13·rows9·prizes201·scalar_prize=rejected · prizes200=accepted
--   · 광고: admin_insert=ok · user(708de904, role=user)_insert=rejected · user_update=0 · owner(7e435684, role=venue_owner — 첫 판 헤더의 '일반'은 오기)_insert=rejected
--     · owner_delete=0 · anon_read=1 · anon_insert=rejected · 버킷 512000 / image/webp,image/jpeg,image/png
--   적용 0 확인: clock_ads·버킷·트리거·함수 모두 없음, clock_states 에 extraPages 0행.
--   NOT_RUN: storage.objects 정책의 실제 업로드·삭제 행동(삭제 시험은 storage.allow_delete_query 설정 필요 — critical-reviewer 기억 참고).
