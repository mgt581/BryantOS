<<<<<<< HEAD
export const firebaseConfig = {
  apiKey: "AIzaSyDq3rozlNMYVO_9sCAqfwmnzmk67x9wN7g",
  authDomain: "bryant0s.firebaseapp.com",
  projectId: "bryant0s",
  storageBucket: "bryant0s.appspot.com", // ✅ FIXED
  messagingSenderId: "1044948666675",
  appId: "1:1044948666675:web:d5fbefd399d7c082a85646",
  measurementId: "G-Z1CRR27XLS"
=======
// BryantOS – Firebase Project Configuration
// ─────────────────────────────────────────────────────────────────────────────
// 1. Go to https://console.firebase.google.com
// 2. Open your project → Project Settings → "Your apps" → Web app
// 3. Copy the firebaseConfig values shown there and paste them below.
// 4. Make sure you have enabled:
//      • Authentication → Sign-in method → Google (enable it)
//      • Firestore Database (create in production or test mode)
// ─────────────────────────────────────────────────────────────────────────────
// Firestore security rules (paste in Firebase Console → Firestore → Rules):
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /users/{uid}/{document=**} {
//         allow read, write: if request.auth != null && request.auth.uid == uid;
//       }
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
>>>>>>> 54216dd (local updates)
};
