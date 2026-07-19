import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { actionNames, getPmsBundle, queryableLookupNames } from "../pms/bundle";
import { actionFieldsShape, capabilitiesCatalog } from "../pms/schema";
import { CONFIRM_LABELS } from "./protocol";
import { getServerTimeResult } from "./server-time";

export interface ClientToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface DonnaRunContext {
  clientToolResults: Record<string, ClientToolResult>;
}

const serverTimeParameters = z
  .object({
    timeZone: z.string().nullable(),
  })
  .strict();

const getServerTime = tool({
  name: "get_server_time",
  description:
    "Return the current server date and time. Use this whenever the user asks for the current date or time.",
  parameters: serverTimeParameters,
  async execute({ timeZone }) {
    return JSON.stringify(getServerTimeResult({ timeZone }));
  },
});

// Every tool that needsApproval must include these fields in its parameters.
// The model fills them when it makes the tool call, so the approval card the
// user sees is specific to what the tool is about to do.
const approvalPresentationFields = {
  approvalTitle: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Short question asking the user to approve this exact action, specific to the current request — never a generic permission prompt.",
    ),
  approvalDescription: z
    .string()
    .min(1)
    .max(240)
    .describe(
      "One or two sentences telling the user precisely what will happen and what data is involved, phrased for this specific request.",
    ),
  confirmLabel: z
    .enum(CONFIRM_LABELS)
    .describe("The approve-button verb that best matches the action."),
};

const pageContextParameters = z
  .object({
    includeSelection: z.boolean(),
    maxCharacters: z.number().int().min(500).max(12_000),
    ...approvalPresentationFields,
  })
  .strict();

const getCurrentPageContext = tool<
  typeof pageContextParameters,
  DonnaRunContext,
  string
>({
  name: "get_current_page_context",
  description:
    "Ask the browser extension for the active page URL, title, selected text, and visible page text. Use only when the user's request depends on the page they are viewing.",
  parameters: pageContextParameters,
  needsApproval: async () => true,
  async execute(_input, runContext, details) {
    const callId = details?.toolCall?.callId;
    if (!callId) {
      throw new Error("The browser tool call did not include a call ID.");
    }

    const result = runContext?.context.clientToolResults[callId];
    if (!result) {
      throw new Error("The browser did not return a result for this tool call.");
    }

    if (!result.ok) {
      return `The browser tool could not read the page: ${result.error ?? "unknown error"}`;
    }

    return JSON.stringify(result.data);
  },
});

// ---------------------------------------------------------------------------
// PMS tools — three generic tools regardless of how many manifests exist.
// Both pms_lookup and submit_pms_action execute in the Chrome extension with
// the user's live PMS session (the pause/resume roundtrip IS the handoff);
// their execute() here only relays the extension's result, same pattern as
// getCurrentPageContext.
// ---------------------------------------------------------------------------

function relayClientResult(
  runContext: { context: DonnaRunContext } | undefined,
  callId: string | undefined,
  failurePrefix: string,
): string {
  if (!callId) throw new Error("The tool call did not include a call ID.");
  const result = runContext?.context.clientToolResults[callId];
  if (!result) {
    throw new Error("The extension did not return a result for this tool call.");
  }
  if (!result.ok) {
    return `${failurePrefix}: ${result.error ?? "unknown error"}`;
  }
  return JSON.stringify(result.data);
}

const pmsLookupParameters = z
  .object({
    lookup: z
      .enum(queryableLookupNames() as [string, ...string[]])
      .describe("Which PMS lookup to run."),
  })
  .strict();

const pmsLookup = tool<typeof pmsLookupParameters, DonnaRunContext, string>({
  name: "pms_lookup",
  description:
    "Read live data from the PMS with the user's session: leave balances, existing leave days, or leave application statuses. Runs silently in the extension; use it freely to answer PMS data questions. Never invent PMS data instead of calling this.",
  parameters: pmsLookupParameters,
  // Client tools always "need approval" — the pause/resume roundtrip is how
  // execution reaches the extension. The extension auto-approves this one
  // silently (read-only), so the user never sees a card for it.
  needsApproval: async () => true,
  async execute(_input, runContext, details) {
    return relayClientResult(
      runContext,
      details?.toolCall?.callId,
      "The PMS lookup failed",
    );
  },
});

