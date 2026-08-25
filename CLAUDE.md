# NURI HOLDEM — 프로젝트 규약

라이브 서비스입니다(운영 중). 큰 재작성보다 **작고 리뷰 가능한 변경**을 우선합니다.

## 스택 (확정 — 변경 금지)
- Vite 8 + React 19 + TypeScript, **Tailwind CSS v3.4** (`tailwind.config.js`)
- **Tailwind v4로 마이그레이션하지 마세요.** `tailwind.config.js`에 커스텀 디자인 시스템이 있습니다:
  surface 스케일(`rgb(var(--surface-*) / <alpha-value>)` CSS 변수 참조), Linear 인디고 accent(`accent-300 #5E6AD2`),
  `future.hoverOnlyWhenSupported`(모바일 hover 잔상 제거), `darkMode: 'class'`.
- 백엔드 Supabase, 에러추적 Sentry, 결제 PortOne, E2E Playwright (`npm run test:e2e`).

## 아이콘 — 단일 소스 유지
`src/components/atoms/Icon.tsx`가 **유일한 아이콘 소스**입니다. Lucide 스타일(viewBox 24 / stroke 2 / currentColor)을
`PATHS` 레지스트리로 관리합니다. 새 아이콘이 필요하면 **`PATHS`에 한 줄 추가**하세요.

> ⚠️ 일부 디자인 스킬(taste-skill §3.C)은 "손으로 SVG를 그리지 말고 Phosphor/Hugeicons를 설치하라"고 지시합니다.
> **이 프로젝트에서는 그 규칙을 적용하지 마세요.** 아이콘 라이브러리를 새로 설치하지 않습니다.

## 애니메이션 — framer-motion 금지
framer-motion은 **의도적으로 제거**했습니다. `layoutId` 기반 슬라이딩 인디케이터 13곳은
`src/components/atoms/SlidingPill.tsx`의 자체 FLIP 구현으로 대체되어 있습니다(`SegmentedTabs`, `StatefulActionButton` 참고).

> ⚠️ taste-skill §3.A는 Motion(`motion/react`)을 기본 애니메이션 라이브러리로 지정합니다.
> **이 프로젝트에서는 적용하지 마세요.** 새 전환이 필요하면 `SlidingPill` 패턴 또는 CSS를 씁니다.

## 탭 구조 — keep-alive 주의
`TabId = 'browse' | 'live' | 'community' | 'market' | 'tools' | 'my-store' | 'admin'`.
**메인(기본) 탭은 `browse`(일정 탐색)** 입니다.

최상위 탭은 언마운트하지 않고 `visitedTabs` Set + `display` 토글로 **마운트를 유지**합니다(`App.tsx`).
그래서 `.tab-pane` 내부의 **항상-렌더 진입 애니메이션은 탭 재방문마다 다시 재생**되어 깜빡임을 만듭니다.
이를 막기 위해 `src/index.css:283`에 무효화 규칙이 있습니다:
`.tab-pane :is(.animate-fade-in, .animate-slide-up, .animate-slide-down, .animate-scale-in):not(.fixed):not(.fixed *)`

> ⚠️ 스크롤 리빌·스태거 진입 애니메이션을 탭 안에 추가할 때는 위 규칙과 충돌하는지 반드시 확인하세요.
> 신규 진입 애니메이션 클래스를 만들면 저 `:is(...)` 목록에도 추가해야 합니다.

## 디자인 스킬 사용 지침
- 홀덤 화면 대부분은 **일정 목록·장부·데이터 테이블·다단계 운영 UI**입니다.
  `taste-skill`은 스스로 "랜딩/포트폴리오/리디자인 전용, 대시보드·데이터테이블·다단계 제품 UI는 범위 밖"이라고 명시합니다.
- **홀덤에서는 `redesign-skill`을 쓰세요.** 감사 후 저위험 순서로 적용: 폰트 → 컬러 → hover/active → 레이아웃·여백 → 진부한 컴포넌트 → loading/empty/error → 타이포 스케일. 프레임워크 마이그레이션 금지가 규칙에 포함되어 있어 안전합니다.
- `output-skill`은 제약 없이 병용 가능합니다(코드 생략 방지).
- 새 라이브러리를 import하기 전 반드시 `package.json`을 먼저 확인하세요.

## 검증
UI를 바꿨으면 `npm run build`와 `npm run test:e2e`(Playwright 스모크)를 돌립니다. dev 서버는 포트 **5173**(`.claude/launch.json`의 `holdem-dev`).
