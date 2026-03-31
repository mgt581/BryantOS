import { deriveKey, encryptData, decryptData } from "./vault-crypto.js";

const VAULT_STORAGE_KEY = "bryantos_secure_vault";

let vaultKey = null;

function getStoredVault() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("Vault read failed:", error);
    return [];
  }
}

function setStoredVault(items) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
}

export async function unlockVault(passcode) {
  const key = await deriveKey(passcode);
  const stored = getStoredVault();

  if (stored.length > 0) {
    try {
      await decryptData(stored[0], key);
    } catch (error) {
      throw new Error("Wrong passcode");
    }
  }

  vaultKey = key;
  return true;
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
      id: Date.now().toString(),
      name,
      value
    },
    vaultKey
  );

  stored.unshift(encrypted);
  setStoredVault(stored);
}

export async function getVaultItems() {
  if (!vaultKey) {
    throw new Error("Vault locked");
  }

  const stored = getStoredVault();
  const results = [];

  for (const item of stored) {
    try {
      const decrypted = await decryptData(item, vaultKey);
      results.push(decrypted);
    } catch (error) {
      console.error("Vault item decrypt failed:", error);
    }
  }

  return results;
}
