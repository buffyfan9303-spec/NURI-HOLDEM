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
  accent — surface 와 같은 CSS 변수 문법(`rgb(var(--accent-*) / <alpha-value>)`), 정의는 `src/index.css`.
  **2026-09-02 아우라 v3(오너 승인)**: 바탕 딥 플럼 #151221 → **딥 네이비 블랙 #06080F**(카드 #0E1322 · 서브 #151C30),
  accent 바이올렛 #805FDA → **딥 퍼플 #9D4EDD**(라이트 #7C3AED · CTA/활성 탭 전용), **네온 시안 `--aura-*` #00F2FE**(라이트 #0E7490)는
  라벨·활성 칩·링·글로우·강조 전용. 글자 3단 #FFF / #8B9BB4 / #74849E(시안 3차 #526079 는 AA 미달이라 상향).
  참조 시안 'Aura Health AI'(sina maleki). 폰 목업·타인 연락처·Inter 폰트는 적용 제외(오너 승인).
  **v4(같은 날, 오너 지시 "aura-ui.com 이 좋은 샘플")**: 주색 딥 퍼플 → **Aura UI 인디고 #5850EC**(라이트 #4F46E5), 시안은 네온 → **cyan-500 #06B6D4**,
  헤드라인 그라데이션 흰→인디고→바이올렛→푸시아, 카드는 불투명+white 5% 헤어라인+겹친 소프트 섀도(+PC hover 2px 리프트), 글로우는 3px 링 20%.
  원칙('Vibrant Depth'): 미묘한 그라데이션·겹친 그림자·유리 패널·의도된 마이크로 모션 — **네온·강한 테두리·큰 글로우 금지**(v3 가 조잡했던 이유).
  **v6(2026-09-02, 오너 "아직도 너무 다르다" → aura-ui.com 을 브라우저로 열어 computed style 실측)**: 배경 블룸 3색 `--bloom-1/2/3`
  = violet-500 #8B5CF6 · indigo-500 #6366F1 · fuchsia-500 #D946EF(알파 다크 .16/.20/.11 · 라이트 .10/.12/.08, 500px 안팎 원 — 실측은 blur-3xl 원이지만
  우리는 radial-gradient 로 그린다), 헤드라인은 **흰색 + 핵심 구절 하나만** `.text-grad-violet`(500 계열 채도, 흰색 시작 금지) + `.text-grad-glow`,
  CTA `--grad-cta` = violet-700→indigo-800 + violet-500/25 틴트 그림자, 카드 테두리 `border-strong` 55%(보이는 헤어라인), 곡률 card 12 · aura 16 · btn 8 · chip 8,
  `.chip-aura`(indigo 틴트 칩) · `.ring-aura`(mask xor 그라데이션 헤어라인, 히어로·피처 카드 한두 곳만) · `shadow-glow` = 3px 링 .25 + 20px .125.
  글자 네온은 레퍼런스에 text-shadow 0곳 — 후광은 구절 span 의 정적 drop-shadow 로만.
  단 클락 TV(`clockTheme.ts`)·GTO 차트 fill(`ranges.data.ts`)의 #5E6AD2 는 도메인 고정 스냅샷이라 앱 accent 와 무관),
  `future.hoverOnlyWhenSupported`, `darkMode: 'class'`

> Tailwind v4로 옮겨도 됩니다. 단 위 커스텀 시스템(특히 surface 알파 채널 문법)을 `@theme`로
> **온전히 이관해야** 전 화면 색이 깨지지 않습니다. 색 회귀는 "기존 오류"에 해당합니다.

## 아이콘 (2026-08-29 갱신 — 아래 서술이 오래돼 있어 실제 구조로 정정)

`src/components/atoms/Icon.tsx` 하나가 단일 진입점이고, **안이 두 갈래**입니다.

| 갈래 | 내용 | 새로 추가할 때 |
|---|---|---|
| **범용 아이콘** | 공식 **`lucide-react` 팩**(오너 지시 2026-08-27, `0aea569`). 네임드 임포트라 쓰는 것만 번들에 들어갑니다(트리셰이킹) | `LUCIDE` 맵에 한 줄 — 이름은 https://lucide.dev 에서 검색 |
| **포커 도메인 글리프** | 카드 수트·칩 등 lucide 에 없는 것만 자체 `PATHS` | `PATHS` 에 한 줄(viewBox 24 / stroke 2 / currentColor) |

