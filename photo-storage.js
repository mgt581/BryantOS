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

/* Upload Photo */
window.addPhoto = async function addPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in first.");
    event.target.value = "";
    return;
  }

  const currentFolder = window.getCurrentFolder();
  const safeFolder = sanitiseFolderPart(currentFolder);
  const safeName = sanitiseFilePart(file.name) || `photo-${Date.now()}.jpg`;
  const id = Date.now().toString();

  const storagePath = `users/${user.uid}/photos/${safeFolder}/${id}-${safeName}`;

  try {
    const fileRef = ref(storage, storagePath);

    // Upload file
    await uploadBytes(fileRef, file);

    // Get URL
    const url = await getDownloadURL(fileRef);

    // Save metadata only
    const items = window.getStoredData("bryantos_photos", []);
    items.unshift({
      id,
      folder: currentFolder,
      name: file.name,
      url,
      storagePath
    });

    window.setStoredData("bryantos_photos", items);

    // Reset input
    const input = document.getElementById("photoInput");
    if (input) input.value = "";

    window.renderPhotos();

  } catch (error) {
    console.error("Photo upload failed:", error);
    alert("Photo upload failed. Check Firebase setup.");
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

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "photo-item";

    li.innerHTML = `
      <div class="photo-card">
        <img src="${window.escapeAttribute(item.url || "")}" 
             alt="${window.escapeAttribute(item.name)}" 
             class="photo-preview">

        <div class="photo-meta">
          <span>${window.escapeHtml(item.name)}</span>

          <div class="list-actions">
            <select onchange="moveItem('bryantos_photos', '${window.escapeAttribute(item.id)}', this.value)">
              ${window.buildFolderOptions(item.folder)}
            </select>

            <button onclick="deletePhoto('${window.escapeAttribute(item.id)}')">
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
