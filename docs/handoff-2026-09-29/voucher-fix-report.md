# 이용권 시트 "올라갔다 내려옴" 수정 보고 (home-team · 2026-09-29)
요구 키: 오너 채팅 2026-09-29 / 원천 scratchpad/voucher-bounce-report.md (A안)

## diff (편집 2파일, 커밋 없음)
- src/components/features/MyVoucherSheet.tsx : `<Modal … dragToClose={…} fillHeight>` + 설명 주석 (+4/-1). fillHeight 사용처는 원래 0곳(Modal.tsx:22,484) → 다른 화면 영향 없음.
- e2e/voucher-sheet-open.spec.ts : 회귀 시험 2개 추가(+61, 기존 단언 불변) — 390×844 · 412×915, store_vouchers 500ms 지연+빈 목록, 1.5초 rAF 로 rect.top−translateY 의 max−min ≤ 1.

## 전/후 (격리 빌드 hf/wt: dist-pre=fillHeight 제거, dist-fix=수정, 포트 4202/4201, LAT=600, sheet.cjs header)
| 뷰포트 | 장수 | 수정 전 떨어짐 | 수정 후 |
|---|---|---|---|
| 390×844 | 0 | 44.2 (742.7→698.5) | 0 (742.7 고정) |
| 390×844 | 3 | 0 | 0 |
| 412×915 | 0 | 106.7 | 0 (805.2 고정) |
| 412×915 | 3 | 6 | 0 |
| 1280×800 | 0 | 20.7 | 0 (704 고정) |
| 1280×800 | 3 | 0 | 0 |
수정 전 수치는 원인 보고서와 소수점까지 일치. 페이지 에러 0.

## 음성 대조 (실제 실행)
- 수정 전 빌드(4202): 두 시험 FAIL — overshoot 66.9 (390·412 모두). 수정 후(4201): 2 passed, overshoot 0.0.
- 참고: e2e 목킹은 두 칸 중 한 칸만 줄여 66.9 로 재고, 하네스는 두 칸 합 44/107(88vh 상한 영향)이다. 어느 쪽이든 수정 전 >1, 수정 후 0.

## 게이트 (격리 사본, supabase/docs 포함 동기화)
- tsc app 0 · tsc e2e 0 · vitest src/components 116 파일 1105 pass/6 skip · lint 0 오류(경고 2527 기존).
- ※ 첫 실행의 tsc/vitest 실패는 사본에 supabase/ 가 없어서였고 복사 후 통과(제품 문제 아님).
- 전체 test:e2e 는 미실행(NOT_RUN): 공용 파일(App/index.css/atoms) 미변경, Modal 은 fillHeight 옵션을 이 소비처만 켰다.

## 무결성
- public/sitemap.xml 해시 전후 동일 5b5953aa…f711. 작업트리 git status = 위 2파일만. node_modules 는 작업트리에 만들지 않았다.
- preview 서버 4201·4202 종료 확인(LISTEN 0). 브라우저 pane 미사용.

## 미검증
- S26 실기기 주소창 접힘 상태(88vh 계산) · 실제 운영 응답 지연. 대가: 내용이 짧으면 시트 아래 빈 공간(390: 44px, 412×915: 107px).
- 다음 한 단계: 리드 검토 후 커밋 여부 결정.
