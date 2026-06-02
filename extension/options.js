const DEFAULT_BACKEND_URL = "http://localhost:3000";
const form = document.querySelector("#settingsForm");
const backendUrlInput = document.querySelector("#backendUrl");
const statusElement = document.querySelector("#status");

chrome.storage.sync.get(["backendUrl"]).then((stored) => {
  backendUrlInput.value = stored.backendUrl || DEFAULT_BACKEND_URL;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const backendUrl = backendUrlInput.value.trim().replace(/\/+$/, "");
  await chrome.storage.sync.set({ backendUrl });

  statusElement.textContent = "Saved.";
  setTimeout(() => {
    statusElement.textContent = "";
  }, 1800);
});
