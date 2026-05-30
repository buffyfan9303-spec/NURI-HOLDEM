import { supabase, IS_MOCK } from '../lib/supabase';

export type NotificationType = 'qna' | 'approval' | 'comment' | 'system' | 'mention';

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

// ── DB row → AppNotification ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToNotif(r: any): AppNotification {
  return {
    id: r.id, type: r.type, title: r.title, message: r.message,
    read: r.read, createdAt: r.created_at, link: r.link ?? undefined,
    avatarText: r.avatar_text ?? undefined, avatarColor: r.avatar_color ?? undefined,
  };
}

// ── 내 알림 조회 ──────────────────────────────────────────────────────────────
export async function getMyNotifications(): Promise<AppNotification[]> {
  if (IS_MOCK) return [];
  const { data: { user } } = await supabase.auth.getUser();
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
