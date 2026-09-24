-- 20260924k — 닉네임 하나로 통합 · 30일 1회 변경 · 닉네임 이력 추적 · 이용권 받는 사람 검색.  (오너 2026-09-24 NICKNAME-RULES)
--
-- ✅ 2026-09-24 운영 적용 완료(nuri-lead, §1~§10 한 트랜잭션). critical 검토(반려 1건) 반영: resolve_ranking_members real_name=null ·
--    set_my_nickname 사칭어 필터 · find_user_for_transfer 닉네임만. 리허설: X1/X2 사칭 BLOCKED · F 누리홀=0 나누=1 pct=0 ·
--    30일 P1 OK/P2 BLOCKED · R rn=0 · M1=0. 적용 후: name≠nickname 0 · 이력 3 · 트리거 2(옛 쿨다운 제거) · anon set/fuft=false.
--    ⚠ 클라이언트(ProfileModal·AuthModal)는 이 파일이 **먼저** 적용돼야 한다(set_my_nickname 이 30일 규칙을 알아야 한다).
--
-- ── 원인 (오너 1차 질문) ──────────────────────────────────────────────────────────────────
--   handle_new_user(20260909a:56-61): 소셜 가입은 메타 'nickname' 이 없어 v_nick is null →
--   **무조건** `이름_uuid앞4자`(예: 준도_9485). 충돌 때문이 아니다(20260601b:77-80 부터 복사돼 왔다).
--
-- ── 오너 결정 (2026-09-24) ────────────────────────────────────────────────────────────────
--   "받는 아이디와 닉네임은 동일하게. 누리홀덤에서 쓰는 것은 닉네임·실명 두 개뿐. 닉네임은 중복 방지 필수.
--    바뀐 아이디도 이전 닉네임을 기록해서 바뀔 때 계속 추적해 순위·매장이용권 등이 바뀐 닉네임으로 적용되게."
--   "이미 가입한 사람도 닉네임으로 모두 통일 — 두 값이 다르면 공개 닉네임 기준, 중복은 최소 번호, 이전 값은 이력에."
--   "이용권 받는 사람: 닉네임·실명 어느 쪽으로도 검색, '실명 → 닉네임' 후보. 실시간 이용권 목록엔 닉네임만."
--
-- ── 정본 컬럼 결정: profiles.nickname (근거) ───────────────────────────────────────────────
--   nickname 쪽에 이미 붙어 있는 것: 유일 인덱스 uniq_profiles_nickname_ci · 커뮤니티 작성자명 서버 강제(20260919c 14개 트리거) ·
--   이름 사본 전파(20260919b trg_sync_nickname) · venue_rankings/장부/시즌 결과의 글자 연결 · 이용권 발급 대상 검색 ·
--   쪽지 검색 · 매장 구성원 초대(invite_staff_by_nickname) · 순위 회원 대조. name 쪽에만 있는 것은 30일 트리거와
--   is_name_available 뿐이다. → nickname 을 정본으로, **name 은 지우지 않고 거울**(트리거가 항상 nickname 으로 맞춤)로 둔다.
--   name 을 읽는 곳(헤더 메뉴 라벨·share_spot_post·respond_staff_invite·list_venue_owners 등 20여 곳)이 코드 변경 없이 닉네임을 보게 된다.
--   예외 — name 을 '실명 칸'처럼 싣던 순위 입력 RPC 2개(search_ranking_members·resolve_ranking_members)는
--   거울이 되면 real_name 자리에 닉네임이 들어가 venue_rankings.real_name 을 오염시키므로 §9 에서 null 로 바꾼다.
--
-- ── 기존 데이터 이관 규칙 (§3) ─────────────────────────────────────────────────────────────
--   ① 공개 닉네임(nickname)이 있으면 그대로 둔다(이미 유일하니 충돌 0).
--   ② 단 **가입 트리거가 자동으로 만든 꼬리형**(미확정 + `name_uuid4` / `name_uuid8` 과 정확히 일치)은 꼬리를 떼
--      name 으로 되돌린다 — 겹치면 최소 번호(준도2). 이게 오너가 본 '준도_9485' 를 기존 가입자에게서도 없앤다.
--   ③ nickname 이 비었으면 name(없으면 '홀덤회원')에서 최소 번호.
--   ④ 처리 순서는 가입순 — 먼저 가입한 사람이 번호 없는 이름을 갖는다.
--   ⑤ 바뀐 nickname, 그리고 nickname 과 달랐던 옛 name 은 **둘 다** 이력(source='merge')에 남긴다 →
--      옛 name 으로 적힌 장부·순위·근무표도 이력으로 이 계정에 이어진다.
--   ⑥ 모두 nickname_changed_at = null — 통합 뒤 한 번은 바로 바꿀 수 있다.
--   ⑦ 탈퇴 회원은 이력을 남기지 않는다(개인정보 — 탈퇴 시 옛 닉네임도 지운다, §4).
--
-- ── 이력 해석 원칙 (§6) ────────────────────────────────────────────────────────────────────
--   저장된 옛 글자(venue_rankings.nickname · ledger_buyins.player_name 등)는 **고치지 않는다.** 조회할 때
--   nickname_owner_at(글자, 기록 시각) 으로 "그 시각에 그 이름을 쓰던 계정" 을 찾는다.
--   그 시각 이후 이름을 바꾼 사람이 있으면 그 사람, 없으면 지금 그 이름을 쓰는 사람(종전 동작과 같다).
--   같은 이름을 나중에 남이 가져가도 옛 기록은 옛 주인에게 남는다.
--
-- ── 보안 체크 ─────────────────────────────────────────────────────────────────────────────
--   SECURITY DEFINER 는 전부 search_path = public, pg_temp. 내부 함수·트리거 함수는 public/anon/authenticated 회수.
--   변이 RPC 는 public·anon 회수 + authenticated·service_role. 이력 표는 클라이언트 권한 0(RLS on · 정책 0 · grant 0),
--   UPDATE 금지 트리거(추가만). 이용권 받는 사람 검색은 can_manage_pos 아닌 호출자에게 42501, 2자 미만 0건, 8건 상한,
--   실명은 입력과 **정확히 같을 때만** 싣는다(CLAUDE.md 보안 6). 이용권 보유자·사용내역 RPC 는 실명을 싣지 않는다.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- [적용 전 확인] 쓰기 없는 조회 — 리드가 먼저 돌려 영향 인원과 라이브 본문을 본다
-- ════════════════════════════════════════════════════════════════════════════════════════
--   ① 영향 인원
--   select count(*) as total,
--          count(*) filter (where lower(btrim(coalesce(name,''))) <> lower(btrim(coalesce(nickname,'')))) as name_ne_nick,
--          count(*) filter (where not coalesce(nickname_locked,false)
--                             and (nickname = name||'_'||left(id::text,4) or nickname = name||'_'||left(replace(id::text,'-',''),8))) as auto_tail_to_strip,
--          count(*) filter (where nullif(btrim(nickname),'') is null) as no_nickname
--     from public.profiles where status::text <> 'withdrawn';
--   ② 꼬리 떼기가 겹치는 사람(= 번호가 붙을 사람)
--   select p.id, p.nickname, p.name,
--          exists (select 1 from public.profiles q where q.id <> p.id and lower(btrim(q.nickname)) = lower(btrim(p.name))) as will_get_number
--     from public.profiles p
--    where p.status::text <> 'withdrawn' and not coalesce(p.nickname_locked,false)
--      and (p.nickname = p.name||'_'||left(p.id::text,4) or p.nickname = p.name||'_'||left(replace(p.id::text,'-',''),8));
--   ③ 옛 name 으로만 이어져 있던 기록(이력 없이 합치면 끊길 것 — 이 파일은 이력으로 잇는다)
--   select (select count(*) from public.venue_rankings r join public.profiles p on lower(btrim(p.name)) = lower(btrim(r.nickname))
--            where lower(btrim(p.nickname)) <> lower(btrim(r.nickname))) as rankings_by_name,
--          (select count(*) from public.staff_schedule s where s.user_id is null) as shifts_without_owner;
--   ④ 라이브 본문 대조(저장소와 다르면 중단·병합): handle_new_user · set_my_nickname · is_nickname_available ·
--      is_name_available · buy_nickname_reset · my_championships · voucher_history · voucher_holder_profiles ·
--      search_ranking_members · resolve_ranking_members · is_my_shift_row · enforce_nickname_cooldown
--   select p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('handle_new_user','set_my_nickname','is_nickname_available','is_name_available',
--      'buy_nickname_reset','my_championships','voucher_history','voucher_holder_profiles','search_ranking_members',
--      'resolve_ranking_members','is_my_shift_row','enforce_nickname_cooldown') order by 1;
--   ⑤ select to_regprocedure('public.shout_blocked(text)'), to_regprocedure('public.my_role()'),
--            to_regprocedure('public.can_manage_pos(uuid)'), to_regprocedure('public.is_ci_verified(text,timestamptz)');
--   ⑥ select version();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §1. 닉네임 이력 — 추가만
-- ════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.nickname_history (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  old_nickname text not null,
  new_nickname text not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid,
  source       text not null default 'user' check (source in ('user', 'admin', 'system', 'merge'))
);
create index if not exists nickname_history_user_idx   on public.nickname_history (user_id, changed_at);
create index if not exists nickname_history_old_ci_idx on public.nickname_history (lower(btrim(old_nickname)));
alter table public.nickname_history enable row level security;          -- 정책 0 = 클라이언트 읽기·쓰기 0
revoke all on table public.nickname_history from public, anon, authenticated;
revoke all on sequence public.nickname_history_id_seq from public, anon, authenticated;
comment on table public.nickname_history is
  '닉네임 변경 이력(추가만). 옛 글자로 적힌 순위·장부·근무표를 조회 시 현재 계정으로 잇는 근거. 탈퇴 시 그 회원 행은 지운다.';

