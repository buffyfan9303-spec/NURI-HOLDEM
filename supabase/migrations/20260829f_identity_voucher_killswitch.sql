-- ============================================================================
-- 본인인증 + 매장이용권 **통합 킬스위치** (오너 지시 2026-08-29)
--
-- 지시 원문: "본인인증은 당분간은 비활성화 예정 이와 동시에 일단 매장이용권 관련 비활성화.
--            본인인증이 활성화 되면 그 때 매장이용권 활성화 예정"
--
-- 무엇을 하는가
--   app_settings.identity_voucher_enabled 한 칸이 화면(클라이언트)과 **서버 게이트**를 동시에 지배한다.
--   값이 'on' 이면 지금까지와 100% 동일. 그 외(행 없음·null·'off')면 아래 4개 서버 게이트가
--   '인증 요구'를 내려놓는다. 데이터·RPC·기존 이용권 레코드는 **하나도 건드리지 않는다**.
--
-- 왜 서버까지 손대야 하는가 (이게 이 마이그레이션의 존재 이유다)
--   인증 UI 를 내리면 **아무도 새로 인증할 수 없다**. 그런데 서버 어딘가가 여전히
--   "본인인증을 완료해 주세요" 로 막고 있으면, 그 기능은 풀 방법이 없는 영구 장애가 된다.
--   실제로 하나가 이미 그런 상태였다:
--     ▸ user_messages.um_insert (쪽지 발신) — RLS 가 ci_hash 를 요구한다. 그런데 쪽지 입력창은
--       누구에게나 열려 있고, 막힌 사실은 '보내기'를 누른 뒤 토스트로만 나타난다.
--       라이브 실측(2026-08-29): profiles 7명 중 ci_hash 보유 **1명** — 나머지 6명은
--       쪽지를 쓸 수는 있지만 보낼 수는 없는 상태였다. 인증을 끄면 7명 전원이 그렇게 된다.
--   이용권 3개 게이트는 화면을 함께 내리므로 지금 당장 사용자에게 보이지는 않지만,
--   같은 스위치를 근거로 판단하게 묶어 둔다 — 게이트마다 근거가 다르면 다음에 누군가
--   한쪽만 켜는 순간 또 데드락이 만들어진다.
--
-- 비파괴 확인
--   · 순수 additive: 새 함수 1개 + 기존 함수 3개 CREATE OR REPLACE + 정책 1개 재정의.
--   · DROP TABLE / TRUNCATE / 컬럼 삭제 / 데이터 UPDATE **없음**.
--   · 값이 'on' 이면 네 곳 모두 종전과 문자 그대로 같은 판정을 한다(가지 하나만 앞에 붙음).
--
-- 되돌리는 법 (운영자)
--   켜기 :  select public.set_app_setting('identity_voucher_enabled', 'on');
--   끄기 :  select public.set_app_setting('identity_voucher_enabled', 'off');
--   (set_app_setting 은 my_role()='admin' 강제. 앱에서는 운영자 계정으로
--    setAppSetting('identity_voucher_enabled','on') 을 부르는 경로와 동일하다.)
--   전환은 즉시 서버에 반영되고, 각 브라우저는 다음에 이 값을 읽을 때(앱 재진입) 따라온다.
-- ============================================================================

-- ── ① 스위치 자체 — 기본값 'off'(오너 지시: 기본은 비활성화) ────────────────
--    do nothing: 이미 운영자가 'on' 으로 켜 둔 뒤 이 파일이 재실행돼도 되돌리지 않는다.
insert into public.app_settings(key, value)
values ('identity_voucher_enabled', 'off')
on conflict (key) do nothing;

-- ── ② 단일 판정 헬퍼 ────────────────────────────────────────────────────────
-- 왜 SECURITY DEFINER: RLS 정책(um_insert) 안에서 불린다. 지금 app_settings 는 전체 공개
-- 읽기지만, 나중에 그 정책을 조이는 순간 '설정을 못 읽어서 게이트가 열린다/닫힌다'가 되면
-- 원인 추적이 불가능해진다. 판정 근거는 RLS 와 무관하게 항상 같아야 한다.
-- 왜 STABLE: 한 문장 안에서 여러 행을 검사할 때 매번 다시 읽지 않게(트리거·정책 모두 행 단위).
create or replace function public.identity_gate_on() returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select value from public.app_settings where key = 'identity_voucher_enabled'), '') = 'on';
$$;
revoke all on function public.identity_gate_on() from public, anon;
grant execute on function public.identity_gate_on() to authenticated, service_role;

