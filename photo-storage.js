import { app, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const storage = getStorage(app);
const db = getFirestore(app);

/* ── String helpers ─────────────────────────────────────────────────────── */

function sanitiseFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

/* Returns empty string if no valid characters remain — callers must check. */
function sanitiseFolderPart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

/* Use the escape helpers defined in app.js (loaded before this module). */
function esc(value) {
  return window.escapeHtml ? window.escapeHtml(value) : String(value);
}

function escAttr(value) {
  return window.escapeAttribute
    ? window.escapeAttribute(value)
    : String(value).replaceAll('"', "&quot;");
}

/* ── Photo-folder state ─────────────────────────────────────────────────── */

/* Values that must never be used as a folder name. */
const CORRUPT_VALUES = new Set([
  "", ",", '","', ".", "undefined", "null", "false", "[]", "{}",
]);

/**
 * Reads the active photo-subfolder from localStorage.
 * Checks every key that may have been written by older versions of this code
 * so that stale / corrupt entries are cleaned up automatically.
 * Returns null when no valid folder is selected (not "General") so the UI
 * can prompt the user to pick or create one.
 */
function getSafePhotoFolder() {
  const KEYS = [
    "bryantos_photo_folder",
    "bryantos_currentPhotoFolder",
    "bryantos_selectedPhotoFolder",
  ];

  for (const key of KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    const value = String(raw).trim();

    if (CORRUPT_VALUES.has(value) || !sanitiseFolderPart(value)) {
      console.warn(`[PhotoStorage] Removing corrupt value from "${key}":`, JSON.stringify(value));
      localStorage.removeItem(key);
      continue;
    }

    /* Found a valid value — canonicalise it to the primary key and remove
       any legacy duplicates so we never have two competing keys. */
    if (key !== "bryantos_photo_folder") {
      localStorage.setItem("bryantos_photo_folder", value);
      localStorage.removeItem(key);
    }

    return value;
  }

  return null;
}

function getCurrentPhotoFolder() {
  return getSafePhotoFolder();
}

function setCurrentPhotoFolder(name) {
  /* Only accept names that survive sanitisation. */
  if (name && sanitiseFolderPart(String(name).trim())) {
    localStorage.setItem("bryantos_photo_folder", name);
  } else {
    localStorage.removeItem("bryantos_photo_folder");
  }
}

window.getCurrentPhotoFolder = getCurrentPhotoFolder;
window.setCurrentPhotoFolder = setCurrentPhotoFolder;

/* ── Upload status helper ───────────────────────────────────────────────── */

/**
 * @param {string} message
 * @param {'info'|'error'|'success'|''} type
 */
function setUploadStatus(message, type) {
  const el = document.getElementById("photoUploadStatus");
  if (!el) return;
  el.textContent = message;
  el.className = "photo-upload-status" + (type ? " photo-upload-status--" + type : "");
}

/* Attach the change listener to the static photoInput element in the HTML. */
const photoInputEl = document.getElementById("photoInput");
if (photoInputEl) {
  photoInputEl.addEventListener("change", async (event) => {
    try {
      await window.addPhoto(event);
    } catch (err) {
      console.error("[PhotoStorage] Unhandled error in addPhoto:", err);
      setUploadStatus("Upload failed: " + (err.message || "Unknown error"), "error");
    }
  });
}

/* ── Firestore sync ─────────────────────────────────────────────────────── */

async function syncPhotoFoldersFromFirestore(uid) {
  try {
    const snapshot = await getDocs(collection(db, `users/${uid}/photoFolders`));
    const folders = [];
    snapshot.forEach(docSnap => {
      folders.push({ id: docSnap.id, ...docSnap.data() });
    });
    folders.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    window.setStoredData("bryantos_photo_folders", folders);
    console.log(`[PhotoStorage] Synced ${folders.length} photo folder(s) from Firestore.`);
  } catch (error) {
    console.error("[PhotoStorage] Failed to sync photo folders from Firestore:", error);
  }
}

async function syncPhotosFromFirestore(uid) {
  try {
    const snapshot = await getDocs(collection(db, `users/${uid}/photos`));
    const photos = [];
    snapshot.forEach(docSnap => {
      photos.push({ id: docSnap.id, ...docSnap.data() });
    });
    photos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    window.setStoredData("bryantos_photos", photos);
    console.log(`[PhotoStorage] Synced ${photos.length} photo(s) from Firestore.`);
  } catch (error) {
    console.error("[PhotoStorage] Failed to sync photos from Firestore:", error);
  }
}

/* On sign-in: load everything. On sign-out: clear caches. */
onAuthStateChanged(auth, async (user) => {
  console.log("[PhotoStorage] Auth state changed:", user ? `uid=${user.uid}` : "signed out");

  /* Render the shell immediately with whatever is in localStorage so the
     create-folder row, upload area, and tabs appear without waiting for
     Firestore. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.renderPhotos(), { once: true });
  } else {
    window.renderPhotos();
  }

  if (user) {
    await syncPhotoFoldersFromFirestore(user.uid);
    await syncPhotosFromFirestore(user.uid);
  } else {
    window.setStoredData("bryantos_photo_folders", []);
    window.setStoredData("bryantos_photos", []);
  }

  /* Re-render after sync to show the latest server-side data. */
  window.renderPhotos();
});

/* ── Photo subfolder management ─────────────────────────────────────────── */

window.addPhotoFolder = async function addPhotoFolder() {
  const input = document.getElementById("photoFolderInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    alert("Enter a folder name.");
    return;
  }

  if (!sanitiseFolderPart(name)) {
    alert("Folder name must contain at least one letter or number.");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in first.");
    return;
  }

  const mainFolder = window.getCurrentFolder?.() || "default";
  const allFolders = window.getStoredData("bryantos_photo_folders", []);
  const duplicate = allFolders.some(
    f => f.mainFolder === mainFolder && f.name.toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    alert("A photo folder with that name already exists here.");
    return;
  }

  const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const folderData = { id: tempId, mainFolder, name, createdAt: Date.now() };

  /* Update localStorage and UI immediately so the folder is usable right away. */
  window.setStoredData("bryantos_photo_folders", [...allFolders, folderData]);
  input.value = "";
  setCurrentPhotoFolder(name);
  window.renderPhotos();

  /* Persist to Firestore in the background. */
  try {
    const docRef = await addDoc(collection(db, `users/${user.uid}/photoFolders`), {
      mainFolder,
      name,
      createdAt: folderData.createdAt,
    });
    /* Swap the temporary local ID for the real Firestore document ID. */
    const saved = window.getStoredData("bryantos_photo_folders", []);
    window.setStoredData(
      "bryantos_photo_folders",
      saved.map(f => f.id === tempId ? { ...f, id: docRef.id } : f)
    );
    console.log("[PhotoStorage] Photo folder saved to Firestore:", docRef.id);
  } catch (error) {
    console.error("[PhotoStorage] Failed to sync photo folder to Firestore:", error);
  }
};

window.selectPhotoFolder = function selectPhotoFolder(name) {
  setCurrentPhotoFolder(name);
  window.renderPhotos();
};

/* ── Upload photos ──────────────────────────────────────────────────────── */

window.addPhoto = async function addPhoto(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  /* ── 1. Auth guard ── */
  const user = auth.currentUser;
  console.log("[PhotoStorage] addPhoto fired. Auth user:", user ? user.uid : "NOT SIGNED IN");

  if (!user) {
    setUploadStatus("Please sign in before uploading photos.", "error");
    event.target.value = "";
    return;
  }

  /* ── 2. Folder guards ── */
  const mainFolder = window.getCurrentFolder?.() || "default";
  const photoFolder = getSafePhotoFolder();

  console.log("[PhotoStorage] Upload state:", {
    uid: user.uid,
    mainFolder,
    photoFolder,
    fileCount: files.length,
  });

  if (!photoFolder) {
    setUploadStatus("Please create or select a photo folder first.", "error");
    event.target.value = "";
    return;
  }

  const safeMain = sanitiseFolderPart(mainFolder);
  const safePhoto = sanitiseFolderPart(photoFolder);

  if (!safePhoto) {
    /* This should never happen because getSafePhotoFolder() already guards
       against it, but we treat it as a hard stop rather than silently
       constructing a broken path. */
    setUploadStatus(
      `Photo folder "${photoFolder}" has an invalid name. ` +
      "Please create a new folder using letters and numbers only.",
      "error"
    );
    event.target.value = "";
    return;
  }

  /* ── 3. Upload each file ── */
  const existing = window.getStoredData("bryantos_photos", []);
  const uploaded = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setUploadStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}…`, "info");

    const safeFileName = `${Date.now()}-${sanitiseFilePart(file.name) || "photo"}`;
    const storagePath = `users/${user.uid}/${safeMain}/${safePhoto}/${safeFileName}`;

    console.log("[PhotoStorage] Starting upload:", {
      file: file.name,
      size: file.size,
      storagePath,
    });

    try {
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, file);
      console.log("[PhotoStorage] Upload success:", snapshot.ref.fullPath);

      const url = await getDownloadURL(snapshot.ref);
      console.log("[PhotoStorage] Download URL obtained:", url);

      /* Exact Firestore schema — field names must match the render filter. */
      const photoData = {
        name: file.name,
        url,
        mainFolder,
        photoFolder,
        storagePath,
        createdAt: Date.now(),
      };

      const docRef = await addDoc(collection(db, `users/${user.uid}/photos`), photoData);
      console.log("[PhotoStorage] Firestore metadata saved, id:", docRef.id);

      uploaded.push({ id: docRef.id, ...photoData });
    } catch (error) {
      console.error("[PhotoStorage] Upload failed for", file.name, "—", error.code, error.message, error);

      let hint = "";
      if (error.code === "storage/unauthorized" || error.code === "permission-denied") {
        hint = " Your Firebase Storage security rules are blocking this path. " +
               "Check that the path starts with users/<your-uid>/…";
      } else if (error.code === "storage/canceled") {
        hint = " The upload was cancelled.";
      } else if (!error.code) {
        /* No SDK error code usually means a network-level failure (CORS,
           offline, etc.). Give one clear actionable message. */
        hint = " This looks like a network or CORS error. " +
               "Open the browser Network tab and look for a blocked OPTIONS / PUT request. " +
               "If found, apply cors.json to your bucket: " +
               "gsutil cors set cors.json gs://YOUR_BUCKET";
      }

      setUploadStatus(
        `Upload failed for "${file.name}": ${error.message || error.code || "Unknown error"}.${hint}`,
        "error"
      );
    }
  }

  /* ── 4. Commit results ── */
  if (uploaded.length) {
    window.setStoredData("bryantos_photos", [...uploaded, ...existing]);
    setUploadStatus(
      uploaded.length === files.length
        ? `${uploaded.length} photo${uploaded.length > 1 ? "s" : ""} uploaded successfully.`
        : `${uploaded.length} of ${files.length} photo${files.length > 1 ? "s" : ""} uploaded.`,
      "success"
    );
    window.renderPhotos();
  }

  event.target.value = "";
};

/* ── Delete photo ───────────────────────────────────────────────────────── */

window.deletePhoto = async function deletePhoto(id) {
  const user = auth.currentUser;
  const items = window.getStoredData("bryantos_photos", []);
  const photo = items.find(item => String(item.id) === String(id));
  const updated = items.filter(item => String(item.id) !== String(id));

  try {
    if (photo?.storagePath) {
      await deleteObject(ref(storage, photo.storagePath));
      console.log("[PhotoStorage] Storage file deleted:", photo.storagePath);
    }
  } catch (error) {
    console.error("[PhotoStorage] Storage delete failed:", error);
  }

  try {
    if (user) {
      await deleteDoc(doc(db, `users/${user.uid}/photos`, String(id)));
      console.log("[PhotoStorage] Firestore doc deleted:", id);
    }
  } catch (error) {
    console.error("[PhotoStorage] Firestore delete failed:", error);
  }

  window.setStoredData("bryantos_photos", updated);
  window.renderPhotos();
};

/* ── Move photo between photo subfolders ────────────────────────────────── */

window.movePhotoToFolder = async function movePhotoToFolder(id, newPhotoFolder) {
  const user = auth.currentUser;
  const items = window.getStoredData("bryantos_photos", []);
  const updated = items.map(item =>
    String(item.id) === String(id) ? { ...item, photoFolder: newPhotoFolder } : item
  );
  window.setStoredData("bryantos_photos", updated);

  try {
    if (user) {
      await updateDoc(doc(db, `users/${user.uid}/photos`, String(id)), { photoFolder: newPhotoFolder });
      console.log("[PhotoStorage] Photo moved to folder:", newPhotoFolder);
    }
  } catch (error) {
    console.error("[PhotoStorage] Firestore move failed:", error);
  }

  window.renderPhotos();
};

/* ── Render ─────────────────────────────────────────────────────────────── */

/*
 * Overrides the stub in app.js so every call to renderPhotos() — including
 * from refreshFolderState — uses this full implementation.
 *
 * localStorage data structures:
 *   bryantos_photo_folders  – [{id, mainFolder, name, createdAt}]
 *   bryantos_photos         – [{id, name, url, mainFolder, photoFolder, storagePath, createdAt}]
 */
window.renderPhotos = function renderPhotos() {
  const list = document.getElementById("photoList");
  if (!list) return;

  const mainFolder = window.getCurrentFolder?.() || "default";

  const allPhotoFolders = window.getStoredData("bryantos_photo_folders", []);
  const photoFolders = allPhotoFolders.filter(f => f.mainFolder === mainFolder);

  /* If the stored selection no longer exists in the folder list, clear it. */
  const storedFolder = getSafePhotoFolder();
  if (storedFolder && !photoFolders.some(f => f.name === storedFolder)) {
    setCurrentPhotoFolder(null);
  }
  const activeFolder = getSafePhotoFolder();

  /* Photos that belong to the active main folder + photo subfolder. */
  const allPhotos = window.getStoredData("bryantos_photos", []);
  const photos = activeFolder
    ? allPhotos.filter(p => p.mainFolder === mainFolder && p.photoFolder === activeFolder)
    : [];

  list.innerHTML = "";

  /* ── Subfolder tab bar ── */
  const tabLi = document.createElement("li");
  tabLi.className = "photo-folder-tabs";
  photoFolders.forEach(f => {
    const btn = document.createElement("button");
    btn.className = "photo-folder-tab" + (f.name === activeFolder ? " active" : "");
    btn.textContent = f.name;
    btn.dataset.folder = f.name;
    btn.addEventListener("click", () => window.selectPhotoFolder(btn.dataset.folder));
    tabLi.appendChild(btn);
  });
  list.appendChild(tabLi);

  /* ── No folder selected / no folders exist yet ── */
  if (!activeFolder) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "list-empty";
    emptyLi.textContent = photoFolders.length
      ? "Select a photo folder above to view photos."
      : "Create a photo folder to get started.";
    list.appendChild(emptyLi);
    window.runSearch?.();
    return;
  }

  /* ── Empty state ── */
  if (!photos.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "list-empty";
    emptyLi.textContent = `No photos in "${activeFolder}" yet. Upload some above.`;
    list.appendChild(emptyLi);
    window.runSearch?.();
    return;
  }

  /* ── Build move-to <select> options ── */
  function buildMoveOptions(currentPF) {
    return photoFolders
      .map(f =>
        `<option value="${escAttr(f.name)}"${f.name === currentPF ? " selected" : ""}>${esc(f.name)}</option>`
      )
      .join("");
  }

  const validFolderNames = new Set(photoFolders.map(f => f.name));

  /* ── Photo cards ── */
  photos.forEach(item => {
    const imgSrc = item.url || item.data || "";
    const itemId = String(item.id);
    const li = document.createElement("li");
    li.className = "photo-item";

    li.innerHTML = `
      <div class="photo-card">
        <img src="${escAttr(imgSrc)}" alt="${escAttr(item.name || "Photo")}" class="photo-preview">
        <div class="photo-meta">
          <span>${esc(item.name || "Untitled photo")}</span>
          <div class="list-actions">
            <button class="js-view-btn">View</button>
            <select class="js-move-select">
              ${buildMoveOptions(item.photoFolder || activeFolder)}
            </select>
            <button class="js-delete-btn">Delete</button>
          </div>
        </div>
      </div>
    `;

    li.querySelector(".js-view-btn").addEventListener("click", () => window.open(imgSrc, "_blank"));

    const moveSelect = li.querySelector(".js-move-select");
    const originalFolder = item.photoFolder || activeFolder;
    moveSelect.addEventListener("change", () => {
      const target = moveSelect.value;
      if (validFolderNames.has(target)) {
        window.movePhotoToFolder(itemId, target);
      } else {
        console.warn("[PhotoStorage] Move target folder no longer exists:", target);
        moveSelect.value = validFolderNames.has(originalFolder) ? originalFolder : activeFolder;
      }
    });

    li.querySelector(".js-delete-btn").addEventListener("click", () => window.deletePhoto(itemId));

    list.appendChild(li);
  });

  window.runSearch?.();
};
