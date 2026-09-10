// src/lib/kst.ts — KST(Asia/Seoul) 날짜 한 줄.
//
// 왜 별도 파일인가(2026-09-11 실측): 이 함수는 원래 src/api/ledger.ts(1215줄) 안에 있었다.
// 그런데 src/api/checkins.ts 가 이것 하나 때문에 ledger 를 정적 import 했고, checkins 는 App.tsx 가
// 정적 import 하므로 **장부 API 전체가 첫 화면 임계 경로에 실렸다** — 비로그인 모바일 손님도 7.1KB gz 를 받았다.
// (App.tsx 는 같은 이유로 장부를 이미 dynamic import 로 떼어 놨는데, checkins 경유로 되돌아와 있었다.)
// 날짜 규칙을 복제하면 '서버는 KST, 화면은 로컬' 부류의 사고가 나므로 정의는 하나로 두고 자리만 옮긴다.
// api/ledger 는 이 파일을 다시 export 하므로 기존 호출부(15곳)는 그대로 둔다.

/**
 * KST(Asia/Seoul) 기준 오늘 — YYYY-MM-DD.
 * 왜 브라우저 로컬 날짜를 안 쓰나: 해외·시계 오설정 기기에서 하루가 어긋난다.
 * 서버 RPC(request_buyin·check_in)는 (now() at time zone 'Asia/Seoul')::date 로 날짜를 정하므로,
 * '오늘만 가능한' 게이트는 서버와 같은 기준으로 판단해야 화면과 서버가 따로 놀지 않는다.
 * now 인자는 테스트에서 자정 경계(15:00Z)를 고정하려고 열어 둔 것.
 */
export const kstToday = (now: number = Date.now()): string =>
  new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
