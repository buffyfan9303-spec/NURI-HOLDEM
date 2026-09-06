-- ============================================================================
-- 이벤트 — '카드가 다 떨어지면 끝'을 서버가 알게 한다 (오너 지시 2026-09-06:
-- "오늘부터 100장이 소진될 때까지 진행")
--
-- 무엇이 문제였나
--   종료 조건을 ends_at(시각)으로만 표현할 수 있었다. 그런데 이 이벤트의 종료 조건은 시각이 아니라
--   **재고**다. ends_at 을 비워 두면(무기한) 카드가 0장 남은 뒤에도 출석할 때마다 참여권이 계속 쌓인다 —
--   손님은 쓸 수 없는 표를 모으고, 이벤트 페이지에서야 '열 카드가 없다'는 걸 알게 된다.
--   그건 지급이 아니라 헛걸음이다.
--
-- 고침
--   참여권 지급 조건에 '아직 안 열린 카드가 남아 있는가' 를 더한다. 마지막 카드가 열리는 순간
--   그 다음 출석부터는 참여권이 나오지 않는다. 이미 받아 둔 참여권은 그대로 남는다(뺏지 않는다) —
--   다만 열 카드가 없으므로 화면이 '모두 소진'이라고 말한다(클라이언트가 left===0 으로 판단).
--
-- 성능: event_cards 는 캠페인당 100행이고 부분 인덱스가 있어 exists 는 즉시 끝난다.
-- 롤백: 20260906b 의 _grant_event_tickets 본문으로 되돌린다(이 파일의 exists 절만 제거).
-- ============================================================================

create or replace function public._grant_event_tickets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.event_tickets(campaign_id, user_id, checkin_id)
  select c.id, new.user_id, new.id
    from public.event_campaigns c
   where c.status = 'live'
     and (c.ticket_venue_id is null or c.ticket_venue_id = new.venue_id)
     and (c.starts_at is null or now() >= c.starts_at)
     and (c.ends_at is null or now() <= c.ends_at)
     -- ⚠ 재고가 종료 조건이다. 남은 카드가 없으면 참여권을 주지 않는다 —
     --   쓸 수 없는 표를 쥐여 주는 게 안 주는 것보다 나쁘다.
     and exists (
       select 1 from public.event_cards ec
        where ec.campaign_id = c.id and ec.opened_at is null
     )
  on conflict do nothing;   -- 같은 출석이 두 번 들어와도 참여권은 한 장
  return new;
exception when others then
  return new;               -- 이벤트 때문에 출석이 실패하면 안 된다 — 출석이 본체다
end $function$;

revoke all on function public._grant_event_tickets() from public, anon, authenticated;

-- 인덱스: '안 열린 카드가 있는가' 를 캠페인 단위로 즉시 답하게 한다.
create index if not exists event_cards_unopened_idx
  on public.event_cards(campaign_id) where opened_at is null;
