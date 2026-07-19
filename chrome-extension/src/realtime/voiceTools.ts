import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import { executeClientTool } from "../api/clientTools";
import { executeRealtimeServerTool } from "../api/realtime";

const serverTimeParameters = z
  .object({ timeZone: z.string().nullable() })
  .strict();

const pmsLookupParameters = z
  .object({
    lookup: z.enum([
      "getLeaveBalance",
      "getLeaveCalendar",
      "getLeaveApplicationStatus",
    ]),
  })
  .strict();

interface VoiceToolOptions {
  requestEnd: () => void;
}

export function createVoiceTools({ requestEnd }: VoiceToolOptions) {
  return [
    tool({
      name: "get_server_time",
      description:
        "Return the current server date and time. Use this to resolve current or relative dates before date-sensitive PMS lookups.",
      parameters: serverTimeParameters,
      async execute(input) {
        const result = await executeRealtimeServerTool("get_server_time", input);
        return JSON.stringify(result);
      },
    }),
    tool({
      name: "pms_lookup",
      description:
        "Read live PMS leave balances, existing leave days, or leave application statuses using the user's signed-in extension session. Never invent PMS data instead of calling this tool.",
      parameters: pmsLookupParameters,
      async execute(input, _runContext, details) {
        const callId = details?.toolCall?.callId ?? crypto.randomUUID();
        const result = await executeClientTool({
          runId: "realtime",
          toolCallId: callId,
          name: "pms_lookup",
          executor: "client",
          arguments: input,
          title: "Read PMS data",
          description: "Read the requested PMS data using your signed-in session.",
          confirmLabel: "Continue",
          requiresApproval: true,
        });
        return JSON.stringify(result);
      },
    }),
    tool({
      name: "end_voice_session",
      description:
        "End the current Realtime voice conversation. Use only when the user clearly asks to end, stop, leave, or says goodbye. Say one brief goodbye before calling this tool.",
      parameters: z.object({}).strict(),
      async execute() {
        requestEnd();
        return JSON.stringify({ ending: true });
      },
    }),
  ];
}
