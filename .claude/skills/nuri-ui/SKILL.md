---
name: nuri-ui
description: NURI HOLDEM의 React/UI/Tailwind 코드를 만들거나 고칠 때 사용. 디자인 시스템과 하드 제약(Icon.tsx 단일 소스, framer-motion 금지→SlidingPill/CSS, surface·accent 토큰, keep-alive 진입애니 규칙, Tailwind v3, redesign-skill 저위험 순서)을 강제한다. 컴포넌트·스타일·리디자인 작업 직전에 호출하라.
---

# nuri-ui — NURI 디자인 시스템·제약 강제

홀덤은 **redesign-skill** 접근(taste-skill 아님). 아래 규약을 벗어나지 마라.

## 하드 제약 (위반 금지 — 가드 훅도 일부 차단)
- **아이콘**: `src/components/atoms/Icon.tsx`의 `PATHS` 레지스트리가 유일 소스. 새 아이콘 라이브러리(lucide·phosphor·react-icons 등) 설치 금지. 필요하면 PATHS에 한 줄 추가(Lucide 스타일: viewBox 24 / stroke 2 / currentColor). 이모지 아이콘도 Icon 글리프로.
- **애니메이션**: framer-motion·motion 금지(의도적 제거). 세그먼트/탭 활성 인디케이터는 `src/components/atoms/SlidingPill.tsx`의 자체 FLIP(SegmentedTabs·StatefulActionButton 참고). 나머지는 CSS transition(`--ease`). 그래프/매트릭스/링/진행바는 순수 SVG·CSS width.
- **Tailwind v3.4** 고정(v4 마이그레이션 금지). 색은 `tailwind.config.js` 토큰만: surface 스케일 `rgb(var(--surface-*)/<alpha>)`, accent-300 `#5E6AD2`(Linear 인디고), darkMode:'class'. 임의 hex·신규 fontSize 스케일 신설 금지.
- **폰트**: Pretendard. 기존 fontSize 스케일만(text-2xs/sm/base…). 15px 같은 임의값 금지.

## keep-alive 진입 애니 함정 (필수)
최상위 탭은 언마운트 안 하고 `visitedTabs`+`display` 토글로 마운트 유지 → `.tab-pane` 내부 항상-렌더 진입 애니는 **재방문마다 재생**돼 깜빡인다. `src/index.css:283`에 무효화 규칙(`:is(.animate-fade-in,.animate-slide-up,.animate-slide-down,.animate-scale-in):not(.fixed)`)이 있다.
- **신규 진입 애니 클래스를 만들면 반드시** index.css:283 `:is(...)` 목록 **+** 384-385의 `prefers-reduced-motion` `animation:none` 목록에 **동시 등록**하라.
- 스크롤 리빌은 기존 `.reveal`(scroll-driven) 재사용. 루프(타이핑 3점 등)는 무효화 대상 아님.

## 색 시맨틱 (드리프트 방지)
- accent-300 인디고 = 상호작용/링크/활성/포커스/진행바. gold-300 = 상금·마일스톤·트로피. emerald = 긍정/온라인/인증. danger = 긴급/HOT/파괴.
- **액션 시맨틱 색(레이즈/콜/4벳/폴드)** 과 **에퀴티 강도 밴드**는 별도 토큰으로 유지 — 하나로 뭉개면 GTO 최고밀도 뷰가 회귀한다(ACTION_COLORS vs EQUITY_BANDS 분리, ACTION_COLORS에 fold 키 유지). raise 인디고는 데이터비주얼 fill 전용(활성색과 시맨틱 충돌 주의).
- 카테고리 태그는 고정 상수(CATEGORY_TINTS 3~5개 저알파 틴트)로 잠가라.

## 저위험 실행 순서 (redesign-skill)
폰트/아이콘 → 컬러 토큰화 → hover/active → 레이아웃·여백 → 진부한 컴포넌트 → loading/empty/error → 타이포 스케일. **한 번에 한 화면·한 관심사만 커밋.** 큰 IA 수술은 마지막.

## 재사용 우선 (신규 최소화)
EmptyState·Skeleton·LoadErrorCard·SlidingPill·TierBadge·calcUi의 CalcCard/Result는 이미 있다 — 재사용. 공유 컴포넌트를 새로 만들면 파일 경로·prop 계약·DoD·최소 렌더 테스트를 함께 명세(화면 간 재구현 드리프트 방지). 개인정보(이메일/실명/금액)는 공개 컴포넌트 prop에서 화이트리스트로 타입 차단.

## 접근성
role/aria/키보드/포커스 가시화/Escape. 오버플로 '…' 메뉴는 role=menu+focus-trap. 색은 색각 이중 인코딩(명도차+글리프)로 단독 의존 금지.

마무리는 반드시 `nuri-ship` 게이트로. UI가 프리뷰로 검증 가능하면 브라우저로 실제 확인.
