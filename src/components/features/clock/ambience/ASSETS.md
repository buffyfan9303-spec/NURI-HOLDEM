# 클락 모션 테마 — 영상 에셋 출처·라이선스

배치 위치(K단계 배선 시): `public/clock-ambience/<이름>.mp4` + `<이름>.jpg`(poster). 14종 합계 약 32.5MB(mp4) + 0.8MB(jpg).
이 커밋에는 **코드만** 들어 있고 영상 파일은 들어 있지 않다(리드가 배치 결정). 인코딩 결과물은 작업 스크래치에 있다.

## 라이선스 — Mixkit Stock Video Free License (2026-09-29 원문 확인)

- 원문: https://mixkit.co/license/ (Stock Video → Free License) · 이용 조건: https://mixkit.co/terms/
- 요지(원문 인용): "Items under the Mixkit Stock Video Free License can be used in your commercial and non-commercial projects, for free."
  "You're permitted to download, copy, modify, distribute, publicly perform and broadcast the Items." "Attribution is not required".
- 제한(User Terms): 변형 없이 사본을 판매 금지 · 아이템을 제3자에게 재라이선스·재판매 금지 · 비슷한/경쟁 스톡 서비스 제작 금지 ·
  Envato/Mixkit 상표 사용 금지 · 상표 등 제3자 구성요소의 권리 확인은 사용자 책임.
- 우리 사용: 앱(매장 클락 TV) 배경으로 **변형**(재생 속도 변경·어둡게·채도·블러·잘라 반복 루프·재인코딩)해 포함. 원본 그대로 배포하지 않는다.
- 확인 사항: 선택한 14편 모두 사람 얼굴·상표·로고가 보이지 않는 장면이다(썸네일·포스터 육안 확인). 폭우 유리창의 붉은 빛 번짐은 유리 너머 광원이며 형태·글자는 식별되지 않는다.

## 영상 목록

| 파일 | 테마 | Mixkit 원본 | 가공(재생 배속 · 루프 길이) | mp4 |
|---|---|---|---|---|
| spring-blossom | 봄 벚꽃 | https://mixkit.co/free-stock-video/japanese-cherry-blossom-in-spring-48889/ | 0.8× · 18s | 2.57MB |
| summer-sea | 여름 바다 윤슬 | https://mixkit.co/free-stock-video/bright-orange-sunset-on-beach-2168/ | 0.7× · 17s | 2.24MB |
| autumn-forest | 가을 단풍숲 | https://mixkit.co/free-stock-video/autumn-forest-trees-with-sunshine-14911/ | 0.85× · 18s | 2.67MB |
| winter-snowfield | 겨울 설원 눈보라 | https://mixkit.co/free-stock-video/fog-on-the-heights-of-the-snowy-mountains-4396/ | 0.8× · 17.5s | 2.42MB |
| rain-window | 폭우 유리창 | https://mixkit.co/free-stock-video/window-on-a-rainy-day-2846/ | 1× · 18s | 2.33MB |
| cloud-sea | 운해 산맥 | https://mixkit.co/free-stock-video/clouds-covering-the-mountains-4695/ | 0.85× · 18s | 2.13MB |
| milky-way | 은하수 | https://mixkit.co/free-stock-video/milky-way-with-a-shooting-star-46101/ | 0.5× · 15s | 1.87MB |
| aurora | 오로라 | https://mixkit.co/free-stock-video/aurora-borealis-timelapse-4033/ | 0.6× · 18s | 2.04MB |
| first-snow | 첫눈 | https://mixkit.co/free-stock-video/snowing-in-a-foggy-forest-slow-motion-35040/ | 1× · 18s | 2.53MB |
| dolphins | 돌고래 수중 | https://mixkit.co/free-stock-video/dolphins-underwater-4133/ | 0.65× · 15s | 2.07MB |
| dolphin-pod | 돌고래 떼 | https://mixkit.co/free-stock-video/pod-of-dolphins-swimming-in-the-sea-11032/ | 0.85× · 16.5s | 2.29MB |
| eagle | 독수리 비상 | https://mixkit.co/free-stock-video/eagle-gliding-in-a-clear-sky-bottom-view-1706/ | 1× · 18s | 1.96MB |
| wild-horses | 야생마 질주 | https://mixkit.co/free-stock-video/aerial-view-of-a-heard-of-wild-horses-running-across-48634/ | 0.7× · 15.5s | 2.14MB |
| lion | 사자 | https://mixkit.co/free-stock-video/big-lion-staring-at-the-horizon-6760/ | 1× · 18s | 2.44MB |

혹등고래는 Mixkit 에 없어(검색 'whale' 결과 0) 돌고래로 대체했다.

## 인코딩 방법(재현)

ffmpeg 없이 설치된 Google Chrome 으로 만든다(Playwright `channel: 'chrome'` → `<video>` 두 개 → `<canvas>` → `MediaRecorder`).
- 무봉제 루프: 길이 D 동안 A(원본 t0 부터)를 그리고, 처음 2초는 B(원본 t0+D 부터)를 1→0 으로 겹친다 → 끝 프레임과 첫 프레임이 이어진다.
- 가공: `brightness(0.5) saturate(0.95) blur(1.2px)`, 1280×720, 30fps, `video/mp4;codecs=avc1.640028`, 1.1Mbps, 무음.
- poster: 루프 첫 프레임 JPEG(q 0.82).
