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
