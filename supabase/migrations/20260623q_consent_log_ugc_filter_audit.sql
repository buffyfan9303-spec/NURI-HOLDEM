-- 2026-06-23 신뢰/규제/감사 배치 (감사 #15·#14·#4)
-- #15 서버측 UGC 금지표현 필터(클라 우회 직접 insert 방어). 게임산업법 §32: 현금화·환전·대리게임·불법도박.
--   물리 칩 판매가 정상인 marketplace_listings 는 제외(오탐 방지) — 토론면(글/댓글/전광판)만 적용.
create or replace function public.contains_blocked_ugc(p_text text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_text,'') ~* '현금화|현금\s*교환|칩\s*환전|환전\s*칩|gp\s*환전|환전\s*gp|시드\s*현금|현금\s*시드|칩\s*(직|판)매|칩\s*구매|칩\s*삽니다|칩\s*팝니다|칩\s*거래|게임\s*머니\s*거래|불법\s*카지노|사설\s*도박|토토\s*환전|배팅\s*사이트|먹튀|총판\s*모집|도박\s*사이트|대리\s*게임|대리\s*참가|대리\s*플레이|대리\s*바이인|대신\s*플레이|게임\s*대행'
     or coalesce(p_text,'') ~ '[0-9]{3,6}-[0-9]{2,6}-[0-9]{4,8}';
$$;
create or replace function public.block_ugc_trigger()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v text;
begin
  for v in select value from jsonb_each_text(to_jsonb(new)) where key in ('title','content','body','message') loop
    if public.contains_blocked_ugc(v) then
      raise exception '현금화·환전·대리게임·불법도박 관련 표현은 게시할 수 없습니다 (게임산업법 제32조).';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_block_ugc on public.community_posts;
create trigger trg_block_ugc before insert on public.community_posts for each row execute function public.block_ugc_trigger();
drop trigger if exists trg_block_ugc on public.comments;
create trigger trg_block_ugc before insert on public.comments for each row execute function public.block_ugc_trigger();
drop trigger if exists trg_block_ugc on public.live_wall;
create trigger trg_block_ugc before insert on public.live_wall for each row execute function public.block_ugc_trigger();

-- #14 동의 이력 불변 로그(약관 분쟁·개보법 대응). profiles 의 동의 boolean 변경 시 append.
create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null,
  agreed boolean not null,
  doc_version text,
  created_at timestamptz not null default now()
);
create index if not exists consent_logs_user_idx on public.consent_logs(user_id, created_at);
alter table public.consent_logs enable row level security;
drop policy if exists consent_logs_select_own on public.consent_logs;
create policy consent_logs_select_own on public.consent_logs for select
  using (user_id = (select auth.uid()) or coalesce((select public.my_role())::text,'') = 'admin');
create or replace function public.log_consent_changes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.agreed_to_terms is distinct from old.agreed_to_terms then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'terms', coalesce(new.agreed_to_terms,false)); end if;
  if tg_op = 'INSERT' or new.agreed_to_privacy is distinct from old.agreed_to_privacy then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'privacy', coalesce(new.agreed_to_privacy,false)); end if;
  if tg_op = 'INSERT' or new.agreed_to_marketing is distinct from old.agreed_to_marketing then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'marketing', coalesce(new.agreed_to_marketing,false)); end if;
  if tg_op = 'INSERT' or new.agreed_to_anti_gambling is distinct from old.agreed_to_anti_gambling then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'anti_gambling', coalesce(new.agreed_to_anti_gambling,false)); end if;
  return new;
end $$;
drop trigger if exists trg_log_consent on public.profiles;
create trigger trg_log_consent after insert or update of agreed_to_terms, agreed_to_privacy, agreed_to_marketing, agreed_to_anti_gambling on public.profiles
  for each row execute function public.log_consent_changes();

-- #4 운영자 행위 변조불가 감사로그(append-only). SECURITY DEFINER 함수만 기록, 일반 역할 직접쓰기 불가.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid, action text not null, target text, meta jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log for select using (coalesce((select public.my_role())::text,'') = 'admin');
create or replace function public._audit(p_action text, p_target text, p_meta jsonb default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log(actor_id, action, target, meta) values (auth.uid(), p_action, p_target, p_meta);
$$;
-- 플래그십: kill_venue 에 감사기록 추가(나머지 고위험 RPC 는 점진 배선 — _audit 인프라 준비됨).
create or replace function public.kill_venue(p_venue_id uuid, p_owner_name text, p_password text)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_owner uuid; v_real text; v_hash text; v_tbl text;
  v_whitelist text[] := array[
    'comments','schedules','venue_follows','venue_staff_invites','venue_rankings','venue_notices',
    'venue_pos_settings','ledger_access','venue_staff','ledger_sessions','staff_schedule','clock_presets',
    'ranking_point_awards','ledger_buyins','ledger_players','clock_states','staff_wage','waitlist',
    'customer_profiles','coupons','dealer_shifts','store_vouchers','checkins','voucher_access',
    'venue_messages','venue_score_entries','league_members','league_entries','venue_reviews',
    'voucher_credit_requests','venue_owners','ledger_buyin_requests','venue_announcements',
    'venue_seasons','game_presets','venue_kill_switch','league_event_status'
  ];
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 실행할 수 있습니다'; end if;
  select real_name into v_real from public.profiles where id = v_owner;
  if coalesce(trim(v_real), '') = '' then raise exception '본인인증(실명)된 업주만 실행할 수 있습니다'; end if;
  if lower(trim(p_owner_name)) <> lower(trim(v_real)) then raise exception '업주 실명이 일치하지 않습니다'; end if;
  select pw_hash into v_hash from public.venue_kill_switch where venue_id = p_venue_id;
  if v_hash is null then raise exception '킬스위치 비밀번호를 먼저 설정하세요'; end if;
  if v_hash <> crypt(p_password, v_hash) then raise exception '킬스위치 비밀번호가 일치하지 않습니다'; end if;
  perform public._audit('kill_venue', p_venue_id::text, jsonb_build_object('owner_name', p_owner_name));
  update public.profiles set venue_id = null where venue_id = p_venue_id;
  foreach v_tbl in array v_whitelist loop
    execute format('delete from public.%I where venue_id = $1', v_tbl) using p_venue_id;
  end loop;
  delete from public.venues where id = p_venue_id;
  return 1;
end $function$;
