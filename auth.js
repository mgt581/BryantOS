import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { auth, provider } from "./firebase-init.js";

const signInBtn = document.getElementById("googleSignInBtn");
const statusEl = document.getElementById("authStatus");

let hasSyncedCurrentUser = false;

const BASE_PATH =
  window.location.hostname === "mgt581.github.io" ? "/BryantOS" : "";

function goToHome() {
  window.location.href = `${BASE_PATH}/index.html`;
}

function goToSignIn() {
  window.location.href = `${BASE_PATH}/signin.html`;
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff6b6b" : "#ffffff";
}

function getFriendlyErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || "Something went wrong.";

  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorised in Firebase yet.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "Sign-in popup was closed before finishing.";
  }

  if (code === "auth/popup-blocked") {
    return "Popup was blocked by the browser.";
  }

  return message;
}

function isSignInPage() {
  return window.location.pathname.endsWith("signin.html");
}

function isHomePage() {
  return (
    window.location.pathname.endsWith("/BryantOS/") ||
    window.location.pathname.endsWith("/") ||
    window.location.pathname.endsWith("index.html")
  );
}

async function handleSignedInUser(user, shouldRedirect = false) {
  if (!user) return;

  if (hasSyncedCurrentUser) {
    if (shouldRedirect) goToHome();
    return;
  }

  hasSyncedCurrentUser = true;

  try {
    setStatus("Signing in...");

    // 🔥 Get Firebase token
    const idToken = await user.getIdToken();

    // 🔥 Send to your Cloudflare Worker API
    const response = await fetch(
      "https://bryantos-api.alexbryant.workers.dev/api/auth/firebase-login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || "",
          photoURL: user.photoURL || ""
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Backend sync failed");
    }

    const data = await response.json();
    console.log("Backend sync success:", data);

    setStatus("Success.");
  } catch (error) {
    hasSyncedCurrentUser = false;
    console.error("Backend sync failed:", error);
    setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
    return;
  }

  if (shouldRedirect) {
    setTimeout(() => {
      goToHome();
    }, 500);
  }
}

function updateAuthButton(isSignedIn) {
  const btn = document.getElementById("authBtn");
  if (!btn) return;

  if (isSignedIn) {
    btn.textContent = "Sign Out";
    btn.onclick = () => window.logoutBryantOS();
  } else {
    btn.textContent = "Sign In";
    btn.onclick = () => goToSignIn();
  }
}

updateAuthButton(false);

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    try {
      setStatus("Signing in...");
      const result = await signInWithPopup(auth, provider);

      if (result?.user) {
        await handleSignedInUser(result.user, true);
      }
    } catch (error) {
      console.error("Login error:", error);
      setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    hasSyncedCurrentUser = false;
    updateAuthButton(false);

    if (isHomePage()) {
      goToSignIn();
    }
    return;
  }

  updateAuthButton(true);

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
    goToSignIn();
  } catch (error) {
    console.error("Logout error:", error);
    setStatus(`Logout failed: ${getFriendlyErrorMessage(error)}`, true);
  }
};
