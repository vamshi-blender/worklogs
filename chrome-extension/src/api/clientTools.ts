import type { ClientToolRequest } from "./protocol";

interface PageContextArguments {
  includeSelection: boolean;
  maxCharacters: number;
}

function parsePageContextArguments(
  value: Record<string, unknown>,
): PageContextArguments {
  if (
    typeof value.includeSelection !== "boolean" ||
    typeof value.maxCharacters !== "number" ||
    !Number.isInteger(value.maxCharacters) ||
    value.maxCharacters < 500 ||
    value.maxCharacters > 12_000
  ) {
    throw new Error("Donna requested invalid page-reading options.");
  }

  return {
    includeSelection: value.includeSelection,
    maxCharacters: value.maxCharacters,
  };
}

function readPageContext(options: PageContextArguments) {
  const selectedText = options.includeSelection
    ? window.getSelection()?.toString().trim() ?? ""
    : "";
  const visibleText = (document.body?.innerText ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, options.maxCharacters);

  return {
    url: window.location.href,
    title: document.title,
    selectedText,
    visibleText,
    truncated: visibleText.length >= options.maxCharacters,
  };
}

export async function executeClientTool(request: ClientToolRequest) {
  if (request.name !== "get_current_page_context") {
    throw new Error("Donna requested a browser tool that is not allowed.");
  }

  const args = parsePageContextArguments(request.arguments);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active browser tab is available.");

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: readPageContext,
    args: [args],
  });

  if (!execution || execution.result === undefined) {
    throw new Error("The active page did not return any readable content.");
  }

  return execution.result;
}
