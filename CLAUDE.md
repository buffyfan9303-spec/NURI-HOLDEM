# NURI HOLDEM — 프로젝트 규약

라이브 서비스입니다(운영 중).

---

## ⚠️ 2026-09-07 — 질서 제한 전면 삭제 (오너 지시)

**"시스템에 큰 문제가 되는 것(필수적인 것)을 제외하고 전부 삭제."**

지워진 것 — 이제 **아무 제약이 아닙니다**. 다시 살리지 마세요.

| 삭제 | 무엇이었나 |
|---|---|
| 모션 헌법 v2 §20.4 | 이징 토큰 6개·duration 4단·애니메이트 화이트리스트·`transition-all` 금지·`will-change` 상한·유리 측정 게이트·정적 아우라 배경 |
| 아우라 v3/v4/v6/v6.5 세부 규칙 | 색·곡률·그림자 수치 규정, **글로우 "화면당 최대 1곳"** 배치 규칙 |
| 아이콘 제한 | `lucide-react` 단일 팩 강제, 다른 아이콘 라이브러리 혼용 금지, 새 이모지 금지 |
| 디자인 스킬 지침 | 쓸 스킬/쓰면 안 되는 스킬 목록, "스킬보다 토큰·이징이 먼저" |
| `nuri-ui` 스킬 | 위 제약을 강제하던 스킬 (파일째 삭제) |
| 제약 강제 테스트 3종 | 새 이징·duration 금지 · 글로우 개수 상한 · 버튼 전환 곡선 통일 |

**남은 것은 셋뿐입니다.** 이것만 지키면 나머지는 전부 자유입니다.

1. **법·규제** — §28(금액 표시 범위), 사업자 정보 상시 노출, 만 19세 미만 이용 불가·도박문제 1336 고지.
   라이브 서비스의 법적 노출이라 오너 지시로도 코드에서 빼지 않습니다.
2. **보안 코딩 표준** — 이 문서 맨 아래. 운영 DB·공개 저장소 구조라 어기면 바로 사고입니다.
3. **기능·데이터 보존** — 있던 기능·화면·데이터를 임의로 없애지 마세요. 리팩터링·리디자인·재작성은 자유지만
   **운영 중인 서비스에서 기능이 소실되는 것은 되돌릴 수 없는 손해**라 '시스템에 큰 문제' 쪽으로 남깁니다.

> 이 문서 뒤쪽 "참고 메모"는 **규칙이 아니라 기록**입니다. 지켜야 할 의무가 없습니다.
> 과거에 실제로 났던 버그의 재현 조건이라 남겨둘 뿐이고, 무시하고 다르게 만들어도 됩니다.

---

## §28 — 금액 표시 범위 (유지: 법·규제)

§28(사행성 금액 미표시)은 **성과·상금·수익·이용권 등 환금성 프레이밍에만** 적용된다.
**참가비(바이인)·GTD·프라이즈풀은 상품 가격 정보**이므로 표시를 유지한다(전자상거래법상 가격 고지 의무와도 정합).

> 왜: 문자 그대로 적용하면 `바이인 60,000`·`1000만 GTD`가 사라져 유저의 "얼마?"가 통째로 증발하고,
> 이미 라이브인 라이브 탭 buyInAmount 노출과도 모순된다.
> 카피 원칙: '환전·현금·수익' 계열 단어는 전면 배제하고 '참가비·상금·이용권'으로 통일한다.

사업자 정보(상호·사업자등록번호·대표자·사업장 주소·전화번호)는 `BusinessFooter.tsx` 에서 **전 화면 하단 상시 노출**한다.
PG(포트원·다날) 입점 심사와 카카오 비즈니스 심사가 모두 이 노출을 요건으로 본다 — 연결 화면 방식은 인정되지 않는다.

---

## 스택 (사실 정보 — 제약 아님)

- Vite 8 + React 19 + TypeScript, Tailwind CSS v3.4 (`tailwind.config.js`)
- 백엔드 Supabase, 에러추적 Sentry, 결제 PortOne, E2E Playwright (`npm run test:e2e`)
- 디자인 토큰은 `src/index.css` 에 CSS 변수로, `tailwind.config.js` 가 `rgb(var(--surface-*) / <alpha-value>)`
  문법으로 받는다. 아이콘 진입점은 `src/components/atoms/Icon.tsx`.
