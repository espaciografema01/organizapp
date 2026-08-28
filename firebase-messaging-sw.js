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

messaging.onBackgroundMessage(function(payload){
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/icon-192.png'
  });
});