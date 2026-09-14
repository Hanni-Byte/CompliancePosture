import type { ProviderSpec } from "./providers";

/**
 * The production Content-Security-Policy, derived from the provider registry
 * (§2.8): `connect-src` is exactly 'self' plus every registered provider
 * origin. Pure so the build script and the tests share one definition.
 */
export function buildCsp(providers: readonly ProviderSpec[]): string {
  const origins = [...new Set(providers.flatMap((p) => p.cspOrigins))];
  for (const origin of origins) {
    if (!/^https?:\/\/[^/*\s]+$/.test(origin)) {
      throw new Error(`provider origin must be a bare origin without wildcards or paths: ${origin}`);
    }
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ${origins.join(" ")}`.trimEnd(),
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}
