import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_EXCEL_BASE64_CHARS = 8_500_000;

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
  debugTools: z.boolean().optional(),
  excelFile: z
    .object({
      name: z.string().trim().min(1).max(260),
      lastModified: z.number().optional(),
      dataBase64: z.string().min(1).max(MAX_EXCEL_BASE64_CHARS),
    })
    .optional(),
  excelAccess: z
    .object({
      status: z.enum([
        "available",
        "not_selected",
        "permission_required",
        "permission_denied",
        "file_missing",
        "read_error",
        "file_too_large",
      ]),
      name: z.string().trim().max(260).optional(),
      message: z.string().trim().max(1000).optional(),
    })
    .optional(),
});

const excelMetadataToolSchema = z.object({});

// Kept for the disabled read_excel_data tool registration below.
// const excelToolSchema = z.object({
//   sheetName: z.string().trim().min(1).max(120),
// });

const excelRangeCsvToolSchema = z.object({
  sheetName: z.string().trim().min(1).max(120),
  range: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,3}\d+:[A-Z]{1,3}\d+$/i, "Use an A1 range, for example A1:I39."),
});

const MAX_EXCEL_BYTES = 6 * 1024 * 1024;
const MAX_EXCEL_SHEETS = 25;
const MAX_EXCEL_ROWS_PER_SHEET = 150;
const MAX_EXCEL_COLUMNS_PER_SHEET = 40;
const MAX_EXCEL_CELL_CHARS = 100;
const MAX_CSV_RANGE_ROWS = 120;
const MAX_CSV_RANGE_COLUMNS = 20;

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
    "You are Workupdate Assistant inside a Chrome side panel. Be concise, practical, and action-oriented.",
    "Active tools: get_excel_metadata, get_range_as_csv, create_worklog. Do not mention or use disabled tools.",
    "Use tools instead of asking avoidable questions. If the user says read from Excel, check Excel, use Excel, from sheet, today's status, what did I do today, or similar, call get_excel_metadata immediately unless the current conversation already has fresh sheet metadata.",
    "Excel workflow: 1) call get_excel_metadata, 2) choose the most likely sheet from the user's date or the Current date month, 3) call get_range_as_csv with a precise A1 range from metadata, 4) answer from the CSV only. For a date-specific question, read the relevant month sheet and find the date block in the CSV. If metadata is unavailable, tell the user the Excel access problem from the tool result.",
    "Worklog workflow: collect exactly these values: issue id, worklog date, hours, category, and log description. If the user asks to raise/log a worklog and says to read from Excel, use Excel to infer date, hours, category, and description when possible, then ask only for values still missing, usually issue id.",
    "Preserve the issue id exactly as the user provides it, except for uppercasing letters. Never change or guess the project prefix, for example do not convert QXY to QKA.",
    `Choose category only from this exact allowed list: ${worklogCategories.join(", ")}.`,
    "If the user provides a close or broad category, map it to the best allowed category using the work description and wording. For example, API flow/testing maps to API Testing, coding maps to Coding, code review maps to Code Review, unit testing maps to Unit Testing, scrum/status calls map to Scrum Calls or Status Call, and bug investigation maps to Bug Analysis or Prod Issue Analysis depending on context.",
    "If no allowed category is a confident match, ask the user to clarify the category instead of calling create_worklog.",
    "Be helpful with minimal input: infer category from the work wording when there is a confident match, and write a short professional log description from the user's stated task or Excel row if they did not provide one explicitly.",
    "Do not fabricate unrelated details. If issue id, date, hours, or enough work context to choose category/description is missing after using available tools, ask a short follow-up for only the missing values.",
    "Resolve relative dates such as today, yesterday, and tomorrow using the Current date context in the prompt. Always pass worklogDate as YYYY-MM-DD.",
    "Accept hours as a positive decimal number. If the user gives hours and minutes, convert them to decimal hours.",
    "Review rule: do not call create_worklog immediately after first deriving worklog details. First present the exact details for human review: issue id, worklog date, hours, category, and log description. Ask the user to approve or request changes in natural language.",
    "Approval rule: call create_worklog only when the latest user message clearly approves the reviewed details from the conversation. The user may approve naturally, for example by saying it looks good, go ahead, log these, proceed, approved, or equivalent wording. Do not require exact approval words.",
    "For multiple approved worklogs, call create_worklog separately once for each worklog. Do not use a batch worklog tool. You may call create_worklog multiple times in one turn when all items have already been reviewed and approved.",
    "The create_worklog tool triggers the Chrome extension to execute the PMS API locally with the user's PMS session. The tool itself receives only the minimal action payload: issue id, worklog date, hours, category, and log description. It must not include PMS metadata such as project id, issue record id, assignee, user id, department, bearer token, or workflow fields.",
    "If the user gives a vague Excel instruction such as read from Excel, do not ask what to read when there is an active worklog/date context. Continue the current task using Excel metadata and CSV range reads.",
    "Use only tool output for Excel facts. If a tool says data is truncated, clearly say that your answer is based on the included range only and ask for a narrower range when needed.",
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
  const excelDigest = await parseExcelDigest(parsed.data.excelFile);
  const excelAccess = parsed.data.excelAccess;
  const debugTools = Boolean(parsed.data.debugTools);
  const prompt = formatMessagesForAgent(messages, {
    currentDate: parsed.data.currentDate || getTodayInTimeZone("Asia/Calcutta"),
    timeZone: parsed.data.timeZone || "Asia/Calcutta",
    excelAvailable: Boolean(excelDigest),
    excelName: excelDigest?.name || "",
    excelAccessStatus: excelAccess?.status || "",
    excelAccessMessage: excelAccess?.message || "",
  });
  const worklogActions: WorklogDraft[] = [];
  let debugEventId = 0;
  let sendToolDebug:
    | ((event: {
        type: "tool_debug";
        id: string;
        name: string;
        input: unknown;
        output: unknown;
        durationMs: number;
      }) => void)
    | null = null;

  async function executeWithToolDebug<TInput, TOutput>(
    name: string,
    input: TInput,
    handler: () => Promise<TOutput> | TOutput,
  ) {
    const startedAt = Date.now();

    try {
      const output = await handler();
      recordToolDebug(name, input, output, Date.now() - startedAt);
      return output;
    } catch (error) {
      recordToolDebug(
        name,
        input,
        {
          status: "error",
          message:
            error instanceof Error ? error.message : "Tool execution failed.",
        },
        Date.now() - startedAt,
      );
      throw error;
    }
  }

  function recordToolDebug(
    name: string,
    input: unknown,
    output: unknown,
    durationMs: number,
  ) {
    if (!debugTools || !sendToolDebug) {
      return;
    }

    debugEventId += 1;
    sendToolDebug({
      type: "tool_debug",
      id: String(debugEventId),
      name,
      input: summarizeToolDebugValue(input),
      output: summarizeToolDebugValue(output),
      durationMs,
    });
  }

  const createWorklog = tool({
    name: "create_worklog",
    description:
      "Trigger the Chrome extension to create one PMS worklog after the human has reviewed and approved the exact details in the chat. Use this only when the latest user message clearly approves the reviewed worklog details. The category must be one exact value from the allowed PMS category enum. Preserve the user's issue id prefix exactly, only uppercasing letters if needed. This tool queues the action for the extension to execute locally with the user's PMS session; it must not include PMS metadata such as project id, issue record id, assignee, user id, department, bearer token, or workflow fields.",
    parameters: worklogDraftSchema,
    async execute(input) {
      return executeWithToolDebug("create_worklog", input, () => {
        worklogActions.push(input);

        return {
          status: "queued_for_extension_execution",
          action: input,
          nextStep:
            "The extension should execute this PMS worklog action locally using the user's PMS session.",
        };
      });
    },
  });

  const agent = chatAgent.clone({
    tools: [
      createWorklog,
      tool({
        name: "get_excel_metadata",
        description:
          "Return lightweight metadata for the selected Excel workbook: workbook name, sheet names, row/column boundaries, truncation limits, and access status. Use this before reading sheet data when the correct sheet is not already known.",
        parameters: excelMetadataToolSchema,
        async execute(input) {
          return executeWithToolDebug("get_excel_metadata", input, () => {
            if (!excelDigest) {
              return {
                status: excelAccess?.status || "not_selected",
                name: excelAccess?.name || "",
                message:
                  excelAccess?.message ||
                  "No Excel file was supplied by the extension. Ask the user to select an Excel file in extension settings.",
              };
            }

            return getExcelMetadata(excelDigest);
          });
        },
      }),
      tool({
        name: "get_range_as_csv",
        description:
          "Return a precise A1 range from one selected Excel sheet as CSV text. Use this when you know the sheetName and range, for example sheetName 'June 2026' and range 'A1:I39'. The range is capped to prevent token overuse.",
        parameters: excelRangeCsvToolSchema,
        async execute(input) {
          return executeWithToolDebug("get_range_as_csv", input, () => {
            if (!excelDigest) {
              return {
                status: excelAccess?.status || "not_selected",
                name: excelAccess?.name || "",
                message:
                  excelAccess?.message ||
                  "No Excel file was supplied by the extension. Ask the user to select an Excel file in extension settings.",
              };
            }

            return getExcelRangeAsCsv(excelDigest, input.sheetName, input.range);
          });
        },
      }),
      // Keep this broader sheet-sample tool available for future use, but do not
      // expose it to the agent while get_range_as_csv is the preferred low-token path.
      // tool({
      //   name: "read_excel_data",
      //   description:
      //     "Read capped row data from exactly one named sheet in the selected Excel workbook. The sheetName parameter is required. If the correct sheet is not already known, call get_excel_metadata first. The tool returns only the requested sheet data plus truncation metadata to prevent token overuse.",
      //   parameters: excelToolSchema,
      //   async execute(input) {
      //     return executeWithToolDebug("read_excel_data", input, () => {
      //       if (!excelDigest) {
      //         return {
      //           status: excelAccess?.status || "not_selected",
      //           name: excelAccess?.name || "",
      //           message:
      //             excelAccess?.message ||
      //             "No Excel file was supplied by the extension. Ask the user to select an Excel file in extension settings.",
      //         };
      //       }

      //       const matchingSheets = excelDigest.sheets.filter(
      //         (sheet) =>
      //           sheet.name.localeCompare(input.sheetName, undefined, {
      //             sensitivity: "base",
      //           }) === 0,
      //       );

      //       return {
      //         ...getExcelMetadata(excelDigest),
      //         status: matchingSheets.length ? excelDigest.status : "sheet_not_found",
      //         requestedSheetName: input.sheetName,
      //         sheets: matchingSheets,
      //       };
      //     });
      //   },
      // }),
    ],
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
        sendToolDebug = send;

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
            worklogAction: worklogActions[0] || null,
            worklogActions,
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
  context: {
    currentDate: string;
    timeZone: string;
    excelAvailable: boolean;
    excelName: string;
    excelAccessStatus: string;
    excelAccessMessage: string;
  },
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
    context.excelAvailable
      ? `Selected Excel workbook available to inspect with get_excel_metadata and read a precise range with get_range_as_csv: ${context.excelName}.`
      : [
          "No selected Excel workbook was supplied with this request.",
          context.excelAccessStatus
            ? `Excel access status: ${context.excelAccessStatus}.`
            : "",
          context.excelAccessMessage
            ? `Excel access message: ${context.excelAccessMessage}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
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

async function parseExcelDigest(
  excelFile: z.infer<typeof requestSchema>["excelFile"],
) {
  if (!excelFile) {
    return null;
  }

  const bytes = Buffer.from(excelFile.dataBase64, "base64");

  if (bytes.byteLength > MAX_EXCEL_BYTES) {
    return {
      status: "file_too_large",
      name: excelFile.name,
      byteLength: bytes.byteLength,
      maxBytes: MAX_EXCEL_BYTES,
      message:
        "The selected Excel file is too large to send to the AI safely. Ask the user to provide a smaller workbook or a narrower export.",
      sheets: [],
    };
  }

  const workbook = new ExcelJS.Workbook();

  try {
    // ExcelJS wants an ArrayBuffer; hand it the exact view over our bytes.
    await workbook.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  } catch (error) {
    return {
      status: "parse_error",
      name: excelFile.name,
      message:
        error instanceof Error
          ? `Could not parse the selected Excel file: ${error.message}`
          : "Could not parse the selected Excel file.",
      sheets: [],
    };
  }

  const allSheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
  const includedWorksheets = workbook.worksheets.slice(0, MAX_EXCEL_SHEETS);

  const sheets = includedWorksheets.map((worksheet) => {
    const totalRows = worksheet.rowCount;
    const totalColumns = worksheet.columnCount;
    const includedColumns = Math.min(totalColumns, MAX_EXCEL_COLUMNS_PER_SHEET);
    const includedRows = Math.min(
      totalRows,
      MAX_EXCEL_ROWS_PER_SHEET,
    );

    const rows: string[][] = [];

    // ExcelJS rows and cells are 1-indexed.
    for (let rowNumber = 1; rowNumber <= includedRows; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const cells: string[] = [];

      for (
        let columnNumber = 1;
        columnNumber <= includedColumns;
        columnNumber += 1
      ) {
        cells.push(truncateExcelCell(row.getCell(columnNumber).text));
      }

      rows.push(cells);
    }

    return {
      name: worksheet.name,
      totalRows,
      totalColumns,
      includedRows: rows.length,
      includedColumns,
      truncated:
        rows.length < totalRows ||
        includedColumns < totalColumns,
      rows,
    };
  });

  return {
    status: "ok",
    name: excelFile.name,
    lastModified: excelFile.lastModified || null,
    sheetCount: allSheetNames.length,
    includedSheetCount: sheets.length,
    omittedSheets: allSheetNames.slice(MAX_EXCEL_SHEETS),
    limits: {
      maxBytes: MAX_EXCEL_BYTES,
      maxSheets: MAX_EXCEL_SHEETS,
      maxRowsPerSheet: MAX_EXCEL_ROWS_PER_SHEET,
      maxColumnsPerSheet: MAX_EXCEL_COLUMNS_PER_SHEET,
      maxCellsPerSheet: MAX_EXCEL_ROWS_PER_SHEET * MAX_EXCEL_COLUMNS_PER_SHEET,
      maxCellChars: MAX_EXCEL_CELL_CHARS,
    },
    truncated:
      allSheetNames.length > sheets.length ||
      sheets.some((sheet) => sheet.truncated),
    sheets,
  };
}

function truncateExcelCell(value: unknown) {
  const text = value == null ? "" : String(value);

  if (text.length <= MAX_EXCEL_CELL_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_EXCEL_CELL_CHARS)}...`;
}

function getExcelMetadata(excelDigest: NonNullable<Awaited<ReturnType<typeof parseExcelDigest>>>) {
  return {
    status: excelDigest.status,
    name: excelDigest.name,
    lastModified: "lastModified" in excelDigest ? excelDigest.lastModified : null,
    sheetCount: "sheetCount" in excelDigest ? excelDigest.sheetCount : 0,
    includedSheetCount:
      "includedSheetCount" in excelDigest ? excelDigest.includedSheetCount : 0,
    omittedSheets: "omittedSheets" in excelDigest ? excelDigest.omittedSheets : [],
    limits: "limits" in excelDigest ? excelDigest.limits : {},
    truncated: "truncated" in excelDigest ? excelDigest.truncated : false,
    sheets: Array.isArray(excelDigest.sheets)
      ? excelDigest.sheets.map((sheet) => ({
          name: sheet.name,
          boundary: {
            startRow: sheet.totalRows > 0 ? 1 : 0,
            endRow: sheet.totalRows,
            startColumn: sheet.totalColumns > 0 ? 1 : 0,
            endColumn: sheet.totalColumns,
          },
          totalRows: sheet.totalRows,
          totalColumns: sheet.totalColumns,
          readableRows: sheet.includedRows,
          readableColumns: sheet.includedColumns,
          truncated: sheet.truncated,
        }))
      : [],
    message: "message" in excelDigest ? excelDigest.message : undefined,
  };
}

function getExcelRangeAsCsv(
  excelDigest: NonNullable<Awaited<ReturnType<typeof parseExcelDigest>>>,
  sheetName: string,
  range: string,
) {
  const sheet = Array.isArray(excelDigest.sheets)
    ? excelDigest.sheets.find(
        (candidate) =>
          candidate.name.localeCompare(sheetName, undefined, {
            sensitivity: "base",
          }) === 0,
      )
    : null;

  if (!sheet) {
    return {
      ...getExcelMetadata(excelDigest),
      status: "sheet_not_found",
      requestedSheetName: sheetName,
      requestedRange: range,
      csv: "",
    };
  }

  const parsedRange = parseA1Range(range);

  if (!parsedRange) {
    return {
      status: "invalid_range",
      requestedSheetName: sheetName,
      requestedRange: range,
      message: "Use an A1 range, for example A1:I39.",
      csv: "",
    };
  }

  const requestedRows = parsedRange.endRow - parsedRange.startRow + 1;
  const requestedColumns = parsedRange.endColumn - parsedRange.startColumn + 1;
  const includedRows = Math.min(requestedRows, MAX_CSV_RANGE_ROWS);
  const includedColumns = Math.min(requestedColumns, MAX_CSV_RANGE_COLUMNS);
  const endRow = parsedRange.startRow + includedRows - 1;
  const endColumn = parsedRange.startColumn + includedColumns - 1;
  const csvRows: string[][] = [];

  for (let rowNumber = parsedRange.startRow; rowNumber <= endRow; rowNumber += 1) {
    const row: string[] = [];

    for (
      let columnNumber = parsedRange.startColumn;
      columnNumber <= endColumn;
      columnNumber += 1
    ) {
      row.push(sheet.rows[rowNumber - 1]?.[columnNumber - 1] || "");
    }

    csvRows.push(row);
  }

  return {
    status: excelDigest.status,
    name: excelDigest.name,
    requestedSheetName: sheetName,
    resolvedSheetName: sheet.name,
    requestedRange: range,
    returnedRange: `${columnNumberToName(parsedRange.startColumn)}${parsedRange.startRow}:${columnNumberToName(endColumn)}${endRow}`,
    requestedRows,
    requestedColumns,
    returnedRows: csvRows.length,
    returnedColumns: includedColumns,
    truncated:
      requestedRows > includedRows ||
      requestedColumns > includedColumns ||
      endRow > sheet.includedRows ||
      endColumn > sheet.includedColumns,
    limits: {
      maxRows: MAX_CSV_RANGE_ROWS,
      maxColumns: MAX_CSV_RANGE_COLUMNS,
      sourceReadableRows: sheet.includedRows,
      sourceReadableColumns: sheet.includedColumns,
    },
    csv: csvRows.map((row) => row.map(csvEscape).join(",")).join("\n"),
  };
}

function parseA1Range(range: string) {
  const match = range
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)$/);

  if (!match) {
    return null;
  }

  const startColumn = columnNameToNumber(match[1]);
  const startRow = Number(match[2]);
  const endColumn = columnNameToNumber(match[3]);
  const endRow = Number(match[4]);

  if (
    startColumn < 1 ||
    endColumn < 1 ||
    startRow < 1 ||
    endRow < 1
  ) {
    return null;
  }

  return {
    startColumn: Math.min(startColumn, endColumn),
    endColumn: Math.max(startColumn, endColumn),
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
  };
}

