# NURI HOLDEM — 프로젝트 규약

라이브 서비스입니다(운영 중).

---

## ⚠️ 2026-08-26 정책 변경 — 기술 제약 전면 해제

사장님 지시로 **기존 하드 제약을 모두 풀었습니다.** 이 문서의 아래 내용은 이제 *금지 규칙*이 아니라
**"예전에 왜 그렇게 했는지"의 배경 지식**입니다. 같은 버그를 다시 만들지 않기 위해 남겨둡니다.

### 새 규칙 3가지 (이것만 지키면 됩니다)

1. **✅ 기술 선택 자유** — framer-motion/motion, 아이콘 라이브러리, Tailwind v4, 차트·UI 라이브러리,
   새 의존성 무엇이든 도입 가능합니다. "APK처럼 부드러운 모션"이 목표라면 그에 맞는 최적의 도구를 쓰세요.
2. **🚫 웹사이트의 '내용'은 보존** — 기능·데이터·화면·카피를 임의로 없애거나 바꾸지 마세요.
   리팩터링·리디자인은 자유지만, **있던 기능이 사라지면 안 됩니다.**
3. **🚫 기존에 있던 오류는 재발 금지** — 아래 "과거 교훈" 섹션의 함정들은 제약이 풀려도 그대로 존재합니다.
   라이브러리를 바꿔도 그 문제를 다시 만들면 안 됩니다.

> 결론: **"어떻게 만들지"는 자유, "무엇이 있는지"는 보존, "예전 버그"는 재발 금지.**

---

## §28 — 금액 표시 범위 (사행성 금액 미표시 규약의 정확한 적용 범위)

§28(사행성 금액 미표시)은 **성과·상금·수익·이용권 등 환금성 프레이밍에만** 적용된다.
**참가비(바이인)·GTD·프라이즈풀은 상품 가격 정보**이므로 표시를 유지한다(전자상거래법상 가격 고지 의무와도 정합).

> 왜: 문자 그대로 적용하면 `바이인 60,000`·`1000만 GTD`가 사라져 유저의 "얼마?"가 통째로 증발하고,
> 이미 라이브인 라이브 탭 buyInAmount 노출과도 모순된다. ScheduleCard를 앵커로 잡는
> 모든 리디자인 카드(DAI-2·DAI-3·DAI-6·IMG-5)와 바이인 예산 필터(UX-2)는 이 정의를 전제한다.
> 카피 원칙: '환전·현금·수익' 계열 단어는 전면 배제하고 '참가비·상금·이용권'으로 통일한다.

---

