-- 쪽지(개인 메시지) v1 — 오너 지시 2026-08-27. 순수 additive DDL(기존 테이블 무변경).
-- 발신은 본인인증 회원만(어뷰징·스팸 방지 — 이용권 게이트와 같은 기준), 차단 관계는 발신 불가.
create table if not exists public.user_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sender_deleted boolean not null default false,
  recipient_deleted boolean not null default false,
  check (sender_id <> recipient_id)
);
create index if not exists user_messages_recipient_idx on public.user_messages (recipient_id, created_at desc);
create index if not exists user_messages_sender_idx on public.user_messages (sender_id, created_at desc);

alter table public.user_messages enable row level security;

-- 읽기: 내가 보낸 것(내가 지우지 않음) 또는 내가 받은 것(내가 지우지 않음)
drop policy if exists um_select on public.user_messages;
create policy um_select on public.user_messages for select
  using ((sender_id = auth.uid() and not sender_deleted)
      or (recipient_id = auth.uid() and not recipient_deleted));

-- 발신: 본인 명의 + 본인인증(ci_hash) + 수신자 활성 + 상호 차단 없음
drop policy if exists um_insert on public.user_messages;
create policy um_insert on public.user_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.ci_hash is not null)
    and exists (select 1 from public.profiles r where r.id = recipient_id and coalesce(r.status::text,'active') = 'active')
    and not exists (select 1 from public.user_blocks b
                     where (b.blocker_id = recipient_id and b.blocked_id = auth.uid())
                        or (b.blocker_id = auth.uid() and b.blocked_id = recipient_id))
  );

-- 수정: 수신자는 읽음/삭제 플래그만, 발신자는 자기 삭제 플래그만 — 본문 불변은 트리거로 강제
drop policy if exists um_update on public.user_messages;
create policy um_update on public.user_messages for update
  using (sender_id = auth.uid() or recipient_id = auth.uid())
  with check (sender_id = auth.uid() or recipient_id = auth.uid());

create or replace function public._guard_user_message_update() returns trigger
language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if new.body is distinct from old.body
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.created_at is distinct from old.created_at then
    raise exception '쪽지 내용은 수정할 수 없습니다';
  end if;
  if current_user in ('authenticated','anon') then
    if auth.uid() = old.recipient_id then
      if new.sender_deleted is distinct from old.sender_deleted then
        raise exception '발신자 표시는 변경할 수 없습니다';
      end if;
    elsif auth.uid() = old.sender_id then
      if new.recipient_deleted is distinct from old.recipient_deleted
         or new.read_at is distinct from old.read_at then
        raise exception '수신자 표시는 변경할 수 없습니다';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_user_message_update on public.user_messages;
create trigger trg_guard_user_message_update
  before update on public.user_messages
  for each row execute function public._guard_user_message_update();
