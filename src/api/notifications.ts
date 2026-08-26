import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

export type NotificationType = 'qna' | 'approval' | 'comment' | 'system' | 'mention' | 'reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  avatarText?: string;
  avatarColor?: string;
}

// ── 링크 정규화 — 라우터(App handleNavigateNotification)가 아는 형태로 읽기 시점 보정 ──
// 왜: 라이브 DB 의 관리자 알림 트리거(_notify_admin_new_venue · _notify_admin_pending_poster)가
// 막다른 link '/' 로 발송돼 "눌러도 아무 데도 안 가는" 알림이 됐다(오너 리포트 2026-08-27,
// '🏪 새 매장 입점 신청'). 트리거 교정 마이그레이션(20260827c_admin_notification_links.sql)
// 적용 전까지 + 이미 쌓인 과거 행을 위해 여기서 보정한다. 두 알림 모두 수신자가 role=admin 뿐이라
// '/admin'(관리자 설정 탭) 라우팅이 전원에게 안전하다.
function normalizeLink(link: string | null | undefined, title: string): string | undefined {
  let l = (link ?? '').trim();
  if (!l) return undefined;
  // 같은 오리진 절대 URL → 상대 경로로 축약(라우터의 '^\/...' 매칭이 절대 URL 을 못 읽는다)
  if (/^https?:\/\//.test(l) && typeof window !== 'undefined' && l.startsWith(window.location.origin)) {
    l = l.slice(window.location.origin.length) || '/';
  }
  // 관리자 승인 큐 알림이 홈('/')을 가리키면 관리자 설정 탭으로
  if (l === '/' && /입점 신청|포스터 승인 대기/.test(title)) return '/admin';
  return l;
}

// ── DB row → AppNotification ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToNotif(r: any): AppNotification {
  return {
    id: r.id, type: r.type, title: r.title, message: r.message,
    read: r.read, createdAt: r.created_at, link: normalizeLink(r.link, r.title ?? ''),
    avatarText: r.avatar_text ?? undefined, avatarColor: r.avatar_color ?? undefined,
  };
}

// ── 내 알림 조회 ──────────────────────────────────────────────────────────────
export async function getMyNotifications(): Promise<AppNotification[]> {
  if (IS_MOCK) return [];
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(rowToNotif);
}

// ── 알림 읽음 처리 ────────────────────────────────────────────────────────────
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (IS_MOCK || ids.length === 0) return;
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids);
  if (error) throw error;
}

// ── 모두 읽음 — 내 알림 전부 read=true ───────────────────────────────────────
// 왜 id 목록이 아니라 조건 update 인가: 화면은 최근 50건만 로드하므로, id 로만 지우면
// 그 밖의 오래된 미읽음 행이 서버에 남는다. RLS 는 notif_update_self(자기 것만 update)로
// 이미 허용되어 있어 별도 마이그레이션 불필요(2026-08-27 라이브 정책 확인).
export async function markAllNotificationsRead(): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  if (!user) return;
  const { error } = await supabase.from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
  if (error) throw error;
}
