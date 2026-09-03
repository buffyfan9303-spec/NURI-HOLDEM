-- 20260904a — 본인확인 인증 ID 일회성 처리
--
-- 왜: KCP/KISA '본인확인서비스 이용기관 취약점 자체점검 체크리스트' ④(데이터 재사용) —
--   "동일 웹사이트에서 과거에 수집된 인증정보(암호화 데이터, 거래번호, 토큰, 세션 등)를
--    재사용하지 못하도록 조치하였는가?"
--   기존에도 profiles.ci_hash 유니크 제약으로 **타인 명의 가입**은 구조적으로 막혔지만
--   (탈취한 identityVerificationId 로 인증해도 CI 가 이미 쓰인 명의면 dup 으로 거절),
--   인증 ID 자체를 한 번만 쓰게 하는 기록은 없었다. 그 층을 추가한다.
--
-- 설계:
--   · 원문 대신 HMAC 해시(hash_ci 재사용 — Vault 의 ci_hmac_key)만 저장한다. 거래식별자도 남기지 않는다.
--   · 같은 사용자가 같은 ID 로 다시 커밋하면 **멱등 성공**(네트워크 재시도·중복 클릭 정상 흐름).
--     다른 사용자가 같은 ID 를 쓰면 'reused' 로 거절한다(탈취·재사용 공격).
--   · 인증 ID 를 넘기지 않는 옛 호출도 계속 동작하도록 p_idv 는 default null (배포 순서 무관).
--
-- 롤백:
--   drop function if exists public.verify_identity_commit(uuid,text,text,text,date,text,text,text);
--   (그 뒤 20260810 계열의 7-인자 정의를 복원)
--   drop table if exists public.used_identity_verifications;

-- ── 1) 사용된 인증 ID 기록 ────────────────────────────────────────────────────
create table if not exists public.used_identity_verifications (
  idv_hash text primary key,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  used_at   timestamptz not null default now()
);
comment on table public.used_identity_verifications is
  '본인확인 인증 ID(identityVerificationId)의 HMAC 해시. 일회성 보장 — 같은 ID 의 타인 재사용을 막는다(KISA 체크리스트 ④).';
create index if not exists used_idv_user_idx on public.used_identity_verifications (user_id, used_at desc);

-- 읽기·쓰기 모두 service_role 전용(정책을 만들지 않는다 = 일반 롤은 전면 차단).
alter table public.used_identity_verifications enable row level security;
revoke all on table public.used_identity_verifications from anon, authenticated;

-- ── 2) 커밋 함수 — 인증 ID 일회성 검사 추가 ──────────────────────────────────
drop function if exists public.verify_identity_commit(uuid, text, text, text, date, text, text);

create or replace function public.verify_identity_commit(
  p_uid uuid, p_ci text, p_name text, p_phone text, p_birth date,
  p_gender text, p_carrier text, p_idv text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_hash text; v_tomb boolean; v_idv_hash text; v_owner uuid;
begin
  v_hash := public.hash_ci(p_ci);
  if p_uid is null or v_hash is null then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  -- 인증 ID 일회성 — 같은 사용자의 재시도는 통과, 타인의 재사용은 거절.
  if p_idv is not null and btrim(p_idv) <> '' then
    v_idv_hash := public.hash_ci(p_idv);
    insert into public.used_identity_verifications (idv_hash, user_id)
    values (v_idv_hash, p_uid)
    on conflict (idv_hash) do nothing;
    if not found then
      select user_id into v_owner from public.used_identity_verifications where idv_hash = v_idv_hash;
      if v_owner is distinct from p_uid then
        return jsonb_build_object('ok', false, 'code', 'reused');
      end if;
    end if;
  end if;

  if exists (select 1 from public.profiles where ci_hash = v_hash and id <> p_uid) then
    return jsonb_build_object('ok', false, 'code', 'dup');
  end if;
  v_tomb := exists (select 1 from public.withdrawn_identities w where w.ci_hash = v_hash);
  update public.profiles set
    ci_hash = v_hash,
    real_name = p_name, phone = p_phone, birth_date = p_birth,
    gender = p_gender, carrier = p_carrier,
    verified_at = now(),
    identity_tombstoned = v_tomb
  where id = p_uid;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_profile'); end if;
  return jsonb_build_object('ok', true, 'tombstoned', v_tomb);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'dup');
end $function$;

comment on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) is
  '본인확인 결과 커밋 — CI 는 HMAC 해시로만 저장, 1인 1계정(ci_hash 유니크), 인증 ID 일회성. 호출자는 verify-identity 엣지 함수(service_role).';

-- ACL 표준: CREATE OR REPLACE 는 기본 GRANT 를 되돌리므로 다시 회수한다. 이 함수는 service_role 전용.
revoke execute on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) from public, anon, authenticated;
grant  execute on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) to service_role;

notify pgrst, 'reload schema';
