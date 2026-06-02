import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  currentDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timeZone: z.string().trim().min(1).max(120).optional(),
});

const worklogCategories = [
  "Demo Call",
  "Task Creation",
  "Regression Suite Execution",
  "Code Re-work / Updation",
  "Requirement Gathering",
  "Client Meeting",
  "KB - Academy",
  "KB - Articles",
  "KB - Release Notes",
  "PM - Product Tips",
  "KB - Analysis",
  "SRS Document",
  "SRS Document Review",
  "Review Test Scenarios",
  "Review Automated Test Cases",
  "Paid Clients Testing",
  "Review Fail Test Scripts",
  "Webinars",
  "Sprint Planning",
  "Roadmap Planning",
  "System Integration Testing",
  "UI/UX Designs",
  "UI/UX Designs Review",
  "Performance Reviews",
  "Leads Discussion",
  "POD Owner Discussion",
  "Dynamic Automation",
  "Review invalid test cases",
  "Review automated test cases and update in Main regression suite",
  "Dynamic Coding",
  "Dynamic Code Review",
  "Weekly Status Report",
  "Daily Status Report",
  "Functional Clarifications",
  "Documentation Preparation",
  "Mobile Automation Setup",
  "Failed Cases Analysis",
  "Dynamic Code Rework",
  "Team Coordination",
  "Performance Testing",
  "RCA for Production Bugs",
  "Exploratory Testing",
  "Re create paid client apps",
  "Regression suite Creation",
  "Re assignment of manual test cases",
  "Tasks Review",
  "Automation Functional Review",
  "Implementation issues",
  "Consolidate test cases sheet of each sprint",
  "Test scenarios preparation",
  "Logging a new bug",
  "Not reproduce Issues",
  "Product Blogs",
  "Product Feature Videos",
  "Product Marketing",
  "Interview",
  "General Meeting",
  "Bug Analysis",
  "Proof of Concept",
  "Knowledge Transfer (KT)",
  "Coding",
  "Code Review",
  "QA Automation Scripts Preparation",
  "Brainstorming & Discussions",
  "Code Refactoring",
  "Build Deployment",
  "Certification",
  "QA Test Case Execution (Manual)",
  "QA Mini Regression / Impact Testing",
  "QA Test Automation",
  "QA System Testing",
  "QA Mobile Testing",
  "QA Test Case Review",
  "Competitor Analysis",
  "Research",
  "Up Skill",
  "Product Training",
  "Whitebox Testing",
  "QA Sanity Testing",
  "QA Test Case Preparation",
  "QA Re-testing of Resolved Bugs",
  "Requirement KT by BA",
  "QA Regression Testing",
  "UI UX Design Reviews (Ripple)",
  "QA Automation Scripts Execution",
  "Unit Testing",
  "Scrum Calls",
  "Design Document",
  "Implementation Support to CS",
  "Design Document Review",
  "Requirement Analysis",
  "KB - User Guides",
  "PM - Community",
  "Dev Box Testing",
  "API Testing",
  "Mobile Unit Testing",
  "Mobile Functional Review",
  "Dynamic Unit Testing",
  "Dynamic Code Updates for New Improvements",
  "Bug Impact Analysis",
  "Dynamic Functional Review",
  "Impact Analysis",
  "Automated Test cases Verification",
  "Automation Enhancements & Implementation",
  "Failed Cases Fixes",
  "Client Implementations",
  "Test case updation",
  "Practice On Application",
  "Status Call",
  "Check List Review Call",
  "Security Testing",
  "Bug Review",
  "Installation or Set Up",
  "Implementations",
  "Testing Training",
  "Post Deployment Sanity",
  "Study SRS Document",
  "CMMIL3 verification and validation documentation",
  "Backlog Improvements Testing",
  "CM Dashboards",
  "Use Case Building",
  "Functional Testing Review",
  "Home Replica Testing",
  "Listscreen segregation",
  "Quality Assurance & Compliance Review",
  "Project Management",
  "Design",
  "Hotfix Build Coordination",
  "Caddie Testing",
  "Prod Issue Analysis",
  "Product Management Activities",
  "Bug Reopened",
  "Bugs/improvements status followup",
  "Pre-requisites creation for revamp",
  "Validating/ Reproducing in Local Environment",
] as const;

const worklogDraftSchema = z.object({
  issueId: z
    .string()
    .trim()
    .regex(/^Q[A-Z]{2}-\d+$/i, "Use the PMS issue id, for example QXY-53833."),
  worklogDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  hours: z.number().positive().max(24),
  category: z.enum(worklogCategories),
  description: z.string().trim().min(1).max(2000),
});

