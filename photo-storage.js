import { auth } from "./firebase-init.js";
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

const storage = getStorage();
const db = getFirestore();

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
  const main = window.getCurrentFolder?.() || "default";
  return localStorage.getItem(`bryantos_current_photo_folder_${main}`) || null;
}

function setCurrentPhotoFolder(name) {
  const main = window.getCurrentFolder?.() || "default";
  if (name) {
    localStorage.setItem(`bryantos_current_photo_folder_${main}`, name);
  } else {
    localStorage.removeItem(`bryantos_current_photo_folder_${main}`);
  }
}

window.getCurrentPhotoFolder = getCurrentPhotoFolder;
window.setCurrentPhotoFolder = setCurrentPhotoFolder;

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
  if (user) {
    await syncPhotoFoldersFromFirestore(user.uid);
    await syncPhotosFromFirestore(user.uid);
  } else {
    window.setStoredData("bryantos_photo_folders", []);
    window.setStoredData("bryantos_photos", []);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.renderPhotos(), { once: true });
  } else {
    window.renderPhotos();
  }
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

  const folderData = { mainFolder, name, createdAt: Date.now() };

  try {
    const docRef = await addDoc(collection(db, `users/${user.uid}/photoFolders`), folderData);
    window.setStoredData("bryantos_photo_folders", [...allFolders, { id: docRef.id, ...folderData }]);
    input.value = "";
    setCurrentPhotoFolder(name);
    window.renderPhotos();
  } catch (error) {
    console.error("Failed to create photo folder:", error);
    alert("Failed to create folder. Please try again.");
  }
};

/* Switch the active photo subfolder. */
window.selectPhotoFolder = function selectPhotoFolder(name) {
  setCurrentPhotoFolder(name);
  window.renderPhotos();
};

/* ── Upload photos ──────────────────────────────────────────────────────── */

window.addPhoto = async function addPhoto(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in first.");
    event.target.value = "";
    return;
  }

  const mainFolder = window.getCurrentFolder?.() || "default";
  const photoFolder = getCurrentPhotoFolder();

  if (!photoFolder) {
    alert("Please create or select a photo folder first.");
    event.target.value = "";
    return;
  }

  const safeMain = sanitiseFolderPart(mainFolder);
  const safePhoto = sanitiseFolderPart(photoFolder);

  const existing = window.getStoredData("bryantos_photos", []);
  const uploaded = [];
  const failed = [];

  for (const file of files) {
    try {
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const safeName = sanitiseFilePart(file.name) || `photo-${tempId}.jpg`;
      const storagePath = `users/${user.uid}/${safeMain}/${safePhoto}/${tempId}-${safeName}`;
      const fileRef = ref(storage, storagePath);

      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      const photoData = {
        userId: user.uid,
        mainFolder,
        photoFolder,
        name: file.name,
        url,
        storagePath,
        createdAt: Date.now()
      };

      const docRef = await addDoc(collection(db, `users/${user.uid}/photos`), photoData);
      uploaded.push({ id: docRef.id, ...photoData });
    } catch (error) {
      console.error(`Upload failed for ${file.name}:`, error);
      failed.push(file.name);
    }
  }

  if (uploaded.length) {
    window.setStoredData("bryantos_photos", [...uploaded, ...existing]);
    window.renderPhotos();
  }

  const input = document.getElementById("photoInput");
  if (input) input.value = "";
  event.target.value = "";

  if (failed.length) {
    alert(`Some uploads failed: ${failed.join(", ")}`);
  }
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
  const currentPhotoFolder = getCurrentPhotoFolder();

  /* Photo subfolders scoped to this niche folder */
  const allPhotoFolders = window.getStoredData("bryantos_photo_folders", []);
  const photoFolders = allPhotoFolders.filter(f => f.mainFolder === mainFolder);

  /* Validate that the stored selection still exists; clear if not */
  if (currentPhotoFolder && !photoFolders.some(f => f.name === currentPhotoFolder)) {
    setCurrentPhotoFolder(null);
  }
  const activeFolder = getCurrentPhotoFolder();

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
  createBtn.textContent = "Create Folder";
  createBtn.addEventListener("click", () => window.addPhotoFolder());
  folderRow.appendChild(folderInput);
  folderRow.appendChild(createBtn);
  createLi.appendChild(folderRow);
  list.appendChild(createLi);

  /* ── Subfolder tab bar ── */
  if (photoFolders.length) {
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
  }

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

  /* ── Upload input (only shown when a subfolder is active) ── */
  const uploadLi = document.createElement("li");
  uploadLi.className = "photo-upload-row";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.id = "photoInput";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.addEventListener("change", event => window.addPhoto(event));
  uploadLi.appendChild(fileInput);
  list.appendChild(uploadLi);

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
