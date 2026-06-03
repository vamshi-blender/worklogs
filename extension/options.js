import {
  saveExcelHandle,
  getExcelAccessStatus,
  clearExcelHandle,
} from "./fileStore.js";

const DEFAULT_BACKEND_URL = "https://worklogs-wheat.vercel.app";
const form = document.querySelector("#settingsForm");
const backendUrlInput = document.querySelector("#backendUrl");
const chooseButton = document.querySelector("#chooseExcelFile");
const grantButton = document.querySelector("#grantExcelAccess");
const clearButton = document.querySelector("#clearExcelFile");
const selectedFileElement = document.querySelector("#selectedFile");
const statusElement = document.querySelector("#status");

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
  clearButton.hidden = access.status === "not_selected";
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
  backendUrlInput.value = stored.backendUrl || DEFAULT_BACKEND_URL;
});

refreshSelectedFile();

chooseButton.addEventListener("click", async () => {
  if (typeof window.showOpenFilePicker !== "function") {
    setStatus("This browser does not support persistent file access.");
    return;
  }

  try {
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
  renderSelectedFile(await getExcelAccessStatus({ prompt: true }));
});

clearButton.addEventListener("click", async () => {
  await clearExcelHandle();
  renderSelectedFile({ status: "not_selected" });
  setStatus("File selection cleared.", true);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const backendUrl = backendUrlInput.value.trim().replace(/\/+$/, "");
  await chrome.storage.sync.set({ backendUrl });

  setStatus("Saved.", true);
});
