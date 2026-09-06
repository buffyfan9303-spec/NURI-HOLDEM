/* NURI HOLDEM — Service Worker: 앱 셸 캐싱(빠른 재방문) + 웹 푸시 */
/* eslint-disable no-undef */

const CACHE = 'nuri-shell-v2'; // 버전 올리면 activate 에서 옛 캐시 전체 삭제(누적 정리)
// [DS] FONT-1: Pretendard dynamic subset 은 페이지당 woff2 수십 조각을 받는다 —
// 60 상한이면 폰트가 앱 셸 자산을 밀어내며 캐시가 공회전하므로 상한을 함께 올린다.
const CACHE_MAX_ENTRIES = 150; // 캐시 엔트리 상한 — 초과 시 오래된 것부터 삭제(무한 성장 방지)
// 캐시 대상: Vite 해시 자산(/assets, 불변) + 아이콘 + 이미지/폰트(같은 출처, /fonts css 포함). HTML·API는 캐시 안 함(항상 최신).
const CACHEABLE = /\/(assets|fonts|icon|favicon|nuri-logo)\b|\.(?:png|jpg|jpeg|svg|webp|gif|woff2?)$/i;

self.addEventListener('install', (event) => {
  // 오프라인 폴백 페이지 미리 캐시
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/offline.html')).catch(() => {}).then(() => self.skipWaiting()));
});

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
  // 외부(Supabase API·GA·AdSense 등)는 건드리지 않음 → 항상 네트워크
  if (url.origin !== self.location.origin) return;
  // 네비게이션(HTML): 네트워크 우선(최신 보장) → 오프라인이면 폴백 페이지
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch (e) { return (await caches.match('/offline.html')) || Response.error(); }
    })());
    return;
  }
  if (!CACHEABLE.test(url.pathname)) return;
  // 해시 자산·아이콘·이미지: 캐시 우선(불변) → 재방문 즉시 로드, 오프라인에도 표시
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const c = await caches.open(CACHE);
        await c.put(req, res.clone());
        // 상한 초과분은 오래된 것(추가 순서 앞쪽)부터 삭제 — 오프라인 폴백 페이지는 보존
        try {
          const keys = await c.keys();
          if (keys.length > CACHE_MAX_ENTRIES) {
            const removable = keys.filter((k) => !k.url.endsWith('/offline.html'));
            const excess = keys.length - CACHE_MAX_ENTRIES;
            await Promise.all(removable.slice(0, excess).map((k) => c.delete(k)));
          }
        } catch (e) { /* 트림 실패는 무시(캐싱 자체는 유지) */ }
      }
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

// 알림 링크 → 앱이 **부팅 시 실제로 소비하는** 형태로 옮긴다 (2026-09-07).
//
// 왜 필요한가: notifications.link 는 '/schedules/<id>' 같은 경로형인데, 그건 앱 안에서
// handleNavigateNotification(App.tsx:2212)이 클라이언트 라우팅으로 처리하는 형태다.
// 푸시 클릭은 그 경로로 **하드 내비게이션**을 하는데, 이 앱은 라우터가 없어 그런 경로가 없다 —
// 라이브 실측: https://nuriholdem.com/schedules/<uuid> → Vercel `404: NOT_FOUND`.
// 즉 예약 리마인더·새 포스터 알림을 탭하면 앱에 들어가지도 못하고, 이미 열려 있던 앱까지 404로 끌려간다.
// (vercel.json 에 SPA 폴백을 함께 넣어 하드 404 자체를 없앴지만, 그것만으로는 홈에 떨어질 뿐이라
//  여기서 앱이 아는 부팅 딥링크로 바꿔 줘야 원래 보여주려던 것이 열린다.)
function toAppLink(raw) {
  const u = String(raw || '/');
  if (/^https?:\/\//.test(u)) return u;                 // 외부 링크는 그대로
  var m = u.match(/^\/schedules\/([^/?#]+)/);           // 대회 상세 → App.tsx:1951 이 ?s= 를 소비
  if (m) return '/?s=' + m[1];
  // 매장 커뮤니티 → 매장 페이지. 전체 UUID 이므로 ?venue= 다 — ?v= 는 8자리 단축코드·슬러그용이다(App.tsx:1965).
  m = u.match(/^\/community\/([^/?#]+)/);
  if (m) return '/?venue=' + m[1];
  if (u === '/admin') return '/?tab=admin';             // 탭형은 ?tab= 이 유일한 부팅 경로(App.tsx:791)
  if (u.indexOf('/my-store') === 0) return '/?tab=my-store';
  if (u.indexOf('/guide/') === 0) return u;             // 정적 파일 — 그대로 연다
  if (u.charAt(0) === '?' || u.charAt(0) === '#') return '/' + u;
  return u;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = toAppLink(event.notification.data && event.notification.data.url);
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
