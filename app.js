// ── Firebase references (populated after auth) ────────────────────────────────
let _db       = null;
let _storage  = null;
let _uid      = null;
let _saveTimer = null;

// In-memory cache of photos loaded from Firestore.
let _firestorePhotos = [];

// Delay (ms) before flushing localStorage changes to Firestore.
// Short enough to feel instant; long enough to batch rapid edits into one write.
const SYNC_DEBOUNCE_MS = 1500;

// Keys synced to Firestore. Photos are excluded — base64 data is too large.
// Vault crypto keys (hash, salt, encrypted flag) are included so the same PIN
// works across devices and double-encryption is avoided on fresh localStorage.
const SYNC_KEYS = [
  "bryantos_folders",
  "bryantos_current_folder",
  "bryantos_mail",
  "bryantos_money",
  "bryantos_bills",
  "bryantos_links",
  "bryantos_codes",
  "bryantos_events",
  "bryantos_contacts",
  "bryantos_vault_pin_hash",
  "bryantos_vault_pin_salt",
  "bryantos_vault_encrypted",
  "bryantos_photo_albums"
];

// ── Vault encryption state ─────────────────────────────────────────────────────
const VAULT_PIN_HASH_KEY = "bryantos_vault_pin_hash";
const VAULT_PIN_SALT_KEY = "bryantos_vault_pin_salt";
const VAULT_ENC_FLAG_KEY = "bryantos_vault_encrypted";
const VAULT_WA_CRED_KEY  = "bryantos_vault_wa_cred";
const VAULT_WA_PIN_KEY   = "bryantos_vault_wa_pin";

// In-memory only — cleared on every page refresh (intentional security design).
let _vaultPin = null;

async function loadFromFirestore() {
  if (!_db || !_uid) return;
  try {
    const doc = await _db
      .collection("users").doc(_uid)
      .collection("data").doc("bryantos")
      .get();
    if (doc.exists) {
      const saved = doc.data();
      Object.entries(saved).forEach(([key, val]) => {
        localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
      });
    }
  } catch (err) {
    console.error("Firestore load failed:", err);
  }
}

function scheduleSyncToFirestore() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(syncToFirestore, SYNC_DEBOUNCE_MS);
}

async function syncToFirestore() {
  if (!_db || !_uid) return;
  try {
    const data = {};
    SYNC_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
      }
    });
    getFolders().forEach(folder => {
      const key = getNotesKey(folder);
      const val = localStorage.getItem(key);
      if (val !== null) data[key] = val;
    });
    await _db
      .collection("users").doc(_uid)
      .collection("data").doc("bryantos")
      .set(data);
    const banner = document.getElementById("syncError");
    if (banner) banner.hidden = true;
  } catch (err) {
    console.error("Firestore sync failed:", err);
    const banner = document.getElementById("syncError");
    if (banner) banner.hidden = false;
  }
}

function signOut() {
  firebase.auth().signOut().then(function() {
    window.location.href = "signin.html";
  });
}

// ── App data ──────────────────────────────────────────────────────────────────
const DEFAULT_FOLDERS = [
  "Personal",
  "Bryant Digital",
  "Cleaning",
  "Construction",
  "AI Photo Studio",
  "MultiPost"
];

const FOLDERS_KEY = "bryantos_folders";
const CURRENT_FOLDER_KEY = "bryantos_current_folder";

const FOLDER_COLORS = {
  "Personal": "#22c55e",
  "Bryant Digital": "#3b82f6",
  "Cleaning": "#f97316",
  "Construction": "#eab308",
  "AI Photo Studio": "#a855f7",
  "MultiPost": "#ec4899"
};

function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");
  sections.forEach(section => section.classList.remove("active"));

  const selectedSection = document.getElementById(sectionId);
  if (!selectedSection) {
    console.error("Section not found:", sectionId);
    const dashboard = document.getElementById("dashboard");
    if (dashboard) dashboard.classList.add("active");
    return;
  }

  selectedSection.classList.add("active");

  if (sectionId === "codes") {
    if (vaultIsUnlocked()) {
      _showVaultContentUI();
    } else {
      _showVaultLockUI();
    }
  }

  runSearch();
}

function getStoredData(key, fallback = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (error) {
    console.error("Error reading", key, error);
    return fallback;
  }
}

function setStoredData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    scheduleSyncToFirestore();
    return true;
  } catch (error) {
    console.error("Error saving", key, error);
    return false;
  }
}

function getFolders() {
  const stored = getStoredData(FOLDERS_KEY, []);
  if (!Array.isArray(stored) || stored.length === 0) {
    setStoredData(FOLDERS_KEY, DEFAULT_FOLDERS);
    return [...DEFAULT_FOLDERS];
  }
  return stored;
}

function getCurrentFolder() {
  const current = localStorage.getItem(CURRENT_FOLDER_KEY);
  const folders = getFolders();

  if (current && folders.includes(current)) {
    return current;
  }

  const fallback = folders[0];
  localStorage.setItem(CURRENT_FOLDER_KEY, fallback);
  return fallback;
}

