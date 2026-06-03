// Persistent storage for the user's selected Excel file.
//
// FileSystemFileHandle objects (from showOpenFilePicker) are structured-cloneable
// but NOT JSON-serializable, so they cannot live in chrome.storage or
// localStorage. IndexedDB is the only place they survive across sessions, which
// is what lets the AI re-read the same file later without the user re-picking it.
//
// This module is shared by options.js (selection) and, later, the AI read tool.

const DB_NAME = "workupdate-files";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const EXCEL_HANDLE_KEY = "excelFileHandle";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = fn(store);
        tx.oncomplete = () => {
          db.close();
          resolve(result instanceof IDBRequest ? result.result : result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

/** Persist the picked Excel file handle so it can be re-read in future sessions. */
export function saveExcelHandle(handle) {
  return withStore("readwrite", (store) => store.put(handle, EXCEL_HANDLE_KEY));
}

/** Load the previously saved Excel file handle, or null if none was stored. */
export async function getExcelHandle() {
  const handle = await withStore("readonly", (store) =>
    store.get(EXCEL_HANDLE_KEY)
  );
  return handle || null;
}

/** Forget the stored Excel file handle. */
export function clearExcelHandle() {
  return withStore("readwrite", (store) => store.delete(EXCEL_HANDLE_KEY));
}

/**
 * Ensure we hold permission to read the file behind a handle. The first read in
 * a session may require a one-click re-grant; pass { prompt: true } only from a
 * user gesture (e.g. a button click), otherwise the prompt will be suppressed.
 */
export async function ensureReadPermission(handle, { prompt = false } = {}) {
  const options = { mode: "read" };
  try {
    if ((await handle.queryPermission(options)) === "granted") {
      return true;
    }
    if (prompt && (await handle.requestPermission(options)) === "granted") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function getExcelAccessStatus({ prompt = false } = {}) {
  const handle = await getExcelHandle();

  if (!handle) {
    return {
      status: "not_selected",
      message: "No Excel file has been selected.",
    };
  }

  const hasPermission = await ensureReadPermission(handle, { prompt });

  if (!hasPermission) {
    return {
      status: prompt ? "permission_denied" : "permission_required",
      name: handle.name,
      message: prompt
        ? "Excel file access was not granted. Click Grant access to allow it."
        : "Excel file access needs to be granted.",
    };
  }

  try {
    const file = await handle.getFile();
    return {
      status: "available",
      name: file.name,
      lastModified: file.lastModified,
      file,
    };
  } catch (error) {
    const isMissing =
      error instanceof DOMException &&
      (error.name === "NotFoundError" || error.name === "NotReadableError");

    return {
      status: isMissing ? "file_missing" : "read_error",
      name: handle.name,
      message: isMissing
        ? "The selected Excel file was moved, deleted, or renamed. Re-select it in Settings."
        : error instanceof Error
          ? `Could not read the selected Excel file: ${error.message}`
          : "Could not read the selected Excel file.",
    };
  }
}

/**
 * Read the current bytes of the saved Excel file, or return a clear status when
 * the file is not available.
 */
export async function readExcelFile({ prompt = false } = {}) {
  const access = await getExcelAccessStatus({ prompt });

  if (access.status !== "available") {
    return access;
  }

  const file = access.file;
  return {
    status: "ok",
    name: file.name,
    lastModified: file.lastModified,
    arrayBuffer: await file.arrayBuffer(),
  };
}
