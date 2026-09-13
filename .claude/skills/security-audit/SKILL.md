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
개수 자체(2026-09-13 실측 221 warning / 0 error)와 규칙별 내역은 `nuri-ship` 기준선 표가 갖는다 — 여기는 **판정**만 한다.

### ⚠ 로컬에서 못 돌리지만 CI 가 돌리는 것 — 여기서 초록이어도 푸시하면 빨개진다
이 루틴은 예전에 **로컬 3종(secretlint·npm audit·eslint)만** 적고 CI 의 나머지를 빠뜨리고 있었다. 실측(`ci.yml`):

| CI 스텝 | 줄 | 로컬에서 되나 |
|---|---|---|
| `gitleaks` (커밋 **이력** 전체) | `:102-103` (`fetch-depth: 0`) | ✗ — secretlint 는 **작업 트리만** 본다. 이미 커밋된 비밀은 secretlint 초록이어도 gitleaks 가 잡는다 |
| `npm audit --omit=dev --audit-level=high` | `:115` | ✓ — 단 CI 는 `--audit-level=high` 라 **high 미만은 실패시키지 않는다** |
| `semgrep --config p/typescript,p/react,p/secrets --error` | `:118-125` | ✗ — `ci.yml:93` 이 이유를 적어 뒀다: **윈도우 로컬은 네이티브 미지원이라 CI 에서만** 돈다 |

→ 보고할 때 **"semgrep·gitleaks 는 로컬 미실행"** 이라고 명시해라. 안 돌린 것을 "통과" 로 적지 마라.
→ `--error` 라 semgrep finding 이 하나라도 있으면 CI 가 실패한다. 로컬 3종이 전부 초록이어도 그건 CI 통과의 근거가 아니다.

## 4. Supabase 어드바이저 (MCP `get_advisors`, type=security)
- **ERROR 0 유지**가 게이트. WARN 중 `*_security_definer_function_executable` 은
  변이 RPC 가 anon 에 열려 있는지 본다 → 열려 있으면 `revoke ... from public, anon` + `grant ... to authenticated, service_role`
  (`from anon` 만으로는 무효 — PUBLIC 기본 GRANT). 읽기 RPC(get_/list_/is_/can_/집계)는 비로그인 화면이 쓰므로 anon 유지.
- 트리거·크론·`_` 내부 함수는 anon·authenticated 모두 회수.
- `rls_enabled_no_policy` 는 service_role 전용 테이블(secret_settings·ai_usage 등)이면 정상.

## 5. 엣지 함수 인증 게이트 (supabase/functions/*)
각 함수의 첫 분기에서 **누가 부를 수 있는가**를 확인한다. `verify_jwt=true` 는 anon 키 JWT 도 통과시키므로 게이트가 아니다.

⚠ **2026-09-13 실측 정정.** 이 표는 예전에 `gemini · gto-explain` 을 "getUser + consume_ai_quota" 로 적고 있었는데
**둘 다 사실이 아니다**(2026-09-11 AI 기능 축소 이후 바뀐 것을 표가 못 따라갔다). 실제 디렉터리는 **8개**다 —
`gemini gto-explain notify-sanction send-push tda-assist verify-identity weekly-email-digest weekly-report`.

| 함수 | 게이트 (근거 = 파일·줄, 2026-09-13 실측) |
|---|---|
| **tda-assist** | `requireUser(req)` 실패 시 **401**(`index.ts:117-118`) + `consume_ai_quota(p_kind='tda', p_limit=40)` 초과 **429**(`:74,:147`), RPC 장애는 fail-closed. **저장소에서 `consume_ai_quota` 를 부르는 함수는 여기 하나뿐**이다 |
| gemini | **인증 분기가 없는 것이 정상이다.** 2026-09-11 폐기된 범용 프록시라 지금은 **무조건 410 Gone 거절 스텁**(`index.ts` 30줄 전부). 디렉터리를 지우지 않는 이유가 본문에 있다 — 지워도 **이미 배포된 함수는 살아 있고** 대시보드에서 지워야 사라진다 |
| **gto-explain** | **확인 불가 — 디렉터리가 비어 있다**(`index.ts` 없음). 저장소에 소스가 없으니 **라이브 배포본이 남아 있는지는 Supabase 대시보드에서만** 보인다. 남아 있다면 아무도 게이트를 읽을 수 없는 상태다 → **오너 확인 항목**(Critical 후보) |
| notify-sanction | 유저 JWT `getUser` → `profiles.role === 'admin'` 아니면 401/403 (`index.ts:44-53`) |
| send-push | `x-nuri-push-secret` 을 `get_push_shared_secret`(service_role 전용 RPC) 값과 대조, 부재·불일치 401 (`index.ts:21-27`) |
| weekly-email-digest · weekly-report | `x-nuri-cron-secret` 을 같은 시크릿과 **타이밍 안전 비교**, 불일치 401 (`weekly-email-digest/index.ts:32-34` · `weekly-report/index.ts:51-54`) |
| verify-identity | `getUser()` 로그인 필수 401 + 만 19세 미만 403 (`index.ts:46-47,72`) |