function setCurrentFolder(folderName) {
  localStorage.setItem(CURRENT_FOLDER_KEY, folderName);
  scheduleSyncToFirestore();
}

function renderFolderDropdown() {
  const select = document.getElementById("folderSelect");
  if (!select) return;

  const folders = getFolders();
  const currentFolder = getCurrentFolder();

  select.innerHTML = folders
    .map(folder => `<option value="${escapeAttribute(folder)}">${escapeHtml(folder)}</option>`)
    .join("");

  select.value = currentFolder;
}

function updateFolderLabels() {
  const currentFolder = getCurrentFolder();
  const labelIds = [
    "notesFolderLabel",
    "photosFolderLabel",
    "mailFolderLabel",
    "moneyFolderLabel",
    "billsFolderLabel",
    "linksFolderLabel",
    "codesFolderLabel",
    "calendarFolderLabel",
    "contactsFolderLabel"
  ];

  labelIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentFolder;
  });
}

function applyFolderColor() {
  const folder = getCurrentFolder();
  const color = FOLDER_COLORS[folder] || "#38bdf8";
  document.documentElement.style.setProperty("--accent", color);
}

function addFolder() {
  const input = document.getElementById("newFolderInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    alert("Enter a folder name.");
    return;
  }

  const folders = getFolders();
  const exists = folders.some(folder => folder.toLowerCase() === name.toLowerCase());

  if (exists) {
    alert("Folder already exists.");
    return;
  }

  folders.push(name);
  setStoredData(FOLDERS_KEY, folders);
  setCurrentFolder(name);
  input.value = "";
  refreshFolderState();
}

function changeFolder() {
  const select = document.getElementById("folderSelect");
  if (!select) return;

  setCurrentFolder(select.value);
  refreshFolderState();
}

function deleteCurrentFolder() {
  const currentFolder = getCurrentFolder();
  const folders = getFolders();

  if (DEFAULT_FOLDERS.includes(currentFolder)) {
    alert("Default folders cannot be deleted.");
    return;
  }

  const confirmed = confirm(`Delete folder "${currentFolder}"? Items in this folder will also be removed.`);
  if (!confirmed) return;

  const updatedFolders = folders.filter(folder => folder !== currentFolder);
  setStoredData(FOLDERS_KEY, updatedFolders);

  deleteItemsForFolder("bryantos_mail", currentFolder);
  deleteItemsForFolder("bryantos_money", currentFolder);
  deleteItemsForFolder("bryantos_bills", currentFolder);
  deleteItemsForFolder("bryantos_links", currentFolder);
  deleteItemsForFolder("bryantos_codes", currentFolder);
  deleteItemsForFolder("bryantos_events", currentFolder);
  deleteItemsForFolder("bryantos_contacts", currentFolder);
  deleteItemsForFolder("bryantos_photos", currentFolder);

  const allAlbums = getPhotoAlbums();
  delete allAlbums[currentFolder];
  setPhotoAlbums(allAlbums);

  localStorage.removeItem(getNotesKey(currentFolder));

  const nextFolder = updatedFolders[0] || DEFAULT_FOLDERS[0];
  setCurrentFolder(nextFolder);
  refreshFolderState();
}

function deleteItemsForFolder(storageKey, folderName) {
  const items = getStoredData(storageKey, []).filter(item => item.folder !== folderName);
  setStoredData(storageKey, items);
}

function refreshFolderState() {
  renderFolderDropdown();
  updateFolderLabels();
  applyFolderColor();
  loadNotes();
  renderAlbumFilter("");
  renderPhotos();
  renderMail();
  renderMoney();
  renderBills();
  renderLinks();
  renderCodes();
  renderEvents();
  renderContacts();
  runSearch();
}

function getNotesKey(folderName) {
  return `bryantos_notes_${folderName}`;
}

function getFilteredItems(key) {
  const currentFolder = getCurrentFolder();
  return getStoredData(key, []).filter(item => item.folder === currentFolder);
}

function buildFolderOptions(selectedFolder) {
  return getFolders()
    .map(folder => {
      const selected = folder === selectedFolder ? "selected" : "";
      return `<option value="${escapeAttribute(folder)}" ${selected}>${escapeHtml(folder)}</option>`;
    })
    .join("");
}

function moveItem(storageKey, id, newFolder) {
  const items = getStoredData(storageKey, []);
  const updated = items.map(item => item.id === id ? { ...item, folder: newFolder } : item);
  setStoredData(storageKey, updated);
  refreshFolderState();
}

function runSearch() {
  const searchInput = document.getElementById("globalSearch");
  if (!searchInput) return;

  const query = searchInput.value.trim().toLowerCase();
  const activeSection = document.querySelector(".section.active");
  if (!activeSection) return;

  const items = activeSection.querySelectorAll(".list-item, .photo-item");
  items.forEach(item => {
    const text = item.innerText.toLowerCase();
    const searchAttr = (item.dataset.search || "").toLowerCase();
    item.style.display = (text.includes(query) || searchAttr.includes(query)) ? "" : "none";
  });
}

