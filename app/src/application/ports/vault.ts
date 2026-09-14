import type { Result } from "../result";

/**
 * Key custody (D10): memory by default, sessionStorage on explicit opt-in,
 * never localStorage. The key exists only in the browser and in requests to
 * the user's chosen provider — BYOK is absolute (§2.2).
 */
export type KeyCustody = "memory" | "session";

export interface VaultError {
  message: string;
}

export interface VaultPort {
  readonly custody: KeyCustody;
  /** Fails (never throws) when the backing store refuses — e.g. private mode. */
  store(apiKey: string): Result<void, VaultError>;
  retrieve(): string | null;
  /** Removes the key from this vault's backing store. */
  wipe(): void;
}
