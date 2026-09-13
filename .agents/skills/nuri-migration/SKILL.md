---
name: nuri-migration
description: NURI HOLDEM 라이브 Supabase DB를 바꾸는 모든 작업(테이블·컬럼·RLS·RPC·함수·트리거·cron)에 사용. fail-open 권한 버그를 다시 내지 않기 위한 안전 마이그레이션 플레이북. 마이그레이션 SQL을 쓰거나 적용하기 직전에 호출하라.
---

# nuri-migration — 라이브 Supabase 안전 마이그레이션

운영 중인 DB다. 아래는 실제로 크리티컬 버그(fail-open 권한)가 터졌던 경험에서 나온 규칙이다. 전부 지켜라.

## 1) 권한(ACL) — 가장 위험한 지점
- 관리/민감 RPC는 **`REVOKE ALL ON FUNCTION ... FROM PUBLIC;`** 이 필수다.
  ⚠️ `REVOKE FROM anon`만으로는 **무효** — PUBLIC 기본 GRANT 때문에 anon이 여전히 실행 가능하다. 반드시 `FROM PUBLIC`.
- 회수 후 필요한 롤에만 재부여: `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
- `CREATE OR REPLACE FUNCTION`은 ACL을 초기화한다 → 재정의 후 **REVOKE/GRANT를 다시** 명시.

## 2) SECURITY DEFINER
- 모든 SECURITY DEFINER 함수는 `SET search_path = public, pg_temp` 고정(하이재킹 방지).

## 3) NULL-safe 가드 (fail-open 방지)
- 권한 체크는 **`IS DISTINCT FROM`** 을 써라. `my_role() <> 'admin'`은 비로그인(auth.uid()=NULL)에서 `NULL<>'admin' = NULL`이 되어 if를 건너뛰고 가드가 열린다.
- 예: `IF my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION ...`

## 4) 멱등·비파괴
- `CREATE TABLE/COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`.
- 반환 타입 변경은 `DROP FUNCTION` 후 재생성 — 이때 ACL 복원 잊지 말 것.
- 기존 행에 0px 영향인지 확인(신규 필드는 optional·폴백=현행값).

## 5) 검증
- 적용 후 **어드바이저 보안 ERROR 0** 유지 확인.
- 합성/롤백 검증(트랜잭션 안에서 RAISE로 롤백해 효과 확인)으로 로직 검증.
- `_`로 시작하는 내부 함수는 anon/authenticated에서 REVOKE(직접 호출 차단).

## 6) 기록
- 라이브에 적용한 마이그레이션은 파일명·요지를 메모리(nuri-holdem-launch-state)에 리포. 리포에 없는 것은 없는 것.
- app_settings는 read=true 공개라 비밀키 저장 금지 — 비밀은 secret_settings(RLS 전면잠금, service_role 전용).

## 무료 한도 인지
- egress 5GB/월이 실질 천장. 실시간 구독은 '보는 화면'에서만 연결(게이팅). Storage 업로드 cacheControl 1년.
- Realtime Free tier: 동시연결 200·월 200만 메시지 — 프레즌스/타이핑 남발 시 TV 클락 구독까지 열화.

마무리는 반드시 `nuri-ship` 게이트로.
