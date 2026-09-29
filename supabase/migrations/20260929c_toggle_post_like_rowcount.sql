-- ✅ 2026-09-29 라이브 적용 완료(nuri-lead, MCP execute_sql). 실측:
--    적용 전: 라이브 정의 md5 403ed539… · ACL postgres/authenticated/service_role(anon·PUBLIC 없음) · post_likes 0행 · 글 like_count md5 407f8c62….
--    리허설(DO + 끝 RAISE 로 롤백): R1 누름 {count 1, liked true} 행 1 · R2 취소 {count 0, liked false} 행 0 · R4 비로그인 P0001 거절 · R5 anon=f auth=t.
--    경합(두 세션 동시) 경로는 한 세션으로 못 만들어 NOT_RUN — row_count 가드는 코드로 확인.
--    적용 후: anon_exec=false · auth_exec=true · 가드 반영 · 글 like_count md5 407f8c62… 불변(기존 수치 안 건드림).
--
-- 요구: docs/HANDOFF-2026-09-29-account-switch.md §8 최종 점검 — critical-reviewer(final-server.md) 위험 2.
-- 왜: toggle_post_like 가 `insert … on conflict do nothing` 으로 **행이 안 들어가도** like_count 를 +1,
--   `delete` 가 0행이어도 −1 했다. 같은 사용자가 두 탭·기기에서 동시에 누르면 행 1개에 카운트 +2.
--   2026-09-29 라이브 실측: 글 7개 중 3개가 like_count ≠ 실제 post_likes 행 수(+7·+4·+2).
--   (그 차이가 이 경합 때문인지 계정 삭제 때문인지는 가리지 못했다 — 기존 수치 재계산은 화면 숫자를 바꾸는
--    데이터 변경이라 이 파일에 넣지 않는다. 오너 결정 대기.)
-- 어떻게: 실제로 바뀐 행 수(GET DIAGNOSTICS row_count)가 1 일 때만 카운트를 움직인다. 서명·반환·권한·가드 불변.
-- 스키마 변경 없음. 기존 행 값 불변.

create or replace function public.toggle_post_like(p_post_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int; v_n int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if exists (select 1 from public.post_likes where post_id = p_post_id and user_id = v_uid) then
    delete from public.post_likes where post_id = p_post_id and user_id = v_uid;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.community_posts set like_count = greatest(0, coalesce(like_count,0) - 1) where id = p_post_id;
    end if;
    v_liked := false;
  else
    insert into public.post_likes(post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.community_posts set like_count = coalesce(like_count,0) + 1 where id = p_post_id;
    end if;
    v_liked := true;
  end if;
  select coalesce(like_count,0) into v_count from public.community_posts where id = p_post_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $function$;

revoke all on function public.toggle_post_like(uuid) from public, anon;
grant execute on function public.toggle_post_like(uuid) to authenticated, service_role;
