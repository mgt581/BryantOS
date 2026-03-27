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

function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");
  sections.forEach((section) => section.classList.remove("active"));

  const selectedSection = document.getElementById(sectionId);
  if (selectedSection) {
    selectedSection.classList.add("active");
  }
}

function getStoredData(key, fallback = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (error) {
    console.error(`Error reading ${key}:`, error);
    return fallback;
  }
}

function setStoredData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
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
}

function renderFolderDropdown() {
  const select = document.getElementById("folderSelect");
  if (!select) return;

  const folders = getFolders();
  const currentFolder = getCurrentFolder();

  select.innerHTML = folders
    .map((folder) => `<option value="${escapeAttribute(folder)}">${escapeHtml(folder)}</option>`)
    .join("");

  select.value = currentFolder;
}

function updateFolderLabels() {
  const currentFolder = getCurrentFolder();
  const labelIds = [
    "notesFolderLabel",
    "mailFolderLabel",
    "moneyFolderLabel",
    "billsFolderLabel",
    "linksFolderLabel",
    "codesFolderLabel",
    "calendarFolderLabel",
    "contactsFolderLabel"
  ];

  labelIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentFolder;
  });
}

function addFolder() {
  const input = document.getElementById("newFolderInput");
  const name = input.value.trim();

  if (!name) {
    alert("Enter a folder name.");
    return;
  }

  const folders = getFolders();

  if (folders.some((folder) => folder.toLowerCase() === name.toLowerCase())) {
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

  const updatedFolders = folders.filter((folder) => folder !== currentFolder);
  setStoredData(FOLDERS_KEY, updatedFolders);

  deleteItemsForFolder("bryantos_mail", currentFolder);
  deleteItemsForFolder("bryantos_money", currentFolder);
  deleteItemsForFolder("bryantos_bills", currentFolder);
  deleteItemsForFolder("bryantos_links", currentFolder);
  deleteItemsForFolder("bryantos_codes", currentFolder);
  deleteItemsForFolder("bryantos_events", currentFolder);
  deleteItemsForFolder("bryantos_contacts", currentFolder);
  localStorage.removeItem(getNotesKey(currentFolder));

  const nextFolder = updatedFolders[0] || DEFAULT_FOLDERS[0];
  setCurrentFolder(nextFolder);

  refreshFolderState();
}

function deleteItemsForFolder(storageKey, folderName) {
  const items = getStoredData(storageKey, []).filter((item) => item.folder !== folderName);
  setStoredData(storageKey, items);
}

function refreshFolderState() {
  renderFolderDropdown();
  updateFolderLabels();
  loadNotes();
  renderMail();
  renderMoney();
  renderBills();
  renderLinks();
  renderCodes();
  renderEvents();
  renderContacts();
}

function getNotesKey(folderName) {
  return `bryantos_notes_${folderName}`;
}

function getFilteredItems(key) {
  const currentFolder = getCurrentFolder();
  return getStoredData(key, []).filter((item) => item.folder === currentFolder);
}

function saveNotes() {
  const notesInput = document.getElementById("notesInput");
  const value = notesInput.value.trim();
  const currentFolder = getCurrentFolder();
  localStorage.setItem(getNotesKey(currentFolder), value);
  alert(`Notes saved in ${currentFolder}.`);
}

function loadNotes() {
  const currentFolder = getCurrentFolder();
  const savedNotes = localStorage.getItem(getNotesKey(currentFolder)) || "";
  const notesInput = document.getElementById("notesInput");
  if (notesInput) {
    notesInput.value = savedNotes;
  }
}

function addMail() {
  const input = document.getElementById("mailInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_mail");
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
  const items = getStoredData("bryantos_mail").filter((item) => item.id !== id);
  setStoredData("bryantos_mail", items);
  renderMail();
}

function renderMail() {
  const list = document.getElementById("mailList");
  const items = getFilteredItems("bryantos_mail");

  list.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>${escapeHtml(item.text)}</span>
      <button onclick="deleteMail(${item.id})">Delete</button>
    `;
    list.appendChild(li);
  });
}

function addMoney() {
  const descInput = document.getElementById("moneyDesc");
  const amountInput = document.getElementById("moneyAmount");

  const desc = descInput.value.trim();
  const amount = amountInput.value.trim();

  if (!desc || !amount) return;

  const items = getStoredData("bryantos_money");
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
  const items = getStoredData("bryantos_money").filter((item) => item.id !== id);
  setStoredData("bryantos_money", items);
  renderMoney();
}

function renderMoney() {
  const list = document.getElementById("moneyList");
  const items = getFilteredItems("bryantos_money");

  list.innerHTML = "";

  items.forEach((item) => {
    const isIncome = item.amount.trim().startsWith("+");
    const amountClass = isIncome ? "money-in" : "money-out";

    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>
        <strong>${escapeHtml(item.desc)}</strong> -
        <span class="${amountClass}">${escapeHtml(item.amount)}</span>
      </span>
      <button onclick="deleteMoney(${item.id})">Delete</button>
    `;
    list.appendChild(li);
  });
}

