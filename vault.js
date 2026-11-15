/*
 * BryantOS Vault crypto.
 *
 * How it works:
 * - A random 256-bit "vault key" encrypts every Vault item with AES-GCM.
 * - The vault key itself is locked ("wrapped") with a key made from your
 *   passphrase (PBKDF2-SHA256, 600,000 rounds). Only the wrapped key is saved.
 * - Face ID / fingerprint uses a passkey with the WebAuthn PRF extension: the
 *   passkey produces a secret that never leaves the device's secure chip, and
 *   that secret wraps a second copy of the vault key.
 * - Nothing that can open the Vault is ever stored in plain form.
 *
 * Old Vault items (PIN + CryptoJS) are read only once, to upgrade them.
 */
(function () {
  "use strict";

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ITERATIONS = 600000;
  const MIN_PASSPHRASE = 10;

  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  function b64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const b64url = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function unb64url(s) {
    const p = s.replace(/-/g, "+").replace(/_/g, "/");
    return unb64(p + "===".slice((p.length + 3) % 4));
  }

  async function keyFromPassphrase(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey(
      "raw", enc.encode(String(passphrase).normalize("NFKC")), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]
    );
  }

  async function wrapVaultKey(vaultKey, wrappingKey) {
    const iv = rand(12);
    const ct = await crypto.subtle.wrapKey("raw", vaultKey, wrappingKey, { name: "AES-GCM", iv });
    return { iv: b64(iv), ct: b64(ct) };
  }

  function unwrapVaultKey(wrapped, wrappingKey) {
    return crypto.subtle.unwrapKey(
      "raw", unb64(wrapped.ct), wrappingKey, { name: "AES-GCM", iv: unb64(wrapped.iv) },
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  }

  /** Make a brand new Vault. Returns { state, key }. state is safe to save. */
  async function create(passphrase) {
    checkPassphrase(passphrase);
    const salt = rand(16);
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const kek = await keyFromPassphrase(passphrase, salt, ITERATIONS);
    const state = {
      v: 2,
      kdf: "PBKDF2-SHA256",
      iter: ITERATIONS,
      salt: b64(salt),
      wrapped: await wrapVaultKey(key, kek),
      devices: {},
      changedAt: new Date().toISOString()
    };
    return { state, key };
  }

  /** Open the Vault with the passphrase. Throws "wrong-passphrase" if it is wrong. */
  async function unlock(state, passphrase) {
    const kek = await keyFromPassphrase(passphrase, unb64(state.salt), state.iter || ITERATIONS);
    try {
      return await unwrapVaultKey(state.wrapped, kek);
    } catch (e) {
      throw new Error("wrong-passphrase");
    }
  }

  /** New passphrase, same vault key (items do not need re-encrypting). */
  async function changePassphrase(state, key, newPassphrase) {
    checkPassphrase(newPassphrase);
    const salt = rand(16);
    const kek = await keyFromPassphrase(newPassphrase, salt, ITERATIONS);
    return {
      ...state,
      iter: ITERATIONS,
      salt: b64(salt),
      wrapped: await wrapVaultKey(key, kek),
      changedAt: new Date().toISOString()
    };
  }

  function checkPassphrase(p) {
    if (typeof p !== "string" || p.trim().length < MIN_PASSPHRASE) {
      throw new Error("passphrase-too-short");
    }
  }

  async function encryptItem(key, obj) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function decryptItem(key, rec) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, unb64(rec.ct));
    return JSON.parse(dec.decode(pt));
  }

  /* ── Face ID / fingerprint (passkey + PRF) ───────────────────────────── */

  async function keyFromPrf(prfOutput) {
    const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("bryantos-vault-v2") },
      base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]
    );
  }

  function biometricsAvailable() {
    return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  }

  /**
   * Make a passkey on this device and store a vault-key copy that only the
   * passkey can open. Returns the updated state.
   */
  async function addBiometric(state, key, userLabel, deviceLabel) {
    if (!biometricsAvailable()) throw new Error("biometrics-unsupported");
    const prfSalt = rand(32);
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: "BryantOS", id: location.hostname },
        user: { id: rand(16), name: userLabel || "BryantOS", displayName: userLabel || "BryantOS Vault" },
        challenge: rand(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
        timeout: 60000,
        extensions: { prf: { eval: { first: prfSalt } } }
      }
    });
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    if (!ext.prf || ext.prf.enabled === false) throw new Error("biometrics-unsupported");
    const credId = b64url(cred.rawId);

    let output = ext.prf.results && ext.prf.results.first;
    if (!output) {
      // Some devices only give the PRF secret when the passkey is used, not created.
      output = await prfFromGet([credId], { [credId]: b64(prfSalt) }).then((r) => r.output);
    }
    const wrapped = await wrapVaultKey(key, await keyFromPrf(output));
    const devices = { ...(state.devices || {}) };
    devices[credId] = { prfSalt: b64(prfSalt), ...wrapped, label: deviceLabel || "This device", addedAt: new Date().toISOString() };
    return { ...state, devices };
  }

  async function prfFromGet(credIds, saltsById) {
    const evalByCredential = {};
    credIds.forEach((id) => { evalByCredential[id] = { first: unb64(saltsById[id]) }; });
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        rpId: location.hostname,
        allowCredentials: credIds.map((id) => ({ type: "public-key", id: unb64url(id) })),
        userVerification: "required",
        timeout: 60000,
        extensions: { prf: { evalByCredential } }
      }
    });
    const ext = assertion.getClientExtensionResults();
    const output = ext.prf && ext.prf.results && ext.prf.results.first;
    if (!output) throw new Error("biometrics-unsupported");
    return { id: b64url(assertion.rawId), output };
  }

  async function unlockBiometric(state) {
    const devices = state.devices || {};
    const ids = Object.keys(devices);
    if (!ids.length) throw new Error("no-biometrics");
    const salts = {};
    ids.forEach((id) => { salts[id] = devices[id].prfSalt; });
    const { id, output } = await prfFromGet(ids, salts);
    const dev = devices[id];
    if (!dev) throw new Error("no-biometrics");
    return unwrapVaultKey(dev, await keyFromPrf(output));
  }

  /* ── Old Vault (PIN + CryptoJS), only used to upgrade ─────────────────── */

  async function legacyPinMatches(pin, hashHex, saltStr) {
    if (!hashHex || !saltStr) return null; // unknown: no stored hash
    const base = await crypto.subtle.importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
    for (const hash of ["SHA-256", "SHA-1"]) {
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash, salt: enc.encode(saltStr), iterations: 600000 }, base, 256);
      const hex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex === hashHex) return true;
    }
    return false;
  }

  const looksOld = (t) => typeof t === "string" && t.startsWith("U2FsdGVkX1");

  function legacyDecrypt(text, pin) {
    if (!looksOld(text)) return text; // was never encrypted
    if (!window.CryptoJS) throw new Error("legacy-lib-missing");
    const once = (c) => {
      try { return window.CryptoJS.AES.decrypt(String(c), String(pin)).toString(window.CryptoJS.enc.Utf8) || null; }
      catch (e) { return null; }
    };
    let out = once(text);
    if (out && looksOld(out)) out = once(out) || out; // old double-encryption bug
    return out;
  }

  window.Vault = {
    MIN_PASSPHRASE,
    create, unlock, changePassphrase, encryptItem, decryptItem,
    biometricsAvailable, addBiometric, unlockBiometric,
    legacyPinMatches, legacyDecrypt
  };
})();
