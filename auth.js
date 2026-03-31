import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { auth, provider } from "./firebase-init.js";

const signInBtn = document.getElementById("googleSignInBtn");
const statusEl = document.getElementById("authStatus");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff6b6b" : "#ffffff";
}

async function syncUserToBackend(user) {
  const idToken = await user.getIdToken();

  const response = await fetch("/api/auth/firebase-login", {
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

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    try {
      setStatus("Signing in...");

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      setStatus("Signed in. Syncing account...");

      await syncUserToBackend(user);

      setStatus("Success. Redirecting...");
      window.location.href = "/dashboard.html";
    } catch (error) {
      console.error("Login error:", error);
      setStatus(`Login failed: ${error.message}`, true);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    await syncUserToBackend(user);
  } catch (error) {
    console.error("Auto sync failed:", error);
  }
});

window.logoutBryantOS = async function logoutBryantOS() {
  try {
    await signOut(auth);
    window.location.href = "/signin.html";
  } catch (error) {
    console.error("Logout error:", error);
  }
};
