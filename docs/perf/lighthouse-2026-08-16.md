# Lighthouse 전/후 비교 — 마스터 지시서 적용 (2026-08-16)

마스터 지시서(통합판 v4) 검증 프로토콜 1번. 로컬 동일 조건 A/B — 같은 머신,
같은 네트워크(라이브 Supabase), 같은 크로미움(Playwright chromium-1228),
`vite build` 프로덕션 산출물을 `vite preview` 로 서빙, 모바일 에뮬레이션(기본).

| 커밋 | 설명 |
|---|---|
| 전 `f94cb0d` | 마스터 지시서 적용 직전(묶음 H·G 잔여까지) |
| 후 `836e732` | Phase 1·2·3·6·7·8 + PART 2(10~17) + framer 제거 완료 |

## 결과 (Performance 카테고리, 각 1회 실행)

| 지표 | 전 (f94cb0d) | 후 (836e732) | 변화 |
|---|---|---|---|
| **Performance 점수** | **73** | **90** | **+17** |
| **CLS** | **0.427** | **0.039** | **–91%** 🎯 |
| FCP | 2.2 s | 2.4 s | +0.2 s |
| LCP | 2.6 s | 2.8 s | +0.2 s |
| TBT | 150 ms | 160 ms | +10 ms |
| Speed Index | 2.2 s | 3.0 s | +0.8 s |
| TTI | 6.4 s | 8.4 s | +2.0 s |

## 해석

- **점수를 끌어올린 결정타는 CLS 0.427 → 0.039.** 전에는 빈 root → 콘텐츠 등장
  과정에서 화면이 통째로 밀렸다. 정적 셸(Phase 2)이 헤더·탭바·스켈레톤 자리를
  처음부터 잡고, 스켈레톤과 실카드의 치수가 일치해 교체 시프트가 사라졌다.
- FCP/LCP ±0.2s, TBT ±10ms 는 단일 실행 오차 범위다(로컬 프리뷰 + 실 Supabase
  왕복이 섞인 측정이라 ±수백 ms 흔들린다).
- TTI/SI 증가는 측정 방법상 예상된 결과: 서드파티(GA·AdSense)를 '첫 데이터 응답
  후'로 미룬 탓에 네트워크 안정 시점이 뒤로 밀린다 — 사용자가 기다리는 콘텐츠는
  먼저 오고(의도), 지표는 광고 로드까지 포함해 계산된다.
- framer-motion 제거(–130KB min)는 이 측정엔 일부만 반영 — 재방문(캐시) 시나리오와
  저사양 기기에서 파싱 비용 절감이 실체감으로 나타난다.

## 재현

```bash
# 후
npm run build && npx vite preview --port 4173
CHROME_PATH=<playwright chromium> npx lighthouse http://localhost:4173 \
  --only-categories=performance --chrome-flags="--headless=new"

# 전
git worktree add ../holdem-baseline f94cb0d && cd ../holdem-baseline
npm ci && npm run build && npx vite preview --port 4180
npx lighthouse http://localhost:4180 ...
```

원본 JSON: 세션 스크래치(before.json/after.json) — 수치는 위 표에 고정 기록.
