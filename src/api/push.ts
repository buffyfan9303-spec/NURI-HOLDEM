// src/api/push.ts — 웹 푸시 구독 관리 (클라이언트)
import { supabase, IS_MOCK } from '../lib/supabase';

// VAPID 공개키(노출되어도 안전). 비공개키는 Edge Function secret(VAPID_PRIVATE_KEY)로만 보관.
export const VAPID_PUBLIC_KEY =
  'BITTLMXvdRPFPNlIuH_dHdZgS8e31I0t56jRhXqfCdPmREodaO6audhhfqRVzznvm1tIW0WMdf4eiXb-rjLPg-s';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

// 알림 권한 요청 → 구독 생성 → DB 저장
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않습니다');
  if (IS_MOCK) throw new Error('데모 모드에서는 사용할 수 없습니다');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('브라우저에서 알림 권한을 허용해야 합니다');

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');

  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

// 구독 해제 + DB 삭제
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    if (!IS_MOCK) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
