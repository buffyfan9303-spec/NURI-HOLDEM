// src/lib/voucherLabel.ts
// 매장이용권 표시명 — "어느 매장이 준 것인가"를 화면이 항상 말하게 하는 단 하나의 규칙(오너 지시 #19).
//
// 왜 순수 함수인가: 같은 규칙이 지갑 그룹 머리글·사용 시트·성공 화면·사용 내역 4곳에서 쓰인다.
//   한 곳만 다르게 굴면 손님은 "다른 매장 이용권인가?" 하고 접수대 앞에서 멈춘다.
//
// ⚠ 매장명은 **발급 시점에 title 로 굽지 않는다.** venue_id 조인으로 표시 시점에 합성한다 —
//   매장이 이름을 바꾸면 이미 발급된 이용권도 같이 따라와야 하기 때문이다.
//   (2026-08-30 실측: 로티아레나가 101장 중 100장의 title 에 '로티아레나'를 손으로 타이핑해 두었다.
//    그래서 그냥 앞에 붙이면 '로티아레나 로티아레나 매장이용권'이 된다 — 아래 stripVenuePrefix 가 그 손자국을 걷어낸다.)

/** 앞뒤 공백 정리 + 연속 공백 1칸 */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 제목 앞에 붙어 있는 구분자(·, -, :, |)와 공백을 제거 */
function stripLeadingSeparator(s: string): string {
  return s.replace(/^[\s·・\-–—:|]+/, '').trim();
}

/**
 * 제목에서 중복된 매장명 접두사를 걷어낸다.
 * '로티아레나 매장이용권' + 매장 '로티아레나' → '매장이용권'
 * 접두사를 걷어낸 뒤 남는 게 없으면 '매장이용권'(기본 명칭)으로 되돌린다 — 빈 줄을 만들지 않는다.
 */
export function stripVenuePrefix(title: string | null | undefined, venueName: string | null | undefined): string {
  const t = tidy(title ?? '');
  const v = tidy(venueName ?? '');
  if (!t) return '매장이용권';
  if (!v) return t;
  if (t.toLowerCase().startsWith(v.toLowerCase())) {
    const rest = stripLeadingSeparator(t.slice(v.length));
    return rest || '매장이용권';
  }
  return t;
}

/**
 * 지갑 그룹 머리글 — "{매장명} 매장이용권".
 * 매장명을 모를 때(발급 매장 행이 사라진 극단) 억지로 '기타 매장 매장이용권'을 만들지 않는다.
 */
export function voucherGroupLabel(venueName: string | null | undefined): string {
  const v = tidy(venueName ?? '');
  return v ? `${v} 매장이용권` : '발급 매장 미확인';
}

/**
 * 한 줄 안에서 매장과 이용권을 함께 말해야 하는 자리(사용 내역·사용 시트·성공 화면)용.
 * '로티아레나 · 매장이용권' — 중복 접두사는 제거된 뒤 합성된다.
 */
export function voucherLineLabel(title: string | null | undefined, venueName: string | null | undefined): string {
  const v = tidy(venueName ?? '');
  const t = stripVenuePrefix(title, venueName);
  return v ? `${v} · ${t}` : t;
}
