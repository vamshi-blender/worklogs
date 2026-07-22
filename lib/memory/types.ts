export type UserMemoryKind =
  | "terminology"
  | "preference"
  | "behavior"
  | "constraint"
  | "profile_note";

export interface MemoryScope {
  tenantId: number;
  userId: string;
}

export interface DonnaIdentity {
  tenantId: number;
  identityId: number;
  displayName: string;
  email: string;
  externalUserId: string;
  externalTenantId: string;
}

export interface RetrievedUserMemory {
  id: string;
  text: string;
  score?: number;
}

export interface MemoryCapture {
  tenantId: number;
  userId: string;
  conversationId: string;
  userMessage: string;
  turnId: string;
}

export type PmsValueRuleInputKind = "digits_only" | "labeled_number";

export interface PmsToolObservation {
  callId: string;
  name: "pms_lookup";
  arguments: Record<string, unknown>;
  output?: string;
}

export interface DonnaRunSummary {
  assistantText: string;
  pmsObservations: PmsToolObservation[];
}
