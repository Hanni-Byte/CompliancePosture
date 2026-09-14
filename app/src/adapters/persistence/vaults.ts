import type { KeyCustody, VaultError, VaultPort } from "../../application/ports/vault";
import type { Result } from "../../application/result";
import { err, ok } from "../../application/result";

/** Default custody: the key lives in a closure and dies with the tab (D10). */
export class InMemoryVault implements VaultPort {
  readonly custody: KeyCustody = "memory";
  private key: string | null = null;

  store(apiKey: string): Result<void, VaultError> {
    this.key = apiKey;
    return ok(undefined);
  }

  retrieve(): string | null {
    return this.key;
  }

  wipe(): void {
    this.key = null;
  }
}

const SESSION_KEY = "cp.byok";

/**
 * Opt-in custody: cleared when the tab closes, never written to localStorage
 * (D10). Storage access can throw (private mode, disabled storage, quota) —
 * every call is guarded so the failure surfaces as a Result, not a crash.
 */
export class SessionVault implements VaultPort {
  readonly custody: KeyCustody = "session";
  private readonly storage: () => Storage;

  constructor(storage: () => Storage = () => globalThis.sessionStorage) {
    this.storage = storage;
  }

  store(apiKey: string): Result<void, VaultError> {
    try {
      this.storage().setItem(SESSION_KEY, apiKey);
      return ok(undefined);
    } catch (cause) {
      return err({ message: `Session storage is unavailable (${cause instanceof Error ? cause.name : "unknown"}); keep the key in memory instead.` });
    }
  }

  retrieve(): string | null {
    try {
      return this.storage().getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }

  wipe(): void {
    try {
      this.storage().removeItem(SESSION_KEY);
    } catch {
      // Nothing to wipe if storage is unreachable.
    }
  }
}