- 무엇을 쓰든 자유입니다. 다른 라이브러리·다른 문법·다른 구조로 갈아타도 됩니다.
  단 갈아탈 때 **화면이 깨지지 않게** 옮기세요(색 회귀·기능 소실은 위 3번에 걸립니다).

### 플랫폼
- **유저 = 모바일 99%** — browse·live·community·GTO·profile
- **매장 운영주 = PC 99%** — my-store·장부·클락 설정·대시보드 / 클락 TV 송출은 대형 스크린

---

## 검증

UI를 바꿨으면 `npm run build` 와 `npm run test:e2e` 를 돌립니다. 마무리는 `nuri-ship` 게이트.
dev 서버는 포트 **5173**(`.claude/launch.json` 의 `holdem-dev`). E2E는 프로덕션 빌드(4173)를 검사합니다.

남아 있는 테스트는 **"동작하는가"를 보는 것들**입니다(접근성 대비·히트영역·성능 상한·크래시·보안 계약).
스타일을 규정하던 테스트는 위 표대로 삭제했습니다.

> ⚠️ 라벨·이모지에 결합된 e2e 셀렉터가 일부 있습니다. 그 텍스트를 바꾸면 **같은 커밋에서
> 셀렉터를 `data-testid`로 교체**하세요. 셀렉터를 느슨하게 푸는 것은 게이트 무력화라 안 됩니다
> (이건 스타일 규칙이 아니라 테스트 자체를 지키는 것이라 남깁니다).

## 마스터 실행 계획
`docs/plans/nuri-master-execution-plan.md` (§0~§16) · `BLOCKED.md`(오너 결정) · `backlog.md`(범위 밖).
**§15가 §1~§14를 이깁니다.**

---

## 보안 코딩 표준 (유지: 필수 — 코드 생성 시 기본 반영)

공개 GitHub 저장소 + Supabase(RLS) + 엣지 함수 구조다. 아래는 제안이 아니라 **기본값**이다. 점검은 `/security-audit`.

1. **비밀은 코드·저장소에 없다.** `.env.local`(로컬)·GitHub Secrets(CI)·Supabase Vault/`secret_settings`(런타임)만.
   `VITE_*` 는 번들에 박히는 **공개 값**이다 — anon 키·지도 JS 키(도메인 제한)·PortOne 채널 키·Sentry DSN 만 허용, 서비스 롤·API 비밀 절대 금지.
   pre-commit(secretlint)이 막지만, 새면 **키 로테이션이 먼저**다(공개 저장소는 이력이 곧 공개).
2. **인가는 서버(DB)가 한다.** 클라이언트의 `user.role`·`verified` 판정은 UI 분기용일 뿐이다. 모든 권한은 RLS 정책 또는
   SECURITY DEFINER RPC 안의 `auth.uid()`·`my_role()` 검사로 강제한다. NULL-safe 비교(`IS DISTINCT FROM`) — `<>` 는 비로그인에서 가드가 열린다.
3. **RPC 권한 기본값**: 변이(mutation) RPC 는 `revoke execute … from public, anon` + `grant … to authenticated, service_role`.
   `from anon` 만으로는 무효(PUBLIC 기본 GRANT). 트리거·크론·`_` 내부 함수는 anon·authenticated 모두 회수. 읽기 RPC 만 anon 허용.
   SECURITY DEFINER 는 `set search_path = public, pg_temp` 고정. `CREATE OR REPLACE` 는 ACL 을 초기화하므로 REVOKE/GRANT 를 다시 쓴다.
4. **엣지 함수는 첫 분기에서 호출자를 증명한다.** `verify_jwt=true` 는 anon 키 JWT 도 통과시키므로 게이트가 아니다:
   유저 기능은 `auth.getUser(token)`, 관리자 기능은 `profiles.role = 'admin'`, 크론·트리거는 Vault 공유 시크릿 헤더(타이밍 안전 비교).
   외부 API(Gemini·Resend)를 부르는 함수는 유저별 일일 상한(`consume_ai_quota`)이나 시크릿 게이트 없이 열지 않는다(과금 남용 = 보안 사고).