-- ── ③ 이용권 보유·사용 트리거 ───────────────────────────────────────────────
-- 원본(20260827f)에서 바뀐 것은 맨 앞 두 줄뿐이다. 나머지는 문자 그대로 동일.
create or replace function public._voucher_require_verified() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_gate boolean := false;
begin
  -- 킬스위치 OFF: 인증할 방법 자체가 없는 동안 인증을 요구하지 않는다(영구 장애 방지).
  if not public.identity_gate_on() then return new; end if;
  if tg_op = 'INSERT' then
    v_gate := new.holder_user_id is not null;
  else
    v_gate := (new.holder_user_id is distinct from old.holder_user_id and new.holder_user_id is not null)
           or (new.status = 'used' and old.status is distinct from 'used' and new.holder_user_id is not null);
  end if;
  if v_gate and not exists (
    select 1 from public.profiles p where p.id = new.holder_user_id and p.ci_hash is not null
  ) then
    raise exception '매장이용권은 본인인증 회원만 보유·사용할 수 있습니다 — 프로필 > 보안에서 본인인증을 완료해 주세요';
  end if;
  return new;
end $$;
-- CREATE OR REPLACE 는 ACL 을 초기화한다 → 종전 상태(postgres·service_role 만) 복원.
revoke all on function public._voucher_require_verified() from public, anon, authenticated;
grant execute on function public._voucher_require_verified() to service_role;  -- 종전 ACL 그대로

-- ── ④ issue_voucher / accrue_voucher 의 선(先) 인증 검사 ────────────────────
-- 왜 DO 블록으로 '현재 정의를 읽어 한 조각만 바꾸는' 방식인가:
--   두 함수는 권한·승인·한도·만료·발급·알림까지 든 긴 본문이다. 여기에 통째로 다시 적으면
--   그 순간 이 파일이 정본과 갈라지고(실제로 accrue_voucher 는 리포의 20260829c 본문과
--   라이브 본문이 이미 다르다), 조용한 회귀가 들어갈 자리가 생긴다.
--   현재 정의에서 **딱 한 조각**만 바꾸면 나머지 전부가 원본 그대로임이 구조적으로 보장된다.
--   조각이 정확히 1회 나오지 않으면 예외로 멈춘다 — 조용히 어긋나느니 실패하는 편이 낫다.
do $mig$
declare
  r record;
  v_def text;
  v_old text;
  v_new text;
begin
  for r in
    select p.oid,
           p.oid::regprocedure::text as sig,
           p.proname,
           case p.proname
             when 'issue_voucher'  then 'if p_holder_user_id is not null and not exists ('
             when 'accrue_voucher' then 'if v_uid is not null and not exists ('
           end as frag
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('issue_voucher', 'accrue_voucher')
  loop
    v_def := pg_get_functiondef(r.oid);

    -- 이미 적용됐으면(재실행) 건너뛴다 — 멱등
    if position('public.identity_gate_on() and ' || substr(r.frag, 4) in v_def) > 0 then
      raise notice '%: 이미 적용됨 — 건너뜀', r.sig;
      continue;
    end if;

    v_old := r.frag;
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception '%: 기대한 조각이 정확히 1회가 아니다 — 본문이 바뀌었으니 사람이 확인할 것', r.sig;
    end if;

    v_new := replace(v_def, v_old, 'if public.identity_gate_on() and ' || substr(v_old, 4));
    execute v_new;

    -- CREATE OR REPLACE 로 초기화된 ACL 복원(종전: authenticated + service_role)
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    raise notice '%: 인증 게이트를 킬스위치에 연결했습니다', r.sig;
  end loop;
end $mig$;

-- ── ⑤ 쪽지 발신 RLS — 이 파일에서 **유일하게 지금 사용자에게 보이는** 수정 ──
-- 종전 정의를 그대로 옮기고, 인증 조건만 `킬스위치가 켜져 있을 때만` 으로 감쌌다.
-- 나머지 3개 조건(본인 명의 · 수신자 활성 · 상호 차단 없음)은 문자 그대로 유지 — 스팸 방어는 그대로다.
drop policy if exists um_insert on public.user_messages;
create policy um_insert on public.user_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      not public.identity_gate_on()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.ci_hash is not null)
    )
    and exists (select 1 from public.profiles r where r.id = recipient_id and coalesce(r.status::text, 'active') = 'active')
    and not exists (select 1 from public.user_blocks b
                     where (b.blocker_id = recipient_id and b.blocked_id = auth.uid())
                        or (b.blocker_id = auth.uid() and b.blocked_id = recipient_id))
  );