create or replace function public._nickname_history_no_update()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  raise exception '닉네임 이력은 고칠 수 없습니다(추가만)';
end $fn$;
revoke execute on function public._nickname_history_no_update() from public, anon, authenticated;
drop trigger if exists trg_nickname_history_no_update on public.nickname_history;
create trigger trg_nickname_history_no_update before update on public.nickname_history
  for each row execute function public._nickname_history_no_update();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §2. 비어 있는 가장 짧은 닉네임(준도 → 준도2 …) — 내부 함수
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._free_nickname(p_base text, p_self uuid)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_base text := left(btrim(regexp_replace(coalesce(p_base, ''), '\s+', ' ', 'g')), 20);
  v_try  text;
begin
  if char_length(v_base) < 2 then return null; end if;
  for i in 1..99 loop
    v_try := case when i = 1 then v_base else rtrim(left(v_base, 20 - char_length(i::text))) || i::text end;
    if not exists (select 1 from public.profiles
                    where lower(trim(nickname)) = lower(v_try) and id is distinct from p_self) then
      return v_try;
    end if;
  end loop;
  return null;  -- ponytail: 같은 이름 99명 뒤로는 호출부가 uuid 꼬리로 떨어진다. 그 규모가 되면 순번 표로.
end $fn$;
revoke execute on function public._free_nickname(text, uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3. 기존 데이터 통합 — 트리거·인덱스 정리 → 한 사람씩 확정 → name 거울
-- ════════════════════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists nickname_changed_at timestamptz;
comment on column public.profiles.nickname_changed_at is
  '닉네임 마지막 본인 변경 시각. null = 한 번은 바로 변경 가능. 30일 판정의 유일한 값(트리거가 찍는다).';

-- name 기준 30일 트리거는 §4 의 닉네임 트리거가 대신한다. 먼저 떼야 아래 name 동기화가 30일에 걸려 멈추지 않는다.
drop trigger if exists trg_enforce_nickname_cooldown on public.profiles;
-- 닉네임 유일 인덱스 하나만 남긴다(name 은 거울이라 따로 유일할 필요가 없고, 남기면 이관 중 교차 충돌만 만든다).
drop index if exists public.profiles_name_lower_uidx;

do $merge$
declare
  r        record;
  v_final  text;
  v_tail8  text;
begin
  for r in
    select id, name, nickname, nickname_locked, status::text as st
      from public.profiles
     order by joined_at nulls last, id
  loop
    v_tail8 := left(replace(r.id::text, '-', ''), 8);
    v_final := nullif(btrim(r.nickname), '');
    -- ② 가입 트리거가 만든 꼬리형(본인이 고른 적 없음) → 꼬리 떼기
    if r.st <> 'withdrawn' and v_final is not null and not coalesce(r.nickname_locked, false)
       and nullif(btrim(r.name), '') is not null
       and (v_final = r.name || '_' || left(r.id::text, 4) or v_final = r.name || '_' || v_tail8) then
      -- 이름이 겹쳐 name 에도 꼬리가 붙었던 사람(준도_9485 / 준도_9485_9485)은 name 의 꼬리도 뗀다.
      v_final := coalesce(public._free_nickname(regexp_replace(r.name, '_(' || left(r.id::text, 4) || '|' || v_tail8 || ')$', ''), r.id),
                          v_final);
    end if;
    -- ③ 닉네임 없음
    if v_final is null then
      v_final := coalesce(public._free_nickname(coalesce(nullif(btrim(r.name), ''), '홀덤회원'), r.id),
                          '홀덤회원_' || v_tail8);
    end if;
    -- ⑤ 이력 — 탈퇴 회원은 남기지 않는다
    if r.st <> 'withdrawn' then
      if nullif(btrim(r.nickname), '') is not null and r.nickname is distinct from v_final then
        insert into public.nickname_history (user_id, old_nickname, new_nickname, source)
        values (r.id, r.nickname, v_final, 'merge');
      end if;
      if nullif(btrim(r.name), '') is not null
         and lower(btrim(r.name)) <> lower(v_final)
         and lower(btrim(r.name)) is distinct from lower(btrim(r.nickname)) then
        insert into public.nickname_history (user_id, old_nickname, new_nickname, source)
        values (r.id, r.name, v_final, 'merge');
      end if;
    end if;
    update public.profiles
       set nickname = v_final, name = v_final, nickname_changed_at = null
     where id = r.id
       and (nickname is distinct from v_final or name is distinct from v_final or nickname_changed_at is not null);
  end loop;
end $merge$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §4. 닉네임 규칙 트리거 — 30일(본인·비관리자) · 이력 · name 거울 · 탈퇴 시 이력 삭제
--   경로 무관하게 한 곳에서: set_my_nickname · admin_set_nickname · 직접 update · 탈퇴 익명화.
--   auth.uid() 가 없으면(마이그레이션·크론) 30일을 보지 않는다. 관리자(my_role)는 면제.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.profiles_nickname_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_admin boolean;
begin
  if tg_op = 'UPDATE' and new.nickname is distinct from old.nickname then
    v_admin := coalesce(public.my_role()::text, '') = 'admin';
    if new.status::text = 'withdrawn' then
      -- 탈퇴 익명화: 30일과 무관하게 통과, 옛 닉네임 이력은 지운다(개인정보 보유 최소화).
      delete from public.nickname_history where user_id = new.id;
    else
      if v_actor is not null and not v_admin
         and old.nickname_changed_at is not null
         and now() < old.nickname_changed_at + interval '30 days' then
        raise exception '닉네임은 30일에 한 번 변경할 수 있어요 (다음 변경 가능: %)',
          to_char((old.nickname_changed_at + interval '30 days') at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"');
      end if;
      if v_actor is not null and v_actor = new.id then
        new.nickname_changed_at := now();
      end if;
      if nullif(btrim(old.nickname), '') is not null then
        insert into public.nickname_history (user_id, old_nickname, new_nickname, changed_by, source)
        values (new.id, old.nickname, new.nickname, v_actor,
                case when v_actor is null then 'system' when v_actor = new.id then 'user' else 'admin' end);
      end if;
    end if;
  end if;
  -- 닉네임 하나: name 은 항상 nickname 의 거울(옛 클라이언트가 name 을 보내도 되돌아온다).
  if new.nickname is not null then
    new.name := new.nickname;
  end if;
  return new;
end $fn$;
revoke execute on function public.profiles_nickname_rules() from public, anon, authenticated;
drop trigger if exists trg_profiles_nickname_rules on public.profiles;
create trigger trg_profiles_nickname_rules
  before insert or update on public.profiles
  for each row execute function public.profiles_nickname_rules();

-- 가드 — 본인 PATCH 로 nickname_changed_at 을 지워 30일을 푸는 경로 차단(관리자·DEFINER 경로는 통과).
create or replace function public.guard_nickname_changed_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if current_user in ('authenticated', 'anon')
     and new.nickname_changed_at is distinct from old.nickname_changed_at
     and coalesce(public.my_role()::text, '') <> 'admin' then
    raise exception '닉네임 변경 시각은 직접 바꿀 수 없습니다';
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_nickname_changed_at() from public, anon, authenticated;
drop trigger if exists trg_guard_nickname_changed_at on public.profiles;
create trigger trg_guard_nickname_changed_at
  before update of nickname_changed_at on public.profiles
  for each row execute function public.guard_nickname_changed_at();

-- 옛 트리거 함수는 더 부르는 곳이 없다(§3 에서 트리거를 뗐다). 롤백 대비로 함수는 남긴다.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §5. 가입 — 꼬리 없는 기본값, 겹칠 때만 최소 번호. 20260909a 본체의 나머지는 그대로.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base   text;
  v_cand   text;
  v_nick   text;
  v_role   user_role  := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_status user_status := case when coalesce((new.raw_user_meta_data->>'role')::user_role, 'user') = 'venue_owner'
                               then 'pending'::user_status else 'active'::user_status end;
  v_pubrank boolean   := (new.raw_user_meta_data->>'public_ranking_consent')::boolean;
  -- 동의는 화면에서 체크한 값(메타데이터)만 인정한다(20260909a 그대로).
  v_terms  boolean    := coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false);
begin
  -- 후보: 가입 화면 닉네임 → 소셜 이름들 → 이메일 앞부분 → '홀덤회원'. 2자 이상 · 금칙어/사칭어 아님.
  foreach v_cand in array array[
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'preferred_username',
      split_part(coalesce(new.email, ''), '@', 1)] loop
    v_cand := left(btrim(regexp_replace(coalesce(v_cand, ''), '\s+', ' ', 'g')), 20);
    if char_length(v_cand) >= 2
       and not public.shout_blocked(v_cand)
       and v_cand !~* '운영자|관리자|누리\s*홀덤|^admin' then
      v_base := v_cand; exit;
    end if;
  end loop;
  v_base := coalesce(v_base, '홀덤회원');
  v_nick := coalesce(public._free_nickname(v_base, new.id), left(v_base, 11) || '_' || left(replace(new.id::text, '-', ''), 8));
  -- ponytail: 같은 이름 동시 가입 경합은 종전과 같다(검사 → insert 사이 23505). 실제로 나면 insert 재시도 루프로.

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at,
    public_ranking_consent, public_ranking_consent_at,
    consented_legal_version, consented_legal_version_at
  ) values (
    new.id, new.email, v_nick, v_nick, v_role, v_status,
    v_terms,
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when v_terms then now() else null end,
    v_pubrank,
    case when v_pubrank is not null then now() else null end,
    case when v_terms then public.current_legal_version() else null end,
    case when v_terms then now() else null end
  ) on conflict (id) do nothing;

  -- 여기서는 이력 행(legal_consents)을 만들지 않는다(20260909a 그대로).

  if new.raw_user_meta_data->>'avatar_url' is not null then
    update public.profiles set avatar_url = new.raw_user_meta_data->>'avatar_url'
     where id = new.id and avatar_url is null;
  end if;

  if v_role = 'venue_owner' then
    update public.profiles set approved = false, phone = nullif(new.raw_user_meta_data->>'phone','')
     where id = new.id;
  elsif v_role = 'venue_staff' then
    update public.profiles set venue_id = nullif(new.raw_user_meta_data->>'venue_id', '')::uuid, approved = false
     where id = new.id;
  end if;

  return new;
