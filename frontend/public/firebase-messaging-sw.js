// Handles reminder pushes while the app is closed. Fill in the same values as your .env.
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js')
firebase.initializeApp({
  apiKey: 'REPLACE', authDomain: 'REPLACE', projectId: 'REPLACE',
  messagingSenderId: 'REPLACE', appId: 'REPLACE',
})
const messaging = firebase.messaging()
messaging.onBackgroundMessage((p) => {
  self.registration.showNotification(p.notification?.title ?? 'MediCare AI', { body: p.notification?.body })
})
