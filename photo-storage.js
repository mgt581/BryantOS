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

/* Sync all photos from Firestore into localStorage cache */
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

/* On sign-in: load photos from Firestore. On sign-out: clear photo cache. */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await syncPhotosFromFirestore(user.uid);
  } else {
    window.setStoredData("bryantos_photos", []);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.renderPhotos(), { once: true });
  } else {
    window.renderPhotos();
  }
});

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
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const safeName = sanitiseFilePart(file.name) || `photo-${tempId}.jpg`;
      const storagePath = `users/${user.uid}/photos/${safeFolder}/${tempId}-${safeName}`;
      const fileRef = ref(storage, storagePath);

      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      const photoData = {
        folder: currentFolder,
        name: file.name,
        url,
        storagePath,
        createdAt: Date.now()
      };

      const docRef = await addDoc(collection(db, `users/${user.uid}/photos`), photoData);
      uploadedItems.push({ id: docRef.id, ...photoData });
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
  const user = auth.currentUser;
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

/* Move Photo to a different folder */
window.movePhotoToFolder = async function movePhotoToFolder(id, newFolder) {
  const user = auth.currentUser;

  const items = window.getStoredData("bryantos_photos", []);
  const updated = items.map(item =>
    String(item.id) === String(id) ? { ...item, folder: newFolder } : item
  );
  window.setStoredData("bryantos_photos", updated);

  try {
    if (user) {
      await updateDoc(doc(db, `users/${user.uid}/photos`, String(id)), { folder: newFolder });
    }
  } catch (error) {
    console.error("Firestore move failed:", error);
  }

  window.renderPhotos();
};
