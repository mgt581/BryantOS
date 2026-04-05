import { app, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
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

function sanitiseFolderPart(value) {
  return String(value || "default")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

/* Use the escape helpers defined in app.js (loaded before this module). */
function esc(value) {
  return window.escapeHtml ? window.escapeHtml(value) : String(value);
}

function escAttr(value) {
  return window.escapeAttribute ? window.escapeAttribute(value) : String(value).replaceAll('"', "&quot;");
}

/* ── Current-photo-folder state (per main niche folder) ─────────────────── */

function getCurrentPhotoFolder() {
  return localStorage.getItem("bryantos_photo_folder") || null;
}

function setCurrentPhotoFolder(name) {
  if (name) {
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
      console.error("Unhandled error in addPhoto:", err);
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
  } catch (error) {
    console.error("Failed to sync photo folders from Firestore:", error);
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
  } catch (error) {
    console.error("Failed to sync photos from Firestore:", error);
  }
}

/* On sign-in: load everything. On sign-out: clear caches. */
onAuthStateChanged(auth, async (user) => {
  /* Render the shell immediately with whatever is in localStorage so the
     create-folder row, upload area, and tabs container appear on first paint
     without waiting for Firestore to respond. */
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
  /* Re-render after sync to reflect the latest server-side data. */
  window.renderPhotos();
});

/* ── Photo subfolder management ─────────────────────────────────────────── */

/* Create a photo subfolder scoped to the current user + niche folder. */
window.addPhotoFolder = async function addPhotoFolder() {
  const input = document.getElementById("photoFolderInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    alert("Enter a folder name.");
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

  /* Update localStorage and UI immediately so the folder is usable right away */
  window.setStoredData("bryantos_photo_folders", [...allFolders, folderData]);
  input.value = "";
  setCurrentPhotoFolder(name);
  window.renderPhotos();

  /* Persist to Firestore in the background */
  try {
    const docRef = await addDoc(collection(db, `users/${user.uid}/photoFolders`), {
      mainFolder,
      name,
      createdAt: folderData.createdAt,
    });
    /* Swap the temporary local ID for the real Firestore document ID */
    const saved = window.getStoredData("bryantos_photo_folders", []);
    window.setStoredData(
      "bryantos_photo_folders",
      saved.map(f => f.id === tempId ? { ...f, id: docRef.id } : f)
    );
  } catch (error) {
    console.error("Failed to sync photo folder to Firestore:", error);
  }
};

/* Switch the active photo subfolder. */
window.selectPhotoFolder = function selectPhotoFolder(name) {
  setCurrentPhotoFolder(name);
  window.renderPhotos();
};

/* ── Upload photos ──────────────────────────────────────────────────────── */

window.addPhoto = async function addPhoto(event) {
  console.log("addPhoto fired");

  const files = Array.from(event.target.files || []);
  console.log("Selected files:", files);

  if (!files.length) return;

  const user = auth.currentUser;
  console.log("Current user:", user);

  if (!user) {
    setUploadStatus("Please sign in before uploading photos.", "error");
    event.target.value = "";
    return;
  }

  const currentFolder = window.getCurrentFolder();
  const currentPhotoFolder = window.getCurrentPhotoFolder();
  console.log("Main folder:", currentFolder);
  console.log("Photo folder:", currentPhotoFolder);

  if (!currentPhotoFolder) {
    setUploadStatus("Please create or select a photo folder first.", "error");
    event.target.value = "";
    return;
  }

  const safeFolder = sanitiseFolderPart(currentFolder);
  const safePhotoFolder = sanitiseFolderPart(currentPhotoFolder);

  const existing = window.getStoredData("bryantos_photos", []);
  const uploaded = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setUploadStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}…`, "info");

    const safeName = sanitiseFilePart(file.name);
    const storagePath = `users/${user.uid}/photos/${safeFolder}/${safePhotoFolder}/${Date.now()}-${safeName}`;
    console.log("Storage path:", storagePath);

    try {
      const storageRef = ref(storage, storagePath);
      console.log("Uploading file:", file.name);

      await uploadBytes(storageRef, file);
      console.log("Upload success");

      const url = await getDownloadURL(storageRef);
      console.log("Download URL:", url);

      const photoData = {
        userId: user.uid,
        mainFolder: currentFolder,
        photoFolder: currentPhotoFolder,
        name: file.name,
        url,
        storagePath,
        createdAt: Date.now()
      };

      const docRef = await addDoc(collection(db, `users/${user.uid}/photos`), photoData);
      console.log("Firestore save success, id:", docRef.id);
      uploaded.push({ id: docRef.id, ...photoData });
    } catch (error) {
      console.error("Photo upload failed:", error);
      const isPermission = error.code === "storage/unauthorized" || error.code === "permission-denied";
      /* Best-effort CORS detection: Firebase SDK doesn't expose a dedicated CORS error code,
         so we fall back to checking for a missing code with a network-related message. */
      const isCors = !error.code && (!error.message || error.message.toLowerCase().includes("network"));
      let hint = "";
      if (isPermission) hint = " Check Firebase Storage security rules.";
      else if (isCors) hint = " This may be a CORS or network error — check Firebase Storage CORS settings.";
      setUploadStatus(`Upload failed for "${file.name}": ${error.message || error.code || "Unknown error"}.${hint}`, "error");
    }
  }

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
    }
  } catch (error) {
    console.error("Storage delete failed:", error);
  }

  try {
    if (user) {
      await deleteDoc(doc(db, `users/${user.uid}/photos`, String(id)));
    }
  } catch (error) {
    console.error("Firestore delete failed:", error);
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
    }
  } catch (error) {
    console.error("Firestore move failed:", error);
  }

  window.renderPhotos();
};

/* ── Render ─────────────────────────────────────────────────────────────── */

/*
 * This overrides the stub in app.js so that all calls to renderPhotos()
 * (including from refreshFolderState) use this full implementation.
 *
 * Data structure:
 *   bryantos_photo_folders  – [{id, mainFolder, name, createdAt}]
 *   bryantos_photos         – [{id, userId, mainFolder, photoFolder, name, url, storagePath, createdAt}]
 */
window.renderPhotos = function renderPhotos() {
  const list = document.getElementById("photoList");
  if (!list) return;

  const mainFolder = window.getCurrentFolder?.() || "default";

  /* Photo subfolders scoped to this niche folder */
  const allPhotoFolders = window.getStoredData("bryantos_photo_folders", []);
  const photoFolders = allPhotoFolders.filter(f => f.mainFolder === mainFolder);

  /* Validate that the stored selection still exists; clear if not */
  const currentPhotoFolder = getCurrentPhotoFolder();
  if (currentPhotoFolder && !photoFolders.some(f => f.name === currentPhotoFolder)) {
    setCurrentPhotoFolder(null);
  }
  const activeFolder = getCurrentPhotoFolder();
  console.log("Active photo folder:", activeFolder);

  /* Photos scoped to this niche folder + photo subfolder */
  const allPhotos = window.getStoredData("bryantos_photos", []);
  const photos = activeFolder
    ? allPhotos.filter(p => p.mainFolder === mainFolder && p.photoFolder === activeFolder)
    : [];

  list.innerHTML = "";

  /* ── Create-folder row ── */
  const createLi = document.createElement("li");
  createLi.className = "photo-folder-create";
  const folderRow = document.createElement("div");
  folderRow.className = "inline-row";
  const folderInput = document.createElement("input");
  folderInput.id = "photoFolderInput";
  folderInput.type = "text";
  folderInput.placeholder = "New photo folder name";
  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.textContent = "Create Folder";
  createBtn.addEventListener("click", () => window.addPhotoFolder());
  folderRow.appendChild(folderInput);
  folderRow.appendChild(createBtn);
  createLi.appendChild(folderRow);
  list.appendChild(createLi);

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

  /* ── No folder selected / no folders yet ── */
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

  /* ── Build move-to <select> options for this niche folder ── */
  function buildMoveOptions(currentPF) {
    return photoFolders
      .map(f => `<option value="${escAttr(f.name)}"${f.name === currentPF ? " selected" : ""}>${esc(f.name)}</option>`)
      .join("");
  }

  /* Valid photo folder names for move validation */
  const validFolderNames = new Set(photoFolders.map(f => f.name));

  /* ── Photo cards ── */
  photos.forEach(item => {
    const imgSrc = item.url || item.data || "";
    const itemId = String(item.id);
    const li = document.createElement("li");
    li.className = "photo-item";

    /* Build card HTML (no user-controlled values in event handler strings) */
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

    const viewBtn = li.querySelector(".js-view-btn");
    viewBtn.addEventListener("click", () => window.open(imgSrc, "_blank"));

    const moveSelect = li.querySelector(".js-move-select");
    const originalFolder = item.photoFolder || activeFolder;
    moveSelect.addEventListener("change", () => {
      const target = moveSelect.value;
      if (validFolderNames.has(target)) {
        window.movePhotoToFolder(itemId, target);
      } else {
        console.warn("Move target folder no longer exists:", target);
        moveSelect.value = validFolderNames.has(originalFolder) ? originalFolder : activeFolder;
      }
    });

    const deleteBtn = li.querySelector(".js-delete-btn");
    deleteBtn.addEventListener("click", () => window.deletePhoto(itemId));

    list.appendChild(li);
  });

  window.runSearch?.();
};
