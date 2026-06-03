import {
  saveExcelHandle,
  getExcelAccessStatus,
} from "./fileStore.js";

const DEFAULT_BACKEND_URL = "https://worklogs-wheat.vercel.app/";
const form = document.querySelector("#settingsForm");
const chooseButton = document.querySelector("#chooseExcelFile");
const grantButton = document.querySelector("#grantExcelAccess");
const selectedFileElement = document.querySelector("#selectedFile");
const statusElement = document.querySelector("#status");
const backendUrlOptions = Array.from(
  document.querySelectorAll("input[name='backendUrl']"),
);

function setStatus(message, transient = false) {
  statusElement.textContent = message;
  if (transient && message) {
    setTimeout(() => {
      statusElement.textContent = "";
    }, 1800);
  }
}

function renderSelectedFile(access) {
  selectedFileElement.textContent = access.name || "No file selected.";
  selectedFileElement.title = access.name || "";
  grantButton.hidden = !["permission_required", "permission_denied"].includes(
    access.status,
  );

  if (access.status === "available" || access.status === "not_selected") {
    setStatus("");
    return;
  }

  setStatus(access.message || "Excel file is not available.");
}

async function refreshSelectedFile() {
  try {
    renderSelectedFile(await getExcelAccessStatus());
  } catch (error) {
    renderSelectedFile({ status: "not_selected" });
    setStatus(`Could not load saved file: ${error.message}`);
  }
}

chrome.storage.sync.get(["backendUrl"]).then((stored) => {
  const selectedUrl = normalizeUrl(stored.backendUrl || DEFAULT_BACKEND_URL);
  const matchingOption =
    backendUrlOptions.find((option) => normalizeUrl(option.value) === selectedUrl) ||
    backendUrlOptions.find((option) => normalizeUrl(option.value) === normalizeUrl(DEFAULT_BACKEND_URL));

  if (matchingOption) {
    matchingOption.checked = true;
  }
});

refreshSelectedFile();

chooseButton.addEventListener("click", async () => {
  if (typeof window.showOpenFilePicker !== "function") {
    setStatus("This browser does not support persistent file access.");
    return;
  }

  try {
    setStatus("Opening file picker...");
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Excel spreadsheet",
          accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              [".xlsx"],
            "application/vnd.ms-excel": [".xls"],
          },
        },
      ],
    });

    await saveExcelHandle(handle);
    renderSelectedFile(await getExcelAccessStatus({ prompt: true }));
    setStatus("File selected and remembered.", true);
  } catch (error) {
    // The user dismissing the picker rejects with AbortError - not an error.
    if (error.name !== "AbortError") {
      setStatus(`Could not select file: ${error.message}`);
    }
  }
});

grantButton.addEventListener("click", async () => {
  setStatus("Requesting Excel file access...");
  renderSelectedFile(await getExcelAccessStatus({ prompt: true }));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving settings...");

  const selectedOption = backendUrlOptions.find((option) => option.checked);
  const backendUrl = selectedOption?.value || DEFAULT_BACKEND_URL;
  await chrome.storage.sync.set({ backendUrl });

  setStatus("Saved.", true);
});

function normalizeUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}
