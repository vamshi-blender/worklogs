// Bridges the manifest bundle to Donna's tool layer: generates the Zod
// schema for submit_pms_action's fields from a manifest's input slots
// ("adding a manifest gives Donna a new capability, no new tool"), and the
// capabilities catalog list_pms_capabilities returns. Single source of
// truth: the manifest files.
import { z } from "zod";
import { getPmsBundle } from "./bundle";
import type { PmsInputSlot } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function slotSchema(slot: PmsInputSlot): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (slot.type) {
    case "enum":
      schema = z.enum((slot.options ?? []) as [string, ...string[]]);
      break;
    case "date":
      schema = z.string().regex(DATE_PATTERN, "Expected YYYY-MM-DD");
      break;
    case "boolean":
      schema = z.boolean();
      break;
    default:
      schema = slot.maxLength
        ? z.string().min(1).max(slot.maxLength)
        : z.string().min(1);
  }
  schema = schema.describe(slot.description);
  // Structured outputs require every key present; optional slots are
  // expressed as nullable, mirroring the existing tool conventions.
  return slot.required ? schema : schema.nullable();
}

export function actionFieldsShape(
  slots: PmsInputSlot[],
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const slot of slots) shape[slot.name] = slotSchema(slot);
  return shape;
}

/** Functional catalog for list_pms_capabilities — what Donna can do in PMS. */
export function capabilitiesCatalog(): unknown {
  const bundle = getPmsBundle();
  return {
    actions: Object.entries(bundle.actions).map(([actionName, manifest]) => ({
      actionName,
      title: manifest.title,
      description: manifest.description,
      userFields: manifest.inputs.map((slot) => ({
        name: slot.name,
        label: slot.label,
        type: slot.type,
        options: slot.options ?? null,
        required: slot.required,
        description: slot.description,
      })),
      businessRules: manifest.rules.map((rule) => rule.message),
      confirmation:
        "The extension shows an in-UI approval card before executing; do not ask for verbal confirmation in chat.",
      executedBy: "the Chrome extension, locally with the user's PMS session",
    })),
    lookups: Object.entries(bundle.lookups)
      .filter(([, lookup]) => lookup.queryable)
      .map(([name, lookup]) => ({
        resolverName: name,
        description: lookup.description,
      })),
  };
}
