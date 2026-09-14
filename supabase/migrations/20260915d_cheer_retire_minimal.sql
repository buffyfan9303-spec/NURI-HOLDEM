-- ============================================================================
-- ✅ 2026-09-15 라이브 적용 완료(nuri-lead). 적용 전 auth=true → 후 auth=false ·
--    service_role 유지(양성 대조) · cheer_active=false · point_purchases/post_cheers 보존(각 0건).
-- 20260915b — 응원 보내기 판매 중지 (서버 쪽 최소 조치)
--
-- 오너 지시 #7 (2026-09-15) "응원 보내기는 좀 없애줘. 응원 필요 없이 이 기능 전량 삭제"
-- 클라이언트는 이미 전량 삭제됐다(community-team, 같은 날). 이 파일은 서버에서
-- **더 이상 팔리지 않게 하는 최소 두 가지**만 한다.
--
-- ── 지우지 않는 것 (nuri-lead 결정 2026-09-15 · CLAUDE.md 3번 데이터 보존) ──
--   · point_purchases 의 kind='cheer' 기록      → 이력이다. 환불 경로(refund_quote·
--     admin_refund_purchase)와 구매 내역 화면이 이 값을 그대로 읽는다. 지우면 깨진다.
--   · post_cheers 테이블 · community_posts.cheer_count 컬럼 → 데이터 보존. 지금 지워서 얻는 것이 없다.
--   · shop_skus 의 'cheer' 행 자체            → DELETE 하지 않는다. active=false 로만 내린다
--     (kind 화이트리스트·과거 구매의 sku_key 참조가 이 행을 가리킨다).
--   · send_cheer 함수 본체                     → DROP 하지 않는다. 되살릴 여지를 남기고,
--     DROP 후 재생성은 ACL 을 초기화하므로(SKILL §1) 그 자체가 더 위험하다.
--
-- ── 이 파일이 하는 것 ─────────────────────────────────────────────────────
--   ① send_cheer(uuid, uuid) 실행 권한 회수 — 라이브에서 authenticated 가 아직 호출 가능하다
--      (20260830m:594-595 가 `revoke ... from public, anon` + `grant ... to authenticated, service_role`).
--      클라 호출부는 0곳이지만 anon 키로 PostgREST 를 직접 때리면 여전히 포인트가 빠진다.
--   ② shop_skus.cheer 를 active=false 로 — "팔지 않는다" 를 데이터로 말한다.
--      ⚠ send_cheer 본문 225행이 `where key='cheer' and active` 라 이것만으로도
--        서버가 '판매 중인 상품이 아닙니다' 로 거절한다(= ① 과 독립적인 두 번째 자물쇠).
--
-- ⚠ `CREATE OR REPLACE` 가 없다 — 순수 REVOKE/UPDATE 라 ACL 초기화 문제는 없다(SKILL §1 실측).
--   `from public` 을 반드시 포함한다. `from anon` 만으로는 무효다(PUBLIC 기본 GRANT).
-- 데이터 변경: shop_skus 1행의 active 뿐. 그 외 0행.
-- 멱등: 여러 번 돌려도 같다.
-- ============================================================================

-- ── 적용 전 ACL 찍기 (쓰기 없음 — 이 블록만 먼저 돌려 출력을 남겨라) ────────
--   select
--     p.oid::regprocedure                                    as fn,
--     has_function_privilege('public',        p.oid, 'execute') as pub,
--     has_function_privilege('anon',          p.oid, 'execute') as anon,
--     has_function_privilege('authenticated', p.oid, 'execute') as auth,
--     has_function_privilege('service_role',  p.oid, 'execute') as svc,
--     p.proacl
--   from pg_proc p
--   where p.oid = 'public.send_cheer(uuid,uuid)'::regprocedure;
--
--   select key, kind, active, price from public.shop_skus where key = 'cheer';

begin;

-- ── 0. 전제 확인 — 하나라도 어긋나면 여기서 멈춘다 ─────────────────────────
do $preflight$
begin
  if to_regprocedure('public.send_cheer(uuid,uuid)') is null then
    raise exception 'ABORT: send_cheer(uuid,uuid) 가 없다 — 시그니처가 바뀌었는지 먼저 확인하라';
  end if;
  if to_regclass('public.shop_skus') is null then
    raise exception 'ABORT: shop_skus 테이블이 없다';
  end if;
  -- 이력이 실제로 이 sku 를 참조하는지 — 참조가 있으면 DELETE 가 아니라 active=false 가 맞다는 근거다.
  raise notice 'cheer 구매 이력: % 건',
    (select count(*) from public.point_purchases where kind = 'cheer');