end;
$function$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §6. 닉네임 변경·검사 RPC
-- ════════════════════════════════════════════════════════════════════════════════════════
-- 본인 닉네임 변경. 30일·이력·name 동기화는 §4 트리거가 한다(경로가 하나라 어긋날 수 없다).
create or replace function public.set_my_nickname(p_nickname text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v     text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  v_cur text;
begin
  if v_uid is null then raise exception using errcode = '42501', message = '로그인이 필요합니다'; end if;
  if char_length(v) < 2 then raise exception '닉네임은 2자 이상 입력하세요'; end if;
  if char_length(v) > 20 then raise exception '닉네임은 20자 이하로 입력하세요'; end if;
  -- critical 2026-09-24 M2: 사칭어 필터가 가입 트리거에만 있었다(30일마다 바꿀 수 있어 노출이 넓어짐)
  if public.my_role() is distinct from 'admin'::user_role
     and (public.shout_blocked(v) or v ~* '운영자|관리자|누리\s*홀덤|^admin') then
    raise exception '사용할 수 없는 닉네임입니다';
  end if;

  select nickname into v_cur from public.profiles where id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_cur is not distinct from v then
    update public.profiles set nickname_locked = true where id = v_uid;   -- 같은 값: 확정만, 시계는 안 돈다
    return;
  end if;
  if exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v) and id <> v_uid) then
    raise exception '이미 사용 중인 닉네임입니다';
  end if;
  update public.profiles set nickname = v, nickname_locked = true where id = v_uid;
