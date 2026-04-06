import { generateSalt, deriveKey, encryptData, decryptData } from "./vault-crypto.js";

const VAULT_STORAGE_KEY = "bryantos_secure_vault";

let vaultKey = null;

function getStoredVault() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) || "null");

    if (!parsed || typeof parsed !== "object") {
      return { salt: null, items: [] };
    }

    return {
      salt: Array.isArray(parsed.salt) ? parsed.salt : null,
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch (error) {
    console.error("Vault read failed:", error);
    return { salt: null, items: [] };
  }
}

function setStoredVault(vault) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
}

export async function unlockVault(passcode) {
  const stored = getStoredVault();

  let salt = stored.salt;

  if (!salt) {
    salt = generateSalt();
    setStoredVault({
      salt,
      items: stored.items
    });
  }

  const key = await deriveKey(passcode, salt);

  if (stored.items.length > 0) {
    try {
      await decryptData(stored.items[0], key);
    } catch (error) {
      throw new Error("Wrong passcode");
    }
  }

  vaultKey = key;
  return true;
}

export function lockVault() {
  vaultKey = null;
}

export function isVaultUnlocked() {
  return !!vaultKey;
}

export async function addVaultItem(name, value) {
  if (!vaultKey) {
    throw new Error("Vault locked");
  }

  const stored = getStoredVault();

  const encrypted = await encryptData(
    {
      id: crypto.randomUUID(),
      name,
      value,
      createdAt: Date.now()
    },
    vaultKey
  );

  stored.items.unshift(encrypted);
  setStoredVault(stored);
}

export async function getVaultItems() {
  if (!vaultKey) {
    throw new Error("Vault locked");
  }

  const stored = getStoredVault();
  const results = [];

  for (const item of stored.items) {
    try {
      const decrypted = await decryptData(item, vaultKey);
      results.push(decrypted);
    } catch (error) {
      console.error("Vault item decrypt failed:", error);
    }
  }

  return results;
}

export function clearVault() {
  vaultKey = null;
  localStorage.removeItem(VAULT_STORAGE_KEY);
}
