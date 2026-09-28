-- ✅ 적용 완료 2026-09-29 (nuri-lead, MCP execute_sql). 실측: trg_reservation_require_verified 0개 ·
--    um_insert = (sender_id = auth.uid() AND _can_message(recipient_id)) · anon 실행권 false.
--
-- 오너 결정(2026-09-29): 본인인증은 매장이용권 수령·사용과 이벤트 참여에만 필요하다.
--   대회 예약·쪽지 보내기는 본인인증 없이 된다. (이용권 트리거 _voucher_require_verified 는 그대로.)
--
-- 함께 고친 결함: 쪽지 INSERT 정책이 profiles·user_blocks 를 **보내는 사람 권한으로** 읽었는데 profiles RLS 가
--   본인 행만 보여 '받는 사람이 활성 계정인가' 가 늘 거짓 → 인증 여부와 무관하게 **쪽지가 한 건도 못 나갔다**
--   (운영 user_messages 0행). 상대가 나를 차단한 행도 보내는 사람에게 안 보였다.
--   → SECURITY DEFINER _can_message(recipient) 가 참/거짓만 돌려준다(프로필 내용은 내주지 않는다).
--
-- 리허설(begin…rollback, 미인증 일반 계정 2개): 미인증 쪽지 OK · 미인증 예약 OK ·
--   남의 이름(sender 위조) 42501 · 자기 자신에게 42501 · 상대가 나를 차단 42501 · anon 실행권 false.

create or replace function public._can_message(p_recipient uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and p_recipient is distinct from auth.uid()
     and exists (select 1 from public.profiles r where r.id = p_recipient and coalesce(r.status::text,'active') = 'active')
     and not exists (select 1 from public.user_blocks b
                     where (b.blocker_id = p_recipient and b.blocked_id = auth.uid())
                        or (b.blocker_id = auth.uid() and b.blocked_id = p_recipient))
$$;
revoke execute on function public._can_message(uuid) from public, anon;
grant execute on function public._can_message(uuid) to authenticated, service_role;

drop trigger if exists trg_reservation_require_verified on public.schedule_reservations;

drop policy if exists um_insert on public.user_messages;
create policy um_insert on public.user_messages for insert to authenticated
  with check (sender_id = auth.uid() and public._can_message(recipient_id));
