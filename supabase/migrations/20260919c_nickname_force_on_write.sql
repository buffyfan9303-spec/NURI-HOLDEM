-- ✅ 적용 완료 2026-09-19 (오너 결정) — 라이브 실측
--    적용 후: trg_force_nick 트리거 **14개** · trg_sync_nickname 1개 · 닉네임 불일치 0 ·
--             검사 잔여행 0 · `_tg_force_author_nickname` 실행 권한 anon=false·authenticated=false ·
--             `profiles.name`(이름 필드) 는 **보존**(덮지 않았다).
--
-- 20260919c — 작성자명을 **저장 시점에 서버가 강제**한다. 오너 결정 2026-09-19.
--
-- 왜 필요했나 — 20260919b 로는 절반만 고쳐졌다.
--   `b` 는 "닉네임을 바꾸면 옛 글이 따라온다" 를 고쳤다. 그런데 **새 글에 옛 이름이 다시 박히는 경로**
--   가 남아 있었다. `src/api/community.ts` 의 여러 insert 가 작성자명을 **브라우저가 보낸 값 그대로**
--   저장하고 있었기 때문이다(예: 1029·1063·1095행의 `user_name: input.userName`).
--   기존 `fill_user_avatar` 트리거는 **아바타만** 채우고 이름은 안 건드렸다.
--
-- 🔴 그래서 이건 성능이 아니라 **보안 문제**였다. 서버 검증이 없으니
--    조작된 요청으로 **남의 닉네임을 달고 글을 쓸 수 있었다.**
--    CLAUDE.md 보안 표준 §2 "인가는 서버(DB)가 한다" 에 정면으로 어긋나는 상태였다.
--
-- 오너 결정 2026-09-19 (두 가지를 물었고 둘 다 답을 받았다)
--   ① "매장 공지·업주 글·딜러 글이 닉네임이 아니라 이름 필드를 쓴다" → **전부 닉네임으로 통일**
--   ② "작성자명을 브라우저 값 그대로 저장한다" → **지금 막아라**
--   → 두 결정이 하나의 수정으로 합쳐진다: 저장 시점에 서버가 닉네임을 강제하면 둘 다 해결된다.
--
-- ⚠ 리드가 한 번 틀렸던 것 (기록으로 남긴다)
--   `venue_notices.author_name` 에 있던 '누리홀덤' 을 "옛 닉네임" 으로 **추론**해 덮었다.
--   실제로는 `fill_venue_notice_author` 트리거가 설계대로 넣은 `profiles.name`(이름 필드)이었다
--   (그 계정은 이름=누리홀덤 · 닉네임=나누리). **추론으로 라이브 데이터를 덮었다.**
--   발견 즉시 되돌렸고, 그다음에 오너에게 물어 결정을 받아 다시 적용했다.
--   교훈: **덮기 전에 그 컬럼을 누가 채우는지(트리거·기본값) 먼저 읽어라.** 값만 보면 속는다.
--
-- ⚠ 여전히 손대지 않는 것
--   · `rank_verifications.nickname` — **증빙 대조용**이다(같은 행에 proof_url·id_card_path·amount_won).
--     그 대회에서 쓴 이름이라 지금 닉네임으로 덮으면 증빙과 연결이 끊긴다. **절대 넣지 마라.**
--   · `venue_rankings`·`marketplace_notices`·`hall_of_fame`·`venue_season_results`·`waitlist`
--     — 사용자 참조 컬럼이 없어 이을 수가 없다. 미해결로 남긴다.
--   · `profiles.name` 자체 — 이름 필드는 그대로 둔다. 표시에 안 쓸 뿐이다.

begin;

-- ── ① 범용 강제 트리거 ─────────────────────────────────────────────────────
-- 저장 시점에 '그 행이 가리키는 사용자'의 **현재 닉네임**으로 덮어쓴다.
-- 클라이언트가 무엇을 보내든 무시한다.
-- auth.uid() 가 아니라 **행의 id 컬럼**을 기준으로 삼는 이유: RPC·서버 경로로 대신 삽입하는
-- 경우에도 "표시되는 이름 = 실제 작성자" 가 성립하게 하려는 것이다.
create or replace function public._tg_force_author_nickname()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare j jsonb; uid uuid; v text; idcol text := TG_ARGV[0]; namecol text := TG_ARGV[1];
begin
  j := to_jsonb(new);
  begin uid := nullif(j ->> idcol, '')::uuid; exception when others then return new; end;
  if uid is null then return new; end if;              -- 익명/시스템 행은 건드리지 않는다
  select nickname into v from public.profiles where id = uid;
  if v is null then return new; end if;                -- 프로필이 없으면 그대로 둔다
  return jsonb_populate_record(new, jsonb_build_object(namecol, v));
end $fn$;

revoke execute on function public._tg_force_author_nickname() from public, anon, authenticated;