end $preflight$;

-- ── 1. 실행 권한 회수 ──────────────────────────────────────────────────────
-- `from public` 필수 — PUBLIC 기본 GRANT 때문에 anon 만 회수하면 무효다.
revoke execute on function public.send_cheer(uuid, uuid) from public, anon, authenticated;
-- ⚠ service_role 은 **건드리지 않는다**(nuri-lead 지시 2026-09-15). 손님 경로는 위 세 롤로 전부 닫히고,
--   service_role 은 운영자·복구 도구가 쓰는 마지막 문이라 이 정리에서 함께 잠글 이유가 없다.

-- ── 2. 상품표에서 내린다 (DELETE 아님) ────────────────────────────────────
update public.shop_skus set active = false where key = 'cheer' and active;

-- ── 3. 자가검사 — 통과하지 못하면 통째로 롤백된다 ─────────────────────────
do $verify$
declare v_n integer; v_active boolean;
begin
  -- (1) 손님 경로 세 롤은 실행할 수 없다 (service_role 은 의도적으로 남긴다 — 위 주석)
  select count(*) into v_n
    from (values ('public'), ('anon'), ('authenticated')) as r(role_name)
   where has_function_privilege(r.role_name, 'public.send_cheer(uuid,uuid)'::regprocedure, 'execute');
  if v_n > 0 then
    raise exception 'ABORT: send_cheer 를 아직 %개 롤이 실행할 수 있다(public/anon/authenticated)', v_n;
  end if;
  -- 양성 대조 — 검사가 실제로 무언가를 보고 있는지. service_role 은 살아 있어야 한다.
  if not has_function_privilege('service_role', 'public.send_cheer(uuid,uuid)'::regprocedure, 'execute') then
    raise exception 'ABORT: service_role 까지 회수됐다 — 이 파일은 손님 경로만 닫는다';
  end if;

  -- (2) 상품표에서 내려갔다
  select active into v_active from public.shop_skus where key = 'cheer';
  if v_active is null then
    raise exception 'ABORT: shop_skus 의 cheer 행이 사라졌다 — 이 파일은 DELETE 하지 않는다';
  end if;
  if v_active then
    raise exception 'ABORT: shop_skus 의 cheer 가 아직 active 다';
  end if;

  -- (3) 지우지 않기로 한 것들이 그대로인가 (데이터 보존 · CLAUDE.md 3번)
  if to_regclass('public.post_cheers') is null then
    raise exception 'ABORT: post_cheers 테이블이 사라졌다';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'community_posts'
                    and column_name = 'cheer_count') then
    raise exception 'ABORT: community_posts.cheer_count 컬럼이 사라졌다';
  end if;
  if to_regprocedure('public.send_cheer(uuid,uuid)') is null then
    raise exception 'ABORT: send_cheer 함수가 사라졌다 — 이 파일은 DROP 하지 않는다(ACL 초기화 위험)';
  end if;

  -- (4) 같이 남아야 하는 형제 상품 — 끌올은 계속 판다. 실수로 같이 내리지 않았는지.
  if not exists (select 1 from public.shop_skus where key = 'bump' and active) then
    raise exception 'ABORT: bump(끌올)까지 내려갔다 — 끌올은 계속 판다';
  end if;
end $verify$;

commit;

-- ── 적용 후 ACL 다시 찍기 (위 '적용 전' 과 같은 쿼리 — 출력을 나란히 남겨라) ──
--   select
--     p.oid::regprocedure                                    as fn,
--     has_function_privilege('public',        p.oid, 'execute') as pub,
--     has_function_privilege('anon',          p.oid, 'execute') as anon,
--     has_function_privilege('authenticated', p.oid, 'execute') as auth,
--     has_function_privilege('service_role',  p.oid, 'execute') as svc,
--     p.proacl
--   from pg_proc p
--   where p.oid = 'public.send_cheer(uuid,uuid)'::regprocedure;
--   -- 기대: pub=f anon=f auth=f svc=f
--
--   select key, kind, active, price from public.shop_skus where key = 'cheer';
--   -- 기대: active=f (행은 그대로 존재)
--
--   select count(*) from public.point_purchases where kind = 'cheer';   -- 적용 전과 같아야 한다
--   select count(*) from public.post_cheers;                            -- 적용 전과 같아야 한다
--
-- 되살리려면 (참고)
--   grant execute on function public.send_cheer(uuid, uuid) to authenticated, service_role;
--   update public.shop_skus set active = true where key = 'cheer';
--   + 클라이언트 복원(같은 날 삭제한 커밋의 역방향)
-- ============================================================================
