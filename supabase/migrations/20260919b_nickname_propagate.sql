-- ⛔ **이 파일은 같은 날 `20260919c` 가 일부를 갈아엎었다. 여기만 읽고 라이브 상태를 짐작하지 마라.**
--    바뀐 것 둘:
--      ① 아래 "일부러 제외" 에서 `dealer_posts`·`owner_posts`·`venue_notices` 를 뺐다고 적혀 있는데,
--         오너 결정("전부 닉네임으로 통일", 2026-09-19)으로 **다시 포함됐다.**
--         `rank_verifications` 제외는 **그대로 유효**하다(증빙 대조용).
--      ② 이 파일은 "바꾸면 따라온다" 만 고쳤다. **새 글에 옛 이름이 박히는 경로**는 `c` 가 막았다
--         (작성자명을 브라우저가 보낸 값 그대로 저장하고 있었다 — 위조도 가능했다).
--    → 라이브 상태는 `20260919c` 가 정본이다. **적용 여부는 문서 말고 라이브를 조회해서 확인해라.**
--
-- ✅ 적용 완료 2026-09-19 (오너 지시) — 라이브 실측
--    예행연습(`begin; … rollback;`)으로 자가검사 4종 통과를 먼저 확인한 뒤 적용했다.
--    롤백이 실제로 됐는지도 확인했다(트리거 0 · 함수 0 · 불일치 4건 그대로 · 검사 잔여행 0).
--    적용 후 실측:
--      · 트리거 trg_sync_nickname = 1
--      · 불일치 **4건 → 0** (community_posts · comments · venue_notices · venue_messages)
--      · 검사용 잔여행 0
--      · _sync_nickname_snapshots 실행 권한: anon=false · authenticated=false (회수 확인)
--      · rank_verifications 는 손대지 않음(증빙 기록)
--    ⚠ 자가검사 (b)는 '트리거가 존재한다' 가 아니라 **실제로 전파되는지**를 본다 —
--      닉네임을 바꿔 글에 반영되는 것까지 확인하고 되돌린다. 존재 확인만으로는 거짓 통과한다.
-- 20260919b — 닉네임을 바꾸면 **이미 쓴 글·댓글에도 새 닉네임이 보이게** 한다. 오너 지시 2026-09-19.
--
-- 오너 원문: "닉네임을 바꿔도 바꾸기 전 닉네임으로 표기되는 버그 발견 이거 고쳐.
--             닉네임을 바꾸면 기존에 썻던 글들이나 이런 것들도 바꾼 후 닉네임으로 일괄 변경"
--
-- 원인 — 단일 버그가 아니다.
--   글·댓글이 작성 시점의 닉네임을 **컬럼에 복사해 저장**한다(비정규화). `profiles.nickname` 만 바꾸면
--   그 사본들은 옛 이름 그대로 남는다. 라이브 조회 결과 **21개 테이블에 22개 컬럼**이 이런 사본을 갖고 있었다.
--   실제 불일치 4건 확인: community_posts 1 · comments 1 · venue_notices 1 · venue_messages 1.
--   (예: 한 회원이 '누리홀덤' → '나누리' 로 바꿨는데 옛 글은 여전히 '누리홀덤' 으로 보였다.)
--
-- 왜 트리거인가 — RPC 두 개(set_my_nickname · admin_set_nickname)를 고치는 것보다 낫다.
--   RPC 를 고치면 "다른 경로로 nickname 이 바뀌면 또 어긋난다" 는 구멍이 남는다.
--   `profiles.nickname` 에 트리거를 걸면 **어느 경로든** 잡힌다 — 부르는 걸 깜빡할 수가 없다.
--
-- ⚠ 무엇을 **일부러 제외했나** (이 줄이 이 파일에서 제일 중요하다)
--   · `rank_verifications.nickname` — **제외.** 이건 표시용 이름이 아니라 **증빙 대조용**이다
--     (같은 행에 `proof_url`·`id_card_path`·`amount_won`·`event_name` 이 있다).
--     "그 대회에서 쓴 이름" 이라 지금 닉네임으로 덮으면 **증빙과 연결이 끊긴다.** 절대 넣지 마라.
--   · `venue_rankings.nickname`(8행) · `marketplace_notices.author_name`(5행) ·
--     `hall_of_fame.nickname`(0) · `venue_season_results.nickname`(0) · `waitlist.display_name`(0)
--     — **사용자 참조 컬럼이 없어 이을 수가 없다.** 매장이 직접 타이핑한 이름이거나 운영 공지다.
--     옛 닉네임 문자열로 매칭하는 것은 위험해서(동명이인·재사용) 하지 않는다. 미해결로 남긴다.
--
-- 적용 대상 14개 — (테이블, 사용자 id 컬럼, 이름 컬럼)
--   checkins/user_id/display_name · comments/user_id/user_name · community_posts/user_id/user_name
--   community_shouts/user_id/nickname · dealer_posts/author_id/author_name
--   group_messages/user_id/user_name · group_posts/author_id/author_name · live_wall/user_id/user_name
--   owner_posts/author_id/author_name · schedule_reservations/user_id/display_name
--   support_inquiries/user_id/user_name · venue_messages/user_id/user_name
--   venue_notices/author_id/author_name · venue_reviews/user_id/nickname

