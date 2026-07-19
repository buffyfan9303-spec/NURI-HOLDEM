# supabase/baseline — 라이브 DB 스냅샷

## 목적

리포지토리 ↔ 라이브 Supabase 간 **스키마 드리프트 해소용 기준 문서**.
라이브 DB(public 스키마)를 카탈로그 조회로 통째로 덤프해 "지금 실제로 돌아가는 스키마"를 한 파일로 보존한다.
DB 유실·프로젝트 이전 시 이 파일만으로 구조 재구축이 가능하다(데이터 제외).

## 파일

- `2026-07-20-live-snapshot.sql` — 2026-07-20 기준 라이브 스냅샷 (project ref: `idsxiqspecrucvfvtgbw`, ~246KB / 5,496줄)

## ⚠️ 절대 금지

1. **`supabase/migrations/` 로 옮기거나 자동 적용하지 말 것.** 이 파일은 문서다. 라이브에 그대로 재실행하면 이미 존재하는 오브젝트와 충돌한다(CREATE TABLE 등은 IF NOT EXISTS 없음 — 의도적으로, 실수 적용을 즉시 실패시키기 위함).
2. **함수 재적용 주의:** `CREATE OR REPLACE FUNCTION` 을 라이브에 재실행하면 **함수 ACL 이 초기화**된다(2026-06-24 감사에서 확인된 gotcha). anon revoke 마이그레이션을 반드시 다시 실행해야 한다.

## 스냅샷 내용 (섹션 순서 = 재구축 실행 순서)

| # | 섹션 | 수량 |
|---|------|------|
| 1 | ENUM 타입 | 11 |
| 2 | 시퀀스 | 1 (`custom_missions_id_seq`) |
| 3 | 테이블 (컬럼/기본값/NOT NULL) | 73 |
| 4 | 제약 — PK / UNIQUE / CHECK / FK | 73 / 11 / 25 / 107 (계 216) |
| 5 | RLS enable | 73 (전 테이블) |
| 6 | 인덱스 (제약 자동생성분 제외) | 87 |
| 7 | 함수 (확장 pg_trgm·pg_net 등 소속 제외) | 182 |
| 8 | 트리거 | public 40 + auth.users 1 (`on_auth_user_created`) |
| 9 | RLS 정책 | 168 |
| 10 | pg_cron 잡 (주석 + 재등록 예시) | 6 |
| 11 | Realtime 퍼블리케이션 테이블 | 24 |

**제외된 것:** 데이터(rows), GRANT/ACL, auth·storage·realtime 등 타 스키마 오브젝트, Edge Functions, Storage 버킷, 확장 자체 설치문(`create extension`), Vault/시크릿.

## 검증 결과 (2026-07-20 덤프 시점)

카탈로그 카운트 쿼리와 파일 내 구문 수 대조 — **전 항목 일치**:

- 함수: 라이브 182 (public, 비확장) = 파일 182 ✓ (`$function$` 태그 364 = 182×2, 짝 맞음)
- 테이블: 라이브 73 = 파일 73 ✓ (RLS enable 73도 일치)
- 정책: 라이브 168 = 파일 168 ✓
- 제약 216 / 인덱스 87 / 트리거 41 / ENUM 11 모두 일치
- 백슬래시 이스케이프 원본 대조 검증: `contains_blocked_ugc` 의 `\s` 정규식, `parse_prize_man` 의 `\.`, `send_weekly_venue_reports` 의 `E'\n'` — 라이브 prosrc 와 position() 매칭으로 확인

## 재구축 시 참고

- 섹션 순서대로 실행하면 의존성 문제 없음 (테이블 전부 생성 → FK 일괄 추가 구조).
- FK 중 일부는 `auth.users(id)` 참조 — Supabase 프로젝트(auth 스키마) 위에서만 실행 가능.
- 사전 필요 확장: `pgcrypto`(gen_random_uuid, crypt/gen_salt — 일부는 `extensions.` 스키마 접두), `uuid-ossp`(uuid_generate_v4), `pg_trgm`(gin_trgm_ops 인덱스), `pg_net`(push_on_notification), `pg_cron`(잡 6개).
- `push_on_notification` 함수에 하드코딩된 Authorization 토큰은 **anon(공개) 키**다. 새 프로젝트로 이전 시 URL·키를 교체할 것.
- 재구축 후 별도 재실행 필요: 함수 anon revoke(ACL) 마이그레이션, cron.schedule 등록(10장 주석 참조), Realtime 퍼블리케이션(11장), auth.users 트리거(8장 말미).

## 갱신 방법

같은 방식(MCP `execute_sql` 카탈로그 조회, 읽기 전용)으로 새 날짜 파일을 만들고 이 README 의 날짜·수량 표를 갱신한다. 기존 스냅샷 파일은 이력으로 남긴다.
