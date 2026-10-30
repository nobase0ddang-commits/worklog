// 알림 전용 서비스 워커. ntfy.sh가 보내는 웹 푸시(내 알림함 토픽)를 받아 복호화해 띄운다.
// 방 키와 알림함 목록은 페이지가 IndexedDB 'wt_push'에 넣어 둔다.
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function pushCfg() {
  return new Promise(res => {
    const r = indexedDB.open('wt_push', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const q = r.result.transaction('k').objectStore('k').get('push');
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      } catch (_) { res(null); }
    };
  });
}
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function handle(e) {
  let data = {};
  try { data = e.data.json(); } catch (_) {}
  const msg = data.message || {};
  let title = '메신저', body = '새 메시지가 왔어요', tag = 'wt';
  if (data.event === 'subscription_expiring') {
    body = '앱을 한 번 열어주면 알림이 계속 와요';
  } else {
    try {
      const cfg = await pushCfg();
      const rm = cfg && cfg.rooms.find(r => r.inbox === msg.topic);
      if (rm && msg.message) {
        const key = await crypto.subtle.importKey('raw', rm.key, 'AES-GCM', false, ['decrypt']);
        const [a, b] = msg.message.split('.');
        const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: ub64(a)}, key, ub64(b));
        const o = JSON.parse(new TextDecoder().decode(pt));
        const text = o.t || '사진을 보냈어요';
        title = rm.name;
        body = rm.group ? `${o.n}: ${text}` : text;
        tag = rm.inbox;
      }
    } catch (_) {}
  }
  await self.registration.showNotification(title, {body, tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png'});
}
self.addEventListener('push', e => e.waitUntil(handle(e)));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
