// SECURITY: the exact-origin CORS allowlist (ALLOWED_EXTENSION_ORIGINS env
// var, same-origin check, origin-less request rejection in production) was
// replaced here with a wildcard, so the extension works from any install
// (extension IDs vary per machine/build) without an env allowlist.
// Anyone who can reach the server can call these endpoints — dev-phase
// decision; see this commit to restore the allowlist, and pair it with
// authentication before any real production deployment.
export function getAllowedOrigin(_request: Request): string | null {
  return "*";
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
