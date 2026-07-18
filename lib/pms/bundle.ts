// Assembles the PMS manifest bundle served to the extension and used to
// generate Donna's tool schemas + capability catalog. Adding a new PMS
// action = write its manifest file and register it here; nothing else.
import type { PmsBundle } from "./types";
import {
  leaveApplicationManifest,
  leaveLookups,
} from "./manifests/leave-application";

// Bump when the bundle shape (not just its content) changes, so the
// extension can reject bundles it doesn't understand.
export const PMS_BUNDLE_VERSION = 1;

export function getPmsBundle(): PmsBundle {
  return {
    version: PMS_BUNDLE_VERSION,
    lookups: { ...leaveLookups },
    actions: {
      create_leave_application: leaveApplicationManifest,
    },
  };
}

/** Names of lookups Donna may call standalone via pms_lookup. */
export function queryableLookupNames(): string[] {
  return Object.entries(getPmsBundle().lookups)
    .filter(([, definition]) => definition.queryable)
    .map(([name]) => name);
}

export function actionNames(): string[] {
  return Object.keys(getPmsBundle().actions);
}