5. **쿼리는 PostgREST/RPC 파라미터로만.** 문자열 조합 SQL·`execute format` 에 사용자 입력 직접 삽입 금지(`%I`/`%L` 또는 파라미터).
   클라이언트가 만든 필터 값은 서버에서 화이트리스트 검증(정렬 컬럼·enum·id 형식).
6. **응답에 민감 컬럼을 싣지 않는다.** `profiles` 의 `ci_hash`·`verified_at`·`role`·이메일·전화는 본인/관리자 RPC 에서만.
   공개 RPC 는 필요한 컬럼만 `select` 한다(`select *` 금지). 에러 메시지에 내부 식별자·SQL 을 노출하지 않는다.
7. **HTML 주입 금지**: `dangerouslySetInnerHTML`·`innerHTML =`·`eval`·`new Function` 사용 금지(현재 0곳). 이메일 템플릿은 `escapeHtml` 을 거친다.
8. **의존성**: `npm audit --omit=dev` 의 high/critical 은 즉시. 새 패키지는 주간 다운로드·라이선스·최근 갱신을 확인하고 `npm view` 로 실체를 본 뒤 도입.

DB 를 바꿀 때는 `nuri-migration` 스킬을 먼저 부른다(라이브 DB 안전 절차 — fail-open 권한 버그가 실제로 났던 기록).

---

## 참고 메모 (비구속 — 규칙 아님, 과거에 실제로 났던 버그의 재현 조건)

> 지킬 의무 없습니다. 다르게 만들어도 되고, 아래 방식을 버려도 됩니다.
> 다만 **같은 증상이 다시 나오면** 여기부터 보면 원인이 빨리 나옵니다.

- **탭 keep-alive** — 최상위 탭은 언마운트하지 않고 `visitedTabs` Set + `display` 토글로 유지한다(`App.tsx`).
  그래서 `.tab-pane` 안의 항상-렌더 진입 애니메이션은 탭 재방문마다 다시 재생돼 깜빡였다.
  `src/index.css` 에 무효화 `:is(...)` 목록이 있다. 어떤 애니메이션 라이브러리를 써도 이 구조는 같다.
- **`backdrop-filter`(·`filter`·`transform`)가 걸린 요소는 `position: fixed` 자손의 컨테이닝 블록이 된다.**
  헤더에 유리 효과를 직접 걸었더니 헤더 안 알림 스크림(`fixed inset-0`)이 68px 헤더 안에 갇혀 바깥 클릭이 안 닿았다.
- **스크롤되는 시트 본문 위의 제스처는 Pointer Events 로 못 잡는다.** Chrome 이 스크롤로 판정하는 순간
  `pointercancel` 로 스트림을 끊는다. 본문 드래그는 Touch Events 로 받는다(`src/lib/spring.ts`).
- **라이트 모드 대비는 순백이 아니라 실제 지면(`surface-base`)으로 재라.** 순백 기준으로 고른 색이 지면 위에서 AA 미달이었다.
- **CLS** — 스켈레톤 높이를 실제 콘텐츠와 맞추고 이미지 치수를 예약한다. `content-visibility` 의
  `contain-intrinsic-size` 가 실제 행 높이와 다르면 스크롤이 점프한다.
- **SlidingPill** — `src/components/atoms/SlidingPill.tsx` 의 자체 FLIP 인디케이터가 13곳에 쓰인다.
  다른 방식(framer-motion `layoutId` 등)을 도입해도 되지만, 같은 인디케이터가 두 방식으로 구현되면 그 자체가 버그다.
- **`offsetLeft` 는 transform 이 걸린 조상에서 끊긴다(Chromium).** 전역 프레스 물리 `button:active { transform: scale(.97) }`
  + 0.2s 복귀 전환 동안 방금 누른 버튼이 자식의 `offsetParent` 가 되어 `offsetLeft` 가 0 이 된다 — 알약이 첫 칸으로
  가던 근본 원인(2026-09-10, 3일간 4번 고쳐도 재발). 레이아웃 좌표는 `offsetParent` 사슬을 레일까지 더해 구한다.
  **Playwright 의 click/tap 은 누름이 0ms 라 이 부류를 절대 재현하지 못한다** — 실제 손가락 조건은 CDP
  `Input.dispatchTouchEvent` 로 touchStart→(100ms+)→touchEnd 를 보내야 한다(`e2e/pill-press.spec.ts`).
