import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { auth, provider } from "./firebase-init.js";

const signInBtn = document.getElementById("googleSignInBtn");
const statusEl = document.getElementById("authStatus");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff6b6b" : "#ffffff";
}

function getFriendlyErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || "Something went wrong.";

  if (code === "auth/popup-closed-by-user") {
    return "Sign-in popup was closed before finishing.";
  }

  if (code === "auth/popup-blocked") {
    return "Popup was blocked by your browser. Allow popups and try again.";
  }

  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorised in Firebase yet.";
  }

  return message;
}

function isSignInPage() {
  return window.location.pathname.endsWith("/signin.html") || window.location.pathname.endsWith("/signin");
}

function isHomePage() {
  return window.location.pathname.endsWith("/") || window.location.pathname.endsWith("/index.html");
}

function redirectToApp() {
  window.location.href = new URL("./", window.location.href).href;
}

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    try {
      setStatus("Signing in...");

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (user) {
        setStatus("Success.");
        redirectToApp();
      }
    } catch (error) {
      console.error("Login error:", error);
      setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (isHomePage()) {
      window.location.href = "signin.html";
    }

    return;
  }

  if (isSignInPage()) {
    redirectToApp();
  }
});

window.logoutBryantOS = async function logoutBryantOS() {
  try {
    await signOut(auth);
    window.location.href = "signin.html";
  } catch (error) {
    console.error("Logout error:", error);
    setStatus(`Logout failed: ${getFriendlyErrorMessage(error)}`, true);
  }
};
