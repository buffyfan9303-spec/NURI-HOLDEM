select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용(home-team 2026-10-06, 브랜치 NURI/legal2-1006). 적용 판단·실행은 nuri-lead(nuri-migration 절차). 위 두 줄을 떼지 말 것.
-- 리허설: supabase/tests/20261006n_rehearsal.sql (원본 사본: Documents/누리홀덤_영상분석_0930/legal-full-1006/)
--   (r0 + s1 + s2 + 20261006l + 20261006m + 이 파일을 한 트랜잭션으로 · node rehearse-geo.mjs <합본> <리허설> · 통째 롤백)
--
-- 20261006n — 약관 전수 재검토(legal-full-1006/review.md) 의 DB 부분
--   P1-5 매장 운영자 이용약관(개인정보 처리위탁 포함) 동의 기록 — 화면: AuthModal(업주 가입) · OwnerTermsGate(기존 업주, 내 매장)
--   P1-3 순위 인증 신분증 사진 — 별도 동의·가림 확인 기록(서버가 없으면 접수 거부) + 미심사 30일 자동 반려·신분증 파일 삭제
--   P2-6 만 19세 미만 확인 → 이용 제한 + 관리자 알림(restrict_underage_account · 엣지 verify-identity 가 부른다 — 엣지 배포는 리드)
--
-- 선행: 20261006s2(PR #187) — storage_purge_queue · cron_storage_purge(10분마다 storage-purge 엣지가 Storage API 로 지운다).
--   신분증 파일 삭제를 그 큐에 넣는다. 큐가 없으면 아래 게이트에서 멈춘다(s2 를 먼저 적용).
-- 화면 짝: src/api/rankverify.ts(RANK_ID_CONSENT_VERSION · 칸이 없으면 PGRST204 완충) · src/lib/ownerTerms.ts · 처리방침 제2조⑪.
-- 바꾸지 않는 것: 기존 행(라이브 rank_verifications 0행 — review.md a6.sql), find_user_by_phone(전화 조회 거부는 store-team s3).

do $gate$
begin
  if to_regclass('public.storage_purge_queue') is null then
    raise exception '20261006n 게이트: 20261006s2(storage_purge_queue)가 없다 — s2 를 먼저 적용하라'; end if;
  if to_regclass('public.rank_verifications') is null then
    raise exception '20261006n 게이트: rank_verifications 가 없다'; end if;
end $gate$;

-- ═══ ① 매장 운영자 이용약관 동의 기록(append-only) ═══════════════════════════════════
create table if not exists public.owner_terms_consents (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version integer not null check (terms_version between 1 and 1000),
  source text not null check (source in ('signup', 'gate')),
  agreed_at timestamptz not null default now()
);
create index if not exists owner_terms_consents_user_idx on public.owner_terms_consents(user_id, terms_version desc);
alter table public.owner_terms_consents enable row level security;
revoke all on table public.owner_terms_consents from public, anon, authenticated;
revoke all on sequence public.owner_terms_consents_id_seq from public, anon, authenticated;
grant select on table public.owner_terms_consents to authenticated;     -- 행은 아래 정책(본인·관리자)만
grant select, insert, delete on table public.owner_terms_consents to service_role;
drop policy if exists otc_select_own on public.owner_terms_consents;
create policy otc_select_own on public.owner_terms_consents for select to authenticated
  using (user_id = auth.uid() or public.my_role() is not distinct from 'admin'::user_role);

-- 기록은 이 RPC 로만 — 시각은 서버가 찍는다(분쟁 시 증거). 판·출처는 화이트리스트.
create or replace function public.record_my_owner_terms_consent(p_version integer, p_source text)
 returns timestamptz
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
declare v_uid uuid := auth.uid(); v_at timestamptz;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_version is null or p_version not between 1 and 1000 then raise exception '약관 판이 올바르지 않습니다'; end if;
  if p_source is null or p_source not in ('signup', 'gate') then raise exception '동의 경로가 올바르지 않습니다'; end if;
  insert into public.owner_terms_consents(user_id, terms_version, source)
  values (v_uid, p_version, p_source)
  returning agreed_at into v_at;
  return v_at;
end $fn$;
revoke all on function public.record_my_owner_terms_consent(integer, text) from public, anon;
grant execute on function public.record_my_owner_terms_consent(integer, text) to authenticated, service_role;

-- 탈퇴하면 동의 이력을 지운다 — 처리방침 제3조②('약관 동의 이력' 즉시 삭제)와 같게. 탈퇴 함수(s2·m)를 다시 쓰지 않으려고 트리거로 붙인다.
create or replace function public._owner_terms_purge_on_withdraw()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
begin
  if new.status::text = 'withdrawn' and old.status::text is distinct from 'withdrawn' then
    delete from public.owner_terms_consents where user_id = new.id;
  end if;
  return new;
end $fn$;
revoke all on function public._owner_terms_purge_on_withdraw() from public, anon, authenticated;
grant execute on function public._owner_terms_purge_on_withdraw() to service_role;
drop trigger if exists trg_owner_terms_purge_on_withdraw on public.profiles;
create trigger trg_owner_terms_purge_on_withdraw
  after update of status on public.profiles
  for each row execute function public._owner_terms_purge_on_withdraw();

-- ═══ ② 순위 인증 — 신분증 사진 별도 동의·가림 확인(개보법 §15②·§24①·§24의2) ═══════════
alter table public.rank_verifications add column if not exists id_consent_version integer;
alter table public.rank_verifications add column if not exists id_consent_at timestamptz;
alter table public.rank_verifications add column if not exists id_masked_confirmed boolean;
comment on column public.rank_verifications.id_consent_version is
  '신분증 사진 처리 별도 동의의 판(src/api/rankverify.ts RANK_ID_CONSENT_VERSION). 20261006n 이후 신규 신청은 필수.';
comment on column public.rank_verifications.id_consent_at is '별도 동의 시각 — 서버가 접수 시각으로 찍는다(클라 값 무시).';
comment on column public.rank_verifications.id_masked_confirmed is '주민등록번호 뒷자리·면허·여권번호·주소 가림 확인(필수).';

create or replace function public._rv_require_id_consent()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
begin
  if new.id_consent_version is null or new.id_consent_version < 1 or new.id_masked_confirmed is not true then
    raise exception '신분증 사진 처리 동의와 번호 가림 확인이 필요합니다' using errcode = '23514';
  end if;
  new.id_consent_at := now();
  return new;
end $fn$;
revoke all on function public._rv_require_id_consent() from public, anon, authenticated;
grant execute on function public._rv_require_id_consent() to service_role;
drop trigger if exists trg_rv_require_id_consent on public.rank_verifications;
create trigger trg_rv_require_id_consent
  before insert on public.rank_verifications
  for each row execute function public._rv_require_id_consent();

-- ═══ ③ 신분증 사진 보유기간 — 승인·반려 즉시(화면) + 미심사 30일 자동 반려(여기) ═══════════
-- 파일은 SQL 로 지우면 버킷에 고아로 남는다(Supabase 공식 문서 · s2 머리말) → s2 큐에 넣고 storage-purge 가 Storage API 로 지운다.
-- 심사가 끝났는데 경로가 남은 행(화면 삭제 실패 등)도 같은 큐로 보낸다. 자동 반려는 결정 알림 트리거(20261002b)가 신청자에게 알린다.
create or replace function public._expire_rank_verification_idcards()
 returns integer
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
declare v_n integer;
begin
  insert into public.storage_purge_queue(bucket_id, name, reason)
  select 'verifications', rv.id_card_path, 'rank_idcard_retention'
    from public.rank_verifications rv
   where rv.id_card_path is not null
     and (rv.status <> 'pending' or rv.created_at < now() - interval '30 days')
  on conflict (bucket_id, name) do update set done_at = null, last_error = null, attempts = 0;

  update public.rank_verifications
     set status = 'rejected',
         admin_note = coalesce(nullif(btrim(admin_note), ''), '심사 기한(30일)이 지나 자동으로 반려했습니다. 신분증 사진은 삭제했으니 필요하면 다시 신청해 주세요'),
         decided_at = now(),
         id_card_path = null
   where status = 'pending' and created_at < now() - interval '30 days';
  get diagnostics v_n = row_count;

  update public.rank_verifications set id_card_path = null
   where status <> 'pending' and id_card_path is not null;
  return v_n;
end $fn$;
revoke all on function public._expire_rank_verification_idcards() from public, anon, authenticated;
grant execute on function public._expire_rank_verification_idcards() to service_role;

-- 매일 04:20 KST(19:20 UTC) — 같은 이름이 있으면 바꿔 단다(멱등).
select cron.unschedule('rank-idcard-retention') where exists (select 1 from cron.job where jobname = 'rank-idcard-retention');
select cron.schedule('rank-idcard-retention', '20 19 * * *', 'select public._expire_rank_verification_idcards()');

-- ═══ ④ 만 19세 미만 확인 → 이용 제한 + 관리자 알림(P2-6 · 리드 결정 2026-10-06) ═══════════
-- 부르는 곳: 엣지 verify-identity(logic.ts) — 본인인증 생년월일로 만 19세 미만이 **확인**되면(생년 미확인은 제외) service_role 로 1회.
-- 하는 일: 무기한 정지(status=suspended · suspended_until=null — 20260907c 만료 크론 대상 아님) + 사유 + 관리자 알림.
--   정지 계정은 로그인하면 이용 제한 안내 시트에서 탈퇴할 수 있다(20261006m). 해지·파기는 관리자가 확인 뒤 처리(약관 제9조⑤·처리방침 제12조③).
--   이미 같은 사유로 정지돼 있으면 다시 알리지 않는다(반복 인증 시도). banned·withdrawn·관리자 계정은 건드리지 않는다.
--   생년월일은 받지도 저장하지도 않는다(회원 번호만).
create or replace function public.restrict_underage_account(p_uid uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
declare
  c_reason constant text := '본인인증에서 만 19세 미만으로 확인되어 이용이 제한되었습니다. 고객센터로 문의하시거나 이 화면에서 탈퇴하실 수 있습니다.';
  v_status text; v_role text; v_reason text; v_nick text;
begin
  if p_uid is null then return false; end if;
  select status::text, role::text, sanction_reason, nickname into v_status, v_role, v_reason, v_nick
    from public.profiles where id = p_uid for update;
  if not found or v_status in ('banned', 'withdrawn') or v_role = 'admin' then return false; end if;
  if v_status = 'suspended' and v_reason is not distinct from c_reason then return true; end if;
  update public.profiles
     set status = 'suspended', suspended_until = null, sanction_reason = c_reason
   where id = p_uid;
  insert into public.notifications(user_id, type, title, message, link)
  select a.id, 'system', '만 19세 미만 본인인증 — 이용 제한',
         left(coalesce(v_nick, '(닉네임 없음)'), 30) || ' 회원의 본인인증에서 만 19세 미만이 확인되어 이용을 제한했습니다. 이용계약 해지·개인정보 파기를 처리해 주세요',
         '/admin'
    from public.profiles a where a.role = 'admin';
  return true;
end $fn$;
revoke all on function public.restrict_underage_account(uuid) from public, anon, authenticated;
grant execute on function public.restrict_underage_account(uuid) to service_role;

-- ═══ 자가검사 — ACL·search_path·트리거 ═══════════════════════════════════════════
do $chk$
declare r record;
begin
  if has_function_privilege('anon', 'public.record_my_owner_terms_consent(integer,text)', 'execute') then
    raise exception '20261006n 자가검사: anon 이 record_my_owner_terms_consent 를 실행할 수 있다'; end if;
  if not has_function_privilege('authenticated', 'public.record_my_owner_terms_consent(integer,text)', 'execute') then
    raise exception '20261006n 자가검사: authenticated 가 record_my_owner_terms_consent 를 못 쓴다'; end if;
  for r in select unnest(array['public._owner_terms_purge_on_withdraw()', 'public._rv_require_id_consent()', 'public._expire_rank_verification_idcards()', 'public.restrict_underage_account(uuid)']) f loop
    if has_function_privilege('anon', r.f, 'execute') or has_function_privilege('authenticated', r.f, 'execute') then
      raise exception '20261006n 자가검사: 내부 함수 % 가 anon/authenticated 에 열려 있다', r.f; end if;
  end loop;
  if has_table_privilege('anon', 'public.owner_terms_consents', 'select')
     or has_table_privilege('authenticated', 'public.owner_terms_consents', 'insert')
     or has_table_privilege('authenticated', 'public.owner_terms_consents', 'update')
     or has_table_privilege('authenticated', 'public.owner_terms_consents', 'delete') then
    raise exception '20261006n 자가검사: owner_terms_consents 표 권한이 넓다'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('record_my_owner_terms_consent', '_owner_terms_purge_on_withdraw', '_rv_require_id_consent', '_expire_rank_verification_idcards', 'restrict_underage_account')
                and not (coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp'])) then
    raise exception '20261006n 자가검사: search_path 고정이 빠진 함수가 있다'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_rv_require_id_consent' and not tgisinternal) then
    raise exception '20261006n 자가검사: 순위 인증 동의 트리거가 없다'; end if;
end $chk$;
