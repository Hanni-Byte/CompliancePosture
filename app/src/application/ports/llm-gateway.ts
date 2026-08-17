import type { Result } from "../result";

/** Why this call is being made — used for prompt routing and cost breakdown. */
export type LlmPurpose = "ask" | "extract" | "evaluate" | "narrate";

/** Reference to a versioned prompt asset in the L2 prompt registry. */
export interface PromptRef {
  id: string;
  version: number;
}

/**
 * Schema contract for a structured LLM call. `jsonSchema` is sent to the
 * provider (its structured-output mechanism); `parse` re-validates the
 * response at the adapter edge and returns the typed value or null.
 * Constitution §2.9: unvalidated output never crosses this boundary.
 */
export interface SchemaRef<T> {
  name: string;
  jsonSchema: Record<string, unknown>;
  parse(raw: unknown): T | null;
}

export interface LlmRequest<T> {
  purpose: LlmPurpose;
  prompt: PromptRef;
  /** Fully rendered messages (template already applied by the caller). */
  system: string;
  user: string;
  schema: SchemaRef<T>;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type LlmError =
  | { kind: "auth"; message: string }
  | { kind: "cors"; message: string }
  | { kind: "network"; message: string }
  | { kind: "rate_limit"; message: string; retryAfterSeconds?: number }
  | { kind: "provider_error"; message: string; status?: number }
  /** Response failed schema validation even after one repair retry (§2.4). */
  | { kind: "invalid_response"; message: string }
  | { kind: "aborted"; message: string };

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface ProviderPing {
  providerId: string;
  model: string;
}

export interface LlmGateway {
  /** Structured-only completion. Every call declares its schema (§2.9). */
  complete<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>>;
  /** Cheapest possible authenticated call, used by VerifyProviderKey. */
  ping(signal?: AbortSignal): Promise<Result<ProviderPing, LlmError>>;
  /** Running token totals across this gateway instance's lifetime. */
  estimateCostSoFar(): CostEstimate;
}