function addBill() {
  const input = document.getElementById("billInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_bills");
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
  const items = getStoredData("bryantos_bills");
  const updated = items.map((item) =>
    item.id === id ? { ...item, paid: !item.paid } : item
  );

  setStoredData("bryantos_bills", updated);
  renderBills();
}

function deleteBill(id) {
  const items = getStoredData("bryantos_bills").filter((item) => item.id !== id);
  setStoredData("bryantos_bills", items);
  renderBills();
}

function renderBills() {
  const list = document.getElementById("billList");
  const items = getFilteredItems("bryantos_bills");

  list.innerHTML = "";

  items.forEach((item) => {
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
        <button onclick="toggleBill(${item.id})">Toggle</button>
        <button onclick="deleteBill(${item.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function addLink() {
  const input = document.getElementById("linkInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_links");
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
  const items = getStoredData("bryantos_links").filter((item) => item.id !== id);
  setStoredData("bryantos_links", items);
  renderLinks();
}

function renderLinks() {
  const list = document.getElementById("linkList");
  const items = getFilteredItems("bryantos_links");

  list.innerHTML = "";

  items.forEach((item) => {
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
      <button onclick="deleteLink(${item.id})">Delete</button>
    `;
    list.appendChild(li);
  });
}

function addCode() {
  const input = document.getElementById("codeInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_codes");
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
  const items = getStoredData("bryantos_codes").filter((item) => item.id !== id);
  setStoredData("bryantos_codes", items);
  renderCodes();
}

function renderCodes() {
  const list = document.getElementById("codeList");
  const items = getFilteredItems("bryantos_codes");

  list.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>${escapeHtml(item.text)}</span>
      <button onclick="deleteCode(${item.id})">Delete</button>
    `;
    list.appendChild(li);
  });
}

function addEvent() {
  const dateInput = document.getElementById("dateInput");
  const eventInput = document.getElementById("eventInput");

  const date = dateInput.value;
  const text = eventInput.value.trim();

  if (!date || !text) return;

  const items = getStoredData("bryantos_events");
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
  const items = getStoredData("bryantos_events").filter((item) => item.id !== id);
  setStoredData("bryantos_events", items);
  renderEvents();
}

function renderEvents() {
  const list = document.getElementById("eventList");
  const items = getFilteredItems("bryantos_events");

  list.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span><strong>${escapeHtml(item.date)}</strong> - ${escapeHtml(item.text)}</span>
      <button onclick="deleteEvent(${item.id})">Delete</button>
    `;
    list.appendChild(li);
  });
}

function addContact() {
  const nameInput = document.getElementById("contactName");
  const numberInput = document.getElementById("contactNumber");

  const name = nameInput.value.trim();
  const number = numberInput.value.trim();

  if (!name || !number) return;

  const items = getStoredData("bryantos_contacts");
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
  const items = getStoredData("bryantos_contacts").filter((item) => item.id !== id);
  setStoredData("bryantos_contacts", items);
  renderContacts();
}

function renderContacts() {
  const list = document.getElementById("contactList");
  const items = getFilteredItems("bryantos_contacts");

  list.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <span>
        <strong>${escapeHtml(item.name)}</strong> -
        <a href="tel:${escapeAttribute(item.number)}">${escapeHtml(item.number)}</a>
      </span>
      <button onclick="deleteContact(${item.id})">Delete</button>
    `;
    list.appendChild(li);
  });
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

document.addEventListener("DOMContentLoaded", () => {
  renderFolderDropdown();
  updateFolderLabels();
  loadNotes();
  renderMail();
  renderMoney();
  renderBills();
  renderLinks();
  renderCodes();
  renderEvents();
  renderContacts();
});