function saveNotes() {
  const notesInput = document.getElementById("notesInput");
  if (!notesInput) return;

  const value = notesInput.value.trim();
  const currentFolder = getCurrentFolder();
  localStorage.setItem(getNotesKey(currentFolder), value);
  scheduleSyncToFirestore();
  alert(`Notes saved in ${currentFolder}.`);
}

function loadNotes() {
  const currentFolder = getCurrentFolder();
  const savedNotes = localStorage.getItem(getNotesKey(currentFolder)) || "";
  const notesInput = document.getElementById("notesInput");
  if (notesInput) notesInput.value = savedNotes;
}

/* Photo Albums */
const ALBUMS_KEY = "bryantos_photo_albums";

function getPhotoAlbums() {
  return getStoredData(ALBUMS_KEY, {});
}

function setPhotoAlbums(data) {
  setStoredData(ALBUMS_KEY, data);
}

function getAlbumsForFolder(folder) {
  const all = getPhotoAlbums();
  return Array.isArray(all[folder]) ? all[folder] : [];
}

function createAlbum() {
  const input = document.getElementById("newAlbumInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    alert("Enter an album name.");
    return;
  }

  const folder = getCurrentFolder();
  const all = getPhotoAlbums();
  const albums = Array.isArray(all[folder]) ? all[folder] : [];

  if (albums.some(a => a.toLowerCase() === name.toLowerCase())) {
    alert("Album already exists in this folder.");
    return;
  }

  albums.push(name);
  all[folder] = albums;
  setPhotoAlbums(all);
  input.value = "";
  renderAlbumFilter(name);
  renderPhotos();
}

function renderAlbumFilter(selectAlbum) {
  const select = document.getElementById("albumFilter");
  if (!select) return;

  const folder = getCurrentFolder();
  const albums = getAlbumsForFolder(folder);
  const current = selectAlbum !== undefined ? selectAlbum : select.value;

  select.innerHTML = `<option value="">All Photos</option>` +
    albums.map(a => `<option value="${escapeAttribute(a)}"${a === current ? " selected" : ""}>${escapeHtml(a)}</option>`).join("");
}

function getCurrentAlbum() {
  const select = document.getElementById("albumFilter");
  return select ? select.value : "";
}

function buildAlbumOptions(selectedAlbum, folder) {
  const albums = getAlbumsForFolder(folder);
  return `<option value=""${selectedAlbum === "" || selectedAlbum === null || selectedAlbum === undefined ? " selected" : ""}>No Album</option>` +
    albums.map(a => `<option value="${escapeAttribute(a)}"${a === selectedAlbum ? " selected" : ""}>${escapeHtml(a)}</option>`).join("");
}

async function movePhotoToAlbum(docId, newAlbum) {
  if (!_db || !_uid) return;
  try {
    await _db
      .collection("users").doc(_uid)
      .collection("photos").doc(docId)
      .update({ album: newAlbum });
    await loadPhotos();
  } catch (err) {
    console.error("[Photos] Album move failed:", err);
  }
}

