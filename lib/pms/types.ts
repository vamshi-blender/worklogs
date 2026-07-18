// Shared shape of the PMS manifest bundle. The bundle is DATA: it describes
// PMS actions (forms) and lookups declaratively, and is served to the Chrome
// extension at runtime via GET /api/pms/manifests. The extension contains
// only a generic interpreter, so changing/adding actions here needs a server
// deploy, never an extension re-zip.
//
// NOTE: this file is duplicated (kept in sync by hand) at
// chrome-extension/src/pms/types.ts — same convention as protocol.ts.

/** A value in the final payload: a constant, or a dotted-path reference into
 * the execution context (namespaces: input.*, user.*, plus one namespace per
 * entry in the manifest's `resolvers` map, and derive.* / serial).
 * format "quixyDateTime" re-emits a date string with Quixy's two-decimal
 * seconds suffix ("2024-06-16T18:30:00.00") — data-table rows return it
 * without the suffix but SaveAppData expects it. */
export type PmsValueSpec =
  | { const: unknown }
  | { ref: string; format?: "quixyDateTime" };

/** Quixy "Layer A" data primitives, parameterised by GUIDs. */
export interface PmsDataTableRowSource {
  kind: "dataTableRow"; // POST /api/DataTable/GetReferencedDataTableData
  dataTableId: string;
  functionId: string;
  referencedElements: string[];
  /** Column name the lookup is keyed on, e.g. "Employee Code". */
  keyReference: string;
  /** Context path providing the key value, e.g. "user.employeeCode". */
  keyRef: string;
}

export interface PmsDatasourceRowsSource {
  kind: "datasourceRows"; // POST /api/Datasource/GetReferencedDataSourceData
  dataSourceId: string;
  referenceId: string;
  outputColumns: string[];
  conditionLabel: string;
  keyRef: string;
}

export interface PmsReportGridSource {
  kind: "reportGrid"; // POST /api/Report/GetGridReportData
  reportId: string;
  orderByFields: string;
  top: number;
}

export type PmsLookupSource =
  | PmsDataTableRowSource
  | PmsDatasourceRowsSource
  | PmsReportGridSource;

export interface PmsLookupDefinition {
  description: string;
  /** true → Donna may call it standalone via the pms_lookup tool. */
  queryable: boolean;
  source: PmsLookupSource;
}

export interface PmsInputSlot {
  name: string;
  label: string;
  type: "enum" | "date" | "string" | "boolean";
  options?: string[];
  required: boolean;
  maxLength?: number;
  description: string;
}

/** Declarative business rules, evaluated by the extension's executor before
 * submit. `field`/`when.field` name input slots; `limitRef` is a context
 * path resolved after execution resolvers ran. */
export type PmsRule =
  | {
      kind: "requiredIf";
      field: string;
      when: { field: string; equals: string };
      message: string;
    }
  | {
      kind: "forceValue";
      field: string;
      when: { field: string; equals: string };
      value: string;
      message: string;
    }
  | {
      kind: "sameMonthRange";
      fromField: string;
      toField: string;
      maxEndDay: number;
      message: string;
    }
  | {
      kind: "maxEffectiveDays";
      when: { field: string; equals: string };
      limitRef: string;
      message: string;
    }
  | { kind: "mustBeTrue"; field: string; message: string };

export interface PmsActionManifest {
  title: string;
  description: string;
  appId: string;
  appName: string;
  /** GET /api/App/GetNextSerialNumber parameter. */
  serialAppElementId: string;
  /** Execution resolvers: context namespace → lookup name in the bundle. */
  resolvers: Record<string, string>;
  inputs: PmsInputSlot[];
  rules: PmsRule[];
  /** The full submit body; key order and misspellings are load-bearing. */
  payload: Record<string, PmsValueSpec>;
  /** Path+query for the final POST. */
  submitPath: string;
}

export interface PmsBundle {
  version: number;
  lookups: Record<string, PmsLookupDefinition>;
  actions: Record<string, PmsActionManifest>;
}
