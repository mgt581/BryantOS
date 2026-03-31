import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ── Firebase state ───────────────────────────────────────────────────────────
let _uid = null;
let _saveTimer = null;
let _photoCache = [];

// Delay before flushing localStorage changes to Firestore.
const SYNC_DEBOUNCE_MS = 1500;

// Keys synced to Firestore (photos handled separately)
const SYNC_KEYS = [
  "bryantos_folders",
  "bryantos_current_folder",
  "bryantos_mail",
  "bryantos_money",
  "bryantos_bills",
  "bryantos_links",
  "bryantos_codes",
  "bryantos_events",
  "bryantos_contacts"
];

// ── App data ─────────────────────────────────────────────────────────────────
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

// ── Firestore sync helpers ──────────────────────────────────────────────────
async function loadFromFirestore() {
  if (!_uid) return;

  try {
    const ref = doc(db, "users", _uid, "data", "bryantos");
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
      const saved = snapshot.data();

      Object.entries(saved).forEach(([key, val]) => {
        localStorage.setItem(
          key,
          typeof val === "string" ? val : JSON.stringify(val)
        );
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
  if (!_uid) return;

  try {
    const data = {};

    SYNC_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }
    });

    getFolders().forEach(folder => {
      const key = getNotesKey(folder);
      const val = localStorage.getItem(key);
      if (val !== null) data[key] = val;
    });

    await setDoc(doc(db, "users", _uid, "data", "bryantos"), data, { merge: true });

    const banner = document.getElementById("syncError");
    if (banner) banner.hidden = true;
  } catch (err) {
    console.error("Firestore sync failed:", err);
    const banner = document.getElementById("syncError");
    if (banner) banner.hidden = false;
  }
}

async function loadPhotosFromFirestore() {
  if (!_uid) return;

  try {
    const snapshot = await getDocs(collection(db, "users", _uid, "photos"));

    _photoCache = snapshot.docs
      .map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (err) {
    console.error("Photo load failed:", err);
    _photoCache = [];
  }
}

// ── UI helpers ───────────────────────────────────────────────────────────────
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
  } catch (error) {
    console.error("Error saving", key, error);
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

async function deleteCurrentFolder() {
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

  const photoIdsToDelete = _photoCache
    .filter(item => item.folder === currentFolder)
    .map(item => item.id);

  for (const photoId of photoIdsToDelete) {
    try {
      await deleteDoc(doc(db, "users", _uid, "photos", String(photoId)));
    } catch (err) {
      console.error("Failed to delete photo from Firestore:", err);
    }
  }

  _photoCache = _photoCache.filter(item => item.folder !== currentFolder);

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

function getFilteredPhotos() {
  const currentFolder = getCurrentFolder();
  return _photoCache.filter(item => item.folder === currentFolder);
}

function buildFolderOptions(selectedFolder) {
  return getFolders()
    .map(folder => {
      const selected = folder === selectedFolder ? "selected" : "";
      return `<option value="${escapeAttribute(folder)}" ${selected}>${escapeHtml(folder)}</option>`;
    })
    .join("");
}

async function moveItem(storageKey, id, newFolder) {
  if (storageKey === "bryantos_photos") {
    const photoId = String(id);

    _photoCache = _photoCache.map(item =>
      String(item.id) === photoId ? { ...item, folder: newFolder } : item
    );

    try {
      await updateDoc(doc(db, "users", _uid, "photos", photoId), {
        folder: newFolder
      });
    } catch (err) {
      console.error("Failed to move photo:", err);
    }

    renderPhotos();
    return;
  }

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
    item.style.display = text.includes(query) ? "" : "none";
  });
}

// ── Notes ────────────────────────────────────────────────────────────────────
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

// ── Photos ───────────────────────────────────────────────────────────────────
async function addPhoto(event) {
  const file = event.target.files[0];
  if (!file || !_uid) return;

  const reader = new FileReader();

  reader.onload = async function (e) {
    const id = String(Date.now());

    const photo = {
      folder: getCurrentFolder(),
      name: file.name,
      data: e.target.result,
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, "users", _uid, "photos", id), photo);

      _photoCache.unshift({
        id,
        ...photo
      });

      const input = document.getElementById("photoInput");
      if (input) input.value = "";

      renderPhotos();
    } catch (err) {
      console.error("Photo save failed:", err);
      alert("Photo save failed.");
    }
  };

  reader.readAsDataURL(file);
}

async function deletePhoto(id) {
  const photoId = String(id);

  try {
    await deleteDoc(doc(db, "users", _uid, "photos", photoId));
    _photoCache = _photoCache.filter(item => String(item.id) !== photoId);
    renderPhotos();
  } catch (err) {
    console.error("Photo delete failed:", err);
  }
}

function renderPhotos() {
  const list = document.getElementById("photoList");
  if (!list) return;

  const items = getFilteredPhotos();
  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "photo-item";
    li.innerHTML = `
      <div class="photo-card">
        <img src="${item.data}" alt="${escapeAttribute(item.name)}" class="photo-preview">
        <div class="photo-meta">
          <span>${escapeHtml(item.name)}</span>
          <div class="list-actions">
            <select onchange="moveItem('bryantos_photos', '${escapeAttribute(item.id)}', this.value)">
              ${buildFolderOptions(item.folder)}
            </select>
            <button onclick="deletePhoto('${escapeAttribute(item.id)}')">Delete</button>
          </div>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  runSearch();
}

// ── Mail ─────────────────────────────────────────────────────────────────────
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

// ── Money ────────────────────────────────────────────────────────────────────
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

// ── Bills ────────────────────────────────────────────────────────────────────
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

// ── Links ────────────────────────────────────────────────────────────────────
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

// ── Vault ────────────────────────────────────────────────────────────────────
function addCode() {
  const input = document.getElementById("codeInput");
  if (!input) return;

  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_codes", []);
  items.unshift({
    id: Date.now(),
    folder: getCurrentFolder(),
    text: value
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
  if (!list) return;

  const items = getFilteredItems("bryantos_codes");
  list.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>${escapeHtml(item.text)}</span>
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

// ── Calendar ─────────────────────────────────────────────────────────────────
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

// ── Contacts ─────────────────────────────────────────────────────────────────
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
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();

  auth.onAuthStateChanged(async function(user) {
    if (!user) {
      window.location.href = "signin.html";
      return;
    }

    _db  = firebase.firestore();
    _uid = user.uid;

    // Pull latest data from Firestore into localStorage, then render
    await loadFromFirestore();

    renderFolderDropdown();
    updateFolderLabels();
    applyFolderColor();
    loadNotes();
    renderPhotos();
    renderMail();
    renderMoney();
    renderBills();
    renderLinks();
    renderCodes();
    renderEvents();
    renderContacts();
    runSearch();
  });
});
