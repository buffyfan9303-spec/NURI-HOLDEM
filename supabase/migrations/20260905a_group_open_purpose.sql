-- 그룹 개설 신청에 '개설 목적' 추가 (오너 지시 2026-09-05)
--
-- 지시: "그룹 만들기를 누르면 내가 승인을 해줘야 하잖아. 처음 만드는 칸에 그룹 개설 목적과
--        그룹 개설 멤버 승인을 할것인지 자동가입을 할 것인지 알려줘야해."
--
-- 현황(조사):
--  · 가입 정책(join_approval)은 **이미 있다**(venues.join_approval, 기본 true). 다만 폼에서
--    작은 체크박스라 고른 줄 모르고 지나가기 쉽고, **관리자 승인 화면에는 아예 안 보인다** —
--    자동가입 그룹이 더 위험한데 그 정보 없이 승인하고 있었다.
--  · '개설 목적'은 어디에도 없다. 관리자가 이름·종류·지역·소개만 보고 승인/거절을 판단해 왔다.
--    소개(description)는 **공개용 그룹 소개**라 목적과 성격이 다르다(공개 문구를 심사 근거로 쓰면
--    신청자가 심사용 문장을 공개 소개에 억지로 끼워 넣게 된다).
--
-- 그룹은 별도 테이블이 아니라 venues 에 kind <> 'venue' 로 저장된다(create_group 참조).
-- 그래서 컬럼도 venues 에 붙는다 — 매장 행에서는 늘 빈 문자열로 남는다.
--
-- 롤백:
--   drop function if exists public.create_group(text, text, text, text, boolean, text);
--   -- (구 5인자 버전을 되살리려면 20260614 이전 정의를 참조)
--   alter table public.venues drop column if exists open_purpose;

alter table public.venues add column if not exists open_purpose text not null default '';

comment on column public.venues.open_purpose is
  '그룹 개설 목적 — 운영자 승인 판단용(비공개). 매장(kind=venue) 행에서는 빈 문자열.';

-- create_group 을 6인자로. 인자를 더하면 시그니처가 달라져 CREATE OR REPLACE 로는 안 되고
-- **오버로드**가 생긴다. 그러면 5인자 호출이 두 함수 사이에서 모호해지므로 구버전을 먼저 지운다.
-- 새 버전의 p_purpose 는 DEFAULT '' 라, 배포 시차로 남아 있는 구 클라이언트의 5인자 호출도
-- 계속 성공한다(목적이 빈 채로 들어오고 관리자 화면에 '목적 미기재'로 뜬다 — 거절 판단 가능).
drop function if exists public.create_group(text, text, text, text, boolean);

create or replace function public.create_group(
  p_name text, p_kind text, p_region text, p_description text,
  p_join_approval boolean, p_purpose text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE gid uuid; pname text; pcolor text; cnt int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_kind NOT IN ('dealer_team','club','youtuber','other') THEN RAISE EXCEPTION '허용되지 않은 그룹 종류'; END IF;
  IF length(coalesce(p_name,'')) < 1 THEN RAISE EXCEPTION '그룹 이름을 입력해 주세요'; END IF;
  SELECT count(*) INTO cnt FROM public.venues WHERE owner_id = auth.uid() AND kind <> 'venue';
  IF cnt >= 5 THEN RAISE EXCEPTION '계정당 최대 5개의 그룹만 만들 수 있습니다'; END IF;
  SELECT coalesce(nickname,'회원'), avatar_color INTO pname, pcolor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.venues (name, region, description, kind, owner_id, approved, status, join_approval, open_purpose)
    VALUES (left(p_name,40), coalesce(nullif(p_region,''),'전국'), left(coalesce(p_description,''),500),
            p_kind, auth.uid(), false, 'active', coalesce(p_join_approval, true),
            left(coalesce(p_purpose,''), 300))
    RETURNING id INTO gid;
  INSERT INTO public.group_members (group_id, user_id, role, status, member_name, member_color)
    VALUES (gid, auth.uid(), 'manager', 'approved', coalesce(pname,'회원'), pcolor);
  RETURN gid;
END; $$;

-- ⚠ CREATE 는 ACL 을 초기화한다(PUBLIC 기본 GRANT 가 되살아난다) → 반드시 다시 잠근다.
--    REVOKE FROM anon 만으로는 무효 — PUBLIC 에서 회수해야 한다.
revoke all on function public.create_group(text, text, text, text, boolean, text) from public;
revoke all on function public.create_group(text, text, text, text, boolean, text) from anon;
grant execute on function public.create_group(text, text, text, text, boolean, text) to authenticated, service_role;
