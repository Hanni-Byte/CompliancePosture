import type { Result } from "../result";
import { err, ok } from "../result";
import type { LlmError, LlmGateway, ProviderPing } from "../ports/llm-gateway";
import type { VaultPort } from "../ports/vault";

export interface KeyVerification {
  providerId: string;
  model: string;
  custody: VaultPort["custody"];
}

/**
 * Stores the key in the chosen vault, then proves it works with the cheapest
 * possible authenticated call. On failure the key is wiped — a key we could
 * not verify is never kept around. A vault that cannot hold the key is a
 * `storage` failure, reported before any network call is made.
 */
export async function verifyProviderKey(
  deps: { gateway: LlmGateway; vault: VaultPort },
  input: { apiKey: string; signal?: AbortSignal },
): Promise<Result<KeyVerification, LlmError>> {
  const trimmed = input.apiKey.trim();
  const stored = deps.vault.store(trimmed);
  if (!stored.ok) {
    return err({ kind: "storage", message: stored.error.message });
  }

  const pinged: Result<ProviderPing, LlmError> = await deps.gateway.ping(input.signal);
  if (!pinged.ok) {
    deps.vault.wipe();
    return err(pinged.error);
  }
  return ok({
    providerId: pinged.value.providerId,
    model: pinged.value.model,
    custody: deps.vault.custody,
  });
}
