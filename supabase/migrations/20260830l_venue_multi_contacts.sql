-- 20260830l — 매장 연락처 다중화(오너 #17).
--
-- 무엇이 문제였나: venues.contact_phone 은 text 단일 컬럼이다. 실제 매장은 '대표 / 예약 /
-- 담당자' 처럼 번호가 여러 개인데, 여태 유일한 표현 수단이 문자열 안에 '/' 를 끼워 넣는
-- 관습(mock 데이터 '010-5248-8587 / 010-7584-1247')뿐이었다. 화면(PhoneRow)이 그 '/' 를
-- 쪼개 칩으로 그리고 있으니 **데이터가 아니라 표기 규칙이 스키마 노릇**을 하고 있었고,
-- 번호마다 무슨 용도인지(라벨)는 어디에도 담기지 못했다.
--
-- 왜 라벨이 필요한가: 번호가 2개 이상이면 손님의 다음 질문은 항상 '어디로 걸어야 하나' 다.
-- 라벨 없는 번호 두 개는 선택을 손님에게 떠넘긴다(=전화가 안 오거나, 엉뚱한 데로 온다).
-- 라벨은 그래서 장식이 아니라 다중화의 전제다.
--
-- 원칙: **추가만.** contact_phone 은 지우지 않는다.
--   · 읽는 쪽(seo.ts telephone, 20260817b/20260829c 의 v_ownerphone, 구버전 앱)이 아직 그 컬럼을 본다.
--   · 그래서 새 배열의 **첫 번째 번호를 contact_phone 에 계속 미러링**한다(단일 진실 유지).
--   · 반대로 구 경로 update_venue_contact(단일 phone)로 저장이 들어와도 배열을 다시 만들어
--     둘이 갈라지지 않게 한다 — 시그니처는 그대로라 기존 호출부는 깨지지 않는다.
--
-- '1개 필수' 는 화면에서 강제한다(첫 줄은 삭제 불가). 서버는 0개도 허용한다 —
-- 지금 라이브에 전화번호가 없는 매장이 3/4 곳이고, 서버가 필수로 죄면 그 매장들은
-- 주소·영업시간조차 저장할 수 없게 된다(연락처와 무관한 필드가 인질이 된다).

-- ── 1) 컬럼 ────────────────────────────────────────────────────────────────
alter table public.venues add column if not exists contact_phones jsonb not null default '[]'::jsonb;

comment on column public.venues.contact_phones is
  '연락처 배열 [{label,phone}] (최대 5). 첫 항목은 contact_phone 에 미러링된다(구 경로 호환).';

-- ── 2) 모양 검증 ───────────────────────────────────────────────────────────
-- venues 는 owner 가 RLS 로 직접 UPDATE 할 수 있는 테이블이다(venues_update).
-- 즉 RPC 를 거치지 않는 쓰기 경로가 실재하므로 검증을 테이블에도 건다.
create or replace function public.venue_contacts_valid(p jsonb)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 5
    and not exists (
      select 1
        from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(btrim(e->>'phone'), '') = ''
          or length(e->>'phone') > 40
          or length(coalesce(e->>'label', '')) > 10
    )
  );
$function$;

revoke all on function public.venue_contacts_valid(jsonb) from public, anon;
grant execute on function public.venue_contacts_valid(jsonb) to authenticated, service_role;

alter table public.venues drop constraint if exists venues_contact_phones_shape;
alter table public.venues add constraint venues_contact_phones_shape
  check (public.venue_contacts_valid(contact_phones));

-- ── 3) 백필 — 기존 번호가 사라지면 안 된다 ─────────────────────────────────
-- 구 표기 규칙('/' 구분)을 그대로 배열로 승격한다. 라벨은 비워 둔다(운영자가 나중에 채움).
update public.venues v
   set contact_phones = s.arr
  from (
    select v2.id,
           coalesce(jsonb_agg(jsonb_build_object('label', '', 'phone', btrim(p)) order by ord), '[]'::jsonb) as arr
      from public.venues v2,
           lateral unnest(string_to_array(coalesce(v2.contact_phone, ''), '/')) with ordinality t(p, ord)
     where btrim(p) <> ''
     group by v2.id
  ) s
 where v.id = s.id
   and (v.contact_phones is null or v.contact_phones = '[]'::jsonb);