function columnNameToNumber(name: string) {
  return name.split("").reduce((value, letter) => {
    return value * 26 + letter.charCodeAt(0) - 64;
  }, 0);
}

function columnNumberToName(value: number) {
  let remaining = value;
  let name = "";

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return name;
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function summarizeToolDebugValue(value: unknown): unknown {
  return {
    approxJsonChars: safeJsonLength(value),
    value: summarizeDebugValue(value, 0),
  };
}

function summarizeDebugValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    const limit = depth === 0 ? 10 : 5;
    return {
      type: "array",
      length: value.length,
      items: value.slice(0, limit).map((item) => summarizeDebugValue(item, depth + 1)),
      omitted: Math.max(0, value.length - limit),
    };
  }

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.sheets)) {
    return {
      ...copyDebugFields(record, [
        "status",
        "name",
        "requestedSheetName",
        "sheetCount",
        "includedSheetCount",
        "omittedSheets",
        "truncated",
        "limits",
        "message",
      ]),
      sheets: record.sheets.slice(0, 5).map((sheet) => summarizeExcelSheet(sheet)),
      omittedDebugSheets: Math.max(0, record.sheets.length - 5),
    };
  }

  const entries = Object.entries(record);
  const limit = depth === 0 ? 20 : 10;
  const result: Record<string, unknown> = {};

  for (const [key, item] of entries.slice(0, limit)) {
    result[key] = summarizeDebugValue(item, depth + 1);
  }

  if (entries.length > limit) {
    result.__omittedKeys = entries.length - limit;
  }

  return result;
}

function summarizeExcelSheet(value: unknown) {
  if (!value || typeof value !== "object") {
    return value;
  }

  const sheet = value as Record<string, unknown>;
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];

  return {
    ...copyDebugFields(sheet, [
      "name",
      "totalRows",
      "totalColumns",
      "includedRows",
      "includedColumns",
      "truncated",
    ]),
    sampleRows: rows.slice(0, 5),
    omittedDebugRows: Math.max(0, rows.length - 5),
  };
}

function copyDebugFields(source: Record<string, unknown>, keys: string[]) {
  const result: Record<string, unknown> = {};

  for (const key of keys) {
    if (key in source) {
      result[key] = source[key];
    }
  }

  return result;
}

function safeJsonLength(value: unknown) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}