-- ── ② 14개 테이블에 건다 ───────────────────────────────────────────────────
do $mk$
declare r record;
begin
  for r in select * from (values
    ('checkins','user_id','display_name'),('comments','user_id','user_name'),
    ('community_posts','user_id','user_name'),('community_shouts','user_id','nickname'),
    ('dealer_posts','author_id','author_name'),('group_messages','user_id','user_name'),
    ('group_posts','author_id','author_name'),('live_wall','user_id','user_name'),
    ('owner_posts','author_id','author_name'),('schedule_reservations','user_id','display_name'),
    ('support_inquiries','user_id','user_name'),('venue_messages','user_id','user_name'),
    ('venue_notices','author_id','author_name'),('venue_reviews','user_id','nickname')
  ) as t(tbl, idcol, namecol) loop
    execute format('drop trigger if exists trg_force_nick on public.%I', r.tbl);
    execute format(
      'create trigger trg_force_nick before insert or update of %I on public.%I
         for each row execute function public._tg_force_author_nickname(%L, %L)',
      r.idcol, r.tbl, r.idcol, r.namecol);
  end loop;
end $mk$;

-- ── ③ 옛 '실명 채움' 트리거에서 이름 부분만 뺀다 ───────────────────────────
-- author_id·색·삭제플래그 설정은 그대로 두고, author_name 은 위 trg_force_nick 이 채운다.
create or replace function public.fill_dealer_post_author() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  new.author_id := auth.uid();
  select avatar_color into new.author_color from public.profiles where id = auth.uid();
  new.deleted := false; new.deleted_at := null;
  return new;
end $f$;

create or replace function public.fill_owner_post_author() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  new.author_id := auth.uid();
  select avatar_color into new.author_color from public.profiles where id = auth.uid();
  new.deleted := false; new.deleted_at := null;
  return new;
end $f$;

create or replace function public.fill_venue_notice_author() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  new.author_id := auth.uid();
  return new;
end $f$;

-- ── ④ 전파 함수에 '실명 계열' 3개를 되돌려 넣는다(이제 전부 닉네임 계열이다) ──
create or replace function public._sync_nickname_snapshots(p_user uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v text; n integer := 0; c integer;
begin
  if p_user is null then return 0; end if;
  select nickname into v from public.profiles where id = p_user;
  if v is null then return 0; end if;
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
  return n;   -- ⚠ rank_verifications 는 증빙 대조용이라 절대 넣지 않는다
end $fn$;

revoke execute on function public._sync_nickname_snapshots(uuid) from public, anon, authenticated;

-- ── ⑤ 실명 계열 3개를 닉네임으로 보정 ──────────────────────────────────────
update public.venue_notices t set author_name = p.nickname from public.profiles p
 where t.author_id = p.id and t.author_name is distinct from p.nickname;
update public.dealer_posts  t set author_name = p.nickname from public.profiles p
 where t.author_id = p.id and t.author_name is distinct from p.nickname;
update public.owner_posts   t set author_name = p.nickname from public.profiles p
 where t.author_id = p.id and t.author_name is distinct from p.nickname;

-- ── ⑥ 자가검사 — **위조가 실제로 막히는지** 진짜로 넣어 보고 확인한다 ──────
do $chk$
declare uid uuid; nick text; got text; nrows int;
begin
  -- 🔴 "트리거가 존재한다" 는 작동한다는 뜻이 아니다. 실제로 위조된 이름을 넣어 본다.
  select id, nickname into uid, nick from public.profiles where nickname is not null limit 1;
  if uid is null then raise exception '[20260919c] 닉네임 있는 회원이 없어 검사할 수 없다'; end if;

  insert into public.community_posts(user_id, user_name, title, content, category)
  values (uid, '__위조된이름__', '__migchk__', '__migchk__', 'free');

  select user_name into got from public.community_posts where title = '__migchk__';
  if got is distinct from nick then
    raise exception '[20260919c] 위조 차단 실패 — 저장된 이름: % (기대: %)', got, nick;
  end if;

  delete from public.community_posts where title = '__migchk__';
  get diagnostics nrows = row_count;
  if nrows <> 1 then raise exception '[20260919c] 검사 행 정리 실패 (% 행)', nrows; end if;

  -- 양성 대조: 닉네임 계열이 전부 맞춰졌는가
  if (select count(*) from public.venue_notices t join public.profiles p on p.id = t.author_id
       where t.author_name is distinct from p.nickname) <> 0 then
    raise exception '[20260919c] venue_notices 닉네임 보정 실패';
  end if;

  -- 음성 대조: 증빙 테이블은 전파 함수에 들어가면 안 된다
  if (select pg_get_functiondef(pr.oid) from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
       where ns.nspname = 'public' and pr.proname = '_sync_nickname_snapshots') ~ 'rank_verifications' then
    raise exception '[20260919c] 전파 함수가 rank_verifications 를 건드린다 — 증빙 기록이다';
  end if;
end $chk$;

commit;