> ⛔ **다른 아이콘 라이브러리를 섞지 마세요.** 스트로크 두께·사이즈가 갈리는 순간 화면이 조잡해집니다 —
> 2026-08-29 에 이모지 300곳을 SVG 로 통일한 이유가 정확히 그것입니다.
> ⛔ **새 이모지를 UI 에 들이지 마세요.** 이모지는 폰트 리소스라 기기마다 다른 그림으로 뜨고,
> 색이 폰트에 박혀 있어 다크/라이트 토큰을 못 따라갑니다 — 디자인 통제권이 OS 로 넘어갑니다.
> 단 **카드 수트(♠♥♦♣)는 도메인 기호라 그대로 씁니다**(교체하면 오히려 나빠집니다).
> ✅ ISC 라이선스 고지는 `Icon.tsx` 상단에 반영 완료(과거 지적 해소).

## 모션 헌법 v2 (§20.4 — 앱 전체의 유일한 물리 법칙) — 2026-09-02 개정

오너 지시(2026-09-02): "Aura Health AI" 시안을 적극 참조한 전체 테마 + Apple 모션 전면 적용, **실측 게이트 하에 헌법 전부 개방**.
v1 의 금지들은 아래처럼 **'금지' → '측정 조건부 허용'** 으로 바뀌었다. v1 이 왜 막았는지는 "과거 교훈" 절에 남아 있다.
새 곡선·duration·애니메이트 속성을 추가하려면 여전히 이 절을 먼저 고친다.

1. **이징 토큰 6개** (`src/index.css :root`):
   `--ease`(iOS 드로어 곡선 0.32,0.72,0,1 — 시트·탭 푸시·큰 면의 이동) ·
   `--ease-out-ui`(0.23,1,0.32,1 — 드롭다운·툴팁·토스트·칩 등 **작은 UI 의 등장/퇴장**, Emil Kowalski 표준) ·
   `--ease-move`(0.77,0,0.175,1 — **화면 안에서 자리를 옮기는 것**: SlidingPill FLIP·재정렬) ·
   `--ease-out`(0.3,0,1,1 — 가속 퇴장. **VT 푸시아웃의 대칭 짝으로만**. Apple §7 '들어온 길로 나간다') ·
   `--spring`(linear() 근사 — CSS 만으로 되는 프레스 복귀) · 예외 2개(무한 루프, shake).
   ❌ `ease-in` 을 UI 에 쓰지 않는다(사용자가 보는 순간을 늦춘다). ❌ 손으로 만든 베지어 신규 도입 금지 — easing.dev 값만.
2. **duration 토큰 4단 유지**: `--dur-fast .15s / --dur-base .22s / --dur-panel .32s / --dur-tab .3s`.
   UI 는 300ms 를 넘지 않는다(시트·풀스크린만 예외). `duration-*` 유틸 신규 사용 금지 — 기존 33곳은 토큰으로 수렴시킨다.
3. **스프링 전면 개방 — 단, 라이브러리 없이.** 손이 닿는 모든 것(시트·드래그·플릭)은 `src/lib/spring.ts` 의
   WAAPI 스프링을 쓴다: 감쇠비 1.0 기본(오버슈트 없음) · 손짓에 운동량이 실렸을 때만 0.8(살짝 바운스) ·
   응답 0.3~0.4s · **손을 뗀 속도를 그대로 이어받고**(velocity handoff) · **투영**(`project(v, 0.998)`)으로 착지점을 정한 뒤 ·
   **언제든 잡아 되돌릴 수 있다**(presentation 값에서 재시작). Apple 스킬 §3~§6 그대로.
   `motion` 패키지는 WAAPI 로 안 되는 것(레이아웃 애니·exit 조율)이 실제로 나올 때만 동적 로드로 재논의. 스크롤 하이재킹은 여전히 금지.
