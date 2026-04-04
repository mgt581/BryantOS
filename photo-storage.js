import { auth } from "./firebase-init.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

const storage = getStorage();

/* Helpers */
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

function makePhotoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* Upload Photo(s) */
window.addPhoto = async function addPhoto(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in first.");
    event.target.value = "";
    return;
  }

  const currentFolder = window.getCurrentFolder() || "default";
  const safeFolder = sanitiseFolderPart(currentFolder);

  const items = window.getStoredData("bryantos_photos", []);
  const uploadedItems = [];
  const failedFiles = [];

  for (const file of files) {
    try {
      const id = makePhotoId();
      const safeName = sanitiseFilePart(file.name) || `photo-${id}.jpg`;
      const storagePath = `users/${user.uid}/photos/${safeFolder}/${id}-${safeName}`;
      const fileRef = ref(storage, storagePath);

      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      uploadedItems.push({
        id,
        folder: currentFolder,
        name: file.name,
        url,
        storagePath,
        createdAt: Date.now()
      });
    } catch (error) {
      console.error(`Photo upload failed for ${file.name}:`, error);
      failedFiles.push(file.name);
    }
  }

  if (uploadedItems.length) {
    window.setStoredData("bryantos_photos", [...uploadedItems, ...items]);
    window.renderPhotos();
  }

  const input = document.getElementById("photoInput");
  if (input) input.value = "";
  event.target.value = "";

  if (failedFiles.length) {
    alert(`Some uploads failed: ${failedFiles.join(", ")}`);
  }
};

/* Delete Photo */
window.deletePhoto = async function deletePhoto(id) {
  const items = window.getStoredData("bryantos_photos", []);
  const photo = items.find(item => String(item.id) === String(id));
  const updated = items.filter(item => String(item.id) !== String(id));

  try {
    if (photo?.storagePath) {
      const fileRef = ref(storage, photo.storagePath);
      await deleteObject(fileRef);
    }
  } catch (error) {
    console.error("Storage delete failed:", error);
  }

  window.setStoredData("bryantos_photos", updated);
  window.renderPhotos();
};

/* Render Photos */
window.renderPhotos = function renderPhotos() {
  const list = document.getElementById("photoList");
  if (!list) return;

  const items = window.getFilteredItems("bryantos_photos");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<li class="list-empty">No photos in this folder yet.</li>`;
    window.runSearch();
    return;
  }

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "photo-item";

    li.innerHTML = `
      <div class="photo-card">
        <img
          src="${window.escapeAttribute(item.url || "")}"
          alt="${window.escapeAttribute(item.name || "Photo")}"
          class="photo-preview"
        >

        <div class="photo-meta">
          <span>${window.escapeHtml(item.name || "Untitled photo")}</span>

          <div class="list-actions">
            <select onchange="moveItem('bryantos_photos', '${window.escapeAttribute(String(item.id))}', this.value)">
              ${window.buildFolderOptions(item.folder)}
            </select>

            <button onclick="deletePhoto('${window.escapeAttribute(String(item.id))}')">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;

    list.appendChild(li);
  });

  window.runSearch();
};
