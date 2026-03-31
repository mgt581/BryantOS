import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { auth, provider } from "./firebase-init.js";

const signInBtn = document.getElementById("googleSignInBtn");
const statusEl = document.getElementById("authStatus");

let hasSyncedCurrentUser = false;

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
  return window.location.pathname.endsWith("signin.html");
}

function isHomePage() {
  return (
    window.location.pathname.endsWith("/") ||
    window.location.pathname.endsWith("index.html")
  );
}

async function syncUserToBackend(user) {
  const idToken = await user.getIdToken();

  const response = await fetch("https://bryantos.alexbryant.workers.dev/api/auth/firebase-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      photoURL: user.photoURL || ""
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Backend sync failed");
  }

  return response.json();
}

async function handleSignedInUser(user, shouldRedirect = false) {
  if (!user) return;

  if (hasSyncedCurrentUser) {
    if (shouldRedirect) {
      window.location.href = "index.html";
    }
    return;
  }

  hasSyncedCurrentUser = true;

  try {
    setStatus("Syncing account...");
    await syncUserToBackend(user);
    setStatus("Success.");

    if (shouldRedirect) {
      window.location.href = "index.html";
    }
  } catch (error) {
    console.error("Backend sync failed:", error);
    hasSyncedCurrentUser = false;
    setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
  }
}

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    try {
      setStatus("Signing in...");

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      await handleSignedInUser(user, true);
    } catch (error) {
      console.error("Login error:", error);
      setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    hasSyncedCurrentUser = false;

    if (isHomePage()) {
      window.location.href = "signin.html";
    }

    return;
  }

  if (isSignInPage()) {
    await handleSignedInUser(user, true);
    return;
  }

  await handleSignedInUser(user, false);
});

window.logoutBryantOS = async function logoutBryantOS() {
  try {
    await signOut(auth);
    hasSyncedCurrentUser = false;
    window.location.href = "signin.html";
  } catch (error) {
    console.error("Logout error:", error);
    setStatus(`Logout failed: ${getFriendlyErrorMessage(error)}`, true);
  }
};
