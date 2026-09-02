// src/lib/venueContacts.ts
// 매장 연락처(다중) 순수 헬퍼 — 오너 #17.
// 컴포넌트 파일에서 분리한 이유: 상수·함수를 컴포넌트와 같은 파일에서 내보내면
// react-refresh(Fast Refresh)가 그 모듈 전체를 못 살린다(eslint react-refresh/only-export-components).
import { MAX_VENUE_CONTACTS, type VenueContact } from '../api/community';

/** 라벨 빠른 입력 — 매장이 실제로 쓰는 용도 4종. 직접 타이핑도 그대로 가능하다. */
export const CONTACT_LABEL_PRESETS = ['대표', '예약', '담당자', '단체문의'] as const;

/** 카카오톡 링크 정규화 — '' 비움(삭제) · http(s) URL 이면 trim 값 · 그 외 null(형식 오류). */
export function normalizeKakaoUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' ? v : null; }
  catch { return null; }
}

/** 최소 1줄 보장 — 저장된 값이 없어도 빈 줄 하나는 서 있어야 '필수 1개'가 화면에서 읽힌다. */
export function ensureOneContact(list: VenueContact[]): VenueContact[] {
  return list.length > 0 ? list : [{ label: '', phone: '' }];
}

/** 저장 직전 정리 — 공백 제거·빈 번호 제거·상한 절단(서버 update_venue_contacts 와 같은 규칙) */
export function cleanContacts(list: VenueContact[]): VenueContact[] {
  return list
    .map((c) => ({ label: c.label.trim().slice(0, 10), phone: c.phone.trim().slice(0, 40) }))
    .filter((c) => c.phone !== '')
    .slice(0, MAX_VENUE_CONTACTS);
}
