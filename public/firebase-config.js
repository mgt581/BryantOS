// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDq3rozlNMYVO_9sCAqfwmnzmk67x9wN7g",
  authDomain: "bryant0s.firebaseapp.com",
  projectId: "bryant0s",
  storageBucket: "bryant0s.firebasestorage.app",
  messagingSenderId: "1044948666675",
  appId: "1:1044948666675:web:d5fbefd399d7c082a85646",
  measurementId: "G-Z1CRR27XLS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
