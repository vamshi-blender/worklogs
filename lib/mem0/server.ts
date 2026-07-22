import "server-only";

import { MemoryClient } from "mem0ai";

let serverClient: MemoryClient | undefined;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

/**
 * Mem0 Platform client for trusted server code.
 *
 * Never expose this client or MEM0_API_KEY to the Chrome extension.
 */
export function getMem0ServerClient(): MemoryClient {
  if (!serverClient) {
    serverClient = new MemoryClient({
      apiKey: requiredEnvironmentVariable("MEM0_API_KEY"),
    });
  }

  return serverClient;
}

export async function pingMem0(): Promise<void> {
  await getMem0ServerClient().ping();
}
