function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");
  sections.forEach((section) => section.classList.remove("active"));

  const selectedSection = document.getElementById(sectionId);
  if (selectedSection) {
    selectedSection.classList.add("active");
  }
}

/* -------------------------
   Local storage helpers
------------------------- */
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

/* -------------------------
   Notes
------------------------- */
function saveNotes() {
  const notesInput = document.getElementById("notesInput");
  const value = notesInput.value.trim();
  localStorage.setItem("bryantos_notes", value);
  alert("Notes saved.");
}

function loadNotes() {
  const savedNotes = localStorage.getItem("bryantos_notes") || "";
  const notesInput = document.getElementById("notesInput");
  if (notesInput) {
    notesInput.value = savedNotes;
  }
}

/* -------------------------
   Inbox Vault
------------------------- */
function addMail() {
  const input = document.getElementById("mailInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_mail");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_mail");

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

/* -------------------------
   Money Tracker
------------------------- */
function addMoney() {
  const descInput = document.getElementById("moneyDesc");
  const amountInput = document.getElementById("moneyAmount");

  const desc = descInput.value.trim();
  const amount = amountInput.value.trim();

  if (!desc || !amount) return;

  const items = getStoredData("bryantos_money");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_money");

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

/* -------------------------
   Bills
------------------------- */
function addBill() {
  const input = document.getElementById("billInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_bills");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_bills");

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

/* -------------------------
   Links
------------------------- */
function addLink() {
  const input = document.getElementById("linkInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_links");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_links");

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

/* -------------------------
   Vault
------------------------- */
function addCode() {
  const input = document.getElementById("codeInput");
  const value = input.value.trim();
  if (!value) return;

  const items = getStoredData("bryantos_codes");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_codes");

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

/* -------------------------
   Calendar
------------------------- */
function addEvent() {
  const dateInput = document.getElementById("dateInput");
  const eventInput = document.getElementById("eventInput");

  const date = dateInput.value;
  const text = eventInput.value.trim();

  if (!date || !text) return;

  const items = getStoredData("bryantos_events");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_events");

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

/* -------------------------
   Contacts
------------------------- */
function addContact() {
  const nameInput = document.getElementById("contactName");
  const numberInput = document.getElementById("contactNumber");

  const name = nameInput.value.trim();
  const number = numberInput.value.trim();

  if (!name || !number) return;

  const items = getStoredData("bryantos_contacts");
  items.unshift({
    id: Date.now(),
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
  const items = getStoredData("bryantos_contacts");

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

/* -------------------------
   Safety helpers
------------------------- */
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

/* -------------------------
   Init
------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadNotes();
  renderMail();
  renderMoney();
  renderBills();
  renderLinks();
  renderCodes();
  renderEvents();
  renderContacts();
});
