-- ✅ 적용 완료 2026-09-27 (nuri-lead, MCP execute_sql)
-- 리드 리허설(롤백): ocean 허용 · x 거부(23514) · null 허용 · 사진 변경 후 본인 글 5건·댓글 사본 불일치 0 · 다른 회원 글 불변

-- home-team 2026-09-27 초안을 리드가 검토·적용.
-- ① profiles.profile_cover — 내 정보 머리 배경(오너 요청 2). 클라(src/lib/profileCover.ts PROFILE_COVERS)와 같은 목록만 받는다. null = 기본 '등급색'.
--    클라는 select('*') 에 키가 없으면 고르기를 숨기므로 적용 순서와 배포 순서는 무관하다.
--    권한: authenticated 에 profiles 표 단위 UPDATE 가 있고(2026-09-27 information_schema 실측) RLS 가 본인 행만 허용 — 새 칸은 추가 GRANT 불필요.
--    guard_profile_privileged_cols 는 특권 칸 목록 방식이라 이 칸을 막지 않는다(적용 전 본문 확인 필요).
alter table public.profiles add column if not exists profile_cover text;
alter table public.profiles drop constraint if exists profiles_profile_cover_chk;
alter table public.profiles add constraint profiles_profile_cover_chk
  check (profile_cover is null or profile_cover in ('violet','ocean','teal','forest','sunset','rose','gold','mono'));

-- ② 프로필 사진을 바꾸면 글·댓글·실시간 글의 user_avatar 사본도 맞춘다(오너 요청 3 '모든 소비처에 같은 이미지').
--    현행: trg_sync_nickname 이 `AFTER UPDATE OF nickname` 이라 avatar_url 변경은 사본에 안 간다(2026-09-27 pg_trigger 실측).
--    _sync_nickname_snapshots(20260925c)는 이미 user_avatar 3표를 현재 avatar_url 로 맞춘다 → 트리거 조건만 넓힌다.
--    함수 _tg_sync_nickname 은 `new.nickname is distinct from old.nickname` 일 때만 동기화하므로 함께 고친다(탈퇴 알림 치환은 닉네임 조건 유지).
create or replace function public._tg_sync_nickname()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.nickname is distinct from old.nickname or new.avatar_url is distinct from old.avatar_url then
    perform public._sync_nickname_snapshots(new.id);
  end if;
  if new.nickname is distinct from old.nickname
     and new.status::text = 'withdrawn' and old.status::text is distinct from 'withdrawn'
     and char_length(btrim(coalesce(old.nickname, ''))) >= 2 then
    update public.notifications
       set title   = replace(title,   old.nickname, new.nickname),
           message = replace(message, old.nickname, new.nickname)
     where user_id is distinct from new.id
       and (strpos(title, old.nickname) > 0 or strpos(message, old.nickname) > 0);
  end if;
  return null;
end $function$;
revoke all on function public._tg_sync_nickname() from public, anon, authenticated;
grant execute on function public._tg_sync_nickname() to service_role;
drop trigger if exists trg_sync_nickname on public.profiles;
create trigger trg_sync_nickname after update of nickname, avatar_url on public.profiles
  for each row execute function public._tg_sync_nickname();

-- 리허설(begin … rollback): 본인 행 avatar_url 변경 → community_posts/comments/live_wall.user_avatar 동일 ·
--   다른 회원 행 불변(음성) · 닉네임만 변경 시 기존 동작 동일(양성) · profile_cover 'x' 거부(음성) · 'ocean' 허용 · null 허용.
-- 2026-09-27 실측 현재 불일치 0건(posts 7 · comments 3 · live_wall 0) — 구조적 틈이라 다음 사진 변경부터 생긴다.
