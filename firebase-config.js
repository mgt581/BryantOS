export const firebaseConfig = {
  apiKey: "AIzaSyDq3rozlNMYVO_9sCAqfwmnzmk67x9wN7g",
  authDomain: "bryant0s.firebaseapp.com",
  projectId: "bryant0s",
  storageBucket: "bryant0s.appspot.com",
  messagingSenderId: "1044948666675",
  appId: "1:1044948666675:web:d5fbefd399d7c082a85646",
  measurementId: "G-Z1CRR27XLS"
};

/* Expose as a global so the compat SDK in app.js can call
   firebase.initializeApp(FIREBASE_CONFIG) without needing ES module imports. */
window.FIREBASE_CONFIG = firebaseConfig;