end;
$function$;
revoke execute on function public.set_my_nickname(text) from public, anon;
grant  execute on function public.set_my_nickname(text) to authenticated, service_role;

-- 가용성 — 2~20자, 로그인 상태면 본인 제외(지금 닉네임 그대로 저장해도 '사용 중' 이 아니다).
create or replace function public.is_nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_nickname is null or char_length(btrim(p_nickname)) < 2 or char_length(btrim(p_nickname)) > 20 then false
    else not exists (select 1 from public.profiles
                      where lower(trim(nickname)) = lower(btrim(p_nickname)) and id is distinct from auth.uid())
  end;
$$;
revoke execute on function public.is_nickname_available(text) from public;
grant  execute on function public.is_nickname_available(text) to anon, authenticated, service_role;

-- 옛 클라이언트(가입 화면의 '닉네임' 칸)가 부르는 이름 검사도 같은 이름공간을 본다.
create or replace function public.is_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.is_nickname_available(p_name); $$;
revoke execute on function public.is_name_available(text) from public;
grant  execute on function public.is_name_available(text) to anon, authenticated, service_role;

-- 닉네임 즉시 변경권 — 30일 판정 값을 nickname_changed_at 으로 옮긴다(나머지 20260830n 그대로).
create or replace function public.buy_nickname_reset()
returns table(available integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_price  int;
  v_status text;
  v_role   text;
  v_points int;
  v_spent  int;
  v_last   timestamptz;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select price into v_price from public.shop_skus where key = 'nick_change' and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  select coalesce(p.status::text, 'active'), coalesce(p.role::text, 'user'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0), p.nickname_changed_at
    into v_status, v_role, v_points, v_spent, v_last
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 구매할 수 없습니다'; end if;

  -- 쿨다운 판정은 profiles_nickname_rules 트리거와 **같은 식**이어야 한다.
  if v_role = 'admin' or v_last is null or now() - v_last >= interval '30 days' then
    raise exception '지금 바로 닉네임을 바꿀 수 있어요 — 이 권한은 필요하지 않습니다';
  end if;

  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_price,
         nickname_changed_at = null          -- = 대기 시간 면제(트리거가 보는 유일한 값)
   where id = v_uid;

  insert into public.point_purchases (user_id, kind, sku_key, cost, duration_hours)
  values (v_uid, 'nick_change', 'nick_change', v_price, 0);

  return query select greatest(0, v_points - v_spent - v_price);
end $function$;
revoke all on function public.buy_nickname_reset() from public, anon;
grant execute on function public.buy_nickname_reset() to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §7. 이력 해석 — 옛 글자 → 그 시각의 계정
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.nickname_owner_at(p_name text, p_at timestamptz default now())
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (select lower(btrim(coalesce(p_name, ''))) as k, coalesce(p_at, now()) as t),
  past as (
    -- 그 시각에 이 이름을 쓰다가 **그 뒤에** 바꾼 사람(그 사이 다른 변경이 없어야 한다)
    select h.user_id
      from public.nickname_history h, q
     where q.k <> '' and lower(btrim(h.old_nickname)) = q.k and h.changed_at > q.t
       and not exists (select 1 from public.nickname_history h2
                        where h2.user_id = h.user_id and h2.changed_at > q.t and h2.changed_at < h.changed_at)
     order by h.changed_at
     limit 1
  )
  select coalesce(
    (select user_id from past),
    (select p.id from public.profiles p, q where q.k <> '' and lower(btrim(p.nickname)) = q.k limit 1));
$$;
revoke execute on function public.nickname_owner_at(text, timestamptz) from public, anon, authenticated;
comment on function public.nickname_owner_at(text, timestamptz) is
  '옛 글자로 적힌 기록의 주인. 그 시각 이후 그 이름에서 바꾼 사람이 있으면 그 사람, 없으면 지금 그 이름의 주인. 내부용.';

-- 조회 화면용 표시 이름 — 주인이 있으면 지금 닉네임, 없으면 적힌 글자 그대로(워크인 손님).
create or replace function public.nickname_display_at(p_name text, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.nickname from public.profiles p
                    where p.id = public.nickname_owner_at(p_name, p_at) and p.status::text <> 'withdrawn'), p_name);
