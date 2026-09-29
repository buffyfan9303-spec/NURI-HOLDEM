# 클락 모션 테마 — 에셋 출처·라이선스

모션 테마 15종 중 **14종은 외부 에셋 0** — 전부 코드로 그린다(`scenes/`). 사진·영상·폰트 글리프를 쓰지 않는다.
외부 파일은 **폭우 유리창 1종**뿐이다: `public/clock-ambience/rain-window.mp4`(2.33MB) + `rain-window.jpg`(poster, 55KB).
이 파일은 그 테마를 고른 클락 화면이 마운트될 때만 받는다(`<video preload="metadata">`, 썸네일은 poster 만).

## 라이선스 — Mixkit Stock Video Free License (2026-09-29 원문 확인)

- 원문: https://mixkit.co/license/ (Stock Video → Free License) · 이용 조건: https://mixkit.co/terms/
- 요지(원문 인용): "Items under the Mixkit Stock Video Free License can be used in your commercial and non-commercial projects, for free."
  "You're permitted to download, copy, modify, distribute, publicly perform and broadcast the Items." "Attribution is not required".
- 제한(User Terms): 변형 없이 사본을 판매 금지 · 아이템을 제3자에게 재라이선스·재판매 금지 · 비슷한/경쟁 스톡 서비스 제작 금지 ·
  Envato/Mixkit 상표 사용 금지 · 상표 등 제3자 구성요소의 권리 확인은 사용자 책임.
- 우리 사용: 앱(매장 클락 TV) 배경으로 **변형**(어둡게·채도·블러·잘라 반복 루프·재인코딩)해 포함. 원본 그대로 배포하지 않는다.
- 확인 사항: 사람 얼굴·상표·로고가 보이지 않는다. 붉은 빛 번짐은 유리 너머 광원이며 형태·글자는 식별되지 않는다.

| 파일 | 테마 | Mixkit 원본 | 가공 |
|---|---|---|---|
| rain-window | 폭우 유리창 | https://mixkit.co/free-stock-video/window-on-a-rainy-day-2846/ | 1× · 18s 무봉제 루프 · 1280×720 · H.264 1.1Mbps · 무음 |

## 인코딩 방법(재현)

ffmpeg 없이 설치된 Google Chrome 으로 만든다(Playwright `channel: 'chrome'` → `<video>` 두 개 → `<canvas>` → `MediaRecorder`).
- 무봉제 루프: 길이 D 동안 A(원본 t0 부터)를 그리고, 처음 2초는 B(원본 t0+D 부터)를 1→0 으로 겹친다 → 끝 프레임과 첫 프레임이 이어진다.
- 가공: `brightness(0.5) saturate(0.95) blur(1.2px)`, 1280×720, 30fps, `video/mp4;codecs=avc1.640028`, 1.1Mbps, 무음.
- poster: 루프 첫 프레임 JPEG(q 0.82).

2026-09-29 에 만든 다른 실사 영상 13편(벚꽃·바다·단풍·설원·운해·은하수·오로라·첫눈·돌고래 2·독수리·야생마·사자)은
오너 피드백 2026-09-30("실사 위주·화질이 안 좋다")으로 **목록에 넣지 않았다** — 저장소에 들어간 적이 없다.
