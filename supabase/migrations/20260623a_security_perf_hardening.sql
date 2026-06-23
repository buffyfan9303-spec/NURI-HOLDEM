-- 2026-06-23 보안/성능 하드닝 (감사 #1, #2, #16)
-- #1 보안: 권한판정 단일기준 my_role() 등 앱 함수 9종 search_path 고정.
--   SECURITY DEFINER + search_path 미고정은 임시스키마 동명객체 주입으로 함수 내부 참조를
--   가로채는 권한상승 벡터. pg_trgm 확장 함수 31종은 확장 소유라 제외.
alter function public.my_role() set search_path = public, pg_temp;
alter function public.create_group(text,text,text,text,boolean) set search_path = public, pg_temp;
alter function public.join_group(uuid) set search_path = public, pg_temp;
alter function public.is_group_member(uuid) set search_path = public, pg_temp;
alter function public.is_group_manager(uuid) set search_path = public, pg_temp;
alter function public.increment_post_likes(uuid) set search_path = public, pg_temp;
alter function public.update_qna_count() set search_path = public, pg_temp;
alter function public._tier_level(integer) set search_path = public, pg_temp;
alter function public._tier_title(integer) set search_path = public, pg_temp;

-- #2 보안: 본인인증 CI 1인1계정 — 유니크 인덱스로 동시 인증 경쟁(TOCTOU) 차단.
--   기존 verify-identity 의 23505 폴백이 실제로 작동하게 됨. (ci null 은 다중 허용)
create unique index if not exists uniq_profiles_ci on public.profiles(ci) where ci is not null;

-- #16 성능: 회원 검색 ILIKE '%q%'(선행 와일드카드라 btree 무용) → pg_trgm GIN 가속.
--   find_user_for_transfer / search_members_for_ranking / search_registered_players 의 nickname·name·real_name 검색.
create index if not exists profiles_nickname_trgm on public.profiles using gin (nickname gin_trgm_ops);
create index if not exists profiles_name_trgm on public.profiles using gin (name gin_trgm_ops);
create index if not exists profiles_real_name_trgm on public.profiles using gin (real_name gin_trgm_ops);
