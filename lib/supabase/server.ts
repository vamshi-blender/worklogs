import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let serverClient: SupabaseClient<Database> | undefined;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

/**
 * Administrative Supabase client for trusted server code only.
 *
 * This client bypasses RLS. Route handlers must authenticate the caller and
 * resolve tenant/user IDs before passing them to the memory repository.
 */
export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (!serverClient) {
    serverClient = createClient<Database>(
      requiredEnvironmentVariable("SUPABASE_URL"),
      requiredEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  }

  return serverClient;
}
