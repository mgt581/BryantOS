import { unlockVault, addVaultItem, getVaultItems } from "./vault.js";

let unlocked = false;

window.unlockVaultUI = async function () {
  const pass = document.getElementById("vaultPasscode").value;

  try {
    await unlockVault(pass);
    unlocked = true;

    document.getElementById("vaultContent").style.display = "block";

    renderVault();
  } catch (err) {
    alert("Wrong passcode");
  }
};

window.addVaultItem = async function () {
  if (!unlocked) return alert("Unlock vault first");

  const name = document.getElementById("vaultName").value;
  const value = document.getElementById("vaultValue").value;

  if (!name || !value) return;

  await addVaultItem(name, value);

  document.getElementById("vaultName").value = "";
  document.getElementById("vaultValue").value = "";

  renderVault();
};

async function renderVault() {
  const list = document.getElementById("vaultList");
  list.innerHTML = "";

  const items = await getVaultItems();

  items.forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.name}</strong>: ${item.value}`;
    list.appendChild(li);
  });
}
