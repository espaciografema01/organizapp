importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBgjK88IjGHptNK4tLgmvLjrCosXBQgAaQ",
  authDomain: "organizapp-e2afa.firebaseapp.com",
  projectId: "organizapp-e2afa",
  messagingSenderId: "386488008309",
  appId: "1:386488008309:web:d68b814a07a240d1a6823c"
});

const messaging = firebase.messaging();

// Las rutas se resuelven contra el scope del service worker (/organizapp/),
// no contra la raíz del dominio: en GitHub Pages "/icon-192.png" no existe.
function assetUrl(name){ return new URL(name, self.registration.scope).href; }

// Los avisos que envía la Cloud Function son "solo datos" (sin campo
// "notification"), así el navegador no los muestra por su cuenta y este
// manejador es el único que los dibuja: no hay duplicados.
// Si por alguna razón llega un mensaje con "notification", FCM ya lo muestra
// automáticamente y aquí no se hace nada.
messaging.onBackgroundMessage(function(payload){
  if(payload.notification) return;
  const d = payload.data || {};
  if(!d.title) return;
  return self.registration.showNotification(d.title, {
    body: d.body || '',
    icon: assetUrl('icon-192.png'),     // a color, se ve al desplegar el aviso
    badge: assetUrl('badge-96.png'),    // silueta blanca: ícono de la barra de estado
    tag: d.tag || undefined,            // mismo tag = reemplaza en vez de duplicar
    data: { url: d.url || self.registration.scope }
  });
});

// Al tocar el aviso: enfocar la app si ya está abierta, o abrirla.
self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
      for(const c of list){
        if(c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus();
      }
      if(clients.openWindow) return clients.openWindow(target);
    })
  );
});