// Fields schema is generated from the manifest's input slots. With a second
// action this becomes a per-action union keyed on actionName; the extension
// executor independently re-validates fields against the manifest either way.
const submitPmsActionParameters = z
  .object({
    actionName: z
      .enum(actionNames() as [string, ...string[]])
      .describe("Which PMS manifest action to execute."),
    fields: z
      .object(
        actionFieldsShape(
          getPmsBundle().actions.create_leave_application.inputs,
        ),
      )
      .strict()
      .describe("The user-facing form fields, collected conversationally."),
    ...approvalPresentationFields,
  })
  .strict();

const submitPmsAction = tool<
  typeof submitPmsActionParameters,
  DonnaRunContext,
  string
>({
  name: "submit_pms_action",
  description:
    "Submit one PMS action (e.g. a leave application) for real, using the user's PMS session in the extension. This creates an actual record and routes it into the PMS workflow. The extension shows the user an approval card before executing — call this directly once the fields are collected; never ask for verbal confirmation in chat first.",
  parameters: submitPmsActionParameters,
  needsApproval: async () => true,
  async execute(_input, runContext, details) {
    return relayClientResult(
      runContext,
      details?.toolCall?.callId,
      "The PMS action failed",
    );
  },
});

const listPmsCapabilities = tool({
  name: "list_pms_capabilities",
  description:
    "List the PMS actions and data lookups Donna currently supports, with their fields and business rules. Use when the user asks what you can do in PMS, or before collecting fields for an action.",
  parameters: z.object({}).strict(),
  async execute() {
    return JSON.stringify(capabilitiesCatalog());
  },
});

export const donnaAgent = new Agent<DonnaRunContext>({
  name: "Donna",
  model: process.env.OPENAI_MODEL ?? "gpt-5.6",
  instructions: `You are Donna, a thoughtful personal AI assistant in a Chrome extension.

Help the user clearly and directly. Keep answers concise unless the task benefits from detail.
Remember and use relevant information from the current conversation.
For tool-heavy work, use brief commentary updates before and between tool calls so the user can follow meaningful progress. Put only the completed answer in the final answer phase, and do not repeat the entire work log there.
Use get_server_time for current date or time questions.
Use get_current_page_context only when the user's request depends on the active browser page. Explain why page access is needed before requesting it when that is not obvious.

PMS (the user's Quixy project-management system):
Use pms_lookup for read-only PMS questions (leave balance, existing leave days, application statuses). It runs silently with the user's session; call it directly instead of asking the user for data it can fetch. Resolve relative dates with get_server_time first.
Use list_pms_capabilities when the user asks what PMS actions you support, or to check an action's fields and rules before collecting them.
For PMS actions (submit_pms_action): collect the user-facing fields conversationally. Check the business rules from list_pms_capabilities early and tell the user immediately if their request violates one (for example leave ranges crossing a calendar month or ending after the 25th) instead of collecting the rest of the fields first.
Submitting: once all required fields are collected, call submit_pms_action directly — do NOT ask for verbal or typed confirmation first. The extension shows the user an approval card with the action details before anything executes; that card is the one and only confirmation step, and declining it cancels the submission. Put the key details (leave type, dates, days, reason) in the approvalDescription so the card is self-explanatory. Set acknowledgment to true; the user's approval on the card is the acknowledgment. Dates are YYYY-MM-DD.
The submission executes locally in the user's extension; report the returned record ID to the user, and never claim a submission happened unless the tool returned success.

Never claim that you inspected a page or used a tool unless the tool returned successfully.
If the user declines page access, continue without it when possible and state the limitation.
Do not invent tool results, private data, or completed actions.
Do not use em dashes in your final answer. Use a colon or parentheses instead.`,
  tools: [
    getServerTime,
    getCurrentPageContext,
    pmsLookup,
    submitPmsAction,
    listPmsCapabilities,
  ],
});
