function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EXTENSION_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");

  // Origin-less requests are useful for local curl/API testing. They are not
  // accepted once the production endpoint is enabled.
  if (!origin) return process.env.NODE_ENV === "production" ? null : "";

  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return origin;

  return configuredOrigins().has(origin) ? origin : null;
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