begin;

-- ── ① 전파 함수 ────────────────────────────────────────────────────────────
-- 내부 전용이다. 클라이언트가 직접 부를 일이 없으므로 아래에서 실행 권한을 회수한다.
create or replace function public._sync_nickname_snapshots(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v text; n integer := 0; c integer;
begin
  if p_user is null then return 0; end if;
  select nickname into v from public.profiles where id = p_user;
  if v is null then return 0; end if;

  -- `is distinct from` 로 걸러 불필요한 쓰기를 막는다(트리거가 매번 14개 테이블을 훑지 않게).
  update public.checkins             set display_name = v where user_id   = p_user and display_name is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.comments             set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.community_posts      set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.community_shouts     set nickname     = v where user_id   = p_user and nickname     is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.dealer_posts         set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.group_messages       set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.group_posts          set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.live_wall            set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.owner_posts          set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.schedule_reservations set display_name = v where user_id  = p_user and display_name is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.support_inquiries    set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.venue_messages       set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.venue_notices        set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.venue_reviews        set nickname     = v where user_id   = p_user and nickname     is distinct from v; get diagnostics c = row_count; n := n + c;
  -- ⚠ rank_verifications 는 넣지 마라 — 위 머리말의 '일부러 제외' 를 읽어라.

  return n;
end $fn$;

revoke execute on function public._sync_nickname_snapshots(uuid) from public, anon, authenticated;

-- ── ② 트리거 — 어느 경로로 닉네임이 바뀌어도 따라간다 ──────────────────────
create or replace function public._tg_sync_nickname()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $tg$
begin
  if new.nickname is distinct from old.nickname then
    perform public._sync_nickname_snapshots(new.id);
  end if;
  return null;   -- AFTER 트리거라 반환값은 쓰이지 않는다
end $tg$;

drop trigger if exists trg_sync_nickname on public.profiles;
create trigger trg_sync_nickname
  after update of nickname on public.profiles
  for each row execute function public._tg_sync_nickname();

-- ── ③ 일회성 보정 — 이미 어긋난 옛 글들 ────────────────────────────────────
update public.checkins             t set display_name = p.nickname from public.profiles p where t.user_id   = p.id and t.display_name is distinct from p.nickname;
update public.comments             t set user_name    = p.nickname from public.profiles p where t.user_id   = p.id and t.user_name    is distinct from p.nickname;
update public.community_posts      t set user_name    = p.nickname from public.profiles p where t.user_id   = p.id and t.user_name    is distinct from p.nickname;
update public.community_shouts     t set nickname     = p.nickname from public.profiles p where t.user_id   = p.id and t.nickname     is distinct from p.nickname;
update public.dealer_posts         t set author_name  = p.nickname from public.profiles p where t.author_id = p.id and t.author_name  is distinct from p.nickname;
update public.group_messages       t set user_name    = p.nickname from public.profiles p where t.user_id   = p.id and t.user_name    is distinct from p.nickname;
update public.group_posts          t set author_name  = p.nickname from public.profiles p where t.author_id = p.id and t.author_name  is distinct from p.nickname;
update public.live_wall            t set user_name    = p.nickname from public.profiles p where t.user_id   = p.id and t.user_name    is distinct from p.nickname;
update public.owner_posts          t set author_name  = p.nickname from public.profiles p where t.author_id = p.id and t.author_name  is distinct from p.nickname;
update public.schedule_reservations t set display_name = p.nickname from public.profiles p where t.user_id  = p.id and t.display_name is distinct from p.nickname;
update public.support_inquiries    t set user_name    = p.nickname from public.profiles p where t.user_id   = p.id and t.user_name    is distinct from p.nickname;
update public.venue_messages       t set user_name    = p.nickname from public.profiles p where t.user_id   = p.id and t.user_name    is distinct from p.nickname;
update public.venue_notices        t set author_name  = p.nickname from public.profiles p where t.author_id = p.id and t.author_name  is distinct from p.nickname;
update public.venue_reviews        t set nickname     = p.nickname from public.profiles p where t.user_id   = p.id and t.nickname     is distinct from p.nickname;

-- ── ④ 자가검사 — 음성(막아야 할 것)과 양성(되어야 할 것)을 둘 다 본다 ──────
do $chk$
declare d integer; ok boolean; before_n text; after_n text; uid uuid;
begin
  -- (a) 보정 후 불일치가 0 인가
  select
      (select count(*) from public.comments t join public.profiles p on p.id=t.user_id where t.user_name is distinct from p.nickname)
    + (select count(*) from public.community_posts t join public.profiles p on p.id=t.user_id where t.user_name is distinct from p.nickname)
    + (select count(*) from public.venue_notices t join public.profiles p on p.id=t.author_id where t.author_name is distinct from p.nickname)
    + (select count(*) from public.venue_messages t join public.profiles p on p.id=t.user_id where t.user_name is distinct from p.nickname)
    + (select count(*) from public.checkins t join public.profiles p on p.id=t.user_id where t.display_name is distinct from p.nickname)
    + (select count(*) from public.venue_reviews t join public.profiles p on p.id=t.user_id where t.nickname is distinct from p.nickname)
    into d;
  if d <> 0 then raise exception '[20260919b] 보정 후에도 불일치 %건이 남았다', d; end if;

  -- (b) 🔴 트리거가 **실제로 작동하는가** — 글이 있는 회원의 닉네임을 바꿔 보고 되돌린다.
  --     "트리거가 존재한다" 는 작동한다는 뜻이 아니다. 실제로 전파되는지를 본다.
  select t.user_id into uid from public.community_posts t join public.profiles p on p.id=t.user_id limit 1;
  if uid is null then
    raise notice '[20260919b] 글 있는 회원이 없어 트리거 실작동 검사를 건너뛴다(데이터 없음)';
  else
    select nickname into before_n from public.profiles where id = uid;
    update public.profiles set nickname = '__migchk_nick__' where id = uid;
    select user_name into after_n from public.community_posts where user_id = uid limit 1;
    if after_n is distinct from '__migchk_nick__' then
      raise exception '[20260919b] 트리거가 전파하지 않았다 — 글에 남은 값: %', after_n;
    end if;
    update public.profiles set nickname = before_n where id = uid;   -- 되돌리면 트리거가 다시 전파한다
    select user_name into after_n from public.community_posts where user_id = uid limit 1;
    if after_n is distinct from before_n then
      raise exception '[20260919b] 되돌리기가 전파되지 않았다 — 남은 값: %', after_n;
    end if;
  end if;

  -- (c) 음성 대조: 증빙 테이블은 **건드리지 않아야** 한다
  select exists (
    select 1 from pg_proc pr join pg_namespace ns on ns.oid=pr.pronamespace
     where ns.nspname='public' and pr.proname='_sync_nickname_snapshots'
       and pg_get_functiondef(pr.oid) ilike '%rank_verifications%'
  ) into ok;
  if ok then raise exception '[20260919b] 전파 함수가 rank_verifications 를 건드린다 — 증빙 기록이다. 빼라'; end if;

  -- (d) 내부 함수 실행 권한이 회수됐는가
  if has_function_privilege('anon', 'public._sync_nickname_snapshots(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._sync_nickname_snapshots(uuid)', 'execute') then
    raise exception '[20260919b] 내부 함수에 anon/authenticated 실행 권한이 남아 있다';
  end if;
end $chk$;

commit;
