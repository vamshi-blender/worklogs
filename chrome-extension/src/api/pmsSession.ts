// Anchors each extension session to a Chrome tab group that is guaranteed to
// contain a PMS tab. The group's ID is the session scope: stored once when
// the extension is opened from the toolbar icon, shared by the side panel and
// the pop-out, cleared when the group closes, and gone with the browser
// session. Tools will later resolve "the page" through this scope instead of
// the focused window (out of scope for now — see getSessionTabs).

export const PMS_HOSTNAMES = [
  "quixyhome.kwixee.co.in",
  // Unauthenticated visits redirect here, so the login page is still PMS.
  "quixyhomeapp.kwixee.co.in",
];

export const PMS_HOME_URL = "https://quixyhome.kwixee.co.in";

const SESSION_GROUP_KEY = "donnaTabGroupId";

export function isPmsUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return PMS_HOSTNAMES.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function createPmsTab(windowId: number): Promise<number> {
  const tab = await chrome.tabs.create({
    url: PMS_HOME_URL,
    windowId,
    active: true,
  });
  if (tab.id === undefined) throw new Error("Could not open the PMS tab.");
  return tab.id;
}

async function setSessionGroup(groupId: number): Promise<number> {
  await chrome.storage.session.set({ [SESSION_GROUP_KEY]: groupId });
  return groupId;
}

/**
 * Makes sure the clicked tab belongs to a tab group containing a PMS tab,
 * creating the PMS tab and/or the group as needed, and stores that group as
 * the session scope. Explicit icon clicks re-anchor the session; passive
 * focus changes never do.
 */
export async function ensureSessionTabGroup(
  tab: chrome.tabs.Tab,
): Promise<number> {
  if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    const members = await chrome.tabs.query({ groupId: tab.groupId });
    if (!members.some((member) => isPmsUrl(member.url))) {
      const pmsTabId = await createPmsTab(tab.windowId);
      await chrome.tabs.group({ tabIds: [pmsTabId], groupId: tab.groupId });
    }
    return setSessionGroup(tab.groupId);
  }

  const anchorTabId =
    isPmsUrl(tab.url) && tab.id !== undefined
      ? tab.id
      : await createPmsTab(tab.windowId);
  const groupId = await chrome.tabs.group({
    tabIds: [anchorTabId],
    createProperties: { windowId: tab.windowId },
  });
  // Only groups Donna creates get named; user-made groups keep their identity.
  await chrome.tabGroups.update(groupId, { title: "Donna", color: "blue" });
  return setSessionGroup(groupId);
}

/**
 * Session flow for the side panel, run by the panel page when it mounts.
 * The panel is opened natively by Chrome (openPanelOnActionClick), because
 * calling sidePanel.open() from a cold-started service worker loses the
 * click's user gesture; the panel document is created on every open, so
 * mounting is the reliable "extension was opened here" signal. From a panel
 * document, currentWindow is the browser window the panel is docked to.
 */
export async function establishSessionFromCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await ensureSessionTabGroup(tab);
}

/** The session's tab-group ID, or null if none was set or the group closed. */
export async function getSessionTabGroupId(): Promise<number | null> {
  const stored = await chrome.storage.session.get(SESSION_GROUP_KEY);
  const groupId = stored[SESSION_GROUP_KEY];
  if (typeof groupId !== "number") return null;
  try {
    await chrome.tabGroups.get(groupId);
    return groupId;
  } catch {
    await chrome.storage.session.remove(SESSION_GROUP_KEY);
    return null;
  }
}

/** Tabs inside the session scope — the set future tools should operate on. */
export async function getSessionTabs(): Promise<chrome.tabs.Tab[]> {
  const groupId = await getSessionTabGroupId();
  if (groupId === null) return [];
  return chrome.tabs.query({ groupId });
}

/**
 * Ends the session if `groupId` is the one currently anchoring it: clears the
 * stored scope and tells every open extension page to close itself, since
 * there is no longer a tab group for the session to operate on. Safe to call
 * speculatively — a no-op if `groupId` isn't the active session.
 */
export async function endSessionIfGroup(groupId: number): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_GROUP_KEY);
  if (stored[SESSION_GROUP_KEY] !== groupId) return;

  await chrome.storage.session.remove(SESSION_GROUP_KEY);
  // No listener (e.g. no extension page open) rejects with "Receiving end
  // does not exist"; that's expected and not an error worth surfacing.
  await chrome.runtime.sendMessage({ type: "session-ended" }).catch(() => {});
}

/** True if the group still exists and contains at least one PMS tab. */
async function groupHasPmsTab(groupId: number): Promise<boolean> {
  try {
    const members = await chrome.tabs.query({ groupId });
    return members.some((member) => isPmsUrl(member.url));
  } catch {
    return false;
  }
}

/**
 * Ends the session if `groupId` is the active one and no longer has a PMS
 * tab in it (the group itself may still be open with other tabs). Called
 * after a tab closes or leaves the group — events that don't by themselves
 * mean the group is gone, unlike chrome.tabGroups.onRemoved.
 */
export async function endSessionIfGroupLostPmsTab(groupId: number): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_GROUP_KEY);
  if (stored[SESSION_GROUP_KEY] !== groupId) return;
  if (await groupHasPmsTab(groupId)) return;
  await endSessionIfGroup(groupId);
}