-- ── 4) 신규 저장 경로 ──────────────────────────────────────────────────────
create or replace function public.update_venue_contacts(
  p_venue_id uuid, p_address text, p_contacts jsonb, p_hours text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_norm jsonb;
begin
  if not public.can_manage_venue(p_venue_id) then
    raise exception '매장 정보를 수정할 권한이 없습니다';
  end if;

  -- 클라이언트 값을 그대로 믿지 않는다: 배열만, 앞 5개만, 빈 번호는 버리고, 길이를 자른다.
  select coalesce(jsonb_agg(jsonb_build_object(
           'label', left(btrim(coalesce(e->>'label', '')), 10),
           'phone', left(btrim(e->>'phone'), 40)
         ) order by ord), '[]'::jsonb)
    into v_norm
    from (
      select e, ord
        from jsonb_array_elements(
               case when jsonb_typeof(coalesce(p_contacts, '[]'::jsonb)) = 'array'
                    then p_contacts else '[]'::jsonb end
             ) with ordinality t(e, ord)
       where jsonb_typeof(e) = 'object' and btrim(coalesce(e->>'phone', '')) <> ''
       order by ord
       limit 5
    ) q;

  update public.venues set
    address        = coalesce(btrim(p_address), ''),
    contact_phones = v_norm,
    -- 구 컬럼 미러링 — 첫 번호가 곧 '대표 번호'. 배열이 비면 NULL(기존 동작과 동일).
    contact_phone  = nullif(btrim(coalesce(v_norm->0->>'phone', '')), ''),
    business_hours = nullif(btrim(coalesce(p_hours, '')), ''),
    updated_at     = now()
  where id = p_venue_id;
end $function$;

comment on function public.update_venue_contacts(uuid, text, jsonb, text) is
  '매장 주소·연락처 배열·영업시간 저장. 첫 연락처를 contact_phone 에 미러링한다(구 경로 호환).';
revoke all on function public.update_venue_contacts(uuid, text, jsonb, text) from public, anon;
grant execute on function public.update_venue_contacts(uuid, text, jsonb, text) to authenticated, service_role;

-- ── 5) 구 경로도 배열과 동기화 ─────────────────────────────────────────────
-- 시그니처·권한 게이트·기존 동작은 그대로. 다만 단일 phone 으로 저장이 들어오면
-- 배열을 다시 만들어 둘이 갈라지지 않게 한다('/' 구분 관습도 그대로 승격).
create or replace function public.update_venue_contact(
  p_venue_id uuid, p_address text, p_phone text, p_hours text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_norm jsonb;
begin
  if not public.can_manage_venue(p_venue_id) then
    raise exception '매장 정보를 수정할 권한이 없습니다';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', '', 'phone', left(btrim(p), 40)) order by ord), '[]'::jsonb)
    into v_norm
    from (
      select p, ord
        from unnest(string_to_array(coalesce(p_phone, ''), '/')) with ordinality t(p, ord)
       where btrim(p) <> ''
       order by ord
       limit 5
    ) q;

  update public.venues set
    address        = coalesce(btrim(p_address), ''),
    contact_phone  = nullif(btrim(coalesce(p_phone, '')), ''),
    contact_phones = v_norm,
    business_hours = nullif(btrim(coalesce(p_hours, '')), ''),
    updated_at     = now()
  where id = p_venue_id;
end $function$;

revoke all on function public.update_venue_contact(uuid, text, text, text) from public, anon;
grant execute on function public.update_venue_contact(uuid, text, text, text) to authenticated, service_role;