/* Photos */
function compressImage(dataUrl, maxDimension, quality, callback) {
  const img = new Image();
  img.onerror = function() {
    callback(dataUrl);
  };
  img.onload = function() {
    let width = img.width;
    let height = img.height;
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round(height * maxDimension / width);
        width = maxDimension;
      } else {
        width = Math.round(width * maxDimension / height);
        height = maxDimension;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      callback(dataUrl);
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL("image/jpeg", quality));
  };
  img.src = dataUrl;
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function addPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!_uid || !_storage || !_db) {
    alert("Not signed in. Please sign in and try again.");
    return;
  }

  const folder = getCurrentFolder();
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${timestamp}_${sanitizedName}`;
  const storagePath = `users/${_uid}/photos/${folder}/${fileName}`;

  console.log("[Photos] Upload start:", fileName);

  const reader = new FileReader();
  reader.onload = function(e) {
    compressImage(e.target.result, 1200, 0.75, async function(compressedDataUrl) {
      try {
        const blob = dataUrlToBlob(compressedDataUrl);
        const storageRef = _storage.ref(storagePath);
        await storageRef.put(blob);
        const url = await storageRef.getDownloadURL();
        console.log("[Photos] Upload success:", url);

        await _db
          .collection("users").doc(_uid)
          .collection("photos")
          .add({
            name: file.name,
            url: url,
            folder: folder,
            album: getCurrentAlbum(),
            storagePath: storagePath,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        console.log("[Photos] Firestore save success");

        const input = document.getElementById("photoInput");
        if (input) input.value = "";

        await loadPhotos();
      } catch (err) {
        console.error("[Photos] Upload failed:", err);
        alert("Photo upload failed. Please try again.");
      }
    });
  };
  reader.readAsDataURL(file);
}

async function deletePhoto(docId) {
  if (!_db || !_uid) return;
  try {
    const docRef = _db.collection("users").doc(_uid).collection("photos").doc(docId);
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      if (data.storagePath && _storage) {
        try {
          await _storage.ref(data.storagePath).delete();
        } catch (storageErr) {
          console.warn("[Photos] Storage delete failed:", storageErr);
        }
      }
      await docRef.delete();
    }
    await loadPhotos();
  } catch (err) {
    console.error("[Photos] Delete failed:", err);
  }
}

async function movePhoto(docId, newFolder) {
  if (!_db || !_uid) return;
  try {
    await _db
      .collection("users").doc(_uid)
      .collection("photos").doc(docId)
      .update({ folder: newFolder });
    await loadPhotos();
  } catch (err) {
    console.error("[Photos] Move failed:", err);
  }
}

async function loadPhotos() {
  if (!_db || !_uid) return;
  try {
    const snapshot = await _db
      .collection("users").doc(_uid)
      .collection("photos")
      .orderBy("createdAt", "desc")
      .get();
    _firestorePhotos = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
    console.log("[Photos] Load results count:", _firestorePhotos.length);
    renderPhotos();
  } catch (err) {
    if (err.code === "failed-precondition") {
      console.error("[Photos] Missing Firestore index. Visit the Firebase console to create an index on 'photos.createdAt'.", err);
    } else {
      console.error("[Photos] Load failed:", err);
    }
  }
}

function shortenFileName(name, max = 28) {
  if (!name) return "Untitled image";
  if (name.length <= max) return name;
  const extIndex = name.lastIndexOf(".");
  if (extIndex === -1) return name.slice(0, max) + "...";
  const ext = name.slice(extIndex);
  const base = name.slice(0, extIndex);
  const baseMax = max - ext.length - 3;
  if (baseMax <= 0) return name.slice(0, max) + "...";
  return base.slice(0, baseMax) + "..." + ext;
}

function renderPhotos() {
  const list = document.getElementById("photoList");
  if (!list) return;

  const currentFolder = getCurrentFolder();
  const selectedAlbum = getCurrentAlbum();
  let items = _firestorePhotos.filter(item => item.folder === currentFolder);

  if (selectedAlbum !== "") {
    items = items.filter(item => (item.album || "") === selectedAlbum);
  }

  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "photo-item";
    li.dataset.search = (item.name || "").toLowerCase();
    li.innerHTML = `
      <div class="photo-card">
        <img src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.name)}" class="photo-preview">
        <div class="photo-meta">
          <div class="photo-title">${escapeHtml(shortenFileName(item.name))}</div>
          <div class="photo-subtitle">Folder: ${escapeHtml(item.folder || "General")}</div>
          <div class="photo-subtitle">Album: ${escapeHtml(item.album || "No Album")}</div>
        </div>
        <div class="photo-actions">
          <select onchange="movePhoto('${escapeAttribute(item.docId)}', this.value)">
            ${buildFolderOptions(item.folder)}
          </select>
          <select onchange="movePhotoToAlbum('${escapeAttribute(item.docId)}', this.value)">
            ${buildAlbumOptions(item.album || "", currentFolder)}
          </select>
          <button onclick="deletePhoto('${escapeAttribute(item.docId)}')">Delete</button>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Mail */
function addMail() {
  const input = document.getElementById("mailInput");
  if (!input) return;

  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_mail", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    text: value
  });

  setStoredData("bryantos_mail", items);
  input.value = "";
  renderMail();
}

function deleteMail(id) {
  const items = getStoredData("bryantos_mail", []).filter(item => item.id !== id);
  setStoredData("bryantos_mail", items);
  renderMail();
}

function renderMail() {
  const list = document.getElementById("mailList");
  if (!list) return;

  const items = getFilteredItems("bryantos_mail");
  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>${escapeHtml(item.text)}</span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_mail', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="deleteMail(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Money */
function addMoney() {
  const descInput = document.getElementById("moneyDesc");
  const amountInput = document.getElementById("moneyAmount");
  if (!descInput || !amountInput) return;

  const desc = descInput.value.trim();
  const amount = amountInput.value.trim();
  if (!desc || !amount) return;

  const items = getStoredData("bryantos_money", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    desc,
    amount
  });

  setStoredData("bryantos_money", items);
  descInput.value = "";
  amountInput.value = "";
  renderMoney();
}

function deleteMoney(id) {
  const items = getStoredData("bryantos_money", []).filter(item => item.id !== id);
  setStoredData("bryantos_money", items);
  renderMoney();
}

