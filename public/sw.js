/* NURI HOLDEM — Service Worker: 앱 셸 캐싱(빠른 재방문) + 웹 푸시 */
/* eslint-disable no-undef */

const CACHE = 'nuri-shell-v1';
// 캐시 대상: Vite 해시 자산(/assets, 불변) + 아이콘 + 이미지/폰트(같은 출처). HTML·API는 캐시 안 함(항상 최신).
const CACHEABLE = /\/(assets|icon|favicon|nuri-logo|2)\b|\.(?:png|jpg|jpeg|svg|webp|gif|woff2?)$/i;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))); // 옛 캐시 정리
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  // 외부(Supabase API·GA·AdSense 등)와 HTML 문서는 건드리지 않음 → 항상 네트워크(최신 보장, 스테일 방지)
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || !CACHEABLE.test(url.pathname)) return;
  // 해시 자산·아이콘·이미지: 캐시 우선(불변) → 재방문 즉시 로드, 오프라인에도 표시
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (e) { return cached || Response.error(); }
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'NHoldem';
  const options = {
    body: data.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) { try { client.navigate(target); } catch (e) { /* noop */ } }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
