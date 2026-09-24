-- 20260924m — 이용권 이벤트 로그(추가만). 서버·함수 버그로 이용권 기록이 사라지지 않게 (VOUCHER-SECURITY-DURABILITY B②).
-- ✅ 2026-09-24 라이브 적용 완료 · 적용 직후 events=1(기존 1장 SNAPSHOT) · 트리거 3개.
--   리허설(critical R3·R4 + 리드 재확인): 상태 변경마다 1행 · 이벤트 수정 42501 · 다른 매장 업주 0행 · 해당 업주 조회 ·
--   매장 통째 삭제 때도 DELETE 이벤트가 남는다(외래키 없음). 마지막 이벤트의 new_row 로 현재 상태 재구성 일치.
-- 되살리기: jsonb_populate_record(null::public.store_vouchers, old_row). 소프트 삭제 대신 이 방식을 택한 이유 —
--   읽는 쪽 7곳(정책·통계 RPC·지갑)을 바꾸지 않고 지운 행 전체를 보존한다.
-- 한계: 표 소유자(postgres)는 트리거를 끌 수 있다 — 완전한 보호는 외부 백업(backup.yml, 20260924 --no-privileges 제거).
create table if not exists public.voucher_events (
  id bigint generated always as identity primary key,
  voucher_id uuid not null, venue_id uuid,
  op text not null check (op in ('SNAPSHOT','INSERT','UPDATE','DELETE')),
  old_status text, new_status text,
  actor uuid, db_role text not null,
  reason text, at timestamptz not null default clock_timestamp(), txid bigint not null default txid_current(),
  old_row jsonb, new_row jsonb);
create index if not exists voucher_events_voucher_idx on public.voucher_events(voucher_id, id);
create index if not exists voucher_events_venue_idx on public.voucher_events(venue_id, at);
create or replace function public._voucher_events_log() returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  insert into public.voucher_events(voucher_id, venue_id, op, old_status, new_status, actor, db_role, reason, old_row, new_row)
  values (coalesce(new.id, old.id), coalesce(new.venue_id, old.venue_id), tg_op,
          case when tg_op <> 'INSERT' then old.status end, case when tg_op <> 'DELETE' then new.status end,
          auth.uid(), current_user, nullif(current_setting('nuri.voucher_reason', true), ''),
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $f$;
create or replace function public._voucher_events_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $f$
begin raise exception 'voucher_events 는 추가만 됩니다' using errcode = '42501'; end $f$;
drop trigger if exists voucher_events_log on public.store_vouchers;
create trigger voucher_events_log after insert or update or delete on public.store_vouchers
  for each row execute function public._voucher_events_log();
drop trigger if exists voucher_events_no_mut on public.voucher_events;
create trigger voucher_events_no_mut before update or delete on public.voucher_events
  for each row execute function public._voucher_events_immutable();
drop trigger if exists voucher_events_no_trunc on public.voucher_events;
create trigger voucher_events_no_trunc before truncate on public.voucher_events
  for each statement execute function public._voucher_events_immutable();
revoke all on function public._voucher_events_log() from public, anon, authenticated;
revoke all on function public._voucher_events_immutable() from public, anon, authenticated;
alter table public.voucher_events enable row level security;
revoke all on public.voucher_events from public, anon, authenticated;
grant select on public.voucher_events to authenticated;
drop policy if exists voucher_events_select on public.voucher_events;
create policy voucher_events_select on public.voucher_events for select to authenticated
  using (public.can_view_vouchers(venue_id));
insert into public.voucher_events(voucher_id, venue_id, op, new_status, db_role, reason, new_row)
select id, venue_id, 'SNAPSHOT', status, current_user, 'backfill', to_jsonb(sv) from public.store_vouchers sv
 where not exists (select 1 from public.voucher_events e where e.voucher_id = sv.id);
