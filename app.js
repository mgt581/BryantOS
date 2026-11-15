/* BryantOS app */
(function () {
  "use strict";

  /* ── Setup ─────────────────────────────────────────────────────────── */

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDq3rozlNMYVO_9sCAqfwmnzmk67x9wN7g",
    authDomain: "bryant0s.firebaseapp.com",
    projectId: "bryant0s",
    storageBucket: "bryant0s.firebasestorage.app",
    messagingSenderId: "1044948666675",
    appId: "1:1044948666675:web:d5fbefd399d7c082a85646"
  };

  // Demo mode: only on this computer (localhost), never on the live site.
  const DEMO = ["localhost", "127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).has("demo");

  const AUTO_LOCK_MS = 5 * 60 * 1000;
  const CLIPBOARD_CLEAR_MS = 30 * 1000;

  const K = {
    folders: "bryantos_folders",
    notes: "bryantos_notelist",
    links: "bryantos_links",
    mail: "bryantos_mail",
    money: "bryantos_money",
    bills: "bryantos_bills",
    events: "bryantos_events",
    contacts: "bryantos_contacts",
    albums: "bryantos_photo_albums",
    vault: "bryantos_vault2",
    vaultItems: "bryantos_vault2_items",
    oldCodes: "bryantos_codes",
    oldHash: "bryantos_vault_pin_hash",
    oldSalt: "bryantos_vault_pin_salt",
    oldFlag: "bryantos_vault_encrypted"
  };
  const OLD_LOCAL_KEYS = [K.folders, K.links, K.mail, K.money, K.bills, K.events, K.contacts, K.albums, K.oldCodes, K.oldHash, K.oldSalt, K.oldFlag];

  const DEFAULT_FOLDERS = ["Personal", "Bryant Digital", "Cleaning", "Construction", "AI Photo Studio", "MultiPost"];
  const FOLDER_COLORS = {
    "Personal": "#22c55e", "Bryant Digital": "#3b82f6", "Cleaning": "#f97316",
    "Construction": "#eab308", "AI Photo Studio": "#a855f7", "MultiPost": "#ec4899"
  };
  const EXTRA_COLORS = ["#14b8a6", "#f43f5e", "#84cc16", "#06b6d4", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981"];

  const VAULT_TYPES = ["Password", "API key", "PIN or code", "Recovery codes", "Card or account", "Other secret"];

  const S = {
    user: null,
    data: {},
    photos: [],
    loaded: false,
    section: "home",
    folder: "All",
    query: "",
    album: "",
    moreTab: "money",
    noteEdit: null,
    vaultKey: null,
    vaultItems: [],
    vaultForm: null,   // null | "new" | id
    vaultPrefill: "",
    shown: {},
    copied: null,
    lastActive: Date.now(),
    busy: false
  };

  let store = null;

  /* ── Helpers ───────────────────────────────────────────────────────── */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function h(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const list = (key) => (Array.isArray(S.data[key]) ? S.data[key] : []);
  const folders = () => {
    const f = S.data[K.folders];
    return Array.isArray(f) && f.length ? f : DEFAULT_FOLDERS;
  };
  function folderColor(name) {
    if (FOLDER_COLORS[name]) return FOLDER_COLORS[name];
    const i = Math.max(0, folders().indexOf(name));
    return EXTRA_COLORS[i % EXTRA_COLORS.length];
  }
  const dot = (f) => `<span class="dot" style="background:${h(folderColor(f))}"></span>`;
  const folderTag = (f) => `<span class="folder-tag">${dot(f)}${h(f || "No folder")}</span>`;
  const inFolder = (f) => S.folder === "All" || f === S.folder;
  const targetFolder = () => (S.folder === "All" ? folders()[0] : S.folder);
  const isUrl = (t) => /^https?:\/\/\S+$/i.test(String(t || "").trim());
  const isEmail = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t || "").trim());

  function folderOptions(selected) {
    return folders().map((f) => `<option value="${h(f)}"${f === selected ? " selected" : ""}>${h(f)}</option>`).join("");
  }

  function timeAgo(ms) {
    if (!ms) return "";
    const d = (Date.now() - ms) / 1000;
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d / 60) + " min ago";
    if (d < 86400) return Math.floor(d / 3600) + " h ago";
    if (d < 86400 * 7) return Math.floor(d / 86400) + " days ago";
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  const idTime = (id) => {
    const n = Number(id);
    if (!n) return 0;
    return n > 1e15 ? Math.floor(n / 1000) : n; // new ids carry extra digits
  };
  const photoTime = (p) => (p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : (p.createdMs || 0));

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function setSyncError(on) {
    const el = $("#syncError");
    if (el) el.hidden = !on;
  }

  /* ── Saving ────────────────────────────────────────────────────────── */

  function save(key, value) {
    S.data[key] = value;
    refresh();
    return store.save({ [key]: value }).then(() => setSyncError(false)).catch((err) => {
      console.error("Save failed", err);
      setSyncError(true);
    });
  }

  function saveMany(patch) {
    Object.assign(S.data, patch);
    refresh();
    return store.save(patch).then(() => setSyncError(false)).catch((err) => {
      console.error("Save failed", err);
      setSyncError(true);
    });
  }

  /* Firebase storage */
  function firebaseStore(uid) {
    const db = firebase.firestore();
    const ref = db.collection("users").doc(uid).collection("data").doc("bryantos");
    const photos = db.collection("users").doc(uid).collection("photos");
    const storage = firebase.storage();
    return {
      subscribe(cb) {
        ref.onSnapshot((snap) => { setSyncError(false); cb(snap.exists ? snap.data() : {}); }, (err) => { console.error(err); setSyncError(true); });
      },
      save(patch) { return ref.set(patch, { mergeFields: Object.keys(patch) }); },
      remove(keys) {
        const p = {};
        keys.forEach((k) => { p[k] = firebase.firestore.FieldValue.delete(); });
        return ref.set(p, { merge: true });
      },
      subscribePhotos(cb) {
        photos.orderBy("createdAt", "desc").onSnapshot(
          (snap) => cb(snap.docs.map((d) => ({ ...d.data(), docId: d.id }))),
          (err) => { console.error(err); }
        );
      },
      async uploadPhoto(blob, meta) {
        const safe = meta.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `users/${uid}/photos/${meta.folder}/${Date.now()}_${safe}`;
        const r = storage.ref(path);
        await r.put(blob, { contentType: blob.type });
        const url = await r.getDownloadURL();
        await photos.add({ ...meta, url, storagePath: path, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      },
      updatePhoto(id, patch) { return photos.doc(id).update(patch); },
      async deletePhoto(p) {
        if (p.storagePath) { try { await storage.ref(p.storagePath).delete(); } catch (e) { console.warn(e); } }
        await photos.doc(p.docId).delete();
      }
    };
  }

  /* Demo storage (this computer only, for testing the layout) */
  function demoStore() {
    const read = () => { try { return JSON.parse(localStorage.getItem("bryantos_demo") || "{}"); } catch (e) { return {}; } };
    const write = (d) => localStorage.setItem("bryantos_demo", JSON.stringify(d));
    let photoCb = () => {};
    let photos = [];
    return {
      subscribe(cb) { cb(read()); },
      save(patch) { write({ ...read(), ...JSON.parse(JSON.stringify(patch)) }); return Promise.resolve(); },
      remove(keys) { const d = read(); keys.forEach((k) => delete d[k]); write(d); return Promise.resolve(); },
      subscribePhotos(cb) { photoCb = cb; cb(photos); },
      uploadPhoto(blob, meta) {
        photos = [{ ...meta, url: URL.createObjectURL(blob), docId: String(newId()), createdMs: Date.now() }, ...photos];
        photoCb(photos);
        return Promise.resolve();
      },
      updatePhoto(id, patch) { photos = photos.map((p) => (p.docId === id ? { ...p, ...patch } : p)); photoCb(photos); return Promise.resolve(); },
      deletePhoto(p) { photos = photos.filter((x) => x.docId !== p.docId); photoCb(photos); return Promise.resolve(); }
    };
  }

  /* ── First load: bring old data along ──────────────────────────────── */

  let migrated = false;
  function migrateOnce() {
    if (migrated) return;
    migrated = true;
    const patch = {};

    // 1. Anything the old version only kept on this device.
    const oldVaultKeys = [K.oldCodes, K.oldHash, K.oldSalt, K.oldFlag];
    if (S.data[K.vault]) oldVaultKeys.forEach((k) => localStorage.removeItem(k));
    OLD_LOCAL_KEYS.forEach((key) => {
      if (S.data[key] !== undefined) return;
      if (S.data[K.vault] && oldVaultKeys.includes(key)) return;
      const raw = localStorage.getItem(key);
      if (raw === null || raw === "") return;
      try { patch[key] = JSON.parse(raw); } catch (e) { patch[key] = raw; }
    });
    const merged = { ...S.data, ...patch };

    // 2. Old notes were split into one list per folder. Combine them once.
    if (!Array.isArray(merged[K.notes])) {
      const byId = new Map();
      const sources = {};
      Object.keys(merged).forEach((k) => { if (k.startsWith("bryantos_notes_")) sources[k] = merged[k]; });
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("bryantos_notes_") && sources[k] === undefined) sources[k] = localStorage.getItem(k);
      }
      Object.keys(sources).forEach((k) => {
        const folder = k.slice("bryantos_notes_".length);
        parseOldNotes(sources[k], folder).forEach((n) => byId.set(String(n.id), n));
      });
      if (byId.size) {
        patch[K.notes] = Array.from(byId.values()).sort((a, b) => idTime(b.id) - idTime(a.id));
      }
    }

    if (Object.keys(patch).length) saveMany(patch);
  }

  function parseOldNotes(raw, folder) {
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (!Array.isArray(parsed)) {
        const t = String(raw).trim();
        return t ? [{ id: newId(), folder, text: t, createdAt: null }] : [];
      }
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n) => n && typeof n.text === "string" && n.text.trim())
      .map((n) => ({ id: n.id || newId(), folder: n.folder || folder, text: n.text, createdAt: n.createdAt || null }));
  }

  /* ── Rendering ─────────────────────────────────────────────────────── */

  // Whole section (forms + lists). Only called when the section changes, so
  // typing is never lost when new data arrives.
  function renderSection() {
    const view = $("#view");
    if (S.query) {
      view.innerHTML = `<div class="view"><div class="view-head"><h1>Search</h1></div><div data-list="search"></div></div>`;
    } else {
      view.innerHTML = (SECTIONS[S.section] || SECTIONS.home)();
    }
    $$(".nav-btn, .bottom-nav button").forEach((b) => b.classList.toggle("active", !S.query && b.dataset.sec === S.section));
    refresh();
  }

  // Lists, chips and labels. Safe to call any time.
  function refresh() {
    if (!S.loaded) return;
    renderChips();
    $$("[data-list]").forEach((el) => {
      const fn = LISTS[el.dataset.list];
      if (fn) el.innerHTML = fn();
    });
    $$("[data-vault-tag]").forEach((el) => {
      el.textContent = S.vaultKey ? "Open" : "Locked";
      el.classList.toggle("open", !!S.vaultKey);
    });
    const lockBtn = $("[data-lock-btn]");
    if (lockBtn) lockBtn.hidden = !S.vaultKey || (S.section === "vault" && !S.query);
  }

  function renderChips() {
    const show = !S.query && ["home", "notes", "photos", "links", "vault", "more"].includes(S.section) &&
      !(S.section === "vault" && !S.vaultKey);
    const el = $("#chips");
    el.hidden = !show;
    if (!show) return;
    el.innerHTML = ["All"].concat(folders()).map((f) =>
      `<button type="button" class="chip${S.folder === f ? " active" : ""}" data-act="folder" data-folder="${h(f)}" aria-pressed="${S.folder === f}">${f === "All" ? "" : dot(f)}${h(f)}</button>`
    ).join("");
  }

  const SECTIONS = {
    home() {
      const name = S.user && S.user.displayName ? S.user.displayName.split(" ")[0] : "";
      return `<div class="view">
        <div class="view-head"><h1>Hi${name ? " " + h(name) : ""}</h1></div>
        <form class="card" data-form="quick">
          <label for="quick" class="list-title">Save something quickly</label>
          <textarea id="quick" name="text" class="input" rows="3" placeholder="Type or paste anything — a note, a link, a code…"></textarea>
          <div class="row">
            <button type="submit" class="btn btn-soft" name="as" value="note">Save as note</button>
            <button type="submit" class="btn btn-soft" name="as" value="link">Save as link</button>
            <button type="submit" class="btn btn-soft" name="as" value="vault">Save to Vault</button>
            <label class="btn btn-soft upload-label">Add photo or document
              <input type="file" accept="image/*,application/pdf" multiple data-upload>
            </label>
          </div>
        </form>
        <div class="tiles" data-list="tiles"></div>
        <h2 class="sub">Recently added</h2>
        <div class="list" data-list="recent"></div>
      </div>`;
    },

    notes() {
      return `<div class="view">
        <div class="view-head"><h1>Notes</h1></div>
        <form class="card" data-form="note-add">
          <label for="note-text" class="list-title">New note</label>
          <textarea id="note-text" name="text" class="input" rows="4" placeholder="First line becomes the title…"></textarea>
          <div class="row"><button type="submit" class="btn btn-primary">Save note</button><span class="small" data-list="saveTo"></span></div>
        </form>
        <div class="notes-grid" data-list="notes"></div>
      </div>`;
    },

    photos() {
      return `<div class="view">
        <div class="view-head">
          <h1>Photos &amp; docs</h1>
          <label class="btn btn-primary upload-label">Upload
            <input type="file" accept="image/*,application/pdf" multiple data-upload>
          </label>
        </div>
        <div class="row">
          <span class="row" data-list="albums"></span>
          <form class="row" data-form="album-add">
            <label class="sr" for="album-new">New album name</label>
            <input id="album-new" name="name" class="input" style="min-height:38px;width:200px" placeholder="New album name">
            <button type="submit" class="btn btn-small btn-soft">Create album</button>
          </form>
        </div>
        <div data-list="photos"></div>
      </div>`;
    },

    links() {
      return `<div class="view">
        <div class="view-head"><h1>Links</h1></div>
        <form class="card" data-form="link-add">
          <div class="form-grid">
            <div class="field"><label for="link-url">Web address or email</label><input id="link-url" name="url" type="text" inputmode="url" placeholder="https://…" autocomplete="off"></div>
            <div class="field"><label for="link-title">Name <span class="small">(optional)</span></label><input id="link-title" name="title" type="text" placeholder="e.g. Cloudflare dashboard"></div>
          </div>
          <div class="row"><button type="submit" class="btn btn-primary">Save link</button><span class="small" data-list="saveTo"></span></div>
        </form>
        <div class="list" data-list="links"></div>
      </div>`;
    },

    vault() {
      return vaultView();
    },

    more() {
      return `<div class="view">
        <div class="view-head"><h1>Money, bills &amp; dates</h1></div>
        <div class="tabs" data-list="moreTabs"></div>
        <div data-more-form></div>
        <div data-list="moreList"></div>
      </div>`;
    },

    settings() {
      return `<div class="view">
        <div class="view-head"><h1>Settings &amp; folders</h1></div>
        <h2 class="sub">Folders</h2>
        <div class="list" data-list="folderRows"></div>
        <form class="row" data-form="folder-add">
          <label class="sr" for="folder-new">New folder name</label>
          <input id="folder-new" name="name" class="input" style="flex:1 1 220px" placeholder="New folder name">
          <button type="submit" class="btn btn-soft">Add folder</button>
        </form>
        <h2 class="sub">Vault security</h2>
        ${LISTS.security()}
        <h2 class="sub">Account</h2>
        <div class="card">
          <p data-list="account"></p>
          <div class="row"><button type="button" class="btn btn-danger" data-act="signout">Sign out</button></div>
        </div>
      </div>`;
    }
  };

  /* Lists */
  const notesInView = () => list(K.notes).filter((n) => inFolder(n.folder));
  const linksInView = () => list(K.links).filter((l) => inFolder(l.folder));
  const photosInView = () => S.photos.filter((p) => inFolder(p.folder) && (!S.album || (p.album || "") === S.album));
  const vaultInView = () => S.vaultItems.filter((v) => inFolder(v.folder));

  function noteParts(text) {
    const t = String(text || "").trim();
    const i = t.indexOf("\n");
    if (i === -1) return t.length > 70 ? { title: t.slice(0, 70) + "…", body: t } : { title: t, body: "" };
    return { title: t.slice(0, i).trim(), body: t.slice(i + 1).trim() };
  }

  function linkHtml(l) {
    const t = String(l.text || "").trim();
    if (isUrl(t)) return `<a href="${h(t)}" target="_blank" rel="noopener noreferrer">${h(t)}</a>`;
    if (isEmail(t)) return `<a href="mailto:${h(t)}">${h(t)}</a>`;
    return h(t);
  }
  function linkName(l) {
    if (l.title) return l.title;
    const t = String(l.text || "");
    try { return isUrl(t) ? new URL(t).hostname.replace(/^www\./, "") : t; } catch (e) { return t; }
  }

  const LISTS = {
    saveTo() { return `Saves to ${h(targetFolder())}${S.folder === "All" ? " (pick a folder above to change)" : ""}`; },

    tiles() {
      const vaultCount = S.vaultKey ? vaultInView().length : list(K.vaultItems).filter((v) => inFolder(v.folder)).length;
      const tile = (sec, n, label) => `<button type="button" class="tile" data-act="go" data-sec="${sec}"><span class="tile-num">${n}</span><span class="tile-label">${label}</span></button>`;
      return tile("notes", notesInView().length, "Notes") +
        tile("photos", S.photos.filter((p) => inFolder(p.folder)).length, "Photos &amp; docs") +
        tile("links", linksInView().length, "Links") +
        tile("vault", vaultCount, "Vault · " + (S.vaultKey ? "open" : "locked"));
    },

    recent() {
      const rows = []
        .concat(notesInView().map((n) => ({ kind: "Note", title: noteParts(n.text).title, folder: n.folder, t: idTime(n.id), sec: "notes" })))
        .concat(linksInView().map((l) => ({ kind: "Link", title: linkName(l), folder: l.folder, t: idTime(l.id), sec: "links" })))
        .concat(S.photos.filter((p) => inFolder(p.folder)).map((p) => ({ kind: "Photo", title: p.name, folder: p.folder, t: photoTime(p), sec: "photos" })))
        .sort((a, b) => b.t - a.t)
        .slice(0, 8);
      if (!rows.length) return `<div class="empty">Nothing here yet. Save something above.</div>`;
      return rows.map((r) => `<button type="button" class="list-row" style="width:100%;border-left:0;border-right:0;border-top:0;background:transparent;color:inherit;text-align:left" data-act="go" data-sec="${r.sec}">
          <span class="kind">${r.kind}</span>
          <span class="list-main"><span class="list-title">${h(r.title)}</span></span>
          ${folderTag(r.folder)}<span class="small">${h(timeAgo(r.t))}</span>
        </button>`).join("");
    },

    notes() {
      const items = notesInView();
      if (!items.length) return `<div class="list"><div class="empty">No notes${S.folder === "All" ? "" : " in " + h(S.folder)} yet.</div></div>`;
      return items.map((n) => {
        if (String(S.noteEdit) === String(n.id)) {
          return `<form class="note" data-form="note-save" data-id="${h(n.id)}">
            <label class="sr" for="edit-${h(n.id)}">Edit note</label>
            <textarea id="edit-${h(n.id)}" name="text" class="input" rows="6">${h(n.text)}</textarea>
            <div class="row"><button type="submit" class="btn btn-primary btn-small">Save</button><button type="button" class="btn btn-small" data-act="note-cancel">Cancel</button></div>
          </form>`;
        }
        const p = noteParts(n.text);
        return `<article class="note">
          <h3>${h(p.title)}</h3>
          ${p.body ? `<div class="note-body">${h(p.body)}</div>` : `<div class="note-body"></div>`}
          <div class="note-foot">
            <span class="small">${folderTag(n.folder)} · ${h(timeAgo(n.createdAt ? Date.parse(n.createdAt) : idTime(n.id)))}</span>
            <span class="list-actions">
              <button type="button" class="btn btn-small" data-act="note-edit" data-id="${h(n.id)}">Edit</button>
              <label class="sr" for="mv-${h(n.id)}">Move to folder</label>
              <select id="mv-${h(n.id)}" class="select-small" data-change="move" data-key="${K.notes}" data-id="${h(n.id)}">${folderOptions(n.folder)}</select>
              <button type="button" class="btn btn-small btn-danger" data-act="del" data-key="${K.notes}" data-id="${h(n.id)}" aria-label="Delete note">Delete</button>
            </span>
          </div>
        </article>`;
      }).join("");
    },

    links() {
      const items = linksInView();
      if (!items.length) return `<div class="empty">No links${S.folder === "All" ? "" : " in " + h(S.folder)} yet.</div>`;
      return items.map((l) => {
        const t = String(l.text || "").trim();
        const open = isUrl(t) ? `<a class="btn btn-small btn-soft" href="${h(t)}" target="_blank" rel="noopener noreferrer">Open</a>` : "";
        return `<div class="list-row">
          <div class="letter">${h(linkName(l).charAt(0) || "?")}</div>
          <div class="list-main"><span class="list-title">${h(linkName(l))}</span><span class="list-sub">${linkHtml(l)}</span></div>
          ${folderTag(l.folder)}
          <div class="list-actions">
            ${open}
            <button type="button" class="btn btn-small" data-act="copy-text" data-text="${h(t)}">Copy</button>
            <label class="sr" for="mvl-${h(l.id)}">Move to folder</label>
            <select id="mvl-${h(l.id)}" class="select-small" data-change="move" data-key="${K.links}" data-id="${h(l.id)}">${folderOptions(l.folder)}</select>
            <button type="button" class="btn btn-small btn-danger" data-act="del" data-key="${K.links}" data-id="${h(l.id)}">Delete</button>
          </div>
        </div>`;
      }).join("");
    },

    albums() {
      const all = S.data[K.albums] && typeof S.data[K.albums] === "object" ? S.data[K.albums] : {};
      const names = S.folder === "All"
        ? Array.from(new Set([].concat(...Object.values(all).filter(Array.isArray))))
        : (Array.isArray(all[S.folder]) ? all[S.folder] : []);
      if (S.album && !names.includes(S.album)) S.album = "";
      const opts = [`<option value="">All albums</option>`].concat(names.map((a) => `<option value="${h(a)}"${a === S.album ? " selected" : ""}>${h(a)}</option>`)).join("");
      return `<label for="album-filter" class="small">Album</label>
        <select id="album-filter" class="select-small" data-change="album">${opts}</select>
        <span class="small">Uploads go to ${h(targetFolder())}${S.album ? " · " + h(S.album) : ""}</span>`;
    },

    photos() {
      const items = photosInView();
      if (!items.length) return `<div class="list"><div class="empty">No photos or documents here yet.</div></div>`;
      return `<div class="photo-grid">` + items.map((p) => {
        const isPdf = /pdf/i.test(p.type || "") || /\.pdf$/i.test(p.name || "");
        const thumb = isPdf
          ? `<a class="photo-file" href="${h(p.url)}" target="_blank" rel="noopener noreferrer">PDF</a>`
          : `<a class="photo-img" href="${h(p.url)}" target="_blank" rel="noopener noreferrer"><img src="${h(p.url)}" alt="${h(p.name)}" loading="lazy"></a>`;
        return `<figure class="photo">${thumb}
          <figcaption>
            <span class="photo-name" title="${h(p.name)}">${h(p.name || "Untitled")}</span>
            ${folderTag(p.folder)}
            <div class="row">
              <label class="sr" for="pf-${h(p.docId)}">Folder</label>
              <select id="pf-${h(p.docId)}" class="select-small" data-change="photo-folder" data-id="${h(p.docId)}">${folderOptions(p.folder)}</select>
              <button type="button" class="btn btn-small btn-danger" data-act="photo-del" data-id="${h(p.docId)}">Delete</button>
            </div>
          </figcaption>
        </figure>`;
      }).join("") + `</div>`;
    },

    vaultList() { return vaultListHtml(); },

    moreTabs() {
      return Object.keys(MORE).map((k) => `<button type="button" class="chip${S.moreTab === k ? " active" : ""}" data-act="more-tab" data-tab="${k}" aria-pressed="${S.moreTab === k}">${MORE[k].label}</button>`).join("");
    },
    moreList() {
      const cfg = MORE[S.moreTab];
      const items = list(cfg.key).filter((i) => inFolder(i.folder));
      let summary = "";
      if (S.moreTab === "money") {
        const total = items.reduce((sum, i) => sum + (parseFloat(String(i.amount).replace(/[^0-9.+-]/g, "")) || 0), 0);
        summary = `<p class="small" style="margin-bottom:8px">Total: <span class="${total < 0 ? "amount-neg" : "amount-pos"}">${total < 0 ? "-" : ""}£${Math.abs(total).toFixed(2)}</span></p>`;
      }
      const sorted = S.moreTab === "events" ? items.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))) : items;
      if (!sorted.length) return summary + `<div class="list"><div class="empty">Nothing here yet.</div></div>`;
      return summary + `<div class="list">` + sorted.map((i) => `<div class="list-row${i.paid ? " paid" : ""}">
          <div class="list-main">${cfg.row(i)}</div>
          ${folderTag(i.folder)}
          <div class="list-actions">
            ${S.moreTab === "bills" ? `<button type="button" class="btn btn-small" data-act="bill-paid" data-id="${h(i.id)}">${i.paid ? "Not paid" : "Mark paid"}</button>` : ""}
            <button type="button" class="btn btn-small btn-danger" data-act="del" data-key="${cfg.key}" data-id="${h(i.id)}">Delete</button>
          </div>
        </div>`).join("") + `</div>`;
    },

    folderRows() {
      return folders().map((f) => `<div class="list-row">
          ${dot(f)}<span class="list-main"><span class="list-title">${h(f)}</span></span>
          <div class="list-actions">
            <button type="button" class="btn btn-small" data-act="folder-rename" data-folder="${h(f)}">Rename</button>
            <button type="button" class="btn btn-small btn-danger" data-act="folder-del" data-folder="${h(f)}">Delete</button>
          </div>
        </div>`).join("");
    },

    security() {
      const st = S.data[K.vault];
      if (!st) return `<div class="card"><p class="lead">The Vault isn't set up yet.</p><div class="row"><button type="button" class="btn btn-primary" data-act="go" data-sec="vault">Set up the Vault</button></div></div>`;
      const devices = Object.entries(st.devices || {});
      const devRows = devices.length
        ? devices.map(([id, d]) => `<div class="list-row"><span class="list-main"><span class="list-title">${h(d.label || "Device")}</span><span class="list-sub">Added ${h(timeAgo(Date.parse(d.addedAt)))}</span></span>
            <button type="button" class="btn btn-small btn-danger" data-act="bio-remove" data-id="${h(id)}">Remove</button></div>`).join("")
        : `<div class="empty">No Face ID or fingerprint set up yet.</div>`;
      const locked = !S.vaultKey;
      return `<div class="card">
        <p class="lead">The Vault locks itself after 5 minutes of no use. Copied secrets are cleared from the clipboard after 30 seconds where the browser allows it.</p>
        <p class="small">Passphrase last changed: ${h(st.changedAt ? new Date(st.changedAt).toLocaleDateString("en-GB") : "unknown")}</p>
      </div>
      <div class="card">
        <h3 class="list-title">Face ID / fingerprint</h3>
        <div class="list">${devRows}</div>
        ${locked ? `<p class="small">Unlock the Vault to add this device.</p>` : (window.Vault.biometricsAvailable() ? `<div class="row"><button type="button" class="btn btn-soft" data-act="bio-add">Turn on for this device</button></div>` : `<p class="small">This browser can't do Face ID / fingerprint unlock.</p>`)}
      </div>
      <form class="card" data-form="change-pass">
        <h3 class="list-title">Change Vault passphrase</h3>
        ${locked ? `<p class="small">Unlock the Vault first.</p>` : `
        <div class="form-grid">
          <div class="field"><label for="cp1">New passphrase</label><input id="cp1" name="p1" type="password" autocomplete="new-password" minlength="${window.Vault.MIN_PASSPHRASE}"></div>
          <div class="field"><label for="cp2">Type it again</label><input id="cp2" name="p2" type="password" autocomplete="new-password"></div>
        </div>
        <p class="error" data-error></p>
        <div class="row"><button type="submit" class="btn btn-primary">Change passphrase</button></div>`}
      </form>`;
    },

    account() {
      return S.user ? `Signed in as <strong>${h(S.user.email || S.user.displayName || "")}</strong>` : "Demo mode (this computer only)";
    },

    search() {
      const q = S.query.toLowerCase();
      const hit = (s) => String(s || "").toLowerCase().includes(q);
      const rows = [];
      list(K.notes).filter((n) => hit(n.text)).forEach((n) => rows.push({ kind: "Note", title: noteParts(n.text).title, folder: n.folder, sec: "notes" }));
      list(K.links).filter((l) => hit(l.text) || hit(l.title)).forEach((l) => rows.push({ kind: "Link", title: linkName(l), folder: l.folder, sec: "links", url: isUrl(l.text) ? l.text : "" }));
      S.photos.filter((p) => hit(p.name) || hit(p.album)).forEach((p) => rows.push({ kind: "Photo", title: p.name, folder: p.folder, sec: "photos" }));
      S.vaultItems.filter((v) => hit(v.name) || hit(v.user) || hit(v.site) || hit(v.note)).forEach((v) => rows.push({ kind: "Vault", title: v.name, folder: v.folder, sec: "vault" }));
      Object.keys(MORE).forEach((k) => {
        list(MORE[k].key).filter((i) => hit(i.text) || hit(i.desc) || hit(i.name) || hit(i.number) || hit(i.date))
          .forEach((i) => rows.push({ kind: MORE[k].label, title: i.text || i.desc || i.name, folder: i.folder, sec: "more", tab: k }));
      });
      const lockedNote = !S.vaultKey && S.data[K.vault] ? `<p class="small" style="margin-bottom:8px">Vault items are only searched while the Vault is unlocked.</p>` : "";
      if (!rows.length) return lockedNote + `<div class="list"><div class="empty">Nothing matches “${h(S.query)}”.</div></div>`;
      return lockedNote + `<div class="list">` + rows.map((r) => `<div class="list-row">
          <span class="kind">${h(r.kind)}</span>
          <span class="list-main"><span class="list-title">${h(r.title)}</span></span>
          ${folderTag(r.folder)}
          <div class="list-actions">
            ${r.url ? `<a class="btn btn-small btn-soft" href="${h(r.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}
            <button type="button" class="btn btn-small" data-act="go" data-sec="${r.sec}"${r.tab ? ` data-tab="${r.tab}"` : ""}>Show</button>
          </div>
        </div>`).join("") + `</div>`;
    }
  };

  const MORE = {
    money: {
      label: "Money", key: K.money,
      fields: [{ name: "desc", label: "What for", placeholder: "e.g. Van fuel" }, { name: "amount", label: "Amount", placeholder: "+100 or -50", mode: "decimal" }],
      row: (i) => `<span class="list-title">${h(i.desc)}</span><span class="${String(i.amount).trim().startsWith("-") ? "amount-neg" : "amount-pos"}">${h(i.amount)}</span>`
    },
    bills: {
      label: "Bills", key: K.bills,
      fields: [{ name: "text", label: "Bill", placeholder: "e.g. Van insurance — £60 on the 3rd" }],
      row: (i) => `<span class="list-title">${h(i.text)}</span><span class="list-sub">${i.paid ? "Paid" : "Not paid yet"}</span>`
    },
    events: {
      label: "Dates", key: K.events,
      fields: [{ name: "date", label: "Date", type: "date" }, { name: "text", label: "What's happening", placeholder: "e.g. MOT due" }],
      row: (i) => `<span class="list-title">${h(i.text)}</span><span class="list-sub">${h(i.date ? new Date(i.date + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "")}</span>`
    },
    contacts: {
      label: "Contacts", key: K.contacts,
      fields: [{ name: "name", label: "Name" }, { name: "number", label: "Phone number", type: "tel" }],
      row: (i) => `<span class="list-title">${h(i.name)}</span><span class="list-sub"><a href="tel:${h(String(i.number).replace(/[^0-9+]/g, ""))}">${h(i.number)}</a></span>`
    },
    mail: {
      label: "Saved emails", key: K.mail,
      fields: [{ name: "text", label: "Message or email", placeholder: "Paste the important bit" }],
      row: (i) => `<span class="list-title" style="font-weight:500;white-space:pre-wrap">${h(i.text)}</span>`
    }
  };

  function moreFormHtml() {
    const cfg = MORE[S.moreTab];
    return `<form class="card" data-form="more-add">
      <div class="form-grid">
        ${cfg.fields.map((f) => `<div class="field"><label for="mf-${f.name}">${h(f.label)}</label><input id="mf-${f.name}" name="${f.name}" type="${f.type || "text"}"${f.mode ? ` inputmode="${f.mode}"` : ""} placeholder="${h(f.placeholder || "")}"></div>`).join("")}
      </div>
      <div class="row"><button type="submit" class="btn btn-primary">Add</button><span class="small">${LISTS.saveTo()}</span></div>
    </form>`;
  }

  /* ── Vault views ───────────────────────────────────────────────────── */

  function vaultView() {
    const st = S.data[K.vault];
    const oldItems = list(K.oldCodes);
    const min = window.Vault.MIN_PASSPHRASE;

    if (!st && oldItems.length) {
      return `<div class="card lock-box">
        <div class="lock-icon">${ICON_LOCK}</div>
        <h1 style="font-size:24px">Upgrade your Vault</h1>
        <p class="lead">Your ${oldItems.length} saved item${oldItems.length === 1 ? "" : "s"} used a short PIN, which isn't strong enough. Enter your old PIN once, then choose a passphrase. Everything gets re-locked with much stronger encryption.</p>
        <form data-form="vault-upgrade" style="display:flex;flex-direction:column;gap:14px">
          <div class="field"><label for="vu-pin">Old Vault PIN</label><input id="vu-pin" name="pin" type="password" inputmode="numeric" autocomplete="off"></div>
          ${passFields(min)}
          <p class="error" data-error></p>
          <button type="submit" class="btn btn-primary btn-big">Upgrade Vault</button>
        </form>
      </div>`;
    }

    if (!st) {
      return `<div class="card lock-box">
        <div class="lock-icon">${ICON_LOCK}</div>
        <h1 style="font-size:24px">Set up your Vault</h1>
        <p class="lead">For passwords, API keys and codes. Everything is scrambled on your device before it's saved, so only your passphrase can open it.</p>
        <form data-form="vault-setup" style="display:flex;flex-direction:column;gap:14px">
          ${passFields(min)}
          <p class="error" data-error></p>
          <button type="submit" class="btn btn-primary btn-big">Create Vault</button>
        </form>
      </div>`;
    }

    if (!S.vaultKey) {
      const bio = Object.keys(st.devices || {}).length && window.Vault.biometricsAvailable();
      return `<div class="card lock-box">
        <div class="lock-icon">${ICON_LOCK}</div>
        <h1 style="font-size:24px">Vault is locked</h1>
        <p class="lead">Passwords, API keys and codes.</p>
        ${bio ? `<button type="button" class="btn btn-primary btn-big" data-act="bio-unlock">Unlock with Face ID / fingerprint</button>` : ""}
        <form data-form="vault-unlock" style="display:flex;flex-direction:column;gap:14px">
          <div class="field"><label for="vl-pass">${bio ? "Or type your passphrase" : "Your Vault passphrase"}</label><input id="vl-pass" name="pass" type="password" autocomplete="current-password"></div>
          <p class="error" data-error></p>
          <button type="submit" class="btn ${bio ? "" : "btn-primary"} btn-big">Unlock</button>
        </form>
        <p class="small">Locks itself after 5 minutes of no use.</p>
      </div>`;
    }

    const bioOffer = window.Vault.biometricsAvailable() && !Object.keys(st.devices || {}).length;
    return `<div class="view">
      <div class="view-head">
        <h1>Vault</h1>
        <span class="pill-good">Unlocked · locks after 5 min idle</span>
        <button type="button" class="btn btn-primary" data-act="vault-new">Add to Vault</button>
        <button type="button" class="btn" data-act="vault-lock">Lock</button>
      </div>
      ${bioOffer ? `<div class="banner banner-info row" style="justify-content:space-between">Want to unlock with Face ID or fingerprint next time? <button type="button" class="btn btn-small btn-soft" data-act="bio-add">Turn it on</button></div>` : ""}
      <div data-vault-form>${S.vaultForm ? vaultFormHtml() : ""}</div>
      <div data-list="vaultList"></div>
      <p class="small">Example: save an API key with a name, so you always know what it's for.</p>
    </div>`;
  }

  function passFields(min) {
    return `<div class="field"><label for="vp1">New passphrase</label>
        <input id="vp1" name="p1" type="password" autocomplete="new-password" minlength="${min}">
        <span class="hint">At least ${min} characters. Three random words is easy to remember and hard to guess, e.g. “purple tractor biscuit”. Write it down somewhere safe — it can't be reset.</span></div>
      <div class="field"><label for="vp2">Type it again</label><input id="vp2" name="p2" type="password" autocomplete="new-password"></div>`;
  }

  function vaultListHtml() {
    if (!S.vaultKey) return "";
    const items = vaultInView();
    if (!items.length) return `<div class="list"><div class="empty">Nothing in the Vault${S.folder === "All" ? "" : " for " + h(S.folder)} yet.</div></div>`;
    return `<div class="list">` + items.map((v) => {
      const shown = !!S.shown[v.id];
      const sub = [v.type, v.user].filter(Boolean).map(h).join(" · ");
      return `<div class="list-row">
        <div class="letter">${h((v.name || "?").charAt(0))}</div>
        <div class="list-main">
          <span class="list-title">${h(v.name || "Untitled")}</span>
          <span class="list-sub">${sub}${v.site ? ` · ${isUrl(v.site) ? `<a href="${h(v.site)}" target="_blank" rel="noopener noreferrer">${h(v.site)}</a>` : h(v.site)}` : ""}</span>
          ${v.note ? `<span class="list-sub" style="white-space:pre-wrap">${h(v.note)}</span>` : ""}
        </div>
        <code class="secret${shown ? " shown" : ""}">${v.error ? "Can't open this item" : (shown ? h(v.secret) : "•••••••••••••")}</code>
        ${folderTag(v.folder)}
        <div class="list-actions">
          <button type="button" class="btn btn-small" data-act="vault-show" data-id="${h(v.id)}" aria-pressed="${shown}">${shown ? "Hide" : "Show"}</button>
          <button type="button" class="btn btn-small btn-soft" data-act="vault-copy" data-id="${h(v.id)}">${S.copied === v.id ? "Copied" : "Copy"}</button>
          <button type="button" class="btn btn-small" data-act="vault-edit" data-id="${h(v.id)}">Edit</button>
          <button type="button" class="btn btn-small btn-danger" data-act="vault-del" data-id="${h(v.id)}">Delete</button>
        </div>
      </div>`;
    }).join("") + `</div>`;
  }

  function vaultFormHtml() {
    const v = S.vaultForm === "new" ? { type: "Password", folder: targetFolder(), secret: S.vaultPrefill } : (S.vaultItems.find((x) => x.id === S.vaultForm) || {});
    return `<form class="card" data-form="vault-save" autocomplete="off">
      <h2 class="sub">${S.vaultForm === "new" ? "Add to Vault" : "Edit"}</h2>
      <div class="form-grid">
        <div class="field"><label for="vf-name">What is it for?</label><input id="vf-name" name="name" required value="${h(v.name || "")}" placeholder="e.g. Cloudflare"></div>
        <div class="field"><label for="vf-type">Type</label><select id="vf-type" name="type">${VAULT_TYPES.map((t) => `<option${t === v.type ? " selected" : ""}>${h(t)}</option>`).join("")}</select></div>
        <div class="field"><label for="vf-user">Username or email <span class="small">(optional)</span></label><input id="vf-user" name="user" value="${h(v.user || "")}"></div>
        <div class="field"><label for="vf-secret">The secret</label><input id="vf-secret" name="secret" type="password" required value="${h(v.secret || "")}" autocomplete="new-password"></div>
        <div class="field"><label for="vf-site">Website <span class="small">(optional)</span></label><input id="vf-site" name="site" inputmode="url" value="${h(v.site || "")}" placeholder="https://…"></div>
        <div class="field"><label for="vf-folder">Folder</label><select id="vf-folder" name="folder">${folderOptions(v.folder || targetFolder())}</select></div>
        <div class="field full"><label for="vf-note">Note <span class="small">(optional)</span></label><textarea id="vf-note" name="note" rows="2">${h(v.note || "")}</textarea></div>
      </div>
      <div class="row">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" data-act="vault-cancel">Cancel</button>
        <label class="row small" style="gap:6px;margin-left:auto"><input type="checkbox" data-act="vault-peek"> Show secret while typing</label>
      </div>
    </form>`;
  }

  const ICON_LOCK = `<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

  function renderVaultForm() {
    const el = $("[data-vault-form]");
    if (el) el.innerHTML = S.vaultForm ? vaultFormHtml() : "";
    const first = el && el.querySelector("input[name=name]");
    if (first) first.focus();
  }

  /* ── Vault actions ─────────────────────────────────────────────────── */

  async function decryptVault() {
    if (!S.vaultKey) { S.vaultItems = []; return; }
    const key = S.vaultKey;
    const recs = list(K.vaultItems);
    const out = await Promise.all(recs.map(async (r) => {
      try { return { ...(await window.Vault.decryptItem(key, r)), id: r.id, folder: r.folder }; }
      catch (e) { return { id: r.id, folder: r.folder, name: "Unreadable item", error: true }; }
    }));
    if (S.vaultKey === key) S.vaultItems = out;
  }

  function lockVault(reason) {
    S.vaultKey = null;
    S.vaultItems = [];
    S.shown = {};
    S.vaultForm = null;
    S.vaultPrefill = "";
    if (S.section === "vault" || S.section === "settings") renderSection(); else refresh();
    if (reason) toast(reason);
  }

  async function openVault(key) {
    S.vaultKey = key;
    S.lastActive = Date.now();
    await decryptVault();
    renderSection();
  }

  function formError(form, msg) {
    const el = form.querySelector("[data-error]");
    if (el) el.textContent = msg;
  }

  function busy(form, on, label) {
    const btn = form.querySelector("button[type=submit]");
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Working…"; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function checkNewPass(form) {
    const p1 = form.elements.p1.value;
    const p2 = form.elements.p2.value;
    if (p1.trim().length < window.Vault.MIN_PASSPHRASE) { formError(form, `Use at least ${window.Vault.MIN_PASSPHRASE} characters.`); return null; }
    if (p1 !== p2) { formError(form, "The two passphrases don't match."); return null; }
    return p1;
  }

  async function vaultSetup(form) {
    const pass = checkNewPass(form);
    if (!pass) return;
    busy(form, true, "Creating…");
    try {
      const { state, key } = await window.Vault.create(pass);
      await saveMany({ [K.vault]: state, [K.vaultItems]: list(K.vaultItems) });
      await openVault(key);
      toast("Vault created");
    } catch (e) {
      console.error(e);
      busy(form, false);
      formError(form, "Couldn't create the Vault. Please try again.");
    }
  }

  async function vaultUpgrade(form) {
    const pin = form.elements.pin.value;
    const pass = checkNewPass(form);
    if (!pass) return;
    if (!pin) { formError(form, "Enter your old PIN."); return; }
    busy(form, true, "Upgrading… (this takes a few seconds)");
    try {
      const ok = await window.Vault.legacyPinMatches(pin, S.data[K.oldHash], S.data[K.oldSalt]);
      if (ok === false) { busy(form, false); formError(form, "That PIN isn't right."); return; }
      const old = list(K.oldCodes);
      const plain = old.map((o) => window.Vault.legacyDecrypt(o.text, pin));
      if (plain.some((p) => p == null || p === "")) { busy(form, false); formError(form, "That PIN couldn't open your old items."); return; }

      const { state, key } = await window.Vault.create(pass);
      const items = [];
      for (let i = 0; i < old.length; i++) {
        const obj = { name: `Old Vault item ${i + 1}`, type: "Other secret", user: "", secret: plain[i], site: "", note: "Moved from the old Vault. Tap Edit to give it a name." };
        const rec = await window.Vault.encryptItem(key, obj);
        // Check it opens again before anything old is removed.
        const back = await window.Vault.decryptItem(key, rec);
        if (back.secret !== plain[i]) throw new Error("verify-failed");
        items.push({ id: old[i].id || newId(), folder: old[i].folder || folders()[0], ...rec });
      }
      const reopened = await window.Vault.unlock(state, pass);
      if (!reopened) throw new Error("verify-failed");

      await saveMany({ [K.vault]: state, [K.vaultItems]: items });
      // Only now remove the weak old copies.
      await store.remove([K.oldCodes, K.oldHash, K.oldSalt, K.oldFlag]);
      [K.oldCodes, K.oldHash, K.oldSalt, K.oldFlag, "bryantos_vault_wa_cred", "bryantos_vault_wa_pin", "bryantos_remote_bryantos_vault_pin_hash", "bryantos_remote_bryantos_vault_pin_salt", "bryantos_remote_bryantos_vault_encrypted"]
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem("vault_sess");
      [K.oldCodes, K.oldHash, K.oldSalt, K.oldFlag].forEach((k) => delete S.data[k]);
      await openVault(key);
      toast("Vault upgraded");
    } catch (e) {
      console.error(e);
      busy(form, false);
      formError(form, "Upgrade failed — nothing was changed. Please try again.");
    }
  }

  async function vaultUnlock(form) {
    const pass = form.elements.pass.value;
    if (!pass) { formError(form, "Type your passphrase."); return; }
    busy(form, true, "Unlocking…");
    try {
      const key = await window.Vault.unlock(S.data[K.vault], pass);
      await openVault(key);
    } catch (e) {
      busy(form, false);
      formError(form, e.message === "wrong-passphrase" ? "That passphrase isn't right." : "Couldn't unlock. Please try again.");
      form.elements.pass.select();
    }
  }

  async function bioUnlock() {
    try {
      const key = await window.Vault.unlockBiometric(S.data[K.vault]);
      await openVault(key);
    } catch (e) {
      if (e && e.name === "NotAllowedError") return; // cancelled
      console.error(e);
      toast("Face ID / fingerprint didn't work. Use your passphrase.");
    }
  }

  async function bioAdd() {
    try {
      const label = deviceLabel();
      const st = await window.Vault.addBiometric(S.data[K.vault], S.vaultKey, (S.user && S.user.email) || "BryantOS", label);
      await save(K.vault, st);
      toast("Face ID / fingerprint turned on for " + label);
      renderSection();
    } catch (e) {
      if (e && e.name === "NotAllowedError") return;
      console.error(e);
      toast(e && e.message === "biometrics-unsupported" ? "This device or browser doesn't support it yet." : "Couldn't turn it on. Please try again.");
    }
  }

  function deviceLabel() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "Device";
    const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
    return br ? `${os} · ${br}` : os;
  }

  async function vaultSave(form) {
    const f = form.elements;
    const obj = {
      name: f.name.value.trim(), type: f.type.value, user: f.user.value.trim(),
      secret: f.secret.value, site: f.site.value.trim(), note: f.note.value.trim()
    };
    if (!obj.name || !obj.secret) return;
    busy(form, true, "Saving…");
    try {
      const rec = await window.Vault.encryptItem(S.vaultKey, obj);
      const items = list(K.vaultItems).slice();
      if (S.vaultForm === "new") {
        items.unshift({ id: newId(), folder: f.folder.value, ...rec });
      } else {
        const i = items.findIndex((x) => x.id === S.vaultForm);
        if (i >= 0) items[i] = { id: items[i].id, folder: f.folder.value, ...rec };
      }
      S.vaultForm = null;
      S.vaultPrefill = "";
      await save(K.vaultItems, items);
      await decryptVault();
      renderVaultForm();
      refresh();
      toast("Saved to Vault");
    } catch (e) {
      console.error(e);
      busy(form, false);
      toast("Couldn't save. Please try again.");
    }
  }

  async function copySecret(text, id) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      toast("Couldn't copy on this browser.");
      return;
    }
    S.copied = id;
    refresh();
    setTimeout(() => { if (S.copied === id) { S.copied = null; refresh(); } }, 1500);
    if (id !== null) {
      setTimeout(() => {
        // Best effort: browsers only allow this while the page is in front.
        if (document.hasFocus()) navigator.clipboard.writeText("").catch(() => {});
      }, CLIPBOARD_CLEAR_MS);
    }
    toast("Copied");
  }

  /* ── Other actions ─────────────────────────────────────────────────── */

  function go(sec, tab) {
    S.section = sec;
    S.query = "";
    if (tab) S.moreTab = tab;
    const search = $("#search");
    if (search) search.value = "";
    S.noteEdit = null;
    renderSection();
    if (sec === "more") $("[data-more-form]").innerHTML = moreFormHtml();
    window.scrollTo(0, 0);
  }

  function addItem(key, item) {
    return save(key, [{ id: newId(), folder: targetFolder(), ...item }].concat(list(key)));
  }

  async function uploadFiles(files) {
    files = Array.from(files || []);
    if (!files.length) return;
    const folder = targetFolder();
    toast(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    let ok = 0;
    for (const file of files) {
      try {
        const isPdf = file.type === "application/pdf";
        const blob = isPdf ? file : await shrinkImage(file);
        await store.uploadPhoto(blob, { name: file.name, folder, album: S.album || "", type: isPdf ? "application/pdf" : blob.type });
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    toast(ok === files.length ? `Uploaded to ${folder}` : `${files.length - ok} upload${files.length - ok === 1 ? "" : "s"} failed`);
    if (S.section !== "photos") go("photos");
  }

  function shrinkImage(file) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) { resolve(file); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 2400;
        let w = img.naturalWidth, hgt = img.naturalHeight;
        if (w <= max && hgt <= max && file.size < 1.5e6) { URL.revokeObjectURL(url); resolve(file); return; }
        const scale = Math.min(1, max / Math.max(w, hgt));
        w = Math.round(w * scale); hgt = Math.round(hgt * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = hgt;
        c.getContext("2d").drawImage(img, 0, 0, w, hgt);
        URL.revokeObjectURL(url);
        c.toBlob((b) => resolve(b || file), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function renameFolderEverywhere(from, to) {
    const patch = {};
    [K.notes, K.links, K.mail, K.money, K.bills, K.events, K.contacts, K.vaultItems].forEach((k) => {
      const l = list(k);
      if (l.some((i) => i.folder === from)) patch[k] = l.map((i) => (i.folder === from ? { ...i, folder: to } : i));
    });
    const albums = S.data[K.albums] && typeof S.data[K.albums] === "object" ? { ...S.data[K.albums] } : null;
    if (albums && albums[from]) {
      albums[to] = Array.from(new Set([].concat(albums[to] || [], albums[from])));
      delete albums[from];
      patch[K.albums] = albums;
    }
    S.photos.filter((p) => p.folder === from).forEach((p) => store.updatePhoto(p.docId, { folder: to }));
    S.vaultItems = S.vaultItems.map((v) => (v.folder === from ? { ...v, folder: to } : v));
    return patch;
  }

  function countInFolder(f) {
    let n = 0;
    [K.notes, K.links, K.mail, K.money, K.bills, K.events, K.contacts, K.vaultItems].forEach((k) => { n += list(k).filter((i) => i.folder === f).length; });
    return n + S.photos.filter((p) => p.folder === f).length;
  }

  /* ── Events ────────────────────────────────────────────────────────── */

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.matches("input[type=checkbox]")) return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    const findById = (k) => list(k).find((i) => String(i.id) === String(id));

    switch (act) {
      case "go": go(el.dataset.sec, el.dataset.tab); break;
      case "folder": S.folder = el.dataset.folder; S.album = ""; refresh(); break;
      case "new":
        go("home");
        setTimeout(() => { const q = $("#quick"); if (q) q.focus(); }, 0);
        break;
      case "del": {
        const k = el.dataset.key;
        if (!confirm("Delete this? It can't be undone.")) return;
        save(k, list(k).filter((i) => String(i.id) !== String(id)));
        break;
      }
      case "note-edit": S.noteEdit = id; refresh(); { const t = $(`#edit-${CSS.escape(id)}`); if (t) t.focus(); } break;
      case "note-cancel": S.noteEdit = null; refresh(); break;
      case "copy-text": copySecret(el.dataset.text, null); break;
      case "photo-del": {
        const p = S.photos.find((x) => x.docId === id);
        if (p && confirm(`Delete “${p.name}”? It can't be undone.`)) store.deletePhoto(p).catch(() => toast("Delete failed"));
        break;
      }
      case "more-tab":
        S.moreTab = el.dataset.tab;
        $("[data-more-form]").innerHTML = moreFormHtml();
        refresh();
        break;
      case "bill-paid":
        save(K.bills, list(K.bills).map((b) => (String(b.id) === String(id) ? { ...b, paid: !b.paid } : b)));
        break;
      case "folder-rename": {
        const from = el.dataset.folder;
        const to = (prompt(`New name for “${from}”:`, from) || "").trim();
        if (!to || to === from) return;
        if (folders().some((f) => f.toLowerCase() === to.toLowerCase())) { toast("A folder with that name already exists."); return; }
        const patch = renameFolderEverywhere(from, to);
        patch[K.folders] = folders().map((f) => (f === from ? to : f));
        if (S.folder === from) S.folder = to;
        saveMany(patch);
        break;
      }
      case "folder-del": {
        const f = el.dataset.folder;
        const rest = folders().filter((x) => x !== f);
        if (!rest.length) { toast("You need at least one folder."); return; }
        const n = countInFolder(f);
        if (!confirm(n ? `Delete the folder “${f}”? Its ${n} item${n === 1 ? "" : "s"} will move to “${rest[0]}” — nothing is deleted.` : `Delete the empty folder “${f}”?`)) return;
        const patch = renameFolderEverywhere(f, rest[0]);
        patch[K.folders] = rest;
        if (S.folder === f) S.folder = "All";
        saveMany(patch);
        break;
      }
      case "signout":
        if (DEMO) { toast("Demo mode"); return; }
        lockVault();
        firebase.auth().signOut().then(() => { location.href = "signin.html"; });
        break;

      case "vault-lock": lockVault(); break;
      case "bio-unlock": bioUnlock(); break;
      case "bio-add": bioAdd(); break;
      case "bio-remove": {
        if (!confirm("Remove Face ID / fingerprint unlock for this device? You can still use your passphrase.")) return;
        const st = { ...S.data[K.vault], devices: { ...(S.data[K.vault].devices || {}) } };
        delete st.devices[id];
        save(K.vault, st).then(renderSection);
        break;
      }
      case "vault-new": S.vaultForm = "new"; renderVaultForm(); break;
      case "vault-edit": S.vaultForm = Number(id); renderVaultForm(); break;
      case "vault-cancel": S.vaultForm = null; S.vaultPrefill = ""; renderVaultForm(); break;
      case "vault-show": S.shown[Number(id)] = !S.shown[Number(id)]; refresh(); break;
      case "vault-copy": {
        const v = S.vaultItems.find((x) => x.id === Number(id));
        if (v && !v.error) copySecret(v.secret, v.id);
        break;
      }
      case "vault-del": {
        const v = S.vaultItems.find((x) => x.id === Number(id));
        if (!v || !confirm(`Delete “${v.name}” from the Vault? It can't be undone.`)) return;
        save(K.vaultItems, list(K.vaultItems).filter((x) => x.id !== v.id)).then(() => decryptVault().then(refresh));
        S.vaultItems = S.vaultItems.filter((x) => x.id !== v.id);
        refresh();
        break;
      }
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches("[data-upload]")) { uploadFiles(el.files); el.value = ""; return; }
    if (el.matches("[data-act=vault-peek]")) { const s = $("#vf-secret"); if (s) s.type = el.checked ? "text" : "password"; return; }
    const kind = el.dataset.change;
    if (kind === "move") {
      const k = el.dataset.key;
      save(k, list(k).map((i) => (String(i.id) === String(el.dataset.id) ? { ...i, folder: el.value } : i)));
      toast("Moved to " + el.value);
    } else if (kind === "photo-folder") {
      store.updatePhoto(el.dataset.id, { folder: el.value }).then(() => toast("Moved to " + el.value));
    } else if (kind === "album") {
      S.album = el.value;
      refresh();
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const f = form.elements;
    switch (form.dataset.form) {
      case "quick": {
        const text = f.text.value.trim();
        const as = e.submitter ? e.submitter.value : "note";
        if (!text) { f.text.focus(); return; }
        if (as === "note") { addItem(K.notes, { text, createdAt: new Date().toISOString() }); toast("Saved to Notes · " + targetFolder()); }
        else if (as === "link") { addItem(K.links, { text }); toast("Saved to Links · " + targetFolder()); }
        else if (as === "vault") {
          S.vaultPrefill = text;
          S.vaultForm = "new";
          go("vault");
          if (!S.vaultKey) toast("Unlock the Vault to finish saving");
          return;
        }
        f.text.value = "";
        break;
      }
      case "note-add": {
        const text = f.text.value.trim();
        if (!text) return;
        addItem(K.notes, { text, createdAt: new Date().toISOString() });
        f.text.value = "";
        toast("Note saved");
        break;
      }
      case "note-save": {
        const text = f.text.value.trim();
        const id = form.dataset.id;
        S.noteEdit = null;
        if (!text) { refresh(); return; }
        save(K.notes, list(K.notes).map((n) => (String(n.id) === String(id) ? { ...n, text } : n)));
        break;
      }
      case "link-add": {
        let url = f.url.value.trim();
        if (!url) { f.url.focus(); return; }
        if (!isUrl(url) && !isEmail(url) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) url = "https://" + url;
        addItem(K.links, { text: url, title: f.title.value.trim() });
        f.url.value = ""; f.title.value = "";
        toast("Link saved");
        break;
      }
      case "album-add": {
        const name = f.name.value.trim();
        if (!name) return;
        const folder = targetFolder();
        const all = S.data[K.albums] && typeof S.data[K.albums] === "object" ? { ...S.data[K.albums] } : {};
        const arr = Array.isArray(all[folder]) ? all[folder].slice() : [];
        if (arr.some((a) => a.toLowerCase() === name.toLowerCase())) { toast("That album already exists"); return; }
        arr.push(name);
        all[folder] = arr;
        S.album = name;
        save(K.albums, all);
        break;
      }
      case "more-add": {
        const cfg = MORE[S.moreTab];
        const item = {};
        cfg.fields.forEach((fd) => { item[fd.name] = f[fd.name].value.trim(); });
        if (!Object.values(item).some(Boolean)) return;
        if (S.moreTab === "bills") item.paid = false;
        addItem(cfg.key, item);
        cfg.fields.forEach((fd) => { f[fd.name].value = ""; });
        break;
      }
      case "folder-add": {
        const name = f.name.value.trim();
        if (!name) return;
        if (folders().some((x) => x.toLowerCase() === name.toLowerCase())) { toast("That folder already exists"); return; }
        save(K.folders, folders().concat(name));
        f.name.value = "";
        break;
      }
      case "vault-setup": vaultSetup(form); break;
      case "vault-upgrade": vaultUpgrade(form); break;
      case "vault-unlock": vaultUnlock(form); break;
      case "vault-save": vaultSave(form); break;
      case "change-pass": {
        const pass = checkNewPass(form);
        if (!pass) return;
        busy(form, true, "Changing…");
        window.Vault.changePassphrase(S.data[K.vault], S.vaultKey, pass)
          .then((st) => save(K.vault, st))
          .then(() => { toast("Passphrase changed"); renderSection(); })
          .catch(() => { busy(form, false); formError(form, "Couldn't change it. Please try again."); });
        break;
      }
    }
  });

  $("#search").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    const was = !!S.query;
    S.query = q;
    if (!!q !== was) renderSection(); else refresh();
  });

  // Auto-lock
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) =>
    document.addEventListener(ev, () => { S.lastActive = Date.now(); }, { passive: true })
  );
  setInterval(() => {
    if (S.vaultKey && Date.now() - S.lastActive > AUTO_LOCK_MS) lockVault("Vault locked after 5 minutes");
  }, 10000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) S.hiddenAt = Date.now();
    else if (S.vaultKey && S.hiddenAt && Date.now() - S.hiddenAt > AUTO_LOCK_MS) lockVault("Vault locked after 5 minutes");
  });

  /* ── Start ─────────────────────────────────────────────────────────── */

  function start(user) {
    S.user = user;
    $("#loading").hidden = true;
    $("#app").hidden = false;
    const name = user ? (user.displayName || user.email || "") : "Demo";
    $("[data-user-name]").textContent = name;
    $("[data-user-initial]").textContent = (name || "?").charAt(0).toUpperCase();
    if (user && user.photoURL) {
      const img = $("[data-user-photo]");
      img.src = user.photoURL;
      img.referrerPolicy = "no-referrer";
      img.hidden = false;
      $("[data-user-initial]").hidden = true;
    }

    let first = true;
    store.subscribe((data) => {
      S.data = data || {};
      S.loaded = true;
      if (first) { first = false; migrateOnce(); renderSection(); }
      if (S.vaultKey) decryptVault().then(refresh); else refresh();
    });
    store.subscribePhotos((photos) => { S.photos = photos; refresh(); });
  }

  if (DEMO) {
    store = demoStore();
    start(null);
  } else {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
    firebase.auth().onAuthStateChanged((user) => {
      if (!user) { location.href = "signin.html"; return; }
      if (store) return;
      store = firebaseStore(user.uid);
      start(user);
    });
  }
})();