function renderMoney() {
  const list = document.getElementById("moneyList");
  if (!list) return;

  const items = getFilteredItems("bryantos_money");
  list.innerHTML = "";

  items.forEach(item => {
    const isIncome = item.amount.trim().startsWith("+");
    const amountClass = isIncome ? "money-in" : "money-out";

    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>
        <strong>${escapeHtml(item.desc)}</strong> -
        <span class="${amountClass}">${escapeHtml(item.amount)}</span>
      </span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_money', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="deleteMoney(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Bills */
function addBill() {
  const input = document.getElementById("billInput");
  if (!input) return;

  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_bills", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    text: value,
    paid: false
  });

  setStoredData("bryantos_bills", items);
  input.value = "";
  renderBills();
}

function toggleBill(id) {
  const items = getStoredData("bryantos_bills", []);
  const updated = items.map(item => item.id === id ? { ...item, paid: !item.paid } : item);
  setStoredData("bryantos_bills", updated);
  renderBills();
}

function deleteBill(id) {
  const items = getStoredData("bryantos_bills", []).filter(item => item.id !== id);
  setStoredData("bryantos_bills", items);
  renderBills();
}

function renderBills() {
  const list = document.getElementById("billList");
  if (!list) return;

  const items = getFilteredItems("bryantos_bills");
  list.innerHTML = "";

  items.forEach(item => {
    const statusClass = item.paid ? "paid" : "unpaid";
    const statusText = item.paid ? "Paid" : "Unpaid";

    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>
        ${escapeHtml(item.text)} -
        <span class="${statusClass}">${statusText}</span>
      </span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_bills', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="toggleBill(${item.id})">Toggle</button>
        <button onclick="deleteBill(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Links */
function addLink() {
  const input = document.getElementById("linkInput");
  if (!input) return;

  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_links", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    text: value
  });

  setStoredData("bryantos_links", items);
  input.value = "";
  renderLinks();
}

function deleteLink(id) {
  const items = getStoredData("bryantos_links", []).filter(item => item.id !== id);
  setStoredData("bryantos_links", items);
  renderLinks();
}

function renderLinks() {
  const list = document.getElementById("linkList");
  if (!list) return;

  const items = getFilteredItems("bryantos_links");
  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-item";

    let content = escapeHtml(item.text);

    if (item.text.startsWith("http://") || item.text.startsWith("https://")) {
      content = `<a href="${escapeAttribute(item.text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>`;
    } else if (item.text.includes("@")) {
      content = `<a href="mailto:${escapeAttribute(item.text)}">${escapeHtml(item.text)}</a>`;
    }

    li.innerHTML = `
      <span>${content}</span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_links', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="deleteLink(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Vault encryption helpers ──────────────────────────────────────────────────── */

function _vaultGetSalt() {
  let salt = localStorage.getItem(VAULT_PIN_SALT_KEY);
  if (!salt) {
    salt = CryptoJS.lib.WordArray.random(16).toString();
    localStorage.setItem(VAULT_PIN_SALT_KEY, salt);
  }
  return salt;
}

function _vaultHashPin(pin) {
  return CryptoJS.PBKDF2(String(pin), _vaultGetSalt(), {
    keySize: 8, iterations: 600000
  }).toString();
}

function _encryptText(text, key) {
  return CryptoJS.AES.encrypt(String(text), String(key)).toString();
}

function _decryptText(ciphertext, key) {
  try {
    const bytes = CryptoJS.AES.decrypt(String(ciphertext), String(key));
    return bytes.toString(CryptoJS.enc.Utf8) || null;
  } catch {
    return null;
  }
}

function vaultHasPin() {
  return !!localStorage.getItem(VAULT_PIN_HASH_KEY);
}

function vaultIsUnlocked() {
  return _vaultPin !== null;
}

// CryptoJS AES.encrypt() output (OpenSSL format) always starts with this prefix
// (base64 of the "Salted__" + 8-byte salt header). Used to detect existing ciphertext.
function _isLikelyCiphertext(text) {
  return typeof text === "string" && text.startsWith("U2FsdGVkX1");
}

// Encrypt all existing vault entries in-place with the given PIN.
// Skips items that are already CryptoJS ciphertext to prevent double-encryption
// when localStorage is fresh but Firestore data was encrypted in a prior session.
function _vaultEncryptAll(pin) {
  const items = getStoredData("bryantos_codes", []);
  const encrypted = items.map(item => {
    if (_isLikelyCiphertext(item.text)) {
      console.log("[Vault] _vaultEncryptAll: item already encrypted, skipping id:", item.id);
      return item;
    }
    console.log("[Vault] _vaultEncryptAll: encrypting plaintext item id:", item.id);
    return { ...item, text: _encryptText(item.text, pin) };
  });
  setStoredData("bryantos_codes", encrypted);
  localStorage.setItem(VAULT_ENC_FLAG_KEY, "true");
}

// Re-encrypt all vault entries when changing PIN.
function _vaultReEncryptAll(oldPin, newPin) {
  const items = getStoredData("bryantos_codes", []);
  const reEncrypted = items.map(item => {
    const plain = _decryptText(item.text, oldPin) || item.text;
    return { ...item, text: _encryptText(plain, newPin) };
  });
  setStoredData("bryantos_codes", reEncrypted);
}

// Encode a PIN for sessionStorage (safe for any Unicode characters).
function _vaultEncodeSession(pin) {
  const bytes = new TextEncoder().encode(String(pin));
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// Decode a PIN from sessionStorage. Returns null on any error.
function _vaultDecodeSession(encoded) {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

// Set (or replace) the vault PIN and encrypt all entries.
function vaultSetNewPin(pin) {
  const wasEncrypted = localStorage.getItem(VAULT_ENC_FLAG_KEY) === "true";
  if (wasEncrypted && _vaultPin) {
    _vaultReEncryptAll(_vaultPin, pin);
  } else if (!wasEncrypted) {
    _vaultEncryptAll(pin);
  }
  localStorage.setItem(VAULT_PIN_HASH_KEY, _vaultHashPin(pin));
  _vaultPin = pin;
  sessionStorage.setItem("vault_sess", _vaultEncodeSession(pin));
  // Immediately sync hash/salt/flag to Firestore so they are available on the
  // next fresh-localStorage load (e.g. new device, cleared storage, private window).
  scheduleSyncToFirestore();
}

// Try to unlock the vault with the given PIN. Returns true on success.
function vaultUnlock(pin) {
  if (!vaultHasPin()) {
    vaultSetNewPin(pin);
    return true;
  }
  if (_vaultHashPin(pin) === localStorage.getItem(VAULT_PIN_HASH_KEY)) {
    _vaultPin = pin;
    sessionStorage.setItem("vault_sess", _vaultEncodeSession(pin));
    return true;
  }
  return false;
}

// Lock the vault — clears in-memory PIN, clears session, and shows the lock overlay.
function vaultLock() {
  _vaultPin = null;
  sessionStorage.removeItem("vault_sess");
  console.log("[Vault] Vault locked, session cleared");
  _showVaultLockUI();
}

/* Vault UI helpers ───────────────────────────────────────────────────────────── */

function _showVaultLockUI() {
  const lockEl    = document.getElementById("vaultLock");
  const contentEl = document.getElementById("vaultContent");
  if (!lockEl || !contentEl) return;

  lockEl.hidden    = false;
  contentEl.hidden = true;

  const hasPin     = vaultHasPin();
  const titleEl    = document.getElementById("vaultLockTitle");
  const subtitleEl = document.getElementById("vaultLockSubtitle");
  const confirmEl  = document.getElementById("vaultPinConfirm");
  const pinEl      = document.getElementById("vaultPinInput");
  const errorEl    = document.getElementById("vaultPinError");
  const bioBtn     = document.getElementById("vaultBioBtn");

  if (titleEl)    titleEl.textContent    = hasPin ? "Vault Locked"          : "Set Your Vault PIN";
  if (subtitleEl) subtitleEl.textContent = hasPin ? "Enter your PIN to unlock." : "Create a PIN to protect your vault.";
  if (confirmEl)  confirmEl.hidden       = hasPin;
  if (pinEl)      pinEl.value            = "";
  if (confirmEl)  confirmEl.value        = "";
  if (errorEl)    errorEl.textContent    = "";
  if (pinEl)      pinEl.focus();

  if (bioBtn) {
    const credId = localStorage.getItem(VAULT_WA_CRED_KEY);
    bioBtn.hidden = !(window.PublicKeyCredential && credId);
  }
}

function _showVaultContentUI() {
  const lockEl    = document.getElementById("vaultLock");
  const contentEl = document.getElementById("vaultContent");
  if (!lockEl || !contentEl) return;

  lockEl.hidden    = true;
  contentEl.hidden = false;

  // Show biometrics registration prompt if WebAuthn is available and not yet set up.
  const bioRegWrap = document.getElementById("vaultBioRegWrap");
  if (bioRegWrap) {
    const hasCred = !!localStorage.getItem(VAULT_WA_CRED_KEY);
    bioRegWrap.hidden = !(window.PublicKeyCredential && !hasCred);
  }

  renderCodes();
}

// Called by the "Unlock" button and PIN inputs' Enter key.
function vaultSubmitPin() {
  const pinEl     = document.getElementById("vaultPinInput");
  const confirmEl = document.getElementById("vaultPinConfirm");
  const errorEl   = document.getElementById("vaultPinError");
  const pin = pinEl ? pinEl.value.trim() : "";

  console.log("[Vault] Unlock clicked, _vaultPin before:", _vaultPin !== null, "vaultHasPin:", vaultHasPin());

  if (errorEl) errorEl.textContent = "";
  if (!pin) {
    if (errorEl) errorEl.textContent = "Please enter a PIN.";
    return;
  }

  if (!vaultHasPin()) {
    // First-time setup — require confirmation.
    const confirm = confirmEl ? confirmEl.value.trim() : "";
    if (pin !== confirm) {
      if (errorEl) errorEl.textContent = "PINs do not match.";
      return;
    }
    console.log("[Vault] First-time PIN setup, encrypt PIN present:", !!pin);
    vaultSetNewPin(pin);
    console.log("[Vault] Vault PIN set, _vaultPin present:", _vaultPin !== null);
    _showVaultContentUI();
    return;
  }

  console.log("[Vault] Verifying PIN, _vaultPin will be set on success");
  if (vaultUnlock(pin)) {
    console.log("[Vault] Unlock succeeded, _vaultPin present:", _vaultPin !== null);
    _showVaultContentUI();
  } else {
    console.warn("[Vault] Unlock failed — wrong PIN");
    if (errorEl) errorEl.textContent = "Wrong PIN. Try again.";
    if (pinEl)   pinEl.value = "";
  }
}

/* WebAuthn biometric helpers ─────────────────────────────────────────────────── */

// Convert a WordArray to a Uint8Array.
function _wordArrayToUint8(wordArray) {
  const words = wordArray.words;
  const len   = wordArray.sigBytes;
  const u8    = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8;
}

// Register a WebAuthn credential to allow biometric vault unlock.
async function vaultRegisterBiometric() {
  if (!window.PublicKeyCredential) {
    alert("Biometrics are not supported on this device or browser.");
    return;
  }
  try {
    const challenge = _wordArrayToUint8(CryptoJS.lib.WordArray.random(32));
    const userId    = _wordArrayToUint8(CryptoJS.lib.WordArray.random(16));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "BryantOS Vault", id: location.hostname },
        user: { id: userId, name: "vault", displayName: "BryantOS Vault" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7   },   // ES256
          { type: "public-key", alg: -257 }    // RS256
        ],
        authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
        timeout: 60000
      }
    });

    const credIdB64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    localStorage.setItem(VAULT_WA_CRED_KEY, credIdB64);

    // Encrypt the session PIN with the credential ID so it can be recovered after
    // a successful biometric assertion (credential ID is the decryption gate).
    const sess = sessionStorage.getItem("vault_sess");
    if (sess) {
      localStorage.setItem(VAULT_WA_PIN_KEY, _encryptText(sess, credIdB64));
    }

    const bioRegWrap = document.getElementById("vaultBioRegWrap");
    if (bioRegWrap) bioRegWrap.hidden = true;

    alert("Biometrics enabled! You can now use your fingerprint or face to unlock the vault.");
  } catch (err) {
    if (err.name !== "NotAllowedError") {
      console.error("WebAuthn registration failed:", err);
      alert("Biometric setup failed: " + err.message);
    }
  }
}

// Authenticate with a registered WebAuthn credential to unlock the vault.
async function vaultBiometricAuth() {
  if (!window.PublicKeyCredential) return;
  const credIdB64 = localStorage.getItem(VAULT_WA_CRED_KEY);
  if (!credIdB64) return;

  const errorEl = document.getElementById("vaultPinError");
  try {
    const challenge  = _wordArrayToUint8(CryptoJS.lib.WordArray.random(32));
    const credIdBytes = Uint8Array.from(atob(credIdB64).split("").map(c => c.charCodeAt(0)));

    await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: credIdBytes }],
        userVerification: "required",
        timeout: 60000
      }
    });

    // WebAuthn assertion succeeded — recover the PIN.
    const encPin = localStorage.getItem(VAULT_WA_PIN_KEY);
    if (!encPin) {
      if (errorEl) errorEl.textContent = "Biometric data not found. Please use your PIN.";
      return;
    }
    const sessPinB64 = _decryptText(encPin, credIdB64);
    if (!sessPinB64) {
      if (errorEl) errorEl.textContent = "Could not recover credentials. Please use your PIN.";
      return;
    }
    const pin = _vaultDecodeSession(sessPinB64);
    if (!pin) {
      if (errorEl) errorEl.textContent = "Could not decode credentials. Please use your PIN.";
      return;
    }
    if (vaultUnlock(pin)) {
      _showVaultContentUI();
    } else {
      if (errorEl) errorEl.textContent = "Biometric key is invalid. Please use your PIN.";
    }
  } catch (err) {
    if (err.name !== "NotAllowedError") {
      console.error("WebAuthn auth failed:", err);
      if (errorEl) errorEl.textContent = "Biometric authentication failed. Please use your PIN.";
    }
  }
}

/* Vault */
function addCode() {
  const input = document.getElementById("codeInput");
  if (!input || !vaultIsUnlocked()) return;

  const value = input.value.trim();
  if (!value) return;

  console.log("[Vault] addCode: encrypt PIN present:", _vaultPin !== null);

  const items = getStoredData("bryantos_codes", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    text: _encryptText(value, _vaultPin)
  });

  setStoredData("bryantos_codes", items);
  input.value = "";
  renderCodes();
}

function deleteCode(id) {
  const items = getStoredData("bryantos_codes", []).filter(item => item.id !== id);
  setStoredData("bryantos_codes", items);
  renderCodes();
}

function renderCodes() {
  const list = document.getElementById("codeList");
  const isUnlocked = vaultIsUnlocked();
  console.log("[Vault] renderCodes called, unlocked:", isUnlocked, "_vaultPin present:", _vaultPin !== null);

  if (!list) return;

  if (!isUnlocked) {
    console.log("[Vault] renderCodes: vault is locked — clearing list, no values rendered");
    list.innerHTML = "";
    return;
  }

  const items = getFilteredItems("bryantos_codes");
  list.innerHTML = "";

  items.forEach(item => {
    console.log("[Vault] decrypt PIN present:", _vaultPin !== null);
    let decrypted = _decryptText(item.text, _vaultPin);
    // If the first decrypt returns something that still looks like ciphertext,
    // the item was double-encrypted — decrypt again to recover the plaintext.
    if (decrypted && _isLikelyCiphertext(decrypted)) {
      console.log("[Vault] item appears double-encrypted — running second decrypt pass, item id:", item.id);
      const secondPass = _decryptText(decrypted, _vaultPin);
      if (secondPass && secondPass.trim()) {
        decrypted = secondPass;
      }
    }
    const displayed = (decrypted && decrypted.trim() !== "") ? decrypted : "Unable to decrypt";
    if (displayed === "Unable to decrypt") {
      console.warn("[Vault] item decryption failed — showing placeholder, item id:", item.id);
    } else {
      console.log("[Vault] item rendered as decrypted");
    }
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>${escapeHtml(displayed)}</span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_codes', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="deleteCode(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Calendar */
function addEvent() {
  const dateInput = document.getElementById("dateInput");
  const eventInput = document.getElementById("eventInput");
  if (!dateInput || !eventInput) return;

  const date = dateInput.value;
  const text = eventInput.value.trim();
  if (!date || !text) return;

  const items = getStoredData("bryantos_events", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    date,
    text
  });

  setStoredData("bryantos_events", items);
  dateInput.value = "";
  eventInput.value = "";
  renderEvents();
}

function deleteEvent(id) {
  const items = getStoredData("bryantos_events", []).filter(item => item.id !== id);
  setStoredData("bryantos_events", items);
  renderEvents();
}

function renderEvents() {
  const list = document.getElementById("eventList");
  if (!list) return;

  const items = getFilteredItems("bryantos_events");
  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span><strong>${escapeHtml(item.date)}</strong> - ${escapeHtml(item.text)}</span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_events', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="deleteEvent(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

/* Contacts */
function addContact() {
  const nameInput = document.getElementById("contactName");
  const numberInput = document.getElementById("contactNumber");
  if (!nameInput || !numberInput) return;

  const name = nameInput.value.trim();
  const number = numberInput.value.trim();
  if (!name || !number) return;

  const items = getStoredData("bryantos_contacts", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    name,
    number
  });

  setStoredData("bryantos_contacts", items);
  nameInput.value = "";
  numberInput.value = "";
  renderContacts();
}

function deleteContact(id) {
  const items = getStoredData("bryantos_contacts", []).filter(item => item.id !== id);
  setStoredData("bryantos_contacts", items);
  renderContacts();
}

function renderContacts() {
  const list = document.getElementById("contactList");
  if (!list) return;

  const items = getFilteredItems("bryantos_contacts");
  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>
        <strong>${escapeHtml(item.name)}</strong> -
        <a href="tel:${escapeAttribute(item.number)}">${escapeHtml(item.number)}</a>
      </span>
      <div class="list-actions">
        <select onchange="moveItem('bryantos_contacts', ${item.id}, this.value)">
          ${buildFolderOptions(item.folder)}
        </select>
        <button onclick="deleteContact(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return String(value).replaceAll('"', "&quot;");
}

document.addEventListener("DOMContentLoaded", function() {
  const auth = firebase.auth();

  auth.onAuthStateChanged(async function(user) {
    if (!user) {
      window.location.href = "signin.html";
      return;
    }

    _db       = firebase.firestore();
    _storage  = firebase.storage();
    _uid      = user.uid;

    // Pull latest data from Firestore into localStorage, then render
    await loadFromFirestore();

    // ── Vault state debug log ──────────────────────────────────────────────────
    const _sessRaw = sessionStorage.getItem("vault_sess");
    console.log("[Vault] Page load — vaultHasPin:", vaultHasPin(),
      "sessionStorage vault_sess:", _sessRaw ? "present" : "absent",
      "_vaultPin present:", _vaultPin !== null);

    // Restore vault PIN from session so items render without re-entering PIN.
    if (_sessRaw && vaultHasPin()) {
      try {
        const _restoredPin = _vaultDecodeSession(_sessRaw);
        if (!_restoredPin) {
          console.warn("[Vault] Session PIN decode failed — session data malformed");
        } else if (_vaultHashPin(_restoredPin) === localStorage.getItem(VAULT_PIN_HASH_KEY)) {
          _vaultPin = _restoredPin;
          console.log("[Vault] Session PIN restored successfully — _vaultPin present:", _vaultPin !== null);
        } else {
          console.warn("[Vault] Session PIN hash mismatch — PIN not restored");
        }
      } catch (e) {
        console.warn("[Vault] Failed to restore session PIN:", e.message);
      }
    } else {
      console.log("[Vault] Session PIN NOT restored —",
        _sessRaw ? "no stored hash (vaultHasPin=false)" : "no session PIN in sessionStorage");
    }

    renderFolderDropdown();
    updateFolderLabels();
    applyFolderColor();
    loadNotes();
    await loadPhotos();
    renderAlbumFilter();
    renderMail();
    renderMoney();
    renderBills();
    renderLinks();
    renderCodes();
    renderEvents();
    renderContacts();
    runSearch();

    // If the vault section is active and the PIN was restored from the session,
    // show vault content immediately (fixes the async-load race condition where
    // the user navigated to the vault section before this callback completed).
    if (_vaultPin) {
      const codesSection = document.getElementById("codes");
      if (codesSection && codesSection.classList.contains("active")) {
        console.log("[Vault] Vault section active on load with restored PIN — showing content");
        _showVaultContentUI();
      }
    }
  });
});