## 스택 (현재 상태 — 변경 가능)
- Vite 8 + React 19 + TypeScript, Tailwind CSS v3.4 (`tailwind.config.js`)
- 백엔드 Supabase, 에러추적 Sentry, 결제 PortOne, E2E Playwright (`npm run test:e2e`)
- `tailwind.config.js`의 커스텀 디자인 시스템: surface 스케일(`rgb(var(--surface-*) / <alpha-value>)`),
  바이올렛 accent — surface 와 같은 CSS 변수 문법(`rgb(var(--accent-*) / <alpha-value>)`, 정의는
  `src/index.css` 다크 `#805FDA`/라이트 `#6946C8` 분리 · 2026-08-27 구 Linear 인디고 #5E6AD2 에서 이동.
  단 클락 TV(`clockTheme.ts`)·GTO 차트 fill(`ranges.data.ts`)의 #5E6AD2 는 도메인 고정 스냅샷이라 앱 accent 와 무관),
  `future.hoverOnlyWhenSupported`, `darkMode: 'class'`

> Tailwind v4로 옮겨도 됩니다. 단 위 커스텀 시스템(특히 surface 알파 채널 문법)을 `@theme`로
> **온전히 이관해야** 전 화면 색이 깨지지 않습니다. 색 회귀는 "기존 오류"에 해당합니다.

## 아이콘
`src/components/atoms/Icon.tsx`의 `PATHS` 레지스트리가 **현재의** 단일 소스입니다(Lucide 스타일: viewBox 24 / stroke 2 / currentColor).

> 아이콘 라이브러리 도입은 이제 자유입니다. 단 **혼용하면 스트로크 두께·사이즈가 갈리므로** 이관 계획을 세우세요.
> ⚖️ 현재 `PATHS`의 다수 path가 Lucide 원본과 동일한데 저작권 고지가 없습니다 — ISC 고지 1줄 추가가 필요합니다.

## 모션 헌법 v1 (§20.4 — 앱 전체의 유일한 물리 법칙)

새 곡선·duration·애니메이트 속성을 추가하려면 이 절을 먼저 고친다.

1. **이징 4개뿐**: `--ease`(기본·감속 — 판단 안 서면 무조건 이것) · `--ease-out`(오직 '화면 밖으로
   사라지는 것') · `--spring`(손 뗀 뒤 복귀) · 예외 2개(무한 루프, shake). 오버슈트 베지어·Material 값 신규 도입 금지.
2. **duration 토큰 4단**: `--dur-fast .15s / --dur-base .2s / --dur-panel .26s / --dur-tab .22s`.
   `duration-200` 류 유틸 신규 사용 금지(토큰과 분리돼 표류). 거리를 줄이는 게 duration 줄이기보다 빠르게 지각된다.
3. **애니메이트 화이트리스트**: `transform`/`opacity`(+색 계열은 ≤0.15s hover·press 한정).
   ❌ `height width top left margin padding gap font-size` ❌ `background-position background-size filter backdrop-filter`(페인트 폭탄)
   ❌ **`transition-all` 신규 금지**(2026-08-26 전수 0건 달성 — 나중에 누가 height 를 추가하면 자동 레이아웃 애니가 된다).
   예외: SlidingPill(absolute 격리) · 자기완결 소형 진행바의 `transition-[width]` · `grid-template-rows 0fr→1fr` 단일 요소.
4. **새 진입 애니 클래스 = 두 목록 동시 등록**: `index.css` `.tab-pane :is(...)` 무효화 목록 + `prefers-reduced-motion` 목록.
5. **will-change 상시 부착 금지**(현 3곳이 상한) · 상시 fixed 요소에 backdrop-filter 금지 ·
   토스트로 폼 에러 금지(등장·퇴장이 또 하나의 '움직임') · CLS 는 진입 애니가 아니라 **공간 예약**으로만 해결.
6. **모션 라이브러리 재고 게이트**(§19.1): MO-1 계측 후 실기기 INP p75 > 200ms + 제스처 특정 + CSS 재현 불가 판정 시에만
   `LazyMotion+m+domAnimation` 동적 로드 한정 재논의. 스크롤 하이재킹(Lenis·ScrollSmoother)은 무조건 금지.

## 애니메이션 — 자유. 단 아래 함정은 그대로 존재
과거 framer-motion을 제거하고 `layoutId` 기반 슬라이딩 인디케이터 13곳을
`src/components/atoms/SlidingPill.tsx`의 자체 FLIP으로 대체했습니다(`SegmentedTabs`, `StatefulActionButton` 참고).

> **이제 framer-motion/motion을 다시 써도 됩니다.** 오히려 "APK처럼 부드러운" 스프링 물리에는 유리할 수 있습니다.
> 단 SlidingPill과 **역할이 겹치지 않게** 정리하세요(같은 인디케이터가 두 방식으로 구현되면 그게 곧 버그입니다).

---

## 과거 교훈 — 제약이 풀려도 이 함정들은 남아 있습니다

### 탭 keep-alive와 진입 애니메이션 (가장 자주 재발하는 버그)
`TabId = 'browse' | 'live' | 'community' | 'market' | 'tools' | 'my-store' | 'admin'`, 메인 탭은 `browse`.
최상위 탭은 **언마운트하지 않고** `visitedTabs` Set + `display` 토글로 마운트를 유지합니다(`App.tsx`).

그래서 `.tab-pane` 내부의 **항상-렌더 진입 애니메이션은 탭 재방문마다 다시 재생**되어 깜빡입니다.
`src/index.css`에 무효화 규칙이 있습니다:
`.tab-pane :is(.animate-fade-in, .animate-slide-up, .animate-slide-down, .animate-scale-in):not(.fixed):not(.fixed *)`

> ⚠️ **어떤 애니메이션 라이브러리를 쓰든** 이 구조적 문제는 동일합니다. 탭 내부에 진입 애니를 넣으면
> 재방문마다 재생됩니다. 새 진입 애니 클래스를 만들면 위 `:is(...)` 목록과
> `prefers-reduced-motion` 목록에 **함께 등록**하세요.

### 모션 품질 목표 (사장님 요구)
"웹이지만 APK처럼 부드럽게. **뚝뚝 끊기거나, 멈췄다가 주르륵 콘텐츠가 아래로 나오는 건 절대 안 됨.**"
- 끊김 = 프레임 드롭 → `transform`/`opacity` 위주, 레이아웃 스래싱 회피, 스크롤 리스너는 passive + rAF
- 주르륵 밀림 = CLS → 스켈레톤 높이를 실제 콘텐츠와 일치, 이미지 치수 예약,
  `content-visibility`의 `contain-intrinsic-size`를 실제 행 높이와 맞출 것(틀리면 스크롤 점프)

### 기존 모션 자산 (버리지 말고 정밀화)
`--ease: cubic-bezier(0.32, 0.72, 0, 1)`(iOS 계열) · View Transitions 방향성 푸시 ·
scroll-driven `reveal-up`(`animation-timeline: view()`) · `content-visibility` + `contain-intrinsic-size` ·
press-spring · `prefers-reduced-motion` 블록 다수

### 플랫폼 분리 (2026-08-25 확정)
- **유저 = 모바일 99%** — browse·live·community·GTO·profile은 모바일 퍼스트(하단 탭바·엄지 영역)
- **매장 운영주 = PC 99%** — my-store·장부·클락 설정·대시보드는 PC 퍼스트(밀도 높은 데이터)
- 클락 TV 송출은 대형 스크린

---

## 디자인 스킬 사용 지침 (2026-08-29 갱신 — 설치 스킬 전수 확인 후)

홀덤 화면 대부분은 **일정 목록·장부·데이터 테이블·다단계 운영 UI**입니다. 이 성격이 어떤 스킬을
쓸지를 결정합니다.

### 이 프로젝트에 쓰는 것
| 스킬 | 언제 |
|---|---|
| **`redesign-skill`** | **기본값.** 기존 화면 개선 전반. 감사 후 저위험 순서로: 폰트 → 컬러 → hover/active → 레이아웃·여백 → 진부한 컴포넌트 → loading/empty/error → 타이포 스케일 |
| **`output-skill`** | 항상 병용 가능. 코드 생략·`// ...나머지 동일` 류 차단 |
| **`frontend-design`**(공식) | 프런트엔드 일반 지침이 필요할 때 |
| **`image-to-code-skill`** | **사장님이 스크린샷·목업을 주셨을 때.** 이미지를 먼저 깊이 분석하고 그에 맞춰 구현하는 흐름 — 이 프로젝트는 지시가 대부분 스크린샷으로 오므로 적중률이 높다 |
| **`brandkit`** | 브랜드 보드·로고 시스템·아이덴티티 덱이 필요할 때(제품 UI 아님) |

### ⚠️ 쓰면 안 되는 것
- **`taste-skill`** — 스킬 자신이 적용 범위를 이렇게 못박고 있습니다:
  *"Landing pages, portfolios, and redesigns. **Not dashboards, not data tables, not multi-step
  product UI.**"* 우리 화면은 정확히 그 "쓰지 말라"는 쪽입니다(일정 표·장부·클락 설정·순위 입력).
  랜딩 페이지나 소개 페이지를 새로 만들 때만 꺼내세요. 제품 UI에 쓰면 데이터 밀도를 해칩니다.
- `stitch-skill`은 Google Stitch용 DESIGN.md 생성기라 우리 파이프라인과 무관합니다.

### 스킬보다 먼저인 것
이 문서의 **모션 헌법(§20.4)과 디자인 토큰이 스킬 지침을 이깁니다.** 스킬이 새 이징·새 duration·
`transition-all`·상시 `will-change`를 제안하면 그건 따르지 않습니다. 색도 마찬가지로 하드 hex 대신
`tailwind.config.js`의 토큰을 씁니다(gold·emerald는 테마 고정색이라 라이트에서 규칙이 반대라는 점 주의).

- 새 라이브러리를 import하기 전 `package.json`을 먼저 확인하세요(중복 도입 방지).
- 라이브러리 문서가 필요하면 **`context7` MCP**(2026-08-29 추가)로 조회할 수 있습니다.

## 검증
UI를 바꿨으면 `npm run build`와 `npm run test:e2e`(Playwright 스모크)를 돌립니다.
dev 서버는 포트 **5173**(`.claude/launch.json`의 `holdem-dev`). E2E는 프로덕션 빌드(4173)를 검사합니다.

> ⚠️ e2e 스펙이 일부 **라벨·이모지에 결합**돼 있습니다(`'도구'` 라벨 3곳, `🏁` 이모지 1곳).
> 리디자인으로 그 텍스트를 바꾸면 **같은 커밋에서 셀렉터를 `data-testid`로 교체**하세요.
> 셀렉터를 느슨하게 푸는 것은 게이트 무력화라 금지입니다.

## 마스터 실행 계획
`docs/plans/nuri-master-execution-plan.md` (§0~§16) · `BLOCKED.md`(오너 결정) · `backlog.md`(범위 밖).
**§15가 §1~§14를 이깁니다.** 읽는 순서: §15 → §12(결정) → 해당 카드.
