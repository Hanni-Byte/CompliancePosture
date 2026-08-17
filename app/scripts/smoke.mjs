// Golden-report smoke runner (quality gate; see docs/HANDOFF.md §9).
// Wired into CI from day one; becomes a real headless assessment once the
// report engine ships (Feature 5). Until then it succeeds with a notice so
// the gate stays green only where the code genuinely doesn't exist yet.
console.log(
  "smoke: report engine not built yet (arrives with Feature 5) — nothing to diff.",
);
process.exit(0);