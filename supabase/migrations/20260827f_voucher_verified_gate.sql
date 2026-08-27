-- 매장이용권 본인인증 게이트(오너 지시 2026-08-27): 카카오/구글/이메일 가입에 더해
-- 본인인증(ci_hash 보유) 회원만 이용권을 '보유(연결)·사용'할 수 있다.
-- RPC 를 하나씩 고치는 대신 store_vouchers 트리거 한 곳에서 전 경로를 강제 —
-- 어떤 함수(발행·적립·양도·QR/전화 사용)를 거치든 이 게이트를 지나게 된다.
-- 이름만 기록된 미가입 고객 발행(holder_user_id null)은 허용 — 계정 연결 시점에 걸린다.
-- 회수(revoked) 등 매장 측 상태 변경은 막지 않는다: '사용(used)' 전이만 검사.
create or replace function public._voucher_require_verified() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_gate boolean := false;
begin
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
revoke execute on function public._voucher_require_verified() from public, anon, authenticated;

drop trigger if exists trg_voucher_verified on public.store_vouchers;
create trigger trg_voucher_verified
  before insert or update of holder_user_id, status on public.store_vouchers
  for each row execute function public._voucher_require_verified();
