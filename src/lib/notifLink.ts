// src/lib/notifLink.ts — 알림 link 를 '어디로 갈지'·'무슨 아이콘인지' 로 읽는 단일 지점.
//
// 서버 알림 type 은 enum 6개(qna·approval·comment·system·mention·reminder)뿐이라 결정 결과 알림(20261002b)의
// 종류는 link 로 구분한다. 라우터(App.handleNavigateNotification)와 알림 목록(NotificationPanel)이 같은 해석을 쓴다.
//   '/my-store[/<섹션>][?venue=<uuid>]' — 내 매장(섹션 + 매장). 매장 id 가 있으면 그 매장으로 바꿔 연다(L-04: 다매장 운영자).
//   '/staff-schedule' — 내 매장 출근 관리(종전 링크).
//   '/rank' — 커뮤니티 순위(순위 인증 결과).
import type { IconName } from '../components/atoms/Icon';
import type { NotificationType } from '../api/notifications';

export type StoreDeepSection = 'dashboard' | 'ledger' | 'partners' | 'attendance' | 'staff' | 'voucher' | 'event';

const STORE_SECTIONS: Record<string, StoreDeepSection> = {
  ledger: 'ledger', partners: 'partners', attendance: 'attendance',
  staff: 'staff', voucher: 'voucher', event: 'event',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 내 매장 목적지면 { section, venueId }, 아니면 null. 모르는 섹션('/my-store/xyz')도 null — 호출부의 종전 처리로 떨어진다. */
export function parseStoreLink(link: string | null | undefined): { section: StoreDeepSection; venueId: string | null } | null {
  const l = (link ?? '').trim();
  if (l === '/staff-schedule') return { section: 'attendance', venueId: null };
  const m = l.match(/^\/my-store(?:\/([a-z-]+))?\/?(?:\?(.*))?$/);
  if (!m) return null;
  const section: StoreDeepSection | undefined = m[1] ? STORE_SECTIONS[m[1]] : 'dashboard';
  if (!section) return null;
  const v = new URLSearchParams(m[2] ?? '').get('venue');
  return { section, venueId: v && UUID_RE.test(v) ? v : null };
}

// qna·comment 는 둘 다 대화성 알림이라 가장 가까운 글리프가 동일하다(제목 텍스트로 구분).
const TYPE_GLYPH: Record<NotificationType, IconName> = {
  qna: 'comment',
  comment: 'comment',
  mention: 'user',
  approval: 'check-circle',
  system: 'info',
  reminder: 'clock',
};

const SECTION_GLYPH: Record<StoreDeepSection, IconName> = {
  dashboard: 'store', ledger: 'notebook', partners: 'handshake', attendance: 'calendar-check',
  staff: 'users', voucher: 'ticket', event: 'megaphone',
};

/** 알림 한 줄의 아이콘 — link 가 가리키는 화면을 먼저 보고, 없으면 type. */
export function notifGlyph(n: { type: NotificationType; link?: string | null }): IconName {
  const l = n.link ?? '';
  const store = parseStoreLink(l);
  if (store) return SECTION_GLYPH[store.section];
  if (l === '/rank') return 'trophy';
  if (l.startsWith('/community/')) return 'store';
  return TYPE_GLYPH[n.type] ?? 'bell';
}
