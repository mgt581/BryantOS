import {
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { auth, provider } from "./firebase-init.js";

const signInBtn = document.getElementById("googleSignInBtn");
const statusEl = document.getElementById("authStatus");

let hasSyncedCurrentUser = false;
const BASE_PATH = window.location.hostname === "mgt581.github.io" ? "/BryantOS" : "";

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
      goToHome();
    }
    return;
  }

  hasSyncedCurrentUser = true;

  try {
    setStatus("Syncing account...");
    await syncUserToBackend(user);
    setStatus("Success.");
  } catch (error) {
    console.error("Backend sync failed but login continuing:", error);
    setStatus("Signed in. Account sync unavailable.");
  }

  if (shouldRedirect) {
    goToHome();
  }
}

function updateAuthButton(isSignedIn) {
  const btn = document.getElementById("authBtn");
  if (!btn) return;

  if (isSignedIn) {
    btn.textContent = "Sign Out";
    btn.setAttribute("aria-label", "Sign out of your account");
    btn.onclick = () => window.logoutBryantOS();
  } else {
    btn.textContent = "Sign In";
    btn.setAttribute("aria-label", "Sign in to your account");
    btn.onclick = () => {
      goToSignIn();
    };
  }
}

updateAuthButton(false);

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    try {
      setStatus("Signing in...");
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
      setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
    }
  });
}

if (isSignInPage()) {
  getRedirectResult(auth)
    .then(async (result) => {
      if (result?.user) {
        await handleSignedInUser(result.user, true);
      }
    })
    .catch((error) => {
      console.error("Redirect login error:", error);
      setStatus(`Login failed: ${getFriendlyErrorMessage(error)}`, true);
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
