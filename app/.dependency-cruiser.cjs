/**
 * Enforces the clean-architecture dependency rule (constitution §7).
 * Layers: domain (L1) → nothing; application (L2) → domain;
 * adapters (L3) → application + domain; infrastructure (L4) → anything.
 * Documented deviations live in docs/HANDOFF.md §7.
 */
module.exports = {
  forbidden: [
    {
      name: "domain-depends-on-nothing",
      severity: "error",
      comment:
        "L1 domain must stay dependency-free: no other layer, no npm packages (zod lives only at edges).",
      from: { path: "^src/domain" },
      to: {
        pathNot: "^src/domain",
      },
    },
    {
      name: "application-only-domain",
      severity: "error",
      comment: "L2 application may depend on L1 domain only.",
      from: { path: "^src/application" },
      to: { path: "^src/(adapters|infrastructure)" },
    },
    {
      name: "adapters-not-infrastructure",
      severity: "error",
      comment: "L3 adapters may depend on L2/L1 but never on L4 infrastructure.",
      from: { path: "^src/adapters" },
      to: { path: "^src/infrastructure" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-test",
      severity: "error",
      comment: "Production code must not import test helpers or fixtures.",
      from: { path: "^src/(domain|application|adapters|infrastructure)" },
      to: { path: "^src/test" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "\\.test\\.(ts|tsx)$" },
  },
};