4. **애니메이트 화이트리스트**: `transform`/`opacity`(+색 계열은 ≤0.15s hover·press) + `clip-path`(리빌 한정).
   ❌ `height width top left margin padding gap font-size` ❌ `background-position background-size` ❌ **`transition-all`**.
   `filter: blur ≤ 6px` 는 **크로스페이드 마스킹**(VT 푸시·탭 진입)에만 — 이미 그렇게 쓰고 있다.
   예외: SlidingPill(absolute 격리) · 자기완결 소형 진행바의 `transition-[width]` · `grid-template-rows 0fr→1fr` 단일 요소.
5. **유리(backdrop-filter) 조건부 허용 — '측정 게이트'.** 상시 fixed 크롬(헤더·하단 탭바·시트)에 `.glass`/`.glass-strong` 를 쓸 수 있다. 조건:
   ① `@supports (backdrop-filter)` + `prefers-reduced-transparency` 에서 **불투명 폴백** 필수(index.css 유틸이 처리) ·
   ② 반투명 면 위에 반투명 면을 **겹치지 않는다**(Apple §12 — 탭바 알약은 불투명 유지) ·
   ③ `perf.spec` 롱프레임 상한(콜드 <40 · 커뮤니티 스크롤 <20)을 **넘기면 즉시 되돌린다** — 이 스펙이 게이트다 ·
   ④ backdrop-filter 자체를 **애니메이트하지 않는다**(등장은 opacity/transform 만).
6. **아우라 배경 = 정적.** `.aura-bg` 한 겹(fixed · radial-gradient 2~3개 · pointer-events:none)만. **흐르는 배경·느린 루프 금지**
   (Apple §14 전정계 지침) · `filter: blur()` 로 만들지 않는다(그라데이션은 싸고 blur 는 비싸다) · reduced-transparency 에서 숨긴다.
7. **새 진입 애니 클래스 = 두 목록 동시 등록**: `index.css` `.tab-pane :is(...)` 무효화 목록 + `prefers-reduced-motion` 목록.
   reduced-motion 은 '없음' 이 아니라 '짧은 페이드' 다 — 이해를 돕는 opacity 전환은 남긴다.
8. **will-change 상시 부착 금지**(현 3곳이 상한) · 토스트로 폼 에러 금지 · CLS 는 진입 애니가 아니라 **공간 예약**으로만 해결 ·
   프레스 피드백은 **pointer-down 즉시**(`:active` `--press: scale(0.97)` · `--dur-fast` · `--ease-out-ui`), 절대 release 에서.

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

### 유리(backdrop-filter)와 시트 제스처의 함정 (2026-09-02 테마 v2 실측)
- **`backdrop-filter`(·`filter`·`transform`)가 걸린 요소는 `position: fixed` 자손의 컨테이닝 블록이 된다.**
  헤더에 `.glass-strong` 을 직접 걸자 헤더 안 알림 스크림(`fixed inset-0`)이 68px 헤더 안에 갇혀 바깥 클릭이 안 닿았다
  (backstack.spec '알림 패널' 실패). fixed 자손이 있을 수 있는 크롬에는 **`.glass-chrome`(::before 레이어)** 만 쓴다.
- **스크롤되는 시트 본문 위의 제스처는 Pointer Events 로 잡을 수 없다.** Chrome 이 스크롤 제스처로 판정하는 순간
  `pointercancel` 로 스트림을 끊는다(맨 위에서 아래로 끌어도). 그립(`touch-none`)에선 되고 본문에선 0.85px 만 움직였다.
  본문 드래그는 **Touch Events** 로 받는다(네이티브 스크롤 중에도 계속 온다). 스프링·투영·중단은 `src/lib/spring.ts` 그대로.
- **라이트 틸은 순백이 아니라 실제 지면(surface-base #F5F6F8)으로 대비를 재라.** #0D9488 은 순백 4.55 · base 3.46 —
  design-tokens.spec 아우라 게이트가 잡았다. 토큰 값을 고르면 반드시 그 스펙을 돌린다.
- **아우라 후광은 정적(radial-gradient) 한 겹.** `filter: blur()` 로 만들지 않고, 흐르게 하지 않는다(Apple §14 전정계·페인트 비용).

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

---

## 보안 코딩 표준 (2026-09-02 보안 패스 — 코드 생성 시 기본 반영)

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
