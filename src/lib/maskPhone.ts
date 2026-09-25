// src/lib/maskPhone.ts — 손님 전화번호 **표시** 규칙 정본(오너 2026-09-25 CUSTOMER-PHONE-MASK).
// 앞 3자리 · 가운데 별표 · 뒤 4자리: 010-1234-5678 → 010-****-5678.
// 표시 전용이다 — 업주가 직접 입력·수정하는 칸(CRM 편집·전화 지정 입력)에는 쓰지 않는다.
// 서버가 이미 가린 값이 와도 무해하다(별표는 숫자가 아니라 세지 않고, 남은 숫자만 규칙대로 가린다).

/** 숫자만 뽑아 앞 3·뒤 4 를 남기고 가운데를 별표로 바꾼다. 빈값·null 은 '' , 7자리 미만은 뒤 4자리만 남긴다. */
export function maskPhone(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const plus = s.startsWith('+') ? '+' : '';
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 4) return '*'.repeat(digits.length);
  if (digits.length < 7) return `${'*'.repeat(digits.length - 4)}-${digits.slice(-4)}`;
  // 02-123-4567 처럼 지역번호가 2자리인 국내 번호도 같은 한 규칙(앞 3·뒤 4)으로 둔다 — 정본은 하나다.
  const mid = '*'.repeat(digits.length - 7);
  return `${plus}${digits.slice(0, 3)}-${mid ? `${mid}-` : ''}${digits.slice(-4)}`;
}
