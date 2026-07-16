import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { CONFIRM_LABELS } from "./protocol";

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
    const now = new Date();
    let formatted: string;

    try {
      formatted = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: timeZone ?? "Asia/Calcutta",
      }).format(now);
    } catch {
      formatted = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "Asia/Calcutta",
      }).format(now);
    }

    return JSON.stringify({
      iso: now.toISOString(),
      formatted,
      requestedTimeZone: timeZone,
    });
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

export const donnaAgent = new Agent<DonnaRunContext>({
  name: "Donna",
  model: process.env.OPENAI_MODEL ?? "gpt-5.6",
  instructions: `You are Donna, a thoughtful personal AI assistant in a Chrome extension.

Help the user clearly and directly. Keep answers concise unless the task benefits from detail.
Remember and use relevant information from the current conversation.
Use get_server_time for current date or time questions.
Use get_current_page_context only when the user's request depends on the active browser page. Explain why page access is needed before requesting it when that is not obvious.
Never claim that you inspected a page or used a tool unless the tool returned successfully.
If the user declines page access, continue without it when possible and state the limitation.
Do not invent tool results, private data, or completed actions.`,
  tools: [getServerTime, getCurrentPageContext],
});
