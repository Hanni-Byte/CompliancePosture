import type { KeyCustody, VaultPort } from "../../application/ports/vault";

/** Default custody: the key lives in a closure and dies with the tab (D10). */
export class InMemoryVault implements VaultPort {
  readonly custody: KeyCustody = "memory";
  private key: string | null = null;

  store(apiKey: string): void {
    this.key = apiKey;
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
 * Opt-in custody: survives reloads within the tab session, never written to
 * localStorage (D10). Storage is injectable for tests.
 */
export class SessionVault implements VaultPort {
  readonly custody: KeyCustody = "session";
  private readonly storage: Storage;

  constructor(storage: Storage = globalThis.sessionStorage) {
    this.storage = storage;
  }

  store(apiKey: string): void {
    this.storage.setItem(SESSION_KEY, apiKey);
  }

  retrieve(): string | null {
    return this.storage.getItem(SESSION_KEY);
  }

  wipe(): void {
    this.storage.removeItem(SESSION_KEY);
  }
}