type WorklogDraft = z.infer<typeof worklogDraftSchema>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const chatAgent = new Agent({
  name: "Workupdate Assistant",
  model: process.env.OPENAI_MODEL ?? "gpt-5.5",
  instructions: [
    "You are Workupdate Assistant, a concise helper inside a Chrome side panel.",
    "You help users chat normally and prepare PMS worklogs when requested.",
    "When the user asks to raise, create, submit, add, or log a worklog, collect exactly these required values: issue id, worklog date, hours, category, and log description.",
    "Preserve the issue id exactly as the user provides it, except for uppercasing letters. Never change or guess the project prefix, for example do not convert QXY to QKA.",
    `Choose category only from this exact allowed list: ${worklogCategories.join(", ")}.`,
    "If the user provides a close or broad category, map it to the best allowed category using the work description and wording. For example, API flow/testing maps to API Testing, coding maps to Coding, code review maps to Code Review, unit testing maps to Unit Testing, scrum/status calls map to Scrum Calls or Status Call, and bug investigation maps to Bug Analysis or Prod Issue Analysis depending on context.",
    "If no allowed category is a confident match, ask the user to clarify the category instead of calling the tool.",
    "Be helpful with minimal input: infer category from the work wording when there is a confident match, and write a short professional log description from the user's stated task if they did not provide one explicitly.",
    "Do not fabricate unrelated details. If the issue id, date, hours, or enough work context to choose a category/description is missing or genuinely ambiguous, ask a short follow-up question for only the missing values.",
    "Resolve relative dates such as today, yesterday, and tomorrow using the Current date context in the prompt. Always pass worklogDate as YYYY-MM-DD.",
    "Accept hours as a positive decimal number. If the user gives hours and minutes, convert them to decimal hours.",
    "When all required values are present, call the prepare_worklog tool. The tool prepares only the minimal draft values; it does not know PMS metadata and does not use PMS tokens.",
    "After preparing a draft, respond with the exact details that will be used: issue id, worklog date, hours, category, and log description. Ask the user to reply Create, Confirm, or Yes to save it. Do not claim it has been saved unless the extension later confirms that.",
    "Keep answers concise unless the user asks for detail.",
  ].join(" "),
});

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return json(
      { error: "OPENAI_API_KEY is not configured on the backend." },
      500,
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return json(
      { error: "Send 1-30 messages with role and non-empty content." },
      400,
    );
  }

  const messages = parsed.data.messages;
  const prompt = formatMessagesForAgent(messages, {
    currentDate: parsed.data.currentDate || getTodayInTimeZone("Asia/Calcutta"),
    timeZone: parsed.data.timeZone || "Asia/Calcutta",
  });
  let worklogDraft: WorklogDraft | null = null;

  const prepareWorklog = tool({
    name: "prepare_worklog",
    description:
      "Prepare the minimal values needed by the browser extension to create a PMS worklog. Use this only after the user has provided issue id, worklog date, hours, category, and log description. The category must be one exact value from the allowed PMS category enum. Preserve the user's issue id prefix exactly, only uppercasing letters if needed. This tool does not save the worklog and must not include PMS metadata such as project id, issue record id, assignee, user id, department, bearer token, or workflow fields.",
    parameters: worklogDraftSchema,
    async execute(input) {
      worklogDraft = input;

      return {
        status: "draft_ready",
        draft: input,
        nextStep:
          "The extension should place these values in the Worklog screen for review and creation.",
      };
    },
  });

  const agent = chatAgent.clone({
    tools: [prepareWorklog],
  });

  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };

        try {
          const result = await run(agent, prompt, { stream: true });
          let reply = "";

          send({ type: "ready" });

          for await (const event of result) {
            if (
              event.type !== "raw_model_stream_event" ||
              event.data.type !== "output_text_delta"
            ) {
              continue;
            }

            reply += event.data.delta;
            send({ type: "delta", value: event.data.delta });
          }

          await result.completed;
          send({
            type: "done",
            reply:
              reply ||
              (typeof result.finalOutput === "string"
                ? result.finalOutput
                : JSON.stringify(result.finalOutput)),
            worklogDraft,
          });
        } catch (error) {
          send({
            type: "error",
            error: error instanceof Error ? error.message : "The agent run failed.",
          });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

function formatMessagesForAgent(
  messages: z.infer<typeof messageSchema>[],
  context: { currentDate: string; timeZone: string },
) {
  const transcript = messages
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
    )
    .join("\n\n");

  return [
    "Continue this chat. Use the full transcript for context, then answer only the latest user message.",
    `Current date: ${context.currentDate}. Time zone: ${context.timeZone}.`,
    "",
    transcript,
  ].join("\n");
}

function getTodayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}
