import {
  unlockVault,
  lockVault,
  addVaultItem,
  getVaultItems,
  isVaultUnlocked
} from "./vault.js";

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
    passInput.value = "";
    vaultContent.style.display = "block";
    await renderVault();
  } catch (error) {
    console.error("Vault unlock failed:", error);
    passInput.value = "";
    alert("Wrong passcode.");
  }
};

window.lockVaultUI = function lockVaultUI() {
  const vaultContent = document.getElementById("vaultContent");
  const list = document.getElementById("vaultList");

  lockVault();

  if (vaultContent) {
    vaultContent.style.display = "none";
  }

  if (list) {
    list.innerHTML = "";
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

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied.");
  } catch (error) {
    console.error("Copy failed:", error);
    alert("Failed to copy.");
  }
}

async function renderVault() {
  const list = document.getElementById("vaultList");
  if (!list) return;

  list.innerHTML = "";

  try {
    const items = await getVaultItems();

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "list-item";

      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.justifyContent = "space-between";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "10px";
      wrapper.style.flexWrap = "wrap";

      const left = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent = item.name;

      const secret = document.createElement("span");
      secret.textContent = " • • • • • • • •";
      secret.dataset.revealed = "false";

      left.appendChild(title);
      left.appendChild(secret);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const revealBtn = document.createElement("button");
      revealBtn.textContent = "Reveal";
      revealBtn.type = "button";
      revealBtn.onclick = () => {
        const revealed = secret.dataset.revealed === "true";

        if (revealed) {
          secret.textContent = " • • • • • • • •";
          secret.dataset.revealed = "false";
          revealBtn.textContent = "Reveal";
        } else {
          secret.textContent = ` - ${item.value}`;
          secret.dataset.revealed = "true";
          revealBtn.textContent = "Hide";
        }
      };

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.type = "button";
      copyBtn.onclick = async () => {
        await copyToClipboard(item.value);
      };

      right.appendChild(revealBtn);
      right.appendChild(copyBtn);

      wrapper.appendChild(left);
      wrapper.appendChild(right);
      li.appendChild(wrapper);
      list.appendChild(li);
    });
  } catch (error) {
    console.error("Vault render failed:", error);
  }
}
