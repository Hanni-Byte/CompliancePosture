import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";
import { PROVIDERS, type ProviderSpec } from "./providers";

const spec = (id: string, ...cspOrigins: string[]): ProviderSpec => ({
  id, label: id, baseUrl: cspOrigins[0] ?? "", cspOrigins, requiresKey: false, defaultModel: "m", notes: [],
});

describe("buildCsp", () => {
  it("derives connect-src from the registry, deduped, in registry order", () => {
    const csp = buildCsp([spec("a", "https://a.example", "https://shared.example"), spec("b", "https://shared.example", "http://localhost:11434")]);
    expect(csp).toContain("connect-src 'self' https://a.example https://shared.example http://localhost:11434;");
  });

  it("never emits wildcards or unsafe-* and keeps the hardening directives", () => {
    const csp = buildCsp(PROVIDERS);
    expect(csp).not.toMatch(/\*|unsafe-inline|unsafe-eval/);
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toMatch(/base-uri 'none';/);
    expect(csp).toMatch(/frame-ancestors 'none';/);
    expect(csp).toMatch(/form-action 'self'$/);
  });

  it("adding a provider adds exactly its origins", () => {
    const before = buildCsp(PROVIDERS);
    const after = buildCsp([...PROVIDERS, spec("new", "https://api.new.example")]);
    expect(after).toBe(before.replace("; base-uri", " https://api.new.example; base-uri"));
  });

  it("rejects origins with paths or wildcards", () => {
    expect(() => buildCsp([spec("x", "https://*.example")])).toThrow(/wildcards/);
    expect(() => buildCsp([spec("x", "https://a.example/v1")])).toThrow(/paths/);
  });
});
