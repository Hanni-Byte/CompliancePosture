import { z } from "zod";
import type { KnowledgePack, PackManifest, PackSummary, Topic } from "../../domain/entities/pack";

/**
 * zod mirror of tools/packs/packs/schema.py — the only pipeline↔app contract.
 * Strict objects: an unknown field is a contract drift and must fail closed.
 * `schemaVersion` is the only compatibility signal (see the pydantic docstring).
 */
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const framework = z.enum(["EU_AI_ACT", "GDPR", "OWASP_LLM_TOP_10", "OWASP_AGENTIC_TOP_10", "NIST_AI_RMF"]);

export const chunkSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_.-]+$/),
  ref: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  url: z.string().regex(/^https:\/\//),
});

export const topicSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1),
  seedQueries: z.array(z.string()).min(1),
  dependsOnSlots: z.array(z.string()).default([]),
  appliesFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

export const crosswalkLinkSchema = z.strictObject({
  framework: z.string().min(1),
  frameworkId: framework.optional(),
  ref: z.string().min(1),
  title: z.string().min(1),
  tier: z.string().optional(),
  url: z.string().regex(/^https?:\/\//).optional(),
  notes: z.string().optional(),
  packId: z.string().optional(),
  chunkIds: z.array(z.string()).default([]),
});

export const crosswalkEntrySchema = z.strictObject({
  entryId: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  severity: z.string().optional(),
  sourceUrl: z.string().regex(/^https:\/\//),
  links: z.array(crosswalkLinkSchema),
  incidents: z
    .array(z.strictObject({ name: z.string().min(1), year: z.number().int().optional(), incidentId: z.string().optional() }))
    .default([]),
});

export const manifestSchema = z.strictObject({
  // Any integer parses; the domain gate turns a mismatch into unsupported_version.
  schemaVersion: z.number().int().positive(),
  id: z.string().regex(/^[a-z0-9_]+$/),
  framework,
  name: z.string().min(1),
  version: z.string().min(1),
  sources: z.array(z.strictObject({ url: z.string().regex(/^https:\/\//), revision: z.string().min(1), sha256 })).min(1),
  license: z.string().min(1),
  chunkCount: z.number().int().positive(),
  topicCount: z.number().int().positive(),
  // partialRecord: z.record with an enum key is exhaustive in zod 4, and
  // crosswalk.json is optional.
  files: z
    .partialRecord(z.enum(["chunks.json", "topics.json", "crosswalk.json"]), sha256)
    .refine((f) => f["chunks.json"] !== undefined && f["topics.json"] !== undefined, "manifest.files must list chunks.json and topics.json"),
});

export const packIndexSchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  packs: z
    .array(z.strictObject({
      id: z.string().regex(/^[a-z0-9_]+$/),
      framework,
      name: z.string().min(1),
      version: z.string().min(1),
      license: z.string().min(1),
      chunkCount: z.number().int().positive(),
    }))
    .min(1),
});

export const chunksFileSchema = z.array(chunkSchema);
export const topicsFileSchema = z.array(topicSchema);
export const crosswalkFileSchema = z.array(crosswalkEntrySchema);

// Compile-time parity: zod output must be assignable to the domain types
// (absent optional keys are never emitted at runtime, hence the `satisfies`).
type Assignable<From, To> = From extends To ? true : never;
export const _manifestParity: Assignable<z.output<typeof manifestSchema>, PackManifest> = true;
export const _chunkParity: Assignable<z.output<typeof chunkSchema>, KnowledgePack["chunks"][number]> = true;
export const _summaryParity: Assignable<z.output<typeof packIndexSchema>["packs"][number], PackSummary> = true;
export const _topicParity: Assignable<Omit<z.output<typeof topicSchema>, "appliesFrom" | "notes">, Omit<Topic, "appliesFrom" | "notes">> = true;