$$;
revoke execute on function public.nickname_display_at(text, timestamptz) from public, anon, authenticated;

-- 내 옛 닉네임들(내 기록 조회용). 남의 이력은 안 나간다.
create or replace function public.my_nickname_aliases()
returns table(nickname text, until_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.old_nickname, h.changed_at from public.nickname_history h where h.user_id = auth.uid()
  union all
  select p.nickname, null::timestamptz from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.my_nickname_aliases() from public, anon;
grant  execute on function public.my_nickname_aliases() to authenticated, service_role;

-- 내 입상 기록 — 옛 닉네임으로 적힌 순위도 그 시각의 주인이 나면 포함.
create or replace function public.my_ranking_history(p_limit integer default 30)
returns table(ranking_date date, "position" integer, prize text, venue_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with al as (select distinct lower(btrim(a.nickname)) as k from public.my_nickname_aliases() a where a.nickname is not null)
  select r.ranking_date, r."position", r.prize, coalesce(v.name, '(매장)')
    from public.venue_rankings r
    join al on lower(btrim(r.nickname)) = al.k
    left join public.venues v on v.id = r.venue_id
   where auth.uid() is not null
     and public.nickname_owner_at(r.nickname, r.created_at) = auth.uid()
   order by r.ranking_date desc, r.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;
revoke execute on function public.my_ranking_history(integer) from public, anon;
grant  execute on function public.my_ranking_history(integer) to authenticated, service_role;

-- 우승 횟수 — 내 지금 닉네임으로 부르면 옛 닉네임 우승까지 센다(남의 닉네임으로 부르면 종전 그대로).
create or replace function public.my_championships(p_nickname text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with me as (
    select exists (select 1 from public.profiles p
                    where p.id = auth.uid() and lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')))) as is_me
  ),
  al as (select distinct lower(btrim(a.nickname)) as k from public.my_nickname_aliases() a where a.nickname is not null)
  select case
    when coalesce(btrim(p_nickname), '') = '' then 0
    when (select is_me from me) then (
      select count(*)::int
        from public.venue_season_results sr
        join al on lower(btrim(sr.nickname)) = al.k
        left join public.venue_seasons s on s.id = sr.season_id
       where sr.rank = 1
         and public.nickname_owner_at(sr.nickname, coalesce(s.ends_on::timestamptz, now())) = auth.uid())
    else (
      select count(*)::int from public.venue_season_results
       where rank = 1 and lower(nickname) = lower(btrim(p_nickname)))
  end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §8. 매장이용권 — 받는 사람 검색(닉네임·실명·옛 닉네임) · 목록은 닉네임만
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.search_voucher_recipients(p_venue_id uuid, p_q text)
returns table(user_id uuid, nickname text, real_name text, verified boolean, matched text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_q    text := left(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 30);
  v_k    text;
  v_like text;
begin
  if auth.uid() is null or not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception using errcode = '42501', message = '권한이 없습니다 — 매장이용권 발급 권한자만 검색할 수 있습니다';
  end if;
  if char_length(v_q) < 2 then return; end if;
  v_k    := lower(v_q);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with hit as (
    select p.id,
           p.nickname,
           -- 실명은 입력과 정확히 같을 때만(선택 확인용). 부분 일치로는 절대 안 나간다.
           case when lower(btrim(p.real_name)) = v_k then p.real_name end as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           case when lower(btrim(p.nickname)) = v_k then 'nickname'
                when lower(btrim(p.real_name)) = v_k then 'real_name'
                when exists (select 1 from public.nickname_history h
                              where h.user_id = p.id and lower(btrim(h.old_nickname)) = v_k) then 'old_nickname'
                else 'partial' end as how
      from public.profiles p
     where coalesce(p.status::text, 'active') = 'active'
       and p.id <> auth.uid()
       and ( p.nickname ilike v_like
          or lower(btrim(p.real_name)) = v_k
          or exists (select 1 from public.nickname_history h
                      where h.user_id = p.id and lower(btrim(h.old_nickname)) = v_k) )
  )
  select h.id, h.nickname, h.rn, h.ver, h.how
    from hit h
   order by case h.how when 'nickname' then 0 when 'real_name' then 1 when 'old_nickname' then 2 else 3 end,
            h.ver desc, h.nickname
   limit 8;
end $fn$;
revoke execute on function public.search_voucher_recipients(uuid, text) from public, anon;
grant  execute on function public.search_voucher_recipients(uuid, text) to authenticated, service_role;
comment on function public.search_voucher_recipients(uuid, text) is
  '이용권 받는 사람 검색(can_manage_pos). 닉네임 부분일치 · 실명/옛 닉네임은 정확일치. 실명은 입력과 같을 때만 싣는다. 8건. (20260924k)';

-- 보유자·사용내역 — 실시간 목록은 닉네임만(오너 결정). 반환형은 그대로 두고 real_name 을 비운다.
create or replace function public.voucher_holder_profiles(p_venue_id uuid)
returns table(user_id uuid, real_name text, nickname text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select p.id, null::text, p.nickname
    from public.profiles p
   where can_view_vouchers(p_venue_id)
     and p.id in (select distinct holder_user_id from public.store_vouchers
                   where venue_id = p_venue_id and holder_user_id is not null);
$function$;
revoke execute on function public.voucher_holder_profiles(uuid) from public, anon;
grant  execute on function public.voucher_holder_profiles(uuid) to authenticated;

create or replace function public.voucher_history(p_venue_id uuid)
returns table(id uuid, title text, holder_name text, real_name text, nickname text, used_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $function$
  select sv.id, sv.title,
         -- 발급 당시 이름 칸에 '실명(닉네임)' 이 적혀 있을 수 있다 — 계정이 있으면 지금 닉네임으로 덮는다.
         case when p.id is not null then p.nickname else sv.holder_name end,
         null::text, p.nickname, sv.used_at
    from public.store_vouchers sv
    left join public.profiles p on p.id = sv.holder_user_id
   where sv.venue_id = p_venue_id and sv.status = 'used' and can_view_vouchers(p_venue_id)
   order by sv.used_at desc nulls last
   limit 100;
$function$;
revoke execute on function public.voucher_history(uuid) from public, anon;
grant  execute on function public.voucher_history(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §9. name 을 '실명 칸' 으로 싣던 순위 입력 RPC — 거울이 되면 real_name 자리에 닉네임이 들어가므로 비운다
--   (20260911j 본체 그대로, `p.name` 두 자리만 null::text. 실명 표시가 필요하면 별도 결정으로 real_name 을 싣는다.)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.search_ranking_members(p_q text)
returns table(id uuid, nickname text, real_name text, verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with rel as materialized (
    select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
  ),
  hit as (
    select p.id as uid,
           p.nickname as nick,
           null::text as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           coalesce(lower(btrim(p.nickname)) = lower(btrim(coalesce(p_q, ''))), false) as is_exact
      from rel
      join public.profiles p on p.id = rel.uid
     where public.can_search_ranking_members()
       and coalesce(p.status::text, 'active') = 'active'
       and btrim(coalesce(p_q, '')) <> ''
       and p.nickname ilike '%' || btrim(p_q) || '%'
    union all
    select p.id, p.nickname, null::text, public.is_ci_verified(p.ci_hash, p.verified_at), true
      from public.profiles p
     where public.can_search_ranking_members()
       and coalesce(p.status::text, 'active') = 'active'
       and btrim(coalesce(p_q, '')) <> ''
       and lower(btrim(p.nickname)) = lower(btrim(p_q))
       and not exists (select 1 from rel where rel.uid = p.id)
  )
  select h.uid, h.nick, h.rn, h.ver
    from hit h
   order by h.is_exact desc, h.nick
   limit 12;
$$;
revoke all on function public.search_ranking_members(text) from public, anon;
grant execute on function public.search_ranking_members(text) to authenticated, service_role;
-- resolve_ranking_members — 라이브 본문(md5 16bc895f…, 2026-09-24 리드 확인)에서 real_name 칸 한 줄만 null 로.
create or replace function public.resolve_ranking_members(p_names text[])
 returns table(q text, id uuid, nickname text, real_name text, verified boolean)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with rel as materialized (
    select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
  )
  select n.q,
         p.id,
         p.nickname,
         null::text,
         public.is_ci_verified(p.ci_hash, p.verified_at)
    from unnest((coalesce(p_names, '{}'::text[]))[1:100]) as n(q)
    join public.profiles p
      on lower(btrim(p.nickname)) = lower(btrim(n.q))
    left join rel c on c.uid = p.id
   where public.can_search_ranking_members()
     and coalesce(p.status::text, 'active') = 'active'
     and btrim(coalesce(n.q, '')) <> '';
$function$;
revoke all on function public.resolve_ranking_members(text[]) from public, anon;
grant execute on function public.resolve_ranking_members(text[]) to authenticated, service_role;

-- find_user_for_transfer — 숨은 name 부분일치로 계정을 찾던 경로 제거(닉네임만, 2자 이상, 활성, 본인 제외). critical 2026-09-24 ④.
create or replace function public.find_user_for_transfer(p_nickname text)
 returns table(id uuid, display text, verified boolean)
 language sql stable security definer set search_path = public, pg_temp
as $function$
  with q as (select btrim(coalesce(p_nickname, '')) as s)
  select p.id, p.nickname, public.is_ci_verified(p.ci_hash, p.verified_at)
    from public.profiles p, q
   where char_length(q.s) >= 2
     and coalesce(p.status::text, 'active') = 'active'
     and p.id <> auth.uid()
     and p.nickname ilike '%' || replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by (lower(btrim(p.nickname)) = lower(q.s)) desc, public.is_ci_verified(p.ci_hash, p.verified_at) desc, p.nickname
   limit 8;
$function$;
revoke all on function public.find_user_for_transfer(text) from public, anon;
grant execute on function public.find_user_for_transfer(text) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §10. 근무표 이름 매칭 — 통합으로 name 이 바뀐 직원이 옛 이름 행(user_id 없음)을 잃지 않게 이력도 본다
--   (20260829b 본체 + 이력 두 곳. 동명이인 2명 이상이면 아무도 통과 못 하는 규칙은 그대로.)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.is_my_shift_row(p_venue_id uuid, p_staff_name text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (p.venue_id = p_venue_id or public.can_manage_pos(p_venue_id))
    )
    and case
      when p_user_id is not null then p_user_id = auth.uid()
      when btrim(coalesce(p_staff_name, '')) = '' then false
      else (
             exists (select 1 from public.profiles p
                      where p.id = auth.uid()
                        and (lower(btrim(p_staff_name)) = lower(btrim(p.name))
                          or lower(btrim(p_staff_name)) = lower(btrim(p.nickname))))
             or exists (select 1 from public.nickname_history h
                         where h.user_id = auth.uid() and lower(btrim(h.old_nickname)) = lower(btrim(p_staff_name)))
           )
           and (select count(*) from public.profiles q
                 where q.venue_id = p_venue_id
                   and (lower(btrim(p_staff_name)) = lower(btrim(q.name))
                     or lower(btrim(p_staff_name)) = lower(btrim(q.nickname))
                     or exists (select 1 from public.nickname_history h
                                 where h.user_id = q.id and lower(btrim(h.old_nickname)) = lower(btrim(p_staff_name))))) <= 1
    end;
$$;
revoke all on function public.is_my_shift_row(uuid, text, uuid) from public, anon;
grant execute on function public.is_my_shift_row(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- [리허설] 라이브에서 begin … rollback. 쓰기는 전부 되돌린다.
--   계정 고르기(역할·소유·잠금 먼저 — nuri-migration §5):
--     select p.id, p.role, p.status, p.nickname, p.nickname_locked, p.real_name is not null as has_real,
--            (select count(*) from public.venues v where v.owner_id = p.id) as owns
--       from public.profiles p where p.status = 'active' order by p.role, p.joined_at limit 30;
--   :U 일반 user(업주 아님) · :O 다른 일반 user · :A admin · :W 업주 · :V 그 업주 매장 id · :W2 다른 매장 업주(:V 권한 없음)
--   · :R 실명 있는 회원(real_name 값 :RN)
--   auth.users 삽입 열: (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at),
--     instance_id='00000000-0000-0000-0000-000000000000', aud=role='authenticated' (20260909a 검증 ③ 과 같다).
--
-- begin;
--   -- ── 음성 대조 0 (적용 전 옛 동작이 실제로 있는지 — 없으면 뒤 시험은 아무것도 증명 못 한다)
--   insert into auth.users (…) values ('00000000-0000-4000-8000-0000000a0001', …, 'np0@example.com',
--          '{"provider":"google","providers":["google"]}', '{"name":"닉프로브"}', now(), now());
--   select nickname ~ '_[0-9a-f]{4}$' from public.profiles where id = '00000000-0000-4000-8000-0000000a0001';   -- 옛: true
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':U', 'role', 'authenticated')::text, true);
--   select count(*) from public.voucher_holder_profiles(':V');   -- 옛: 업주 아님 → 0행(게이트 존재 확인)
--   reset role;
--   select count(*) filter (where real_name is not null) from public.voucher_holder_profiles(':V');  -- (postgres 는 can_view_vouchers 가 false → 0)
--
--   <이 파일 전문 §1 ~ §10>
--
--   -- ── 통합 결과
--   select count(*) from public.profiles where status::text <> 'withdrawn' and name is distinct from nickname;      -- 0
--   select count(*) from public.profiles where status::text <> 'withdrawn'
--      and nickname ~ '_[0-9a-f]{4}$' and not nickname_locked;                                                        -- ② 조회의 will_get_number 수 이하
--   select source, count(*) from public.nickname_history group by 1;                                                   -- merge 만
--   select 0a0001 의 nickname → '닉프로브'(또는 닉프로브N), 이력 1행(old=닉프로브_xxxx)
--
--   -- ── 가입(A): 꼬리 없음, 겹칠 때만 번호
--   insert … '0a0002' '{"name":"닉프로브"}' ; insert … '0a0003' '{"name":"J"}' email 'jq@example.com' ;
--   insert … '0a0004' '{"name":"운영자"}' email 'x@example.com' ;
--   insert … '0a0005' provider email '{"name":"무시","nickname":"닉프로브"}' ;
--   select id, name, nickname from public.profiles where id::text like '00000000-0000-4000-8000-0000000a000%' order by id;
--   -- 기대: 0002 닉프로브2 · 0003 jq · 0004 홀덤회원(N) · 0005 닉프로브3 · 전부 name = nickname
--
--   -- ── 30일(B) 음성
--   update public.profiles set nickname_changed_at = now() - interval '1 day' where id = ':U';
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':U', 'role', 'authenticated')::text, true);
--   do $$ begin perform public.set_my_nickname('np_n1'); raise exception 'FAIL N1'; exception when others then
--         if sqlerrm not like '닉네임은 30일에 한 번%' then raise; end if; end $$;                                     -- N1 30일 안
--   do $$ begin update public.profiles set nickname_changed_at = null where id = ':U'; raise exception 'FAIL N2';
--         exception when others then if sqlerrm not like '닉네임 변경 시각은%' then raise; end if; end $$;            -- N2 시각 지우기
--   do $$ declare n int; begin update public.profiles set nickname = 'np_hijack' where id = ':O';
--         get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL N3 %', n; end if;
--         exception when others then if sqlerrm like 'FAIL N3%' then raise; end if; end $$;                              -- N3 남의 행
--   do $$ begin update public.profiles set name = 'np_name_only' where id = ':U'; end $$;
--   reset role;
--   select name = nickname from public.profiles where id = ':U';                                                       -- N4 name 단독 변경은 거울로 되돌아옴 → true
--   select has_function_privilege('anon','public.set_my_nickname(text)','execute'),                                   -- false
--          has_function_privilege('authenticated','public.nickname_owner_at(text,timestamptz)','execute'),             -- false
--          has_function_privilege('authenticated','public._free_nickname(text,uuid)','execute'),                       -- false
--          has_function_privilege('anon','public.search_voucher_recipients(uuid,text)','execute'),                     -- false
--          (select count(*) from information_schema.role_table_grants
--            where table_name = 'nickname_history' and grantee in ('anon','authenticated'));                           -- 0
--
--   -- ── 30일(B) 양성
--   update public.profiles set nickname_changed_at = null where id = ':U';
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':U', 'role', 'authenticated')::text, true);
--   select public.set_my_nickname('np_p1');                                                                             -- P1 첫 변경
--   reset role;
--   select nickname, name, nickname_changed_at > now() - interval '1 minute',
--          (select count(*) from public.nickname_history where user_id = ':U' and new_nickname = 'np_p1' and source = 'user')
--     from public.profiles where id = ':U';                                                                            -- np_p1 | np_p1 | t | 1
--   update public.profiles set nickname_changed_at = now() - interval '31 days' where id = ':U';
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':U', 'role', 'authenticated')::text, true);
--   select public.set_my_nickname('np_p2');                                                                             -- P2 30일 뒤
--   select set_config('request.jwt.claims', json_build_object('sub', ':A', 'role', 'authenticated')::text, true);
--   select public.set_my_nickname('np_admin');  select public.set_my_nickname('np_admin2');                             -- P3 관리자 연속
--   reset role;
--   -- 이력 해석: :U 의 옛 이름(np_p1)으로 적힌 옛 순위 행은 :U, 새로 가져간 사람이 있어도 옛 행은 그대로
--   select public.nickname_owner_at('np_p1', now() - interval '1 hour') = ':U';                                         -- true
--
--   -- ── 이용권 받는 사람 검색 — 음성
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':U', 'role', 'authenticated')::text, true);
--   do $$ begin perform * from public.search_voucher_recipients(':V', 'np'); raise exception 'FAIL V1';
--         exception when insufficient_privilege then null; end $$;                                                     -- V1 일반회원 42501
--   select set_config('request.jwt.claims', json_build_object('sub', ':W2', 'role', 'authenticated')::text, true);
--   do $$ begin perform * from public.search_voucher_recipients(':V', 'np'); raise exception 'FAIL V2';
--         exception when insufficient_privilege then null; end $$;                                                     -- V2 다른 매장 업주 42501
--   select set_config('request.jwt.claims', '', true);
--   do $$ begin perform * from public.search_voucher_recipients(':V', 'np'); raise exception 'FAIL V3';
--         exception when insufficient_privilege then null; end $$;                                                     -- V3 비로그인 42501
--   -- ── 이용권 받는 사람 검색 — 양성(:W 는 :V 업주)
--   select set_config('request.jwt.claims', json_build_object('sub', ':W', 'role', 'authenticated')::text, true);
--   select * from public.search_voucher_recipients(':V', ':RN');       -- :R 한 줄, real_name = :RN, matched = real_name
--   select * from public.search_voucher_recipients(':V', left(':RN', 1));   -- 1자 → 0행
--   select * from public.search_voucher_recipients(':V', 'np_p');      -- :U (np_p2) partial, real_name null
--   select * from public.search_voucher_recipients(':V', 'np_p1');     -- :U matched = old_nickname, nickname = np_p2
--   select count(*) filter (where real_name is not null) from public.voucher_holder_profiles(':V');   -- 0 (닉네임만)
--   select count(*) filter (where real_name is not null) from public.voucher_history(':V');           -- 0
--   reset role;
--
--   -- ── 음성 대조(가드) — 가드를 빼면 N2 가 통과해야 한다
--   drop trigger trg_guard_nickname_changed_at on public.profiles;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':U', 'role', 'authenticated')::text, true);
--   update public.profiles set nickname_changed_at = null where id = ':U';   -- 1행 성공 = 가드가 유일한 차단
--   reset role;
-- rollback;
--   -- 롤백 확인: select to_regclass('public.nickname_history');  -- null
--
-- [롤백(적용 후)] — 데이터 이관(§3)이 있어 되돌림은 두 단계다
--   ① 함수·트리거: handle_new_user(20260909a) · set_my_nickname(baseline 2026-07-20:4268) · is_nickname_available(20260601b) ·
--      is_name_available(20260903c) · buy_nickname_reset(20260830n) · my_championships(baseline:3171) ·
--      voucher_history/voucher_holder_profiles(baseline:4612/4627) · search_ranking_members(20260911j) · is_my_shift_row(20260829b)
--      본문 재실행 → drop trigger trg_profiles_nickname_rules, trg_guard_nickname_changed_at →
--      create trigger trg_enforce_nickname_cooldown before update on profiles for each row execute function enforce_nickname_cooldown();
--   ② 데이터: nickname_history 의 source='merge' 행이 옛 값이다. 옛 name/nickname 복원은
--      update profiles p set nickname = h.old_nickname from nickname_history h where … (행별 검토 — 그사이 남이 가져간 이름 주의).
--      profiles_name_lower_uidx 재생성은 name 중복 0 을 먼저 확인한 뒤.
