import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({
  prompt: "select_account"
});

export { app, auth, provider };
