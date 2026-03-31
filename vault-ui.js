import { unlockVault, addVaultItem, getVaultItems, isVaultUnlocked } from "./vault.js";

window.unlockVaultUI = async function unlockVaultUI() {
  const passInput = document.getElementById("vaultPasscode");
  const vaultContent = document.getElementById("vaultContent");

  if (!passInput || !vaultContent) return;

  const passcode = passInput.value.trim();
  if (!passcode) {
    alert("Enter a passcode first.");
    return;
  }

  try {
    await unlockVault(passcode);
    vaultContent.style.display = "block";
    await renderVault();
  } catch (error) {
    console.error("Vault unlock failed:", error);
    alert("Wrong passcode.");
  }
};

window.addVaultItem = async function addVaultItemUI() {
  if (!isVaultUnlocked()) {
    alert("Unlock vault first.");
    return;
  }

  const nameInput = document.getElementById("vaultName");
  const valueInput = document.getElementById("vaultValue");

  if (!nameInput || !valueInput) return;

  const name = nameInput.value.trim();
  const value = valueInput.value.trim();

  if (!name || !value) {
    alert("Enter both a name and a secret.");
    return;
  }

  try {
    await addVaultItem(name, value);
    nameInput.value = "";
    valueInput.value = "";
    await renderVault();
  } catch (error) {
    console.error("Vault save failed:", error);
    alert("Failed to save vault item.");
  }
};

async function renderVault() {
  const list = document.getElementById("vaultList");
  if (!list) return;

  list.innerHTML = "";

  try {
    const items = await getVaultItems();

    items.forEach(item => {
      const li = document.createElement("li");
      li.className = "list-item";
      li.innerHTML = `<span><strong>${item.name}</strong> - ${item.value}</span>`;
      list.appendChild(li);
    });
  } catch (error) {
    console.error("Vault render failed:", error);
  }
}
