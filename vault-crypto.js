// Simple encryption using Web Crypto API

export async function deriveKey(passcode) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("bryantos-salt"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data))
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  };
}

export async function decryptData(payload, key) {
  const dec = new TextDecoder();

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
    key,
    new Uint8Array(payload.data)
  );

  return JSON.parse(dec.decode(decrypted));
}
