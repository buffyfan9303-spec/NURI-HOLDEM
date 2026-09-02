---
name: security-audit
description: NURI HOLDEM 보안 점검 — 비밀 유출(secretlint)·의존성(npm audit)·정적 분석(eslint security)·Supabase 어드바이저·엣지 함수 인증 게이트를 한 번에 돌리고 우선순위별 조치안을 낸다. 배포 전·마이그레이션 후·"보안 점검" 요청 시.
---

# /security-audit — 보안 점검 루틴

라이브 서비스(공개 GitHub 저장소 + Supabase)다. 아래 순서로 **실측**하고, 결과를 우선순위(Critical → High → Medium → Low)로 정리해 보고한다.
추측으로 "안전하다"고 쓰지 않는다 — 각 항목은 실행한 명령과 실제 출력이 근거다.

## 1. 비밀 유출 — 저장소·스테이징
```bash
npx secretlint "**/*" --format compact          # 저장소 전체(.secretlintignore 적용)
git log -p -S"SERVICE_ROLE" --all --oneline | head  # 이력에 서비스 롤 키가 박힌 적 없는지
```
- `sb_publishable_*` · anon JWT(role=anon) 는 **공개 키**라 allows 에 등록돼 있다. service_role · Resend · Gemini · Vault 값이 나오면 Critical.
- 공개 저장소이므로 새면 즉시 공개: 발견 시 **키 로테이션이 먼저**, 삭제 커밋은 그다음(이력에 남는다).

## 2. 의존성
```bash
npm audit --omit=dev            # 런타임 번들에 들어가는 것만 — high/critical 은 즉시
npm audit                       # dev 포함(도구 체인)
```
`npm audit fix` 는 semver 안전 범위만. 메이저 상향은 오너 결정(dependabot PR 관행).

## 3. 정적 분석
```bash
npm run lint                    # eslint-plugin-security 규칙 포함(경고로 표면화)
```
`security/detect-*` 경고 중 **사용자 입력이 흐르는 곳**만 본다(정규식 DoS·비리터럴 require·eval 계열).

## 4. Supabase 어드바이저 (MCP `get_advisors`, type=security)
- **ERROR 0 유지**가 게이트. WARN 중 `*_security_definer_function_executable` 은
  변이 RPC 가 anon 에 열려 있는지 본다 → 열려 있으면 `revoke ... from public, anon` + `grant ... to authenticated, service_role`
  (`from anon` 만으로는 무효 — PUBLIC 기본 GRANT). 읽기 RPC(get_/list_/is_/can_/집계)는 비로그인 화면이 쓰므로 anon 유지.
- 트리거·크론·`_` 내부 함수는 anon·authenticated 모두 회수.
- `rls_enabled_no_policy` 는 service_role 전용 테이블(secret_settings·ai_usage 등)이면 정상.

## 5. 엣지 함수 인증 게이트 (supabase/functions/*)
각 함수의 첫 분기에서 **누가 부를 수 있는가**를 확인한다. `verify_jwt=true` 는 anon 키 JWT 도 통과시키므로 게이트가 아니다.
| 함수 | 게이트 |
|---|---|
| gemini · gto-explain | `getUser(token)` 로그인 필수 + `consume_ai_quota` 일일 상한 |
| notify-sanction | 로그인 + profiles.role = admin |
| send-push · weekly-email-digest · weekly-report | Vault 공유 시크릿 헤더(`x-nuri-push-secret` / `x-nuri-cron-secret`) — 크론·트리거만 안다 |
| verify-identity | 로그인 + service_role RPC 내부 판정 |
```bash
# anon 키만으로 호출해 401 인지 확인(성공하면 구멍)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/gemini \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"prompt":"x"}'
```

## 6. 클라이언트 노출 점검
```bash
grep -rnE "service_role|SERVICE_ROLE|-----BEGIN" src        # 0 이어야 한다
grep -rhoE "import\.meta\.env\.VITE_[A-Z_]+" src | sort -u   # 전부 공개 가능한 값인지(anon·지도 JS 키·PortOne 채널 키·Sentry DSN)
grep -rnE "dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(" src
```
지도 키(Kakao/Naver)는 **도메인 제한**이 켜져 있어야 공개돼도 무해하다(콘솔에서 확인).

## 7. 보고 형식
```
[Critical] … (근거: 명령/출력) → 조치
[High] …
[Medium] …
[Low/Info] …
오너 결정 필요: …
```
CLAUDE.md '보안 코딩 표준' 위반이 코드에 있으면 그 자리에서 고치되, 라이브 DB 변경은 nuri-migration 규칙(멱등·REVOKE PUBLIC·search_path·롤백)을 따른다.
