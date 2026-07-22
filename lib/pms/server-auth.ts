import "server-only";

import { resolveExternalMemoryIdentity } from "@/lib/memory/repository";
import type { DonnaIdentity } from "@/lib/memory/types";

const PMS_USER_DETAILS_URL =
  "https://quixyhomeapi.kwixee.co.in/api/User/GetUserDetails";

export class PmsAuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 502 = 401,
  ) {
    super(message);
    this.name = "PmsAuthenticationError";
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 16_000) {
    throw new PmsAuthenticationError("A valid PMS session is required.");
  }
  return match[1];
}

function stringField(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

export async function authenticateDonnaRequest(
  request: Request,
): Promise<DonnaIdentity> {
  const token = bearerToken(request);
  let response: Response;

  try {
    response = await fetch(PMS_USER_DETAILS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    throw new PmsAuthenticationError(
      "Donna could not validate the PMS session. Please try again.",
      502,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new PmsAuthenticationError(
      "Your PMS session has expired. Please sign in again.",
    );
  }
  if (!response.ok) {
    throw new PmsAuthenticationError(
      "Donna could not validate the PMS session. Please try again.",
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PmsAuthenticationError(
      "The PMS returned an invalid user profile.",
      502,
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PmsAuthenticationError("The PMS returned an invalid user profile.", 502);
  }

  const record = payload as Record<string, unknown>;
  const externalUserId = stringField(record, "UserId");
  const externalTenantId = stringField(record, "OrganizationId");
  if (!externalUserId || !externalTenantId) {
    throw new PmsAuthenticationError("The PMS returned an invalid user profile.", 502);
  }

  const firstName = stringField(record, "FirstName");
  const lastName = stringField(record, "LastName");
  const displayName = `${firstName} ${lastName}`.trim();
  const email = stringField(record, "EmailId");
  const resolved = await resolveExternalMemoryIdentity({
    provider: "pms",
    externalTenantId,
    externalUserId,
    tenantName: `PMS organization ${externalTenantId}`,
    displayName,
    email,
    metadata: { employee_code: stringField(record, "EmployeeCode") },
  });

  return {
    tenantId: resolved.tenant_id,
    identityId: resolved.identity_id,
    displayName,
    email,
    externalUserId,
    externalTenantId,
  };
}