```bash
ls supabase/functions/                            # 1) 표에 없는 함수가 늘었는가 - 새 함수는 '게이트 미확인' 이다
grep -rn "consume_ai_quota" supabase/functions/   # 2) 외부 API 를 부르는 함수에 유저별 상한이 있는가(보안 표준 4)
# 3) 살아 있는 AI 엔드포인트를 anon 키만으로 → 401 이어야 한다(200 이면 구멍)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/tda-assist \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"question":"x","ruleKeys":[]}'
# 4) 폐기된 gemini → 410 이어야 한다. **200 이면 옛 범용 프록시가 아직 배포돼 있다는 뜻이라 Critical.**
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/gemini \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"prompt":"x"}'
```
⚠ 3)4) 의 기대값(401 / 410)은 **코드를 읽은 근거**이지 이 문서를 쓰며 쏴 본 결과가 아니다 —
돌렸으면 **네가 받은 실제 코드를 적어라.** 표도 같다: 저장소의 소스이지 **라이브에 배포된 판본이 아니다.**

## 6. 클라이언트 노출 점검
```bash
# ⚠ 이 줄은 예전에 "0 이어야 한다" 고 적혀 있었는데 **거짓이다** — 실측(2026-09-13) 27줄 / 15파일.
#    전부 `src/api/*.migration.test.ts`·`*.contract.test.ts` 안의 **SQL 계약 단언 문자열**이다
#    (`grant execute ... to authenticated, service_role;` 가 마이그레이션 파일에 있는지 검사하는 테스트).
#    0 을 기대하면 매번 27건을 보고 이 검사 자체를 무시하게 된다. 런타임 코드만 봐라 — 아래가 실측 0 이다:
grep -rnE "service_role|SERVICE_ROLE|-----BEGIN" src | grep -vE "\.test\.ts"   # 실측 0
grep -rhoE "import\.meta\.env\.VITE_[A-Z_]+" src | sort -u                     # 전부 공개 가능한 값인지
grep -rnE "dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(" src              # 실측 0
```
지도 키(Kakao/Naver)는 **도메인 제한**이 켜져 있어야 공개돼도 무해하다(콘솔에서 확인).
`VITE_*` 실측 12개 — `SUPABASE_URL`·`SUPABASE_ANON_KEY`·`KAKAO_MAP_KEY`·`NAVER_MAP_KEY`·`PORTONE_CHANNEL_KEY`·
`PORTONE_STORE_ID`·`SENTRY_DSN`·`SENTRY_RELEASE`·`STORAGE_BUCKET_{COMMUNITY,LISTINGS,POSTERS}`·`VERCEL_GIT_COMMIT_SHA`.
**목록에 없는 이름이 나오면 그게 점검 대상**이다 — 번들에 박히므로 "설정에 숨겼다" 는 성립하지 않는다.

## 6-1. 빌드가 운영 DB로 나간다 (2026-09-13 실측)
`npm run build` 의 첫 단계 `scripts/gen-sitemap.mjs` 는 **`.env.local`(없으면 `.env`)을 직접 파싱**해
`VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 를 읽고, **운영 Supabase REST 로 읽기 요청**을 낸다
(`schedules?select=id,date&approved=eq.true`, `venues?select=id,slug,region&approved=eq.true&status=eq.active`) → 결과를 `public/sitemap.xml` 에 쓴다.
```bash
grep -n "\.env\.local\|fetch(\|rest/v1" scripts/gen-sitemap.mjs
```
점검 포인트:
- 이 경로로 나가는 값은 **anon 키뿐**이어야 한다. 빌드 스크립트가 서비스 롤을 읽기 시작하면 그 순간 CI 로그·산출물이 유출 경로가 된다.
- `select` 가 **필요한 컬럼만** 인지(공개 RPC 규칙과 같다). 사이트맵에 들어간 값은 곧 **공개 URL** 이다 — 미승인·비활성 레코드가 섞이면 그 자체가 노출이다.
- 부작용을 알고 있어야 한다: **빌드(=E2E 도)를 돌릴 때마다 운영 DB 를 읽고 `public/sitemap.xml` 을 덮어쓴다.** 안전 절차는 `nuri-e2e`·`nuri-ship`.
- 이 스크립트는 **어떤 실패에도 throw 하지 않는다**(설계상 빌드 비차단). 즉 키가 틀려도 조용히 스킵되고 옛 sitemap 이 남는다 — "빌드 성공" 이 "수집 성공" 이 아니다.

## 6-2. 권한 거부의 조용한 0행 — 이건 보안 점검 항목이다
RLS·GRANT 로 막힌 클라이언트 **변이**(update/delete/insert)는 PostgREST 에서 **에러가 아니라 "성공, 영향 0행"** 으로 돌아온다.
그래서 **권한 거부가 UI 에서 성공처럼 보이고**, 반대로 가드를 잘못 열어 둔 것도 같은 화면에서는 구별되지 않는다.
- 보안 관점의 판정: "성공했으니 권한이 있다" 도, "0행이니 막혀 있다" 도 **증거가 아니다**. 실제로 변경됐는지 서버에서 되읽어 확인한다.
- 탐지 방법·`.select()` 로 영향 행을 받아내는 패턴은 **`nuri-affect`** 가 다룬다 — 여기서 되풀이하지 않는다.
- 마이그레이션으로 RLS 를 좁힌 직후가 가장 위험하다(`nuri-migration` 적용 후 반드시 같이 본다).

## 7. 보고 형식
```
[Critical] … (근거: 명령/출력) → 조치
[High] …
[Medium] …
[Low/Info] …
오너 결정 필요: …
```
CLAUDE.md '보안 코딩 표준' 위반이 코드에 있으면 그 자리에서 고치되, 라이브 DB 변경은 nuri-migration 규칙(멱등·REVOKE PUBLIC·search_path·롤백)을 따른다.

## 이 점검이 못 보는 것 (전부 초록이어도 안전을 뜻하지 않는다)

- **라이브에 실제로 배포된 것.** 1~6번은 전부 **저장소 파일**을 본다. 엣지 함수도 RPC 도 라이브 판본이 저장소와
  같다는 보장이 없다 — `gto-explain` 처럼 **저장소에 소스가 없는데 배포본은 살아 있을 수 있는** 경우가 실제로 있다.
  라이브 확인은 대시보드·`get_advisors`·실제 curl 뿐이다.
- **ACL 자가검사의 거짓 통과.** 이미 REVOKE 된 함수를 `CREATE OR REPLACE` 로 덮으면 파일에서 REVOKE 를 빼도
  ACL 이 남아 검사를 통과한다. 음성 대조는 `DROP` 후 적용해야 한다 → 규칙은 `nuri-migration` 1번, 절차는 `nuri-verify`.
- **권한 거부의 조용한 0행.** 위 6-2. 탐지 절차는 `nuri-affect`.
- **`npm audit` 이 아는 것만.** 실측(2026-09-13): `npm audit --omit=dev` · `npm audit` 둘 다 `found 0 vulnerabilities`.
  0 은 "취약점이 없다" 가 아니라 **"advisory 에 올라온 것이 없다"** 다. 공급망 탈취·타이포스쿼트는 여기 안 잡힌다(보안 표준 8).
- **secretlint 가 아는 패턴만.** 실측: exit 0 / 출력 0바이트. 커스텀 형식의 비밀은 룰이 없으면 조용히 통과한다.
  그리고 **이미 푸시된 이력은 스캔이 통과해도 공개다** — 새면 삭제 커밋이 아니라 **로테이션이 먼저**다(1번).
- **린트 경고의 의미.** 3번은 `security/detect-*` 를 **세기만** 한다. 사용자 입력이 그 자리에 실제로 흐르는지는
  사람이 읽어야 갈린다. 규칙별 기준선 수치는 `nuri-ship` 의 기준선 표에 있다 — 여기서 되풀이하지 않는다.
- **코드 밖.** 오리진 설정, 스토리지 버킷 공개 범위, PG 확장, 대시보드 권한·2FA 는 이 루틴이 건드리지 않는다.
