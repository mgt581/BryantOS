import { deriveKey, encryptData, decryptData } from "./vault-crypto.js";

let vaultKey = null;

export async function unlockVault(passcode) {
  vaultKey = await deriveKey(passcode);
  return true;
}

export function isVaultUnlocked() {
  return !!vaultKey;
}

export async function saveVaultItem(item) {
  if (!vaultKey) throw new Error("Vault locked");

  const stored = JSON.parse(localStorage.getItem("bryantos_vault") || "[]");

  const encrypted = await encryptData(item, vaultKey);

  stored.unshift(encrypted);

  localStorage.setItem("bryantos_vault", JSON.stringify(stored));
}

export async function getVaultItems() {
  if (!vaultKey) throw new Error("Vault locked");

  const stored = JSON.parse(localStorage.getItem("bryantos_vault") || "[]");

  const results = [];

  for (const item of stored) {
    try {
      const decrypted = await decryptData(item, vaultKey);
      results.push(decrypted);
    } catch {
      // ignore bad entries
    }
  }

  return results;
}
