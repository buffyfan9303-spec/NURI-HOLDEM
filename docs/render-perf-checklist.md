# 렌더 성능 체크리스트 (세 앱 공통 · NURI HOLDEM/MIND/PET)

신규 화면·무거운 컴포넌트를 만들 때 **선적용**할 항목. 2026-06-24 HOLDEM "내 매장 메뉴 잰크" 최적화에서 검증된 패턴 정리.
원칙: **DB/로직/간격/UX는 그대로, 렌더 비용만 줄인다.**

## 1. 탭/섹션을 "마운트 유지(display:none)"로 전환한다면 → 반드시 memo
- 방문 섹션을 언마운트하지 않고 `display:none`으로 숨기면 재진입 깜빡임·재fetch는 없지만,
  **부모가 재렌더될 때마다 숨은 섹션이 전부 재조정(reconcile)**된다. 무거운 섹션이 쌓이면 전환이 뚝뚝 끊긴다.
- ✅ 섹션 컴포넌트를 `memo()`로 감싼다(모듈 스코프에서 `const XM = memo(X)` → JSX에서 `<XM/>` 사용, 컴포넌트 파일은 안 건드림).
- ✅ 넘기는 **핸들러는 `useCallback`, 객체/배열/엘리먼트 prop은 `useMemo`**로 참조 고정(안 그러면 memo가 매번 깨짐).
- ✅ `active`류 가시성 prop은 토글되게 두면 됨 → 전환 시 "나가는+들어오는" 섹션만 재렌더.
- ⚠️ `active` 게이팅(내부 작업/구독 중단)만으로는 **재렌더 자체를 못 막는다.** memo가 그 한 겹.
- 참고: 조건부 렌더(`{tab===X && ...}`)는 비활성 섹션을 언마운트하므로 이 문제가 **없다**(대신 재진입 시 재마운트 비용). 둘 중 택1.

## 2. 렌더 루프 안의 O(n) 조회 → useMemo 맵으로 O(1)
- `rows.map(r => buyins.find(b => b.x===r.x))` 같이 **행/셀마다 배열 전체를 훑으면 O(행×열×n)**으로 폭증(예: 50명×10칸×200바인 ≈ 10만 회/렌더).
- ✅ `buyins`를 1회 순회해 `Map`(키→값/집계)을 `useMemo([data])`로 만들고, 조회는 `map.get(key) ?? 기본값`.
- HOLDEM 적용처: `cellAt`/`countOf`/`maxEntryOf`/`playerTotals` (NuriPosLedger).

## 3. 이미지 디코드/지연
- **히어로/접힘 위 이미지**: `decoding="async"`만(메인스레드 밖 디코드 → 모달 열림 잰크 제거). **`loading="lazy"`는 금지**(주 콘텐츠 지연).
- **리스트/썸네일/접힘 아래/캐러셀**: `loading="lazy" decoding="async"` 둘 다.
- 데이터 URL(QR 등)은 `loading`은 무의미, `decoding="async"`만 무해하게.

## 4. 인라인 고비용 계산 → useMemo
- 렌더 본문에서 매번 `sort/큰 reduce/정규식(큰 텍스트)`을 돌리면 매 렌더 재계산. **데이터 의존성으로 `useMemo`**.
- 의존성 배열은 **실제 데이터(state)만** — 매 렌더 새로 만드는 객체/배열을 deps에 넣으면 memo가 무효.

## 5. 무프롭 무거운 컴포넌트 → memo = 마운트 후 재렌더 0
- prop이 없는 무거운 컴포넌트(예: 도구 패널)는 `memo()`만으로 부모 재렌더와 무관해진다.

## 6. 애니메이션은 레이아웃 비용 0으로
- 활성 인디케이터(알약/밑줄) 이동: **opacity 크로스페이드**(칸마다 자기 핀 + `transition-opacity`)가 가장 안전·저비용.
- framer `layoutId`는 FLIP 측정(레이아웃 읽기)이 들어감 — 작은 핀엔 무난하나, 다수/빈번하면 opacity 방식 고려.
- `transform` 이동도 가능하나 `translateX(%)`는 자기 너비 기준이라 컨테이너 칸 이동엔 함정(명시 너비 필요).

## 7. 무거운 전환은 useDeferredValue로 양보
- 메뉴 하이라이트는 즉시, 무거운 콘텐츠 렌더는 `useDeferredValue`로 저우선 → 저사양 폰에서 프레임 막힘 완화.

---
### 빠른 점검 그렙
```
# 렌더 루프 O(n) 조회 후보
grep -rnE '\.(find|filter|reduce)\(' src --include=*.tsx | grep -iE 'map\(|\.map'
# memo 누락(무거운 리스트/탭 컴포넌트인데 export default function …)
grep -rnE 'export default function' src/components
# 이미지 속성 누락
grep -rnE '<img' src --include=*.tsx | grep -vE 'decoding=|loading='
```
