import type {
  CostEstimate,
  LlmError,
  LlmGateway,
  LlmRequest,
  ProviderPing,
} from "../../application/ports/llm-gateway";
import type { Result } from "../../application/result";
import { err, ok } from "../../application/result";

/**
 * Scripted gateway for use-case tests: queue up responses per purpose, and
 * ping outcomes, then assert on what the code under test did with them.
 */
export class FakeLlmGateway implements LlmGateway {
  pingResults: Result<ProviderPing, LlmError>[] = [];
  completions: unknown[] = [];
  requests: LlmRequest<unknown>[] = [];
  private cost: CostEstimate = { inputTokens: 0, outputTokens: 0, calls: 0 };

  complete<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>> {
    this.requests.push(request);
    this.cost.calls += 1;
    const next = this.completions.shift();
    if (next === undefined) {
      return Promise.resolve(
        err<LlmError>({ kind: "invalid_response", message: "fake: no scripted completion" }),
      );
    }
    const parsed = request.schema.parse(next);
    if (parsed === null) {
      return Promise.resolve(
        err<LlmError>({ kind: "invalid_response", message: "fake: scripted value failed schema" }),
      );
    }
    return Promise.resolve(ok(parsed));
  }

  ping(): Promise<Result<ProviderPing, LlmError>> {
    const next = this.pingResults.shift();
    return Promise.resolve(
      next ?? ok({ providerId: "fake", model: "fake-model" }),
    );
  }

  estimateCostSoFar(): CostEstimate {
    return { ...this.cost };
  